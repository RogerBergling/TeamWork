import { describe, expect, it } from 'vitest'
import {
  hostOf,
  isExternalProtocolAllowed,
  isTrustedOrigin,
  normalizeOrigin,
  originOf,
  sameOrigin,
  shouldOpenExternally
} from '../src/shared/urls'

describe('URL policy', () => {
  it('extracts HTTP origins only', () => {
    expect(originOf('https://element.example.com/rooms/1')).toBe(
      'https://element.example.com'
    )
    expect(originOf('mailto:test@example.com')).toBeNull()
    expect(originOf('not a url')).toBeNull()
  })

  it('normalizes origins', () => {
    expect(normalizeOrigin('https://login.example.com/saml/?x=1')).toBe(
      'https://login.example.com'
    )
    expect(normalizeOrigin('file:///tmp/index.html')).toBeNull()
  })

  it('compares origins exactly', () => {
    expect(sameOrigin('https://a.example.com/x', 'https://a.example.com/y')).toBe(true)
    expect(sameOrigin('https://a.example.com', 'http://a.example.com')).toBe(false)
    expect(sameOrigin('https://a.example.com', 'https://b.example.com')).toBe(false)
  })

  it('matches trusted auth origins', () => {
    const trusted = ['https://login.example.com', 'https://sso.example.com/']
    expect(isTrustedOrigin('https://login.example.com/saml', trusted)).toBe(true)
    expect(isTrustedOrigin('https://sub.login.example.com/saml', trusted)).toBe(false)
    expect(isTrustedOrigin('https://evil.example.com', trusted)).toBe(false)
  })

  it('keeps all navigations in-app when no trusted origins are configured', () => {
    expect(shouldOpenExternally('https://idp.example.com/login', 'https://element.example.com', []))
      .toBe(false)
  })

  it('keeps app and trusted origins in-app and sends other links to the browser', () => {
    const trusted = ['https://login.example.com']
    expect(
      shouldOpenExternally('https://element.example.com/room', 'https://element.example.com', trusted)
    ).toBe(false)
    expect(
      shouldOpenExternally('https://login.example.com/saml', 'https://element.example.com', trusted)
    ).toBe(false)
    expect(
      shouldOpenExternally('https://example.org/article', 'https://element.example.com', trusted)
    ).toBe(true)
  })

  it('treats non-HTTP schemes as external', () => {
    expect(shouldOpenExternally('mailto:test@example.com', 'https://element.example.com', [])).toBe(
      true
    )
    expect(isExternalProtocolAllowed('mailto:test@example.com')).toBe(true)
    expect(isExternalProtocolAllowed('tel:+461234567')).toBe(true)
    expect(isExternalProtocolAllowed('javascript:alert(1)')).toBe(false)
  })

  it('formats hosts for display', () => {
    expect(hostOf('https://meet.example.com/room')).toBe('meet.example.com')
    expect(hostOf('not-a-url')).toBe('not-a-url')
  })
})
