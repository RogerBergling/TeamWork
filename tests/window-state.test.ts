import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WindowStateStore } from '../src/main/window-state'

const directories: string[] = []

function temporaryState(): { directory: string; path: string; store: WindowStateStore } {
  const directory = mkdtempSync(join(tmpdir(), 'teamwork-window-'))
  directories.push(directory)
  const path = join(directory, 'window-state.json')
  return { directory, path, store: new WindowStateStore(path) }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('WindowStateStore', () => {
  it('returns sensible defaults when no state exists', () => {
    const { store } = temporaryState()
    const state = store.load()
    expect(state.width).toBeGreaterThanOrEqual(940)
    expect(state.height).toBeGreaterThanOrEqual(600)
    expect(state.maximized).toBe(false)
  })

  it('round-trips geometry', () => {
    const { path, store } = temporaryState()
    store.save({ x: 120, y: 80, width: 1440, height: 900, maximized: true })

    const loaded = new WindowStateStore(path).load()
    expect(loaded).toEqual({ x: 120, y: 80, width: 1440, height: 900, maximized: true })
  })

  it('falls back to defaults when the file is corrupt', () => {
    const { path, store } = temporaryState()
    writeFileSync(path, 'not json', 'utf8')
    const state = store.load()
    expect(state.width).toBe(1280)
    expect(state.height).toBe(820)
  })

  it('clamps undersized windows', () => {
    const { path, store } = temporaryState()
    writeFileSync(
      path,
      JSON.stringify({ x: 0, y: 0, width: 100, height: 100, maximized: false }),
      'utf8'
    )
    const state = store.load()
    expect(state.width).toBe(940)
    expect(state.height).toBe(600)
  })
})
