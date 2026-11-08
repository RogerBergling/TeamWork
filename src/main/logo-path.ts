import { homedir } from 'node:os'
import { extname, resolve } from 'node:path'

export const MAX_LOGO_BYTES = 8 * 1024 * 1024

export const LOGO_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
}

export function expandHome(value: string): string {
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return resolve(homedir(), value.slice(2))
  return value
}

export function resolveLogoPath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('\0')) return null
  return resolve(expandHome(trimmed))
}

export function logoMimeType(path: string): string | null {
  return LOGO_MIME_TYPES[extname(path).toLowerCase()] ?? null
}

/**
 * The renderer may only request the logo that is saved in the configuration or
 * a file the user just picked in the native dialog. Arbitrary local paths are
 * rejected so a compromised renderer cannot read files outside that policy.
 */
export function isLogoPathAllowed(
  candidate: string,
  savedLogoPath: string,
  approvedPaths: Iterable<string>
): boolean {
  const resolved = resolveLogoPath(candidate)
  if (!resolved) return false

  const saved = savedLogoPath.trim() ? resolveLogoPath(savedLogoPath) : null
  if (saved && resolved === saved) return true

  for (const approved of approvedPaths) {
    if (resolveLogoPath(approved) === resolved) return true
  }
  return false
}
