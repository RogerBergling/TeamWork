import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type { AppController } from './app-controller'
import { isTrustedShellSenderUrl } from './shell-url-policy'
import type { ManagedView, ShellView } from '../shared/types'

function isManagedView(value: unknown): value is ManagedView {
  return value === 'element' || value === 'jitsi'
}

function isShellView(value: unknown): value is ShellView {
  return isManagedView(value) || value === 'settings' || value === 'logs'
}

export function registerIpc(controller: AppController): void {
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => {
    if (controller.shellWebContentsId !== event.sender.id) return false

    // A matching webContents id is not sufficient: the document must still be
    // the packaged shell or the validated loopback development server.
    const location = controller.shellRendererLocation
    if (!location) return false

    const senderUrl = event.senderFrame?.url || event.sender.getURL()
    return isTrustedShellSenderUrl(senderUrl, location)
  }

  const handle = <T>(channel: string, handler: (...args: unknown[]) => T): void => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!trusted(event)) throw new Error(`Untrusted IPC sender on ${channel}`)
      return handler(...args)
    })
  }

  const on = (channel: string, handler: (...args: unknown[]) => void): void => {
    ipcMain.on(channel, (event, ...args) => {
      if (!trusted(event)) return
      handler(...args)
    })
  }

  handle('settings:get', () => controller.snapshot())
  handle('view:statuses', () => controller.getViewStatuses())
  handle('settings:save', (input) => controller.saveSettings(input))
  handle('settings:reset', () => controller.resetSettings())
  handle('settings:export', () => controller.exportSettings())
  handle('settings:import', () => controller.importSettings())
  handle('settings:choose-logo', () => controller.chooseLogo())
  handle('settings:logo-data', (path) => controller.getLogoData(String(path ?? '')))
  handle('settings:open-config', () => controller.openConfigFile())

  handle('logs:read', (lines) => controller.readLogs(typeof lines === 'number' ? lines : 500))
  handle('logs:clear', () => controller.clearLogs())
  handle('logs:open', () => controller.openLogFolder())

  handle('app:restart', () => controller.restart())
  handle('app:window-state', () => controller.getWindowState())

  on('app:renderer-ready', () => controller.markRendererReady())

  on('app:renderer-error', (message, details) => {
    if (typeof message !== 'string') return
    controller.reportRendererError(message, typeof details === 'string' ? details : undefined)
  })

  handle('view:clear-session', (view) => {
    if (!isManagedView(view)) throw new Error('Invalid view')
    return controller.clearSession(view)
  })

  handle('view:join-jitsi', (input) => {
    if (typeof input !== 'string') return { ok: false, error: 'Invalid meeting URL.' }
    return controller.joinJitsiMeeting(input)
  })

  on('view:activate', (view) => {
    if (!isShellView(view)) return
    controller.activateView(view)
  })

  on('view:bounds', (bounds) => {
    if (typeof bounds !== 'object' || bounds === null) return
    const value = bounds as Record<string, unknown>
    const numbers = ['x', 'y', 'width', 'height'].map((key) => value[key])
    if (numbers.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) return
    controller.setViewBounds({
      x: numbers[0] as number,
      y: numbers[1] as number,
      width: numbers[2] as number,
      height: numbers[3] as number
    })
  })

  on('view:suspend', () => controller.suspendViews())
  on('view:resume', () => controller.resumeViews())

  on('view:reload', (view) => {
    if (isManagedView(view)) controller.reloadView(view)
  })

  on('view:open-external', (view) => {
    if (isManagedView(view)) controller.openViewInBrowser(view)
  })

  on('screenshare:select', (id, sourceId) => {
    if (typeof id !== 'number') return
    controller.selectScreenShare(id, typeof sourceId === 'string' ? sourceId : null)
  })

  on('window:minimize', () => controller.minimizeWindow())
  on('window:maximize', () => controller.maximizeWindow())
  on('window:close', () => controller.closeWindow())
}
