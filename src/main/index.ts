import { app, dialog } from 'electron'
import { mkdirSync } from 'node:fs'
import { resolveAppPaths } from './paths'
import { ConfigStore } from './config-store'
import { AppLogger } from './logger'
import { WindowStateStore } from './window-state'
import { AppController } from './app-controller'
import { registerIpc } from './ipc'

const paths = resolveAppPaths()
app.setName('TeamWork')
app.setDesktopName('teamwork.desktop')

mkdirSync(paths.configDir, { recursive: true, mode: 0o700 })
mkdirSync(paths.logDir, { recursive: true, mode: 0o700 })
app.setPath('userData', paths.configDir)
app.setAppLogsPath(paths.logDir)

const logger = new AppLogger(paths.logFile)
const configStore = new ConfigStore(paths.configFile, (message, error) =>
  logger.warn(message, error)
)
const loaded = configStore.load()
logger.configure(loaded.settings.logging)
logger.info('TeamWork bootstrapping')

if (!loaded.settings.advanced.hardwareAcceleration) {
  logger.warn('Hardware acceleration disabled by configuration')
  app.disableHardwareAcceleration()
}

// These switches must be set before the app becomes ready. Wayland is preferred
// when available; the setting exists for troubleshooting stubborn drivers.
const ozone = loaded.settings.linux.ozonePlatform
app.commandLine.appendSwitch('ozone-platform-hint', ozone)
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer,WaylandWindowDecorations')
if (ozone !== 'x11') {
  // Better IME support for chat input on Wayland. Ignored on X11 and by
  // Chromium builds that do not support the switch.
  app.commandLine.appendSwitch('enable-wayland-ime')
}

let controller: AppController | null = null
const settingsProvider = () => controller?.snapshot().settings ?? loaded.settings

app.on('certificate-error', (event, _webContents, url, error, _certificate, callback) => {
  if (settingsProvider().authentication.allowInsecureCertificates) {
    logger.warn(`Allowing invalid TLS certificate for ${url}: ${error}`)
    event.preventDefault()
    callback(true)
    return
  }
  logger.warn(`Rejected invalid TLS certificate for ${url}: ${error}`)
  callback(false)
})

app.on('child-process-gone', (_event, details) => {
  logger.error('A Chromium child process stopped', details)
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in the main process', error)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection in the main process', reason)
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    controller?.showWindow()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app
    .whenReady()
    .then(() => {
      const windowState = new WindowStateStore(paths.windowStateFile, (message, error) =>
        logger.warn(message, error)
      )

      controller = new AppController(paths, configStore, logger, windowState)
      controller.start()
      registerIpc(controller)
    })
    .catch((error: unknown) => {
      logger.error('Could not start TeamWork', error)
      const message = error instanceof Error ? error.stack ?? error.message : String(error)
      void dialog
        .showMessageBox({
          type: 'error',
          title: 'TeamWork could not start',
          message: 'TeamWork could not start.',
          detail: `${message}\n\nLogs: ${paths.logFile}`,
          buttons: ['Quit']
        })
        .finally(() => app.exit(1))
    })
}
