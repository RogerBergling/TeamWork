import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigStore } from '../src/main/config-store'
import { DEFAULT_SETTINGS } from '../src/shared/settings'

const directories: string[] = []

function temporaryConfig(): { directory: string; path: string; store: ConfigStore } {
  const directory = mkdtempSync(join(tmpdir(), 'teamwork-test-'))
  directories.push(directory)
  const path = join(directory, 'config.json')
  return { directory, path, store: new ConfigStore(path) }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('ConfigStore', () => {
  it('creates a default configuration on first load', () => {
    const { path, store } = temporaryConfig()
    const loaded = store.load()

    expect(loaded.settings).toEqual(DEFAULT_SETTINGS)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(DEFAULT_SETTINGS)
  })

  it('persists valid changes and reloads them', () => {
    const { store, path } = temporaryConfig()
    store.load()

    const result = store.save({
      ...DEFAULT_SETTINGS,
      appearance: { ...DEFAULT_SETTINGS.appearance, appName: 'Acme Meet' },
      servers: {
        ...DEFAULT_SETTINGS.servers,
        elementUrl: 'https://element.example.com',
        jitsiUrl: 'https://meet.example.com'
      }
    })

    expect(result.ok).toBe(true)
    const reloaded = new ConfigStore(path)
    expect(reloaded.load().settings.appearance.appName).toBe('Acme Meet')
    expect(reloaded.value.servers.jitsiUrl).toBe('https://meet.example.com')
  })

  it('rejects invalid values without changing the current configuration', () => {
    const { store } = temporaryConfig()
    store.load()

    const result = store.save({
      ...DEFAULT_SETTINGS,
      servers: { ...DEFAULT_SETTINGS.servers, elementUrl: 'javascript:alert(1)' }
    })

    expect(result.ok).toBe(false)
    expect(result.errors?.some((entry) => entry.path === 'servers.elementUrl')).toBe(true)
    expect(store.value.servers.elementUrl).toBe('')
  })

  it('backs up and replaces a corrupt configuration file', () => {
    const { directory, path, store } = temporaryConfig()
    writeFileSync(path, '{ this is not json', 'utf8')

    const loaded = store.load()
    expect(loaded.loadError).toBeTruthy()
    expect(loaded.settings).toEqual(DEFAULT_SETTINGS)
    expect(readFileSync(path, 'utf8')).toContain('"version": 1')
    expect(readdirSync(directory).some((name) => name.startsWith('config.json.invalid-'))).toBe(true)
  })

  it('exports and imports configuration files', () => {
    const { directory, store } = temporaryConfig()
    store.load()
    store.save({
      ...DEFAULT_SETTINGS,
      appearance: { ...DEFAULT_SETTINGS.appearance, appName: 'Exported' }
    })

    const exportPath = join(directory, 'export.json')
    expect(store.exportTo(exportPath).ok).toBe(true)

    const destination = new ConfigStore(join(directory, 'destination.json'))
    destination.load()
    const result = destination.importFrom(exportPath)

    expect(result.ok).toBe(true)
    expect(destination.value.appearance.appName).toBe('Exported')
  })

  it('survives an import of invalid JSON', () => {
    const { directory, store } = temporaryConfig()
    store.load()
    const invalid = join(directory, 'invalid.json')
    writeFileSync(invalid, 'nope', 'utf8')

    const result = store.importFrom(invalid)
    expect(result.ok).toBe(false)
    expect(store.value).toEqual(DEFAULT_SETTINGS)
  })
})
