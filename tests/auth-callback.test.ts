import { describe, expect, it } from 'vitest'
import {
  authCallbackState,
  isAuthCallbackLink,
  resolveAuthCallback
} from '../src/shared/auth-callback'

const element = 'https://element.example.com'
const jitsi = 'https://meet.example.com'

describe('external-browser sign-in callback', () => {
  it('recognises auth callbacks only', () => {
    expect(isAuthCallbackLink('teamwork://auth')).toBe(true)
    expect(isAuthCallbackLink('teamwork://auth/callback?view=element')).toBe(true)
    expect(isAuthCallbackLink('teamwork:auth')).toBe(true)
    expect(isAuthCallbackLink('teamwork://auth/other')).toBe(false)
    expect(isAuthCallbackLink('teamwork://join?url=https%3A%2F%2Fmeet.example.com')).toBe(false)
    expect(isAuthCallbackLink('https://example.com/auth')).toBe(false)
  })

  it('extracts the anti-CSRF state from auth callbacks only', () => {
    const state = 'a'.repeat(64)
    expect(
      authCallbackState(`teamwork://auth?view=element&teamwork_state=${state}`)
    ).toBe(state)
    expect(authCallbackState(`teamwork://auth?view=element&state=${state}`)).toBe(state)
    expect(authCallbackState('teamwork://auth?view=element')).toBeNull()
    expect(authCallbackState('teamwork://auth?view=element&state=short')).toBeNull()
    expect(authCallbackState(`https://example.com/?state=${state}`)).toBeNull()
    expect(authCallbackState(`teamwork://join?url=x&state=${state}`)).toBeNull()
  })

  it('returns the configured application URL when only a view is supplied', () => {
    const result = resolveAuthCallback('teamwork://auth?view=element', element, jitsi)
    expect(result).toEqual({ ok: true, view: 'element', url: `${element}/` })
  })

  it('validates and preserves a return URL on the configured origin', () => {
    const target = 'https://element.example.com/#/room/!room:example.com?via=example.com'
    const result = resolveAuthCallback(
      `teamwork://auth/callback?view=element&url=${encodeURIComponent(target)}`,
      element,
      jitsi
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.view).toBe('element')
      expect(result.url).toBe(target)
    }
  })

  it('infers the view from a same-origin return URL', () => {
    const result = resolveAuthCallback(
      `teamwork://auth?url=${encodeURIComponent('https://meet.example.com/room')}`,
      element,
      jitsi
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.view).toBe('jitsi')
  })

  it('rejects return URLs on another origin', () => {
    const result = resolveAuthCallback(
      `teamwork://auth?url=${encodeURIComponent('https://evil.example.com/steal')}`,
      element,
      jitsi
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('configured Element or Jitsi server')
  })

  it('rejects credentials in a return URL', () => {
    const result = resolveAuthCallback(
      `teamwork://auth?url=${encodeURIComponent('https://user:pass@element.example.com/login')}`,
      element,
      jitsi
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('credentials')
  })

  it('rejects a return URL that does not match the requested view', () => {
    const result = resolveAuthCallback(
      `teamwork://auth?view=jitsi&url=${encodeURIComponent('https://element.example.com/login')}`,
      element,
      jitsi
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('configured Jitsi server')
  })

  it('requires an explicit view when both applications are configured', () => {
    const result = resolveAuthCallback('teamwork://auth', element, jitsi)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('view=element or view=jitsi')
  })

  it('rejects unsupported views', () => {
    const result = resolveAuthCallback('teamwork://auth?view=admin', element, jitsi)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('unsupported view')
  })
})
