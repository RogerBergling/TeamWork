import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export interface ShellRendererLocation {
  rendererFile: string
  /** Validated loopback development URL, or null outside development. */
  devUrl: string | null
  /** How the shell should load its initial document. */
  load:
    | { kind: 'dev-url'; url: string }
    | { kind: 'file'; file: string }
    | { kind: 'missing' }
}

/**
 * Accepts only an http(s) URL whose host is the local machine. Packaged builds
 * must never honour ELECTRON_RENDERER_URL, so callers pass isPackaged and the
 * result ignores the environment there.
 */
export function parseLoopbackDevUrl(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

export function resolveShellRendererLocation(options: {
  baseDir: string
  isPackaged: boolean
  envUrl?: string
  fileExists?: (path: string) => boolean
}): ShellRendererLocation {
  const rendererFile = resolve(join(options.baseDir, '../renderer/index.html'))
  const devUrl = options.isPackaged ? null : parseLoopbackDevUrl(options.envUrl)
  const fileExists = options.fileExists ?? existsSync

  if (devUrl) {
    return { rendererFile, devUrl, load: { kind: 'dev-url', url: devUrl } }
  }
  if (fileExists(rendererFile)) {
    return { rendererFile, devUrl: null, load: { kind: 'file', file: rendererFile } }
  }
  return { rendererFile, devUrl: null, load: { kind: 'missing' } }
}

function filePathOf(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'file:') return null
    return resolve(decodeURIComponent(url.pathname))
  } catch {
    return null
  }
}

/**
 * The shell is privileged (it has a preload bridge and IPC access). It may only
 * display the packaged renderer file or the validated development server.
 */
export function isAllowedShellNavigation(target: string, location: ShellRendererLocation): boolean {
  if (location.devUrl) {
    try {
      const expected = new URL(location.devUrl)
      const candidate = new URL(target)
      return (
        (candidate.protocol === 'http:' || candidate.protocol === 'https:') &&
        candidate.origin === expected.origin
      )
    } catch {
      return false
    }
  }

  return filePathOf(target) === location.rendererFile
}

/** IPC senders must come from the same document the shell is allowed to show. */
export function isTrustedShellSenderUrl(
  senderUrl: string,
  location: ShellRendererLocation
): boolean {
  return isAllowedShellNavigation(senderUrl, location)
}

/** The privileged shell never opens child windows. */
export function shellWindowOpenDecision(_url: string): { action: 'deny' } {
  return { action: 'deny' }
}
