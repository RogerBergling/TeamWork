import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  getByPath,
  mergeSettings,
  parseSettings,
  safeParseSettings,
  setByPath
} from '../src/shared/settings'

describe('settings schema', () => {
  it('parses the shipped defaults', () => {
    const parsed = parseSettings(DEFAULT_SETTINGS)
    expect(parsed.servers.elementUrl).toBe('')
    expect(parsed.appearance.appName).toBe('TeamWork')
    expect(parsed.logging.level).toBe('info')
  })

  it('fills newly added settings from defaults', () => {
    const parsed = parseSettings({
      appearance: { appName: 'Acme Meet' },
      servers: { elementUrl: 'https://element.example.com' }
    })

    expect(parsed.appearance.appName).toBe('Acme Meet')
    expect(parsed.appearance.theme).toBe('system')
    expect(parsed.servers.elementUrl).toBe('https://element.example.com')
    expect(parsed.servers.jitsiUrl).toBe('')
    expect(parsed.advanced.zoomFactor).toBe(1)
  })

  it('rejects invalid URLs with a field path', () => {
    const result = safeParseSettings({
      servers: { elementUrl: 'element.example.com', jitsiUrl: 'https://meet.example.com' }
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({ path: 'servers.elementUrl' })
      )
    }
  })

  it('rejects an invalid accent colour', () => {
    const result = safeParseSettings({ appearance: { accentColor: 'purple' } })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((entry) => entry.path === 'appearance.accentColor')).toBe(true)
    }
  })

  it('requires a proxy URL in custom mode', () => {
    const result = safeParseSettings({ network: { proxyMode: 'custom', proxyUrl: '' } })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((entry) => entry.path === 'network.proxyUrl')).toBe(true)
    }
  })

  it('accepts proxy URLs only for supported protocols', () => {
    expect(
      safeParseSettings({ network: { proxyMode: 'custom', proxyUrl: 'socks5://proxy:1080' } }).ok
    ).toBe(true)
    expect(
      safeParseSettings({ network: { proxyMode: 'custom', proxyUrl: 'ftp://proxy:21' } }).ok
    ).toBe(false)
  })

  it('validates trusted authentication origins', () => {
    const result = safeParseSettings({
      authentication: { trustedAuthOrigins: ['https://login.example.com', 'not-a-url'] }
    })
    expect(result.ok).toBe(false)
  })

  it('requires a trusted origin before enabling system-browser SSO', () => {
    expect(
      safeParseSettings({ authentication: { externalBrowserSso: true } }).ok
    ).toBe(false)
    expect(
      safeParseSettings({
        authentication: {
          externalBrowserSso: true,
          trustedAuthOrigins: ['https://login.example.com']
        }
      }).ok
    ).toBe(true)
  })

  it('merges nested objects without mutating defaults', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      logging: { debug: true }
    }) as typeof DEFAULT_SETTINGS

    expect(merged.logging.debug).toBe(true)
    expect(merged.logging.level).toBe('info')
    expect(DEFAULT_SETTINGS.logging.debug).toBe(false)
  })

  it('reads and writes nested values immutably', () => {
    const updated = setByPath(DEFAULT_SETTINGS, 'servers.jitsiUrl', 'https://meet.example.com')
    expect(getByPath(updated, 'servers.jitsiUrl')).toBe('https://meet.example.com')
    expect(DEFAULT_SETTINGS.servers.jitsiUrl).toBe('')
    expect(updated).not.toBe(DEFAULT_SETTINGS)
  })
})
