import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PendingAuthStore } from '../src/main/pending-auth'

const directories: string[] = []
const state = 'a'.repeat(64)
const returnUrl = 'https://element.example.com/'

function temporaryStore(now?: () => number): { path: string; store: PendingAuthStore } {
  const directory = mkdtempSync(join(tmpdir(), 'teamwork-auth-pending-'))
  directories.push(directory)
  const path = join(directory, 'auth-pending.json')
  return { path, store: new PendingAuthStore(path, 30 * 60 * 1000, now) }
}

function record(
  store: PendingAuthStore,
  view: 'element' | 'jitsi' = 'element',
  markerState = state,
  markerUrl = returnUrl
): void {
  store.record({ view, state: markerState, returnUrl: markerUrl })
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('PendingAuthStore', () => {
  it('accepts a matching one-shot callback', () => {
    const { store } = temporaryStore()
    record(store)

    expect(store.consume('element', state, 'https://element.example.com/#/room/!room')).toBe(
      true
    )
    expect(store.consume('element', state, returnUrl)).toBe(false)
  })

  it('rejects a callback for another view', () => {
    const { store } = temporaryStore()
    record(store, 'element')
    expect(store.consume('jitsi', state, 'https://meet.example.com/room')).toBe(false)
  })

  it('rejects a callback with the wrong or missing state', () => {
    const { store } = temporaryStore()
    record(store)

    expect(store.consume('element', 'b'.repeat(64), returnUrl)).toBe(false)
    expect(store.consume('element', undefined, returnUrl)).toBe(false)
    // A forged callback must not consume the legitimate pending sign-in.
    expect(store.consume('element', state, returnUrl)).toBe(true)
  })

  it('rejects a callback that returns to another origin', () => {
    const { store } = temporaryStore()
    record(store)

    expect(store.consume('element', state, 'https://evil.example.com/steal')).toBe(false)
    expect(store.consume('element', state, returnUrl)).toBe(true)
  })

  it('rejects an expired marker', () => {
    let now = 1_000_000
    const { store } = temporaryStore(() => now)
    record(store, 'jitsi', state, 'https://meet.example.com/')
    now += 31 * 60 * 1000
    expect(store.consume('jitsi', state, 'https://meet.example.com/')).toBe(false)
  })

  it('rejects missing or malformed markers', () => {
    const missing = temporaryStore()
    expect(missing.store.consume('element', state, returnUrl)).toBe(false)

    const malformed = temporaryStore()
    writeFileSync(malformed.path, '{"view":"admin","state":"x","createdAt":1}\n')
    expect(malformed.store.consume('element', state, returnUrl)).toBe(false)

    const weakState = temporaryStore()
    record(weakState.store, 'element', 'short')
    expect(weakState.store.consume('element', 'short', returnUrl)).toBe(false)
  })

  it('does not persist a marker with an invalid state', () => {
    const { path, store } = temporaryStore()
    record(store, 'element', 'short')
    expect(store.consume('element', 'short', returnUrl)).toBe(false)
    // The marker file is absent rather than containing a weak state.
    expect(existsSync(path)).toBe(false)
  })
})
