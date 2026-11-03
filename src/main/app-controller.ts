import {
  app,
  dialog,
  Menu,
  nativeTheme,
  shell,
  type BrowserWindow,
  type MenuItemConstructorOptions
} from 'electron'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppPaths } from './paths'
import type { ConfigStore, SaveConfigResult } from './config-store'
import type { AppLogger } from './logger'
import type { PolicyStore } from './policy-store'
import type { WindowStateStore } from './window-state'
import { SessionManager } from './session-manager'
import { ViewManager } from './view-manager'
import { PendingAuthStore } from './pending-auth'
import { TrayController } from './tray'
import { createShellWindow } from './shell-window'
import { startupTimer } from './startup-timing'
import { BUILD_NUMBER, BUILD_TIMESTAMP } from './build-info'
import { chooseLogo, readLogoDataUrl, trayIconFor, windowIconFor } from './logo'
import { getByPath, safeParseSettings, setByPath, type Settings } from '../shared/settings'
import { formatBuildParts } from '../shared/build-info'
import { isAuthCallbackLink, resolveAuthCallback } from '../shared/auth-callback'
import {
  findDeepLinkInArgv,
  resolveJitsiMeetingInput,
  resolveTeamworkDeepLink,
  safeUrlForLog,
  type ResolvedDeepLink
} from '../shared/deep-links'
import type {
  ImportExportResult,
  JoinMeetingResult,
  LogSnapshot,
  ManagedView,
  SettingsMeta,
  SettingsSnapshot,
  ShellView,
  ViewBounds,
  ViewStatus,
  WindowState
} from '../shared/types'

export class AppController {
  private window: BrowserWindow | null = null
  private views: ViewManager | null = null
  private sessions: SessionManager | null = null
  private tray: TrayController | null = null
  private settings: Settings
  private readonly pendingAuth: PendingAuthStore
  private quitting = false
  private sessionsCleared = false
  private shellReady = false
  private rendererReady = false
  private pendingDeepLink: string | null = null
  private boundsTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly paths: AppPaths,
    private readonly configStore: ConfigStore,
    private readonly policy: PolicyStore,
    private readonly logger: AppLogger,
    private readonly windowState: WindowStateStore
  ) {
    this.settings = policy.apply(configStore.value)
    this.pendingAuth = new PendingAuthStore(join(paths.configDir, 'auth-pending.json'))
  }

  start(): void {
    startupTimer.mark('controller-start')
    this.logger.info(
      `Starting ${app.getName()} ${app.getVersion()} (build ${BUILD_NUMBER}, ${BUILD_TIMESTAMP})`
    )
    this.logger.info(`Configuration: ${this.paths.configFile}`)
    this.logger.info(`Log file: ${this.paths.logFile}`)
    this.logger.info(
      `Session type: ${process.env.XDG_SESSION_TYPE ?? 'unknown'}; Ozone hint: ${this.settings.linux.ozonePlatform}`
    )

    nativeTheme.themeSource = this.settings.appearance.theme
    this.sessions = new SessionManager(
      () => this.settings,
      this.logger,
      () => this.window
    )
    this.sessions.apply(this.settings)

    const icon = windowIconFor(this.settings)
    const state = this.windowState.load()
    this.window = createShellWindow({
      settings: this.settings,
      icon,
      state,
      baseDir: __dirname,
      onClose: (event) => this.onWindowClose(event),
      onBoundsChanged: () => this.scheduleWindowStateSave()
    })
    startupTimer.mark('window-created')

    this.window.on('maximize', () => this.sendWindowState())
    this.window.on('unmaximize', () => this.sendWindowState())
    this.window.on('enter-full-screen', () => this.sendWindowState())
    this.window.on('leave-full-screen', () => this.sendWindowState())
    this.window.on('closed', () => {
      this.window = null
      this.views = null
    })
    this.window.webContents.on('did-start-navigation', (event) => {
      if (event.isMainFrame && !event.isSameDocument) {
        this.rendererReady = false
      }
    })
    this.window.webContents.on('did-finish-load', () => {
      startupTimer.mark('shell-loaded')
      this.shellReady = true
      this.sendWindowState()
      for (const status of this.views?.getStatuses() ?? []) {
        this.send('view:status', status)
      }
      this.flushPendingDeepLink()
    })
    this.window.webContents.on('render-process-gone', (_event, details) => {
      this.logger.error('The TeamWork interface renderer stopped', details)
    })
    this.window.webContents.on('before-input-event', (event, input) => {
      if (this.settings.advanced.enableDevTools) return
      const key = input.key.toLowerCase()
      const withModifier = input.control || input.meta
      if (key === 'f12' || (withModifier && input.shift && ['i', 'j', 'c'].includes(key))) {
        event.preventDefault()
      }
    })

    this.views = new ViewManager(
      this.window,
      this.settings,
      this.sessions,
      this.logger,
      (status) => {
        if (status.state === 'ready' && startupTimer.mark(`${status.view}-ready`)) {
          this.logger.info(
            `Startup: ${status.view} ready at ${startupTimer.get(`${status.view}-ready`)} ms`
          )
        }
        this.send('view:status', status)
      },
      (request) => this.send('screenshare:request', request),
      (id) => this.send('screenshare:cancelled', id),
      (event) => {
        this.pendingAuth.record(event.view)
        this.send('auth:external', event)
      }
    )
    startupTimer.mark('views-prepared')

    this.tray = new TrayController(
      this.settings,
      {
        showWindow: () => this.showWindow(),
        toggleWindow: () => this.toggleWindow(),
        showElement: () => this.showView('element'),
        showJitsi: () => this.showView('jitsi'),
        showSettings: () => this.showView('settings'),
        showLogs: () => this.showView('logs'),
        quit: () => this.quit()
      },
      (message, error) => this.logger.error(message, error)
    )
    this.tray.apply(this.settings, this.trayIcon())
    startupTimer.mark('tray-ready')

    if (this.settings.window.startMinimized && !this.tray.visible) {
      this.logger.warn('Start-minimized was requested but the tray is unavailable; showing the window')
      this.showWindow()
    }

    this.installMenu()
    startupTimer.mark('menu-ready')

    app.on('before-quit', (event) => this.beforeQuit(event))
    app.on('activate', () => this.showWindow())

    if (process.env.TEAMWORK_SMOKE_TEST === '1') {
      this.scheduleSmokeTest()
    }
  }

  getViewStatuses(): ViewStatus[] {
    return this.views?.getStatuses() ?? []
  }

  get shellWebContentsId(): number | null {
    if (!this.window || this.window.isDestroyed() || this.window.webContents.isDestroyed()) {
      return null
    }
    return this.window.webContents.id
  }

  snapshot(): SettingsSnapshot {
    return { settings: this.settings, meta: this.meta() }
  }

  meta(): SettingsMeta {
    const sessionType = process.env.XDG_SESSION_TYPE?.toLowerCase() ?? 'unknown'
    const build = formatBuildParts(BUILD_TIMESTAMP)
    return {
      configPath: this.paths.configFile,
      logPath: this.paths.logFile,
      policyPath: this.paths.policyFile,
      lockedFields: this.policy.locked,
      policyError: this.policy.error,
      appVersion: app.getVersion(),
      buildNumber: BUILD_NUMBER,
      buildTimestamp: BUILD_TIMESTAMP,
      buildDate: build.date,
      buildTime: build.time,
      buildHour: build.hour,
      electronVersion: process.versions.electron ?? '',
      chromeVersion: process.versions.chrome ?? '',
      nodeVersion: process.versions.node ?? '',
      platform: `${process.platform} ${process.arch}`,
      sessionType,
      isWayland:
        sessionType.includes('wayland') ||
        Boolean(process.env.WAYLAND_DISPLAY) ||
        Boolean(process.env.WAYLAND_SOCKET),
      loadError: this.configStore.warning
    }
  }

  saveSettings(input: unknown): SaveConfigResult {
    const previous = this.settings
    const parsed = safeParseSettings(input)
    if (!parsed.ok) {
      return { ok: false, errors: parsed.errors, message: 'Some settings are invalid.' }
    }

    // The GUI only knows the effective (policy-applied) values. Put the user's
    // existing values back before writing so the user file remains the user's
    // own configuration when a policy is later removed.
    const result = this.configStore.save(this.preservePolicyLockedValues(parsed.settings))
    if (!result.ok || !result.settings) return result

    this.settings = this.policy.apply(result.settings)
    this.applySettingsSafely(previous)
    return { ...result, settings: this.settings }
  }

  resetSettings(): SaveConfigResult {
    const previous = this.settings
    const result = this.configStore.reset()
    if (!result.ok || !result.settings) return result

    this.settings = this.policy.apply(result.settings)
    this.applySettingsSafely(previous)
    return { ...result, settings: this.settings }
  }

  async exportSettings(): Promise<ImportExportResult> {
    const options: Electron.SaveDialogOptions = {
      title: 'Export TeamWork configuration',
      defaultPath: 'teamwork-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const result = this.window
      ? await dialog.showSaveDialog(this.window, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { ok: false, message: 'Export cancelled.' }

    const saveResult = this.configStore.exportTo(result.filePath)
    return { ...saveResult, path: result.filePath }
  }

  async importSettings(): Promise<ImportExportResult> {
    const options: Electron.OpenDialogOptions = {
      title: 'Import TeamWork configuration',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const result = this.window
      ? await dialog.showOpenDialog(this.window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, message: 'Import cancelled.' }
    }

    const previous = this.settings
    const saveResult = this.configStore.importFrom(result.filePaths[0])
    if (!saveResult.ok || !saveResult.settings) return saveResult

    this.settings = this.policy.apply(saveResult.settings)
    this.applySettingsSafely(previous)
    return { ...saveResult, settings: this.settings, path: result.filePaths[0] }
  }

  async chooseLogo(): Promise<string | null> {
    return chooseLogo(this.window)
  }

  getLogoData(path: string): string | null {
    return readLogoDataUrl(path)
  }

  async openConfigFile(): Promise<void> {
    const failure = await shell.openPath(this.paths.configFile)
    if (failure) shell.showItemInFolder(this.paths.configFile)
  }

  readLogs(lines = 500): LogSnapshot {
    const result = this.logger.read(lines)
    return { path: this.paths.logFile, lines: result.lines, size: result.size }
  }

  clearLogs(): void {
    this.logger.clear()
  }

  openLogFolder(): void {
    if (existsSync(this.paths.logFile)) {
      shell.showItemInFolder(this.paths.logFile)
    } else {
      void shell.openPath(this.paths.logDir)
    }
  }

  async openNotices(): Promise<void> {
    const noticesPath = app.isPackaged
      ? join(process.resourcesPath, 'THIRD_PARTY_NOTICES.md')
      : join(app.getAppPath(), 'THIRD_PARTY_NOTICES.md')
    const failure = await shell.openPath(noticesPath)
    if (failure) {
      this.logger.warn(`Could not open third-party notices at ${noticesPath}`, failure)
    }
  }

  handleSecondInstance(argv: string[]): void {
    this.showWindow()
    const deepLink = findDeepLinkInArgv(argv)
    if (deepLink) this.handleDeepLink(deepLink)
  }

  handleDeepLink(raw: string): void {
    this.pendingDeepLink = raw
    this.flushPendingDeepLink()
  }

  markRendererReady(): void {
    this.rendererReady = true
    if (startupTimer.mark('renderer-ready')) {
      this.logger.info(`Startup timing: ${JSON.stringify(startupTimer.snapshot())}`)
    }
    this.flushPendingDeepLink()
  }

  reportRendererError(message: string, details?: string): void {
    const safeMessage = message.replace(/[\r\n]+/g, ' ').slice(0, 1000)
    const safeDetails = details?.slice(0, 4000)
    this.logger.error(`Renderer error: ${safeMessage}`, safeDetails)
  }

  joinJitsiMeeting(input: string): JoinMeetingResult {
    const result = resolveJitsiMeetingInput(input, this.settings.servers.jitsiUrl)
    if (!result.ok) {
      this.logger.warn(`Rejected Jitsi meeting link: ${result.error}`)
      return { ok: false, error: result.error }
    }
    if (!this.views) {
      return { ok: false, error: 'The Jitsi view is not available.' }
    }

    this.logger.info(`Opening Jitsi meeting ${safeUrlForLog(result.url)}`)
    this.views.openJitsiMeeting(result.url)
    return { ok: true, url: result.url }
  }

  private openDeepLink(raw: string): ResolvedDeepLink {
    const result = resolveTeamworkDeepLink(
      raw,
      this.settings.servers.jitsiUrl,
      this.settings.servers.elementUrl
    )
    if (!result.ok) {
      this.logger.warn(`Rejected TeamWork deep link: ${result.error}`)
      return result
    }
    if (!this.views) {
      return { ok: false, error: 'The embedded view is not available.' }
    }

    this.logger.info(`Opening ${result.view} deep link ${safeUrlForLog(result.url)}`)
    if (result.view === 'jitsi') this.views.openJitsiMeeting(result.url)
    else this.views.openElementRoom(result.url)
    return result
  }

  private openAuthCallback(raw: string): ResolvedDeepLink {
    const result = resolveAuthCallback(
      raw,
      this.settings.servers.elementUrl,
      this.settings.servers.jitsiUrl
    )
    if (!result.ok) {
      this.logger.warn(`Rejected external sign-in callback: ${result.error}`)
      return result
    }
    if (!this.views) {
      return { ok: false, error: 'The embedded view is not available.' }
    }
    if (!this.pendingAuth.consume(result.view)) {
      const message =
        'No system-browser sign-in is pending for this application. Start sign-in from TeamWork and try again.'
      this.logger.warn(`Rejected unsolicited external sign-in callback for ${result.view}`)
      return { ok: false, error: message }
    }

    this.logger.info(
      `Completing external sign-in for ${result.view} at ${safeUrlForLog(result.url)}`
    )
    if (result.view === 'jitsi') this.views.openJitsiMeeting(result.url)
    else this.views.openElementRoom(result.url)
    return result
  }

  activateView(view: ShellView): void {
    if (view === 'element' || view === 'jitsi') {
      this.views?.activate(view)
    } else {
      this.views?.activate(null)
    }
  }

  setViewBounds(bounds: ViewBounds): void {
    this.views?.setBounds(bounds)
  }

  suspendViews(): void {
    this.views?.setSuspended(true)
  }

  resumeViews(): void {
    this.views?.setSuspended(false)
  }

  reloadView(view: ManagedView): void {
    this.views?.reload(view)
  }

  openViewInBrowser(view: ManagedView): void {
    this.views?.openInBrowser(view)
  }

  async clearSession(view: ManagedView): Promise<void> {
    await this.views?.clearSession(view)
  }

  selectScreenShare(id: number, sourceId: string | null): void {
    this.views?.selectScreenShare(id, sourceId)
  }

  getWindowState(): WindowState {
    return {
      maximized: this.window?.isMaximized() ?? false,
      fullScreen: this.window?.isFullScreen() ?? false
    }
  }

  minimizeWindow(): void {
    this.window?.minimize()
  }

  maximizeWindow(): void {
    if (!this.window) return
    if (this.window.isMaximized()) this.window.unmaximize()
    else this.window.maximize()
  }

  closeWindow(): void {
    this.window?.close()
  }

  showWindow(): void {
    if (!this.window) return
    if (this.window.isMinimized()) this.window.restore()
    this.window.show()
    this.window.focus()
  }

  toggleWindow(): void {
    if (!this.window) return
    if (this.window.isVisible() && this.window.isFocused()) {
      this.window.hide()
    } else {
      this.showWindow()
    }
  }

  showView(view: ShellView): void {
    this.showWindow()
    this.activateView(view)
    this.send('app:command', view)
  }

  showJoinMeetingDialog(): void {
    this.showView('jitsi')
    this.send('app:command', 'join-meeting')
  }

  reloadActive(): void {
    const active = this.views?.activeView
    if (active) this.views?.reload(active)
  }

  toggleDevTools(): void {
    if (!this.settings.advanced.enableDevTools) return
    const active = this.views?.activeView
    if (active) {
      this.views?.toggleDevTools(active)
    } else {
      this.window?.webContents.toggleDevTools()
    }
  }

  async restart(): Promise<void> {
    this.quitting = true
    this.saveWindowState()
    if (this.settings.authentication.clearSessionsOnExit) {
      await this.views?.clearSessions()
    }
    app.relaunch()
    app.exit(0)
  }

  quit(): void {
    this.quitting = true
    this.saveWindowState()
    app.quit()
  }

  private flushPendingDeepLink(): void {
    if (!this.shellReady || !this.rendererReady || !this.pendingDeepLink || !this.views) return

    const raw = this.pendingDeepLink
    this.pendingDeepLink = null
    this.showWindow()

    const authCallback = isAuthCallbackLink(raw)
    const result = authCallback ? this.openAuthCallback(raw) : this.openDeepLink(raw)
    if (!result.ok) {
      const options: Electron.MessageBoxOptions = {
        type: 'warning',
        title: authCallback ? 'Could not complete sign-in' : 'Could not open TeamWork link',
        message: authCallback
          ? 'TeamWork could not complete the system-browser sign-in.'
          : 'TeamWork could not open the link.',
        detail: result.error ?? 'The link target is invalid.',
        buttons: ['OK'],
        noLink: true
      }
      if (this.window) void dialog.showMessageBox(this.window, options)
      else void dialog.showMessageBox(options)
      return
    }

    this.showView(result.view)
  }

  private applySettingsSafely(previous: Settings): void {
    try {
      this.applySettings(previous)
    } catch (error) {
      this.logger.error('Some settings could not be applied at runtime', error)
    }
  }

  private preservePolicyLockedValues(settings: Settings): Settings {
    let userSettings = structuredClone(settings)
    for (const path of this.policy.locked) {
      const existing = getByPath(this.configStore.value, path)
      if (existing !== undefined) userSettings = setByPath(userSettings, path, existing)
    }
    return userSettings
  }

  private applySettings(previous: Settings): void {
    this.logger.configure(this.settings.logging)
    nativeTheme.themeSource = this.settings.appearance.theme
    this.sessions?.apply(this.settings)
    this.views?.applySettings(this.settings, previous)

    if (this.window) {
      this.window.setTitle(this.settings.appearance.appName)
      this.window.setIcon(windowIconFor(this.settings))
    }

    this.tray?.apply(this.settings, this.trayIcon())
    this.installMenu()
    this.send('settings:changed', this.snapshot())

    this.logger.debug('Settings applied')
  }

  private trayIcon() {
    const custom = windowIconFor(this.settings)
    if (!custom.isEmpty()) return custom.resize({ width: 22, height: 22 })
    return trayIconFor()
  }

  private installMenu(): void {
    const name = this.settings.appearance.appName
    const template: MenuItemConstructorOptions[] = [
      {
        label: name,
        submenu: [
          {
            label: 'Settings…',
            accelerator: 'CmdOrCtrl+,',
            click: () => this.showView('settings')
          },
          {
            label: 'Open configuration file',
            click: () => void this.openConfigFile()
          },
          { type: 'separator' },
          { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => this.quit() }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          {
            label: 'Element',
            accelerator: 'CmdOrCtrl+1',
            click: () => this.showView('element')
          },
          {
            label: 'Jitsi',
            accelerator: 'CmdOrCtrl+2',
            click: () => this.showView('jitsi')
          },
          {
            label: 'Join Jitsi meeting…',
            accelerator: 'CmdOrCtrl+J',
            click: () => this.showJoinMeetingDialog()
          },
          { type: 'separator' },
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: () => this.reloadActive()
          },
          {
            label: 'Open current page in browser',
            click: () => {
              const active = this.views?.activeView
              if (active) this.views?.openInBrowser(active)
            }
          },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          ...(this.settings.advanced.enableDevTools
            ? ([
                { type: 'separator' },
                {
                  label: 'Toggle developer tools',
                  accelerator: 'F12',
                  click: () => this.toggleDevTools()
                }
              ] satisfies MenuItemConstructorOptions[])
            : [])
        ]
      },
      {
        label: 'Help',
        submenu: [
          { label: 'Logs…', click: () => this.showView('logs') },
          {
            label: 'Open log folder',
            click: () => this.openLogFolder()
          },
          {
            label: 'Documentation',
            click: () => void shell.openExternal('https://github.com/RogerBergling/TeamWork#readme')
          },
          {
            label: 'Third-party notices',
            click: () => void this.openNotices()
          },
          { type: 'separator' },
          { label: `About ${name}`, click: () => void this.showAbout() }
        ]
      }
    ]

    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  private async showAbout(): Promise<void> {
    const meta = this.meta()
    const options: Electron.MessageBoxOptions = {
      type: 'info',
      title: `About ${this.settings.appearance.appName}`,
      message: `${this.settings.appearance.appName} ${meta.appVersion}`,
      detail: [
        `Element + Jitsi desktop client`,
        '',
        `Build ${meta.buildNumber} · ${meta.buildDate} ${meta.buildTime} (hour ${meta.buildHour})`,
        `Electron ${meta.electronVersion}`,
        `Chromium ${meta.chromeVersion}`,
        `Node ${meta.nodeVersion}`,
        `Platform ${meta.platform}`,
        `Session ${meta.sessionType}${meta.isWayland ? ' (Wayland)' : ''}`,
        '',
        `Configuration: ${meta.configPath}`,
        `Logs: ${meta.logPath}`
      ].join('\n'),
      buttons: ['OK'],
      noLink: true
    }
    if (this.window) await dialog.showMessageBox(this.window, options)
    else await dialog.showMessageBox(options)
  }

  private onWindowClose(event: Electron.Event): void {
    this.saveWindowState()
    if (!this.quitting && this.settings.window.closeToTray && this.tray?.visible) {
      event.preventDefault()
      this.window?.hide()
    }
  }

  private beforeQuit(event: Electron.Event): void {
    this.quitting = true
    this.saveWindowState()

    if (this.settings.authentication.clearSessionsOnExit && !this.sessionsCleared) {
      this.sessionsCleared = true
      event.preventDefault()
      void (this.sessions?.clearAll() ?? Promise.resolve())
        .catch((error: unknown) => this.logger.error('Could not clear sessions on exit', error))
        .finally(() => app.quit())
    }
  }

  private scheduleWindowStateSave(): void {
    if (this.boundsTimer) clearTimeout(this.boundsTimer)
    this.boundsTimer = setTimeout(() => {
      this.boundsTimer = null
      this.saveWindowState()
    }, 400)
    this.boundsTimer.unref?.()
  }

  private saveWindowState(): void {
    if (!this.window || this.window.isDestroyed()) return
    const bounds = this.window.getNormalBounds()
    this.windowState.save({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: this.window.isMaximized()
    })
  }

  private scheduleSmokeTest(): void {
    const window = this.window
    if (!window) return

    const finish = async (): Promise<void> => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const state = (await window.webContents.executeJavaScript(`({
          title: document.title,
          rail: Boolean(document.querySelector('.rail')),
          settings: Boolean(document.querySelector('.settings-view')),
          buttons: document.querySelectorAll('button').length,
          theme: document.documentElement.dataset.theme ?? 'unknown'
        })`)) as Record<string, unknown>

        let saveTest: Record<string, unknown> | null = null
        if (process.env.TEAMWORK_SMOKE_SAVE_TEST === '1') {
          saveTest = (await window.webContents.executeJavaScript(`(async () => {
            const snapshot = await window.teamwork.getSettings()
            const next = structuredClone(snapshot.settings)
            next.appearance.organizationName = 'Smoke Test Organisation'
            next.logging.debug = true
            const saved = await window.teamwork.saveSettings(next)
            const reloaded = await window.teamwork.getSettings()
            return {
              ok: saved.ok === true,
              organizationName: reloaded.settings.appearance.organizationName,
              debug: reloaded.settings.logging.debug,
              configPath: reloaded.meta.configPath
            }
          })()`)) as Record<string, unknown>
          await new Promise((resolve) => setTimeout(resolve, 300))
        }

        if (process.env.TEAMWORK_SMOKE_JOIN_DIALOG === '1') {
          this.showJoinMeetingDialog()
          await new Promise((resolve) => setTimeout(resolve, 600))
        }

        let uiJoinTest: Record<string, unknown> | null = null
        if (process.env.TEAMWORK_SMOKE_UI_JOIN_URL) {
          uiJoinTest = (await window.webContents.executeJavaScript(`(async () => {
            const input = document.querySelector('#join-meeting-url')
            if (!input) return { ok: false, error: 'Join input not found' }
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            ).set
            setter.call(input, ${JSON.stringify(process.env.TEAMWORK_SMOKE_UI_JOIN_URL)})
            input.dispatchEvent(new Event('input', { bubbles: true }))
            await new Promise((resolve) => setTimeout(resolve, 100))
            input.closest('form').requestSubmit()
            await new Promise((resolve) => setTimeout(resolve, 1200))
            const statuses = await window.teamwork.getViewStatuses()
            return {
              ok: !document.querySelector('.join-modal'),
              statuses
            }
          })()`)) as Record<string, unknown>
        }

        const screenshotPath = process.env.TEAMWORK_SMOKE_SCREENSHOT
        const image = await window.webContents.capturePage()
        const png = image.toPNG()
        if (screenshotPath) await writeFile(screenshotPath, png)

        const activeView = this.views?.activeView ?? null
        const viewPng = activeView ? await this.views?.capture(activeView) : null
        if (screenshotPath && viewPng && activeView) {
          await writeFile(screenshotPath.replace(/\.png$/i, `-${activeView}.png`), viewPng)
        }

        const expectedView = process.env.TEAMWORK_SMOKE_EXPECT_READY
        const statuses = this.views?.getStatuses() ?? []
        const expectedReady =
          !expectedView ||
          statuses.some((status) => status.view === expectedView && status.state === 'ready')

        const result = {
          ...state,
          screenshot: screenshotPath ?? null,
          screenshotBytes: png.length,
          activeView,
          viewCaptured: Boolean(viewPng),
          statuses,
          saveTest,
          uiJoinTest,
          rendererUrl: window.webContents.getURL()
        }
        this.logger.info(`SMOKE_TEST ${JSON.stringify(result)}`)
        const savePassed = saveTest === null || saveTest.ok === true
        const joinPassed = uiJoinTest === null || uiJoinTest.ok === true
        app.exit(
          state.rail === true &&
            state.settings === true &&
            expectedReady &&
            savePassed &&
            joinPassed
            ? 0
            : 1
        )
      } catch (error) {
        this.logger.error('Smoke test failed', error)
        app.exit(1)
      }
    }

    if (window.webContents.isLoadingMainFrame()) {
      window.webContents.once('did-finish-load', () => void finish())
    } else {
      void finish()
    }
  }

  private sendWindowState(): void {
    this.send('window:state', this.getWindowState())
  }

  private send(channel: string, payload: unknown): void {
    if (!this.window || this.window.isDestroyed() || this.window.webContents.isDestroyed()) return
    this.window.webContents.send(channel, payload)
  }
}
