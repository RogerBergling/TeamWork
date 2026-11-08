import { lstat, readFile } from 'node:fs/promises'
import { logoMimeType, MAX_LOGO_BYTES, resolveLogoPath } from './logo-path'

/**
 * Reads a logo asynchronously after confirming it is a regular file and within
 * the size limit. Symlinks and special files are rejected.
 */
export async function readLogoDataUrl(path: string): Promise<string | null> {
  const resolved = resolveLogoPath(path)
  if (!resolved) return null

  const mime = logoMimeType(resolved)
  if (!mime) return null

  try {
    const info = await lstat(resolved)
    if (!info.isFile() || info.size <= 0 || info.size > MAX_LOGO_BYTES) return null

    const data = await readFile(resolved)
    if (data.byteLength > MAX_LOGO_BYTES) return null
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
}
