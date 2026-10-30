import { Menu, Tray, type NativeImage } from 'electron'
import type { Settings } from '../shared/settings'

export interface TrayCallbacks {
  showWindow: () => void
  toggleWindow: () => void
  showElement: () => void
  showJitsi: () => void
  showSettings: () => void
  showLogs: () => void
  quit: () => void
}

export class TrayController {
  private tray: Tray | null = null
  private settings: Settings

  constructor(
    settings: Settings,
    private readonly callbacks: TrayCallbacks,
    private readonly onError: (message: string, error?: unknown) => void = () => undefined
  ) {
    this.settings = settings
  }

  get visible(): boolean {
    return this.tray !== null
  }

  apply(settings: Settings, icon: NativeImage): void {
    this.settings = settings
    if (!settings.appearance.showTrayIcon) {
      this.destroy()
      return
    }
    try {
      if (!this.tray) {
        this.tray = new Tray(icon)
        this.tray.on('click', this.callbacks.toggleWindow)
        this.tray.on('double-click', this.callbacks.showWindow)
      } else {
        this.tray.setImage(icon)
      }
      this.tray.setToolTip(settings.appearance.appName)
      this.rebuildMenu()
    } catch (error) {
      this.onError('Could not create the system tray icon', error)
      this.destroy()
    }
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private rebuildMenu(): void {
    if (!this.tray) return
    const menu = Menu.buildFromTemplate([
      { label: `Show ${this.settings.appearance.appName}`, click: this.callbacks.showWindow },
      { type: 'separator' },
      { label: 'Element', click: this.callbacks.showElement },
      { label: 'Jitsi', click: this.callbacks.showJitsi },
      { type: 'separator' },
      { label: 'Settings…', click: this.callbacks.showSettings },
      { label: 'Logs…', click: this.callbacks.showLogs },
      { type: 'separator' },
      { label: 'Quit', click: this.callbacks.quit }
    ])
    this.tray.setContextMenu(menu)
  }
}
