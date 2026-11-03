import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PendingAuthStore } from '../src/main/pending-auth'

const directories: string[] = []

function temporaryStore(now?: () => number): { path: string; store: PendingAuthStore } {
  const directory = mkdtempSync(join(tmpdir(), 'teamwork-auth-pending-'))
  directories.push(directory)
  const path = join(directory, 'auth-pending.json')
  return { path, store: new PendingAuthStore(path, 30 * 60 * 1000, now) }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('PendingAuthStore', () => {
  it('accepts a matching one-shot callback', () => {
    const { store } = temporaryStore()
    store.record('element')

    expect(store.consume('element')).toBe(true)
    expect(store.consume('element')).toBe(false)
  })

  it('rejects a callback for another view', () => {
    const { store } = temporaryStore()
    store.record('element')
    expect(store.consume('jitsi')).toBe(false)
  })

  it('rejects an expired marker', () => {
    let now = 1_000_000
    const { store } = temporaryStore(() => now)
    store.record('jitsi')
    now += 31 * 60 * 1000
    expect(store.consume('jitsi')).toBe(false)
  })

  it('rejects missing or malformed markers', () => {
    const missing = temporaryStore()
    expect(missing.store.consume()).toBe(false)

    const malformed = temporaryStore()
    writeFileSync(malformed.path, '{"view":"admin","createdAt":1}\n')
    expect(malformed.store.consume()).toBe(false)
  })
})
