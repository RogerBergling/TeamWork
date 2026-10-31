import { describe, expect, it } from 'vitest'
import {
  buildDeepLink,
  hostMatches,
  matchLink,
  normalizeDomains,
  unwrapRedirectUrl
} from '../browser-extension/src/lib/links'

const settings = {
  jitsiDomains: ['meet.example.com', '*.jitsi.example.com'],
  elementDomains: ['element.example.com'],
  detectPublicJitsi: false,
  detectMatrixTo: true
}

describe('browser extension link matching', () => {
  it('matches a Jitsi room on a configured domain', () => {
    const match = matchLink('https://meet.example.com/team-standup', settings)
    expect(match?.kind).toBe('jitsi')
    expect(match?.deepLink).toBe(
      'teamwork://join?url=https%3A%2F%2Fmeet.example.com%2Fteam-standup'
    )
  })

  it('supports wildcard domain entries', () => {
    const match = matchLink('https://room.jitsi.example.com/daily', settings)
    expect(match?.kind).toBe('jitsi')
    expect(hostMatches('room.jitsi.example.com', ['*.jitsi.example.com'])).toBe(true)
    expect(hostMatches('jitsi.example.com', ['*.jitsi.example.com'])).toBe(false)
  })

  it('does not convert the Jitsi home page or static assets', () => {
    expect(matchLink('https://meet.example.com/', settings)).toBeNull()
    expect(matchLink('https://meet.example.com/config.js', settings)).toBeNull()
    expect(matchLink('https://meet.example.com/libs/lib-jitsi-meet.min.js', settings)).toBeNull()
  })

  it('does not match unknown domains', () => {
    expect(matchLink('https://other.example.com/room', settings)).toBeNull()
  })

  it('only matches public Jitsi when enabled', () => {
    const publicUrl = 'https://meet.jit.si/team-standup'
    expect(matchLink(publicUrl, settings)).toBeNull()
    expect(matchLink(publicUrl, { ...settings, detectPublicJitsi: true })?.kind).toBe('jitsi')
  })

  it('unwraps Outlook SafeLinks before matching', () => {
    const wrapped =
      'https://eur01.safelinks.protection.outlook.com/?url=' +
      encodeURIComponent('https://meet.example.com/standup') +
      '&data=example'
    expect(unwrapRedirectUrl(wrapped)).toBe('https://meet.example.com/standup')
    expect(matchLink(wrapped, settings)?.kind).toBe('jitsi')
  })

  it('matches Element room permalinks on a configured domain', () => {
    const match = matchLink(
      'https://element.example.com/#/room/!room:example.com',
      settings
    )
    expect(match?.kind).toBe('matrix')
    expect(match?.deepLink).toBe(
      'teamwork://matrix?url=https%3A%2F%2Felement.example.com%2F%23%2Froom%2F!room%3Aexample.com'
    )
  })

  it('matches matrix.to links when enabled', () => {
    const match = matchLink('https://matrix.to/#/!room:example.com', settings)
    expect(match?.kind).toBe('matrix')
    expect(matchLink('https://matrix.to/#/!room:example.com', { ...settings, detectMatrixTo: false }))
      .toBeNull()
  })

  it('does not match unrelated Element hash routes', () => {
    expect(
      matchLink('https://element.example.com/#/settings', settings)
    ).toBeNull()
  })

  it('normalizes domain inputs', () => {
    expect(
      normalizeDomains([
        'https://Meet.Example.com:8443/path',
        '*.jitsi.example.com',
        'meet.example.com',
        'not a domain'
      ])
    ).toEqual(['meet.example.com', '*.jitsi.example.com'])
  })

  it('builds encoded TeamWork links', () => {
    expect(buildDeepLink('matrix', 'https://matrix.to/#/!room:example.com')).toBe(
      'teamwork://matrix?url=https%3A%2F%2Fmatrix.to%2F%23%2F!room%3Aexample.com'
    )
  })
})
