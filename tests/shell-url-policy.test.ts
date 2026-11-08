import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isAllowedShellNavigation,
  isTrustedShellSenderUrl,
  parseLoopbackDevUrl,
  resolveShellRendererLocation,
  shellWindowOpenDecision
} from '../src/main/shell-url-policy'

const baseDir = '/opt/teamwork/out/main'
const rendererFile = resolve(join(baseDir, '../renderer/index.html'))

describe('shell renderer policy', () => {
  it('accepts only loopback http(s) development URLs', () => {
    expect(parseLoopbackDevUrl('http://localhost:5173/')).toBe('http://localhost:5173/')
    expect(parseLoopbackDevUrl('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173/')
    expect(parseLoopbackDevUrl('https://[::1]:5173/')).toBe('https://[::1]:5173/')
    expect(parseLoopbackDevUrl('https://example.com/')).toBeNull()
    expect(parseLoopbackDevUrl('file:///tmp/index.html')).toBeNull()
    expect(parseLoopbackDevUrl('http://user:pass@localhost:5173/')).toBeNull()
  })

  it('honours the dev URL only outside packaged builds', () => {
    const development = resolveShellRendererLocation({
      baseDir,
      isPackaged: false,
      envUrl: 'http://127.0.0.1:5173/',
      fileExists: () => true
    })
    expect(development.devUrl).toBe('http://127.0.0.1:5173/')
    expect(development.load).toEqual({
      kind: 'dev-url',
      url: 'http://127.0.0.1:5173/'
    })

    const packaged = resolveShellRendererLocation({
      baseDir,
      isPackaged: true,
      envUrl: 'http://127.0.0.1:5173/',
      fileExists: () => true
    })
    expect(packaged.devUrl).toBeNull()
    expect(packaged.load).toEqual({ kind: 'file', file: rendererFile })
  })

  it('ignores non-loopback environment URLs even in development', () => {
    const location = resolveShellRendererLocation({
      baseDir,
      isPackaged: false,
      envUrl: 'https://evil.example.com/app',
      fileExists: () => true
    })
    expect(location.devUrl).toBeNull()
    expect(location.load.kind).toBe('file')
  })

  it('allows only the packaged file or the validated dev origin', () => {
    const packaged = resolveShellRendererLocation({
      baseDir,
      isPackaged: true,
      envUrl: 'http://localhost:5173/',
      fileExists: () => true
    })
    expect(isAllowedShellNavigation(`file://${rendererFile}`, packaged)).toBe(true)
    expect(isAllowedShellNavigation('file:///etc/passwd', packaged)).toBe(false)
    expect(isAllowedShellNavigation('https://evil.example.com/', packaged)).toBe(false)

    const development = resolveShellRendererLocation({
      baseDir,
      isPackaged: false,
      envUrl: 'http://127.0.0.1:5173/',
      fileExists: () => true
    })
    expect(isAllowedShellNavigation('http://127.0.0.1:5173/settings', development)).toBe(true)
    expect(isAllowedShellNavigation('http://127.0.0.1:9999/', development)).toBe(false)
    expect(isAllowedShellNavigation('https://evil.example.com/', development)).toBe(false)
  })

  it('rejects IPC senders that are not the shell document', () => {
    const location = resolveShellRendererLocation({
      baseDir,
      isPackaged: true,
      fileExists: () => true
    })
    expect(isTrustedShellSenderUrl(`file://${rendererFile}`, location)).toBe(true)
    expect(isTrustedShellSenderUrl('file:///tmp/other.html', location)).toBe(false)
    expect(isTrustedShellSenderUrl('about:blank', location)).toBe(false)
    expect(isTrustedShellSenderUrl('https://evil.example.com/', location)).toBe(false)
  })

  it('denies every shell window-open request', () => {
    expect(shellWindowOpenDecision('https://example.com')).toEqual({ action: 'deny' })
    expect(shellWindowOpenDecision('about:blank')).toEqual({ action: 'deny' })
  })
})
