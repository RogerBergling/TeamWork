import { app, dialog, nativeImage, type BrowserWindow, type NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { Settings } from '../shared/settings'
import { expandHome } from './logo-path'

export { expandHome, isLogoPathAllowed, resolveLogoPath } from './logo-path'
export { readLogoDataUrl } from './logo-file'

export function defaultIconPath(): string {
  const packaged = join(process.resourcesPath, 'icon.png')
  if (app.isPackaged && existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'build', 'icon.png')
}

export async function chooseLogo(parent: BrowserWindow | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Choose a logo',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] },
      { name: 'All files', extensions: ['*'] }
    ]
  }

  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

export function windowIconFor(settings: Settings): NativeImage {
  const custom = settings.appearance.logoPath
  if (custom) {
    const extension = extname(expandHome(custom)).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
      const image = nativeImage.createFromPath(expandHome(custom))
      if (!image.isEmpty()) return image
    }
  }

  const fallback = defaultIconPath()
  if (existsSync(fallback)) {
    const image = nativeImage.createFromPath(fallback)
    if (!image.isEmpty()) return image
  }
  return nativeImage.createEmpty()
}

export function trayIconFor(): NativeImage {
  const fallback = defaultIconPath()
  if (!existsSync(fallback)) return nativeImage.createEmpty()
  return nativeImage.createFromPath(fallback).resize({ width: 22, height: 22 })
}
