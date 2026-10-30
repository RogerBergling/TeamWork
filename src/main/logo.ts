import { app, dialog, nativeImage, type BrowserWindow, type NativeImage } from 'electron'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { homedir } from 'node:os'
import type { Settings } from '../shared/settings'

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
}

const MAX_LOGO_BYTES = 8 * 1024 * 1024

export function expandHome(value: string): string {
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return value
}

export function defaultIconPath(): string {
  const packaged = join(process.resourcesPath, 'icon.png')
  if (app.isPackaged && existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'build', 'icon.png')
}

export function readLogoDataUrl(path: string): string | null {
  try {
    const resolved = expandHome(path.trim())
    if (!resolved || !existsSync(resolved)) return null
    const extension = extname(resolved).toLowerCase()
    const mime = MIME_TYPES[extension]
    if (!mime) return null
    if (statSync(resolved).size > MAX_LOGO_BYTES) return null
    return `data:${mime};base64,${readFileSync(resolved).toString('base64')}`
  } catch {
    return null
  }
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
