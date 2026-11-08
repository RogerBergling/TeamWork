import { app, BrowserWindow, screen, type NativeImage } from 'electron'
import { join } from 'node:path'
import { safeUrlForLog } from '../shared/deep-links'
import {
  isAllowedShellNavigation,
  resolveShellRendererLocation,
  shellWindowOpenDecision,
  type ShellRendererLocation
} from './shell-url-policy'
import type { PersistedWindowState } from './window-state'

export interface ShellWindowOptions {
  settings: import('../shared/settings').Settings
  icon: NativeImage
  state: PersistedWindowState
  baseDir: string
  rendererLocation?: ShellRendererLocation
  onClose: (event: Electron.Event) => void
  onBoundsChanged: () => void
}

function intersectsDisplay(bounds: PersistedWindowState): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const overlapWidth =
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
    const overlapHeight =
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
    return overlapWidth >= 120 && overlapHeight >= 80
  })
}

export function createShellWindow(options: ShellWindowOptions): BrowserWindow {
  const { settings, state, icon } = options
  const useRememberedBounds = settings.window.rememberBounds && intersectsDisplay(state)
  const bounds = useRememberedBounds
    ? { x: state.x, y: state.y, width: state.width, height: state.height }
    : { width: 1280, height: 820 }

  const preloadPath = join(options.baseDir, '../preload/index.js')
  const rendererLocation: ShellRendererLocation =
    options.rendererLocation ??
    resolveShellRendererLocation({
      baseDir: options.baseDir,
      isPackaged: app.isPackaged,
      envUrl: process.env.ELECTRON_RENDERER_URL
    })

  const window = new BrowserWindow({
    ...bounds,
    minWidth: 940,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#20202e',
    title: settings.appearance.appName,
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: settings.advanced.spellcheck,
      devTools: true,
      backgroundThrottling: false
    }
  })

  window.setMenuBarVisibility(false)

  if (rendererLocation.load.kind === 'dev-url') {
    void window.loadURL(rendererLocation.load.url)
  } else if (rendererLocation.load.kind === 'file') {
    void window.loadFile(rendererLocation.load.file)
  } else {
    void window.loadURL(
      `data:text/html,${encodeURIComponent('<h1>Renderer build not found</h1>')}`
    )
  }

  // The shell document contains the privileged preload bridge. Never let it
  // navigate away from the packaged renderer or the validated dev server.
  const guardNavigation = (event: Electron.Event, url: string): void => {
    if (isAllowedShellNavigation(url, rendererLocation)) return
    event.preventDefault()
    console.warn(
      `TeamWork blocked an unexpected shell navigation to ${safeUrlForLog(url)}`
    )
  }
  window.webContents.on('will-navigate', (event, url) => guardNavigation(event, url))
  window.webContents.on('will-redirect', (event, url) => guardNavigation(event, url))
  window.webContents.setWindowOpenHandler((details) => shellWindowOpenDecision(details.url))

  window.once('ready-to-show', () => {
    if (settings.window.startMinimized && settings.appearance.showTrayIcon) return
    if (useRememberedBounds && state.maximized) window.maximize()
    window.show()
    window.focus()
  })

  window.on('close', options.onClose)
  window.on('resize', options.onBoundsChanged)
  window.on('move', options.onBoundsChanged)
  window.on('maximize', options.onBoundsChanged)
  window.on('unmaximize', options.onBoundsChanged)

  return window
}
