import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PolicyStore, validatePolicyFileInfo } from '../src/main/policy-store'
import { DEFAULT_SETTINGS } from '../src/shared/settings'

const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'teamwork-policy-'))
  directories.push(directory)
  return directory
}

function temporaryPolicy(content: unknown, mode = 0o644): string {
  const directory = temporaryDirectory()
  const path = join(directory, 'policy.json')
  writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`)
  chmodSync(path, mode)
  return path
}

function testStore(
  path: string,
  onWarning?: (message: string, error?: unknown) => void
): PolicyStore {
  // Temporary files are owned by the test user, not root.
  return new PolicyStore(path, onWarning, { requireRootOwner: false })
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('PolicyStore', () => {
  it('does nothing when the policy file is absent', () => {
    const directory = temporaryDirectory()
    const store = testStore(join(directory, 'missing.json'))
    const result = store.load()

    expect(result.lockedFields).toEqual([])
    expect(store.apply(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })

  it('locks only fields explicitly present in the policy', () => {
    const path = temporaryPolicy({
      servers: { elementUrl: 'https://element.example.com' },
      advanced: { enableDevTools: false }
    })
    const store = testStore(path)
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
    const store = testStore(path)
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
    const store = testStore(path)
    const result = store.load(base)

    expect(result.error).toBeUndefined()
    expect(store.apply(base).authentication.externalBrowserSso).toBe(true)
  })

  it('rejects unknown policy fields instead of silently ignoring typos', () => {
    const path = temporaryPolicy({
      authentication: { allowInsecureCertificate: true }
    })
    const onWarning = vi.fn()
    const store = testStore(path, onWarning)
    const result = store.load()

    expect(result.error).toContain('Unknown policy field')
    expect(result.lockedFields).toEqual([])
    expect(onWarning).toHaveBeenCalled()
  })

  it('rejects invalid policy values', () => {
    const path = temporaryPolicy({
      servers: { elementUrl: 'javascript:alert(1)' }
    })
    const store = testStore(path)
    const result = store.load()

    expect(result.error).toContain('Invalid policy')
    expect(result.lockedFields).toEqual([])
  })

  it('rejects a policy file writable by group or other users', () => {
    const path = temporaryPolicy(
      {
        servers: { elementUrl: 'https://element.example.com' }
      },
      0o666
    )
    const store = testStore(path)
    const result = store.load()

    expect(result.error).toContain('group- or world-writable')
    expect(result.lockedFields).toEqual([])
  })

  it('rejects a policy file that is not owned by root', () => {
    if (process.getuid?.() === 0) return
    const path = temporaryPolicy({
      servers: { elementUrl: 'https://element.example.com' }
    })
    const store = new PolicyStore(path)
    const result = store.load()

    expect(result.error).toContain('owned by root')
    expect(result.lockedFields).toEqual([])
  })

  it('rejects symbolic links and non-regular policy files', () => {
    const directory = temporaryDirectory()
    const target = join(directory, 'target.json')
    writeFileSync(target, JSON.stringify({ servers: { elementUrl: 'https://element.example.com' } }))
    const link = join(directory, 'policy.json')
    symlinkSync(target, link)

    const linked = testStore(link).load()
    expect(linked.error).toContain('symbolic link')

    const folder = join(directory, 'policy-dir')
    mkdirSync(folder)
    const directoryResult = testStore(folder).load()
    expect(directoryResult.error).toContain('regular file')
  })

  it('fails closed when the policy path cannot be accessed', () => {
    if (process.getuid?.() === 0) return
    const directory = temporaryDirectory()
    const path = join(directory, 'policy.json')
    writeFileSync(path, JSON.stringify({}))
    chmodSync(directory, 0o000)
    try {
      const store = testStore(path)
      const result = store.load()
      expect(result.error).toBeTruthy()
      expect(
        store.apply({
          ...DEFAULT_SETTINGS,
          servers: {
            ...DEFAULT_SETTINGS.servers,
            elementUrl: 'https://user.example.com'
          }
        }).servers.elementUrl
      ).toBe('')
    } finally {
      chmodSync(directory, 0o700)
    }
  })

  it('fails closed and keeps a visible warning when a managed policy is unreadable', () => {
    const path = temporaryPolicy({})
    writeFileSync(path, '{ not valid json', 'utf8')
    const onWarning = vi.fn()
    const store = testStore(path, onWarning)
    const result = store.load()

    expect(result.error).toBeTruthy()
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('safe defaults'),
      expect.anything()
    )

    const userSettings = {
      ...DEFAULT_SETTINGS,
      servers: { ...DEFAULT_SETTINGS.servers, elementUrl: 'https://user.example.com' },
      advanced: { ...DEFAULT_SETTINGS.advanced, enableDevTools: true }
    }
    expect(store.apply(userSettings)).toEqual(DEFAULT_SETTINGS)
    expect(store.locked).toEqual([])
  })

  it('validates root ownership, file type and permissions from file metadata', () => {
    const good = {
      isFile: () => true,
      isSymbolicLink: () => false,
      uid: 0,
      mode: 0o644,
      size: 100
    }
    expect(() => validatePolicyFileInfo(good)).not.toThrow()
    expect(() =>
      validatePolicyFileInfo({ ...good, uid: 1000 })
    ).toThrow(/owned by root/)
    expect(() =>
      validatePolicyFileInfo({ ...good, isSymbolicLink: () => true })
    ).toThrow(/symbolic link/)
    expect(() =>
      validatePolicyFileInfo({ ...good, isFile: () => false })
    ).toThrow(/regular file/)
    expect(() =>
      validatePolicyFileInfo({ ...good, mode: 0o666 })
    ).toThrow(/group- or world-writable/)
    expect(() =>
      validatePolicyFileInfo({ ...good, size: 2 * 1024 * 1024 })
    ).toThrow(/larger than/)
    // Tests can explicitly relax the root requirement; production cannot.
    expect(() =>
      validatePolicyFileInfo({ ...good, uid: 1000 }, { requireRootOwner: false })
    ).not.toThrow()
  })
})
