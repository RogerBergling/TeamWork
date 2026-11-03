import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PolicyStore } from '../src/main/policy-store'
import { DEFAULT_SETTINGS } from '../src/shared/settings'

const directories: string[] = []

function temporaryPolicy(content: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), 'teamwork-policy-'))
  directories.push(directory)
  const path = join(directory, 'policy.json')
  writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`)
  chmodSync(path, 0o644)
  return path
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('PolicyStore', () => {
  it('does nothing when the policy file is absent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'teamwork-policy-'))
    directories.push(directory)
    const store = new PolicyStore(join(directory, 'missing.json'))
    const result = store.load()

    expect(result.lockedFields).toEqual([])
    expect(store.apply(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })

  it('locks only fields explicitly present in the policy', () => {
    const path = temporaryPolicy({
      servers: { elementUrl: 'https://element.example.com' },
      advanced: { enableDevTools: false }
    })
    const store = new PolicyStore(path)
    const result = store.load()

    expect(result.lockedFields.sort()).toEqual([
      'advanced.enableDevTools',
      'servers.elementUrl'
    ])
    expect(result.lockedFields).not.toContain('version')
  })

  it('applies policy values over user settings', () => {
    const path = temporaryPolicy({
      servers: { elementUrl: 'https://element.example.com' },
      advanced: { enableDevTools: false }
    })
    const store = new PolicyStore(path)
    store.load()

    const effective = store.apply({
      ...DEFAULT_SETTINGS,
      servers: { ...DEFAULT_SETTINGS.servers, elementUrl: 'https://user.example.com' },
      advanced: { ...DEFAULT_SETTINGS.advanced, enableDevTools: true }
    })

    expect(effective.servers.elementUrl).toBe('https://element.example.com')
    expect(effective.advanced.enableDevTools).toBe(false)
  })

  it('validates cross-field policy rules against the current user configuration', () => {
    const base = {
      ...DEFAULT_SETTINGS,
      authentication: {
        ...DEFAULT_SETTINGS.authentication,
        trustedAuthOrigins: ['https://login.example.com']
      }
    }
    const path = temporaryPolicy({
      authentication: { externalBrowserSso: true }
    })
    const store = new PolicyStore(path)
    const result = store.load(base)

    expect(result.error).toBeUndefined()
    expect(store.apply(base).authentication.externalBrowserSso).toBe(true)
  })

  it('rejects unknown policy fields instead of silently ignoring typos', () => {
    const path = temporaryPolicy({
      authentication: { allowInsecureCertificate: true }
    })
    const onWarning = vi.fn()
    const store = new PolicyStore(path, onWarning)
    const result = store.load()

    expect(result.error).toContain('Unknown policy field')
    expect(result.lockedFields).toEqual([])
    expect(onWarning).toHaveBeenCalled()
  })

  it('rejects invalid policy values', () => {
    const path = temporaryPolicy({
      servers: { elementUrl: 'javascript:alert(1)' }
    })
    const store = new PolicyStore(path)
    const result = store.load()

    expect(result.error).toContain('Invalid policy')
    expect(result.lockedFields).toEqual([])
  })

  it('rejects a policy file writable by group or other users', () => {
    const path = temporaryPolicy({
      servers: { elementUrl: 'https://element.example.com' }
    })
    chmodSync(path, 0o666)
    const store = new PolicyStore(path)
    const result = store.load()

    expect(result.error).toContain('group- or world-writable')
    expect(result.lockedFields).toEqual([])
  })
})
