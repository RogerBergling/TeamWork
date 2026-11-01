import {
  BrowserWindow,
  desktopCapturer,
  shell,
  WebContentsView,
  type DesktopCapturerSource,
  type WebContents
} from 'electron'
import type {
  ManagedView,
  ScreenShareRequest,
  ScreenShareSource,
  ViewStatus,
  ViewBounds
} from '../shared/types'
import type { Settings } from '../shared/settings'
import { safeUrlForLog } from '../shared/deep-links'
import { shouldOpenExternally, isExternalProtocolAllowed, parseHttpUrl } from '../shared/urls'
import type { AppLogger } from './logger'
import type { SessionManager } from './session-manager'

interface ManagedEntry {
  kind: ManagedView
  view: WebContentsView
  status: ViewStatus
  configuredUrl: string
  targetUrl: string
  loaded: boolean
  hideUntilReady: boolean
  lastLoadFailed: boolean
  cssKey?: string
  cssValue?: string
}

interface PendingScreenShare {
  id: number
  view: ManagedView
  callback: (streams: Electron.Streams | null) => void
  sources: DesktopCapturerSource[]
  timer: NodeJS.Timeout
}

const VIEW_LABEL: Record<ManagedView, string> = {
  element: 'Element',
  jitsi: 'Jitsi'
}

function isSameDocumentUrl(current: string, target: URL): boolean {
  if (!current) return false
  try {
    const existing = new URL(current)
    return (
      existing.origin === target.origin &&
      existing.pathname === target.pathname &&
      existing.search === target.search
    )
  } catch {
    return false
  }
}

export class ViewManager {
  private readonly entries = new Map<ManagedView, ManagedEntry>()
  private active: ManagedView | null = null
  private bounds: ViewBounds = { x: 0, y: 0, width: 0, height: 0 }
  private suspended = false
  private screenPickerOpen = false
  private pendingScreenShare: PendingScreenShare | null = null
  private nextScreenShareId = 1
  private readonly popups = new Set<BrowserWindow>()

  constructor(
    private readonly window: BrowserWindow,
    private settings: Settings,
    private readonly sessions: SessionManager,
    private readonly logger: AppLogger,
    private readonly onStatus: (status: ViewStatus) => void,
    private readonly onScreenShareRequest: (request: ScreenShareRequest) => void,
    private readonly onScreenShareCancelled: (id: number) => void
  ) {
    this.sessions.setDisplayMediaHandler((view, request, callback) => {
      void this.handleDisplayMediaRequest(view, request, callback)
    })

    for (const kind of ['element', 'jitsi'] as const) {
      this.createView(kind)
    }
  }

  get activeView(): ManagedView | null {
    return this.active
  }

  getStatuses(): ViewStatus[] {
    return [...this.entries.values()].map((entry) => entry.status)
  }

  async capture(view: ManagedView): Promise<Buffer | null> {
    const entry = this.entries.get(view)
    if (!entry || entry.status.state !== 'ready' || entry.view.webContents.isDestroyed()) {
      return null
    }
    const image = await entry.view.webContents.capturePage()
    return image.toPNG()
  }

  setBounds(bounds: ViewBounds): void {
    this.bounds = {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height))
    }
    for (const entry of this.entries.values()) {
      entry.view.setBounds(this.bounds)
    }
  }

  activate(view: ManagedView | null): void {
    this.active = view
    if (view) this.ensureLoaded(view)
    this.updateVisibility()
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended
    this.updateVisibility()
  }

  applySettings(settings: Settings, previous: Settings): void {
    this.settings = settings

    for (const kind of ['element', 'jitsi'] as const) {
      const entry = this.entries.get(kind)
      if (!entry) continue

      const previousUrl =
        kind === 'element' ? previous.servers.elementUrl : previous.servers.jitsiUrl
      const nextUrl = kind === 'element' ? settings.servers.elementUrl : settings.servers.jitsiUrl
      const urlChanged = previousUrl !== nextUrl

      if (urlChanged) {
        if (entry.loaded || this.active === kind) {
          this.load(kind)
        } else {
          // Keep inactive, never-opened views cold until the user selects them.
          entry.loaded = false
        }
      }

      if (entry.loaded && previous.appearance.customCss !== settings.appearance.customCss) {
        this.applyCustomCss(entry)
      }

      if (entry.loaded && previous.advanced.zoomFactor !== settings.advanced.zoomFactor) {
        this.setZoom(entry)
      }

      const previousUserAgent =
        kind === 'element'
          ? previous.servers.elementUserAgent
          : previous.servers.jitsiUserAgent
      const nextUserAgent =
        kind === 'element' ? settings.servers.elementUserAgent : settings.servers.jitsiUserAgent
      if (
        entry.loaded &&
        !urlChanged &&
        previousUserAgent !== nextUserAgent &&
        entry.status.state !== 'unconfigured'
      ) {
        if (this.active === kind) entry.view.webContents.reload()
        else entry.loaded = false
      }
    }

    this.updateVisibility()
  }

  reload(view: ManagedView): void {
    const entry = this.entries.get(view)
    if (!entry) return

    if (!entry.loaded) {
      this.load(view)
      return
    }

    if (entry.status.state === 'error' || entry.status.state === 'unconfigured') {
      this.load(view, entry.targetUrl || undefined)
      return
    }

    this.logger.info(`Reloading ${VIEW_LABEL[view]}`)
    entry.view.webContents.reload()
  }

  openInBrowser(view: ManagedView): void {
    const entry = this.entries.get(view)
    if (!entry) return
    const configured = (
      view === 'element' ? this.settings.servers.elementUrl : this.settings.servers.jitsiUrl
    ).trim()
    const target = entry.status.url || entry.targetUrl || entry.configuredUrl || configured
    if (target && parseHttpUrl(target)) {
      void shell.openExternal(target)
    }
  }

  openJitsiMeeting(url: string): void {
    this.load('jitsi', url)
    this.activate('jitsi')
  }

  openElementRoom(url: string): void {
    this.load('element', url)
    this.activate('element')
  }

  toggleDevTools(view: ManagedView): void {
    const entry = this.entries.get(view)
    if (!entry || entry.view.webContents.isDestroyed()) return
    entry.view.webContents.toggleDevTools()
  }

  async clearSession(view: ManagedView): Promise<void> {
    await this.sessions.clear(view)
    const entry = this.entries.get(view)
    if (!entry) return
    if (this.active === view) {
      this.load(view)
    } else {
      // Keep an inactive view cold; it will reload the next time it is opened.
      entry.loaded = false
    }
  }

  async clearSessions(): Promise<void> {
    await this.sessions.clearAll()
  }

  selectScreenShare(id: number, sourceId: string | null): void {
    const pending = this.pendingScreenShare
    if (!pending || pending.id !== id) return

    clearTimeout(pending.timer)
    this.pendingScreenShare = null
    this.screenPickerOpen = false

    if (sourceId === null) {
      pending.callback(null)
      this.logger.info(`Screen sharing cancelled for ${VIEW_LABEL[pending.view]}`)
    } else {
      const source = pending.sources.find((candidate) => candidate.id === sourceId)
      if (!source) {
        pending.callback(null)
        this.logger.warn(`Selected screen-share source ${sourceId} was not found`)
      } else {
        pending.callback({ video: source })
        this.logger.info(
          `Screen sharing started for ${VIEW_LABEL[pending.view]} using "${source.name}"`
        )
      }
    }

    this.updateVisibility()
  }

  private createView(kind: ManagedView): void {
    const view = new WebContentsView({
      webPreferences: {
        partition: this.sessions.partitionFor(kind),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webviewTag: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: this.settings.advanced.spellcheck,
        devTools: true,
        autoplayPolicy: 'no-user-gesture-required',
        backgroundThrottling: false,
        safeDialogs: true,
        navigateOnDragDrop: false
      }
    })

    view.setBounds(this.bounds)
    view.setVisible(false)
    this.window.contentView.addChildView(view)

    const entry: ManagedEntry = {
      kind,
      view,
      status: {
        view: kind,
        state: 'unconfigured',
        url: ''
      },
      configuredUrl: '',
      targetUrl: '',
      loaded: false,
      hideUntilReady: true,
      lastLoadFailed: false
    }
    this.entries.set(kind, entry)

    this.attachGuards(kind, view.webContents)
    view.webContents.setZoomFactor(this.settings.advanced.zoomFactor)

    view.webContents.on('did-start-navigation', (event) => {
      if (!event.isMainFrame || event.isSameDocument) return
      // insertCSS keys are scoped to a document and cannot be reused after a
      // navigation.
      entry.cssKey = undefined
      entry.cssValue = undefined
      entry.lastLoadFailed = false
      if (entry.status.state === 'ready') {
        this.setStatus(entry, { ...entry.status, state: 'loading', url: event.url })
      }
    })

    view.webContents.on('did-finish-load', () => {
      const url = view.webContents.getURL()
      // Chromium emits did-finish-load for its own network-error page. Never
      // replace the explicit error state with a false "ready".
      if (entry.lastLoadFailed || url.startsWith('chrome-error://')) return
      entry.lastLoadFailed = false
      this.setStatus(entry, { view: kind, state: 'ready', url })
      if (entry.hideUntilReady) {
        entry.hideUntilReady = false
        if (this.active === kind) this.updateVisibility()
      }
    })

    view.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return
        // ERR_ABORTED is emitted for redirects and intentional cancellations.
        if (errorCode === -3) return

        entry.hideUntilReady = true
        entry.lastLoadFailed = true
        this.setStatus(entry, {
          view: kind,
          state: 'error',
          message: errorDescription || 'The page could not be loaded',
          code: errorCode,
          url: validatedURL
        })
        this.logger.error(
          `${VIEW_LABEL[kind]} failed to load ${safeUrlForLog(validatedURL)}: ${errorDescription} (${errorCode})`
        )
        this.updateVisibility()
      }
    )

    view.webContents.on('did-navigate', (_event, url) => {
      if (entry.status.state === 'ready') {
        this.setStatus(entry, { ...entry.status, url })
      }
    })

    view.webContents.on('did-navigate-in-page', (_event, url) => {
      if (entry.status.state === 'ready') {
        this.setStatus(entry, { ...entry.status, url })
      }
    })

    view.webContents.on('render-process-gone', (_event, details) => {
      entry.hideUntilReady = true
      this.setStatus(entry, {
        view: kind,
        state: 'error',
        message: `The ${VIEW_LABEL[kind]} renderer stopped (${details.reason})`,
        url: view.webContents.getURL()
      })
      this.logger.error(`${VIEW_LABEL[kind]} renderer stopped`, details)
      this.updateVisibility()
    })

    view.webContents.on('unresponsive', () => {
      this.logger.warn(`${VIEW_LABEL[kind]} is unresponsive`)
    })

    view.webContents.on('dom-ready', () => {
      // A new document invalidates any previous insertCSS key.
      entry.cssKey = undefined
      entry.cssValue = undefined
      this.applyCustomCss(entry)
    })

    view.webContents.on('console-message', (event) => {
      if (!this.settings.logging.debug) return
      this.logger.debug(
        `[${VIEW_LABEL[kind]} console:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`
      )
    })
  }

  private attachGuards(kind: ManagedView, contents: WebContents): void {
    contents.setWindowOpenHandler((details) => {
      const { url } = details
      const popupOptions: Electron.BrowserWindowConstructorOptions = {
        parent: this.window,
        width: 1024,
        height: 780,
        autoHideMenuBar: true,
        backgroundColor: '#ffffff',
        webPreferences: {
          partition: this.sessions.partitionFor(kind),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          spellcheck: this.settings.advanced.spellcheck,
          devTools: true,
          autoplayPolicy: 'no-user-gesture-required'
        }
      }

      if (isExternalProtocolAllowed(url)) {
        void shell.openExternal(url)
        return { action: 'deny' }
      }

      // Some OpenID libraries open a blank window first and then navigate it.
      if (url === 'about:blank') {
        return { action: 'allow', overrideBrowserWindowOptions: popupOptions }
      }

      if (!parseHttpUrl(url)) {
        this.logger.warn(
          `Blocked unsupported popup URL from ${VIEW_LABEL[kind]}: ${safeUrlForLog(url)}`
        )
        return { action: 'deny' }
      }

      const appUrl =
        kind === 'element' ? this.settings.servers.elementUrl : this.settings.servers.jitsiUrl

      if (
        shouldOpenExternally(
          url,
          appUrl,
          this.settings.authentication.trustedAuthOrigins
        )
      ) {
        this.logger.debug(`Opening external popup in the system browser: ${safeUrlForLog(url)}`)
        void shell.openExternal(url)
        return { action: 'deny' }
      }

      this.logger.debug(`Allowing in-app popup for ${VIEW_LABEL[kind]}: ${safeUrlForLog(url)}`)
      return {
        action: 'allow',
        overrideBrowserWindowOptions: popupOptions
      }
    })

    contents.on('did-create-window', (popup) => {
      this.popups.add(popup)
      popup.setMenuBarVisibility(false)
      popup.on('closed', () => this.popups.delete(popup))
      this.attachGuards(kind, popup.webContents)
      this.logger.debug(`Opened authentication or popup window for ${VIEW_LABEL[kind]}`)
    })

    contents.on('will-navigate', (event) => {
      const target = event.url
      if (!parseHttpUrl(target)) {
        if (isExternalProtocolAllowed(target)) void shell.openExternal(target)
        event.preventDefault()
        return
      }

      const appUrl =
        kind === 'element' ? this.settings.servers.elementUrl : this.settings.servers.jitsiUrl
      if (
        shouldOpenExternally(
          target,
          appUrl,
          this.settings.authentication.trustedAuthOrigins
        )
      ) {
        event.preventDefault()
        this.logger.debug(`Opening navigation target in system browser: ${safeUrlForLog(target)}`)
        void shell.openExternal(target)
      }
    })

    contents.on('will-redirect', (event) => {
      const target = event.url
      if (!parseHttpUrl(target)) return

      const appUrl =
        kind === 'element' ? this.settings.servers.elementUrl : this.settings.servers.jitsiUrl
      if (
        shouldOpenExternally(
          target,
          appUrl,
          this.settings.authentication.trustedAuthOrigins
        )
      ) {
        event.preventDefault()
        this.logger.debug(`Opening redirect target in system browser: ${safeUrlForLog(target)}`)
        void shell.openExternal(target)
      }
    })
  }

  private ensureLoaded(kind: ManagedView): void {
    const entry = this.entries.get(kind)
    if (!entry) return
    const configured = (
      kind === 'element' ? this.settings.servers.elementUrl : this.settings.servers.jitsiUrl
    ).trim()
    if (!entry.loaded || (entry.status.state === 'unconfigured' && configured !== '')) {
      this.load(kind)
    }
  }

  private load(kind: ManagedView, requestedUrl?: string): void {
    const entry = this.entries.get(kind)
    if (!entry) return
    entry.loaded = true

    const configured = (
      kind === 'element' ? this.settings.servers.elementUrl : this.settings.servers.jitsiUrl
    ).trim()
    entry.configuredUrl = configured
    const requested = requestedUrl?.trim() || configured
    entry.targetUrl = requested

    if (requested === '') {
      entry.hideUntilReady = true
      this.setStatus(entry, {
        view: kind,
        state: 'unconfigured',
        message: `Set the ${VIEW_LABEL[kind]} URL in Settings to get started.`,
        url: ''
      })
      this.updateVisibility()
      return
    }

    const validated = parseHttpUrl(requested)
    if (!validated) {
      entry.hideUntilReady = true
      this.setStatus(entry, {
        view: kind,
        state: 'error',
        message: 'The configured URL is not a valid http:// or https:// address.',
        url: requested
      })
      this.updateVisibility()
      return
    }

    const sameDocument =
      !entry.view.webContents.isLoadingMainFrame() &&
      isSameDocumentUrl(entry.view.webContents.getURL(), validated)

    entry.hideUntilReady = !sameDocument
    entry.lastLoadFailed = false
    this.setStatus(entry, {
      view: kind,
      state: sameDocument ? 'ready' : 'loading',
      url: requested
    })
    this.logger.info(`Loading ${VIEW_LABEL[kind]} from ${safeUrlForLog(requested)}`)

    if (sameDocument) {
      this.updateVisibility()
    }

    this.setZoom(entry)
    entry.view.webContents.loadURL(validated.toString()).catch((error: unknown) => {
      // did-fail-load reports the user-facing error. Keep this at debug level to
      // avoid duplicate error lines for the same navigation.
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('ERR_ABORTED')) {
        this.logger.debug(
          `loadURL rejected for ${VIEW_LABEL[kind]} (${safeUrlForLog(requested)})`
        )
      }
    })
  }

  private setStatus(entry: ManagedEntry, status: ViewStatus): void {
    entry.status = status
    this.onStatus(status)
  }

  private updateVisibility(): void {
    for (const entry of this.entries.values()) {
      const visible =
        !this.suspended &&
        !this.screenPickerOpen &&
        this.active === entry.kind &&
        entry.status.state === 'ready' &&
        !entry.hideUntilReady
      entry.view.setVisible(visible)
    }
  }

  private setZoom(entry: ManagedEntry): void {
    if (entry.view.webContents.isDestroyed()) return
    entry.view.webContents.setZoomFactor(this.settings.advanced.zoomFactor)
  }

  private applyCustomCss(entry: ManagedEntry): void {
    const contents = entry.view.webContents
    if (contents.isDestroyed()) return

    const css = this.settings.appearance.customCss
    if (entry.cssKey && entry.cssValue !== css) {
      contents.removeInsertedCSS(entry.cssKey).catch(() => undefined)
      entry.cssKey = undefined
      entry.cssValue = undefined
    }

    if (!css) return
    if (entry.cssKey && entry.cssValue === css) return

    contents
      .insertCSS(css)
      .then((key) => {
        entry.cssKey = key
        entry.cssValue = css
      })
      .catch((error: unknown) => this.logger.warn('Could not inject custom CSS', error))
  }

  private async handleDisplayMediaRequest(
    view: ManagedView,
    request: Electron.DisplayMediaRequestHandlerHandlerRequest,
    callback: (streams: Electron.Streams | null) => void
  ): Promise<void> {
    if (this.pendingScreenShare || this.screenPickerOpen) {
      callback(null)
      return
    }

    const id = this.nextScreenShareId
    this.nextScreenShareId += 1
    this.window.show()
    this.window.focus()
    this.screenPickerOpen = true
    this.updateVisibility()

    let sources: DesktopCapturerSource[] = []
    let error: string | undefined
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('The desktop portal did not respond within 30 seconds.')),
          30_000
        )
        timer.unref?.()
      })
      sources = await Promise.race([
        desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: false
        }),
        timeout
      ])
      if (sources.length === 0) {
        error = 'No screens or windows were offered by the desktop portal.'
      }
    } catch (captureError) {
      error = captureError instanceof Error ? captureError.message : String(captureError)
      this.logger.error('Could not enumerate screen-sharing sources', captureError)
    }

    const mapped: ScreenShareSource[] = sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      displayId: source.display_id || undefined
    }))

    const timer = setTimeout(() => {
      if (this.pendingScreenShare?.id !== id) return
      this.pendingScreenShare = null
      this.screenPickerOpen = false
      callback(null)
      this.logger.warn('Screen-share picker timed out')
      this.onScreenShareCancelled(id)
      this.updateVisibility()
    }, 120_000)
    timer.unref?.()

    this.pendingScreenShare = { id, view, callback, sources, timer }
    this.onScreenShareRequest({
      id,
      view,
      sources: mapped,
      audioRequested: request.audioRequested,
      error
    })
    this.logger.debug(
      `Screen-share request for ${VIEW_LABEL[view]} from ${request.securityOrigin}; ${mapped.length} source(s)`
    )
  }
}
