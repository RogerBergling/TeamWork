import { dialog, session, type BrowserWindow, type Session } from 'electron'
import type { ManagedView } from '../shared/types'
import type { Settings } from '../shared/settings'
import { normalizeOrigin, originOf } from '../shared/urls'
import type { AppLogger } from './logger'

export type DisplayMediaCallback = (streams: Electron.Streams | null) => void
export type DisplayMediaHandler = (
  view: ManagedView,
  request: Electron.DisplayMediaRequestHandlerHandlerRequest,
  callback: DisplayMediaCallback
) => void

const APP_PERMISSIONS = new Set<string>([
  'media',
  'display-capture',
  'fullscreen',
  'clipboard-read',
  'clipboard-sanitized-write',
  'speaker-selection',
  'storage-access',
  'top-level-storage-access',
  'persistent-storage',
  'pointerLock',
  'screen-wake-lock',
  'window-management',
  'openExternal'
])

const ALWAYS_ALLOWED = new Set<string>(['storage-access', 'top-level-storage-access', 'openExternal'])

export class SessionManager {
  private displayHandler: DisplayMediaHandler | null = null
  private readonly permissionCache = new Map<string, boolean>()
  private readonly lastProxy = new Map<ManagedView, string>()
  private readonly lastUserAgent = new Map<ManagedView, string>()
  private readonly lastSpellcheck = new Map<ManagedView, boolean>()

  constructor(
    private readonly getSettings: () => Settings,
    private readonly logger: AppLogger,
    private readonly getWindow: () => BrowserWindow | null
  ) {
    for (const view of ['element', 'jitsi'] as const) {
      this.configurePermissionHandlers(view)
      this.configureDisplayMedia(view)
    }
  }

  sessionFor(view: ManagedView): Session {
    return session.fromPartition(this.partitionFor(view))
  }

  partitionFor(view: ManagedView): string {
    return `persist:${view}`
  }

  setDisplayMediaHandler(handler: DisplayMediaHandler): void {
    this.displayHandler = handler
  }

  apply(settings: Settings): void {
    for (const view of ['element', 'jitsi'] as const) {
      const target = this.sessionFor(view)

      const userAgent = this.userAgentFor(view, settings)
      if (this.lastUserAgent.get(view) !== userAgent) {
        target.setUserAgent(userAgent, 'en-US,en')
        this.lastUserAgent.set(view, userAgent)
      }

      if (this.lastSpellcheck.get(view) !== settings.advanced.spellcheck) {
        target.setSpellCheckerEnabled(settings.advanced.spellcheck)
        this.lastSpellcheck.set(view, settings.advanced.spellcheck)
      }

      const proxyMode =
        settings.network.proxyMode === 'system'
          ? 'system'
          : settings.network.proxyMode === 'direct'
            ? 'direct'
            : 'fixed_servers'
      const proxyRules =
        settings.network.proxyMode === 'custom' ? settings.network.proxyUrl : undefined
      const proxyKey = `${proxyMode}|${proxyRules ?? ''}`

      if (this.lastProxy.get(view) !== proxyKey) {
        target
          .setProxy(proxyRules ? { mode: proxyMode, proxyRules } : { mode: proxyMode })
          .then(() => this.lastProxy.set(view, proxyKey))
          .catch((error: unknown) => this.logger.error(`Could not apply proxy for ${view}`, error))
      }
    }
  }

  async clear(view: ManagedView): Promise<void> {
    const target = this.sessionFor(view)
    await target.clearStorageData()
    await target.clearCache()
    await target.clearAuthCache()
    this.permissionCache.clear()
    this.logger.info(`Cleared session data for ${view}`)
  }

  async clearAll(): Promise<void> {
    await Promise.all([this.clear('element'), this.clear('jitsi')])
  }

  private userAgentFor(view: ManagedView, settings: Settings): string {
    const override =
      view === 'element' ? settings.servers.elementUserAgent : settings.servers.jitsiUserAgent
    if (override) return override

    const chrome = process.versions.chrome ?? '120.0.0.0'
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }

  private appOriginFor(view: ManagedView, settings: Settings): string | null {
    return normalizeOrigin(view === 'element' ? settings.servers.elementUrl : settings.servers.jitsiUrl)
  }

  private configureDisplayMedia(view: ManagedView): void {
    this.sessionFor(view).setDisplayMediaRequestHandler((request, callback) => {
      if (!this.displayHandler) {
        this.logger.warn(`Screen sharing requested for ${view} but no handler is registered`)
        callback(null)
        return
      }
      this.displayHandler(view, request, callback)
    })
  }

  private configurePermissionHandlers(view: ManagedView): void {
    const target = this.sessionFor(view)

    target.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
      const settings = this.getSettings()
      const appOrigin = this.appOriginFor(view, settings)
      const origin = normalizeOrigin(requestingOrigin)

      if (ALWAYS_ALLOWED.has(permission)) return true
      if (origin !== null && appOrigin !== null && origin === appOrigin) {
        if (permission === 'notifications') return settings.authentication.notifications
        return APP_PERMISSIONS.has(permission)
      }

      // Force a permission request (and therefore an explicit prompt) for
      // sensitive permissions coming from a different origin, such as Element
      // Call hosted on its own domain.
      return false
    })

    target.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const settings = this.getSettings()
      const appOrigin = this.appOriginFor(view, settings)
      const requestingUrl = 'requestingUrl' in details ? details.requestingUrl : webContents.getURL()
      const origin = originOf(requestingUrl)

      if (origin === null) {
        this.logger.debug(`Denied ${permission} request without a valid origin`)
        callback(false)
        return
      }

      if (permission === 'notifications' && !settings.authentication.notifications) {
        callback(false)
        return
      }

      if (origin === appOrigin) {
        callback(true)
        return
      }

      if (!['media', 'display-capture', 'speaker-selection'].includes(permission)) {
        this.logger.debug(`Denied ${permission} request from untrusted origin ${origin}`)
        callback(false)
        return
      }

      const cacheKey = `${view}:${permission}:${origin}`
      const cached = this.permissionCache.get(cacheKey)
      if (cached !== undefined) {
        callback(cached)
        return
      }

      const label =
        permission === 'display-capture'
          ? 'share your screen'
          : permission === 'speaker-selection'
            ? 'use your speakers'
            : 'use your camera and microphone'

      const options: Electron.MessageBoxOptions = {
        type: 'question',
        buttons: ['Allow', 'Deny'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: 'Permission request',
        message: `${origin} wants to ${label}`,
        detail: `This page is embedded in the ${view === 'element' ? 'Element' : 'Jitsi'} view. Only allow it if you trust this origin.`
      }

      const parent = this.getWindow()
      if (parent && !parent.isVisible()) parent.show()
      parent?.focus()
      const prompt = parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)

      void prompt
        .then((result) => {
          const allowed = result.response === 0
          this.permissionCache.set(cacheKey, allowed)
          this.logger.info(`Permission ${permission} for ${origin}: ${allowed ? 'allowed' : 'denied'}`)
          callback(allowed)
        })
        .catch((error: unknown) => {
          this.logger.error('Permission prompt failed', error)
          callback(false)
        })
    })
  }
}
