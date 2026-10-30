import { describe, expect, it } from 'vitest'
import {
  extractDeepLinkTarget,
  findDeepLinkInArgv,
  resolveJitsiMeetingInput,
  safeUrlForLog,
  validateJitsiMeetingUrl
} from '../src/shared/deep-links'

const configured = 'https://meet.example.com'

describe('Jitsi meeting links', () => {
  it('accepts a meeting URL on the configured Jitsi origin and preserves its query', () => {
    const result = resolveJitsiMeetingInput(
      'https://meet.example.com/team-standup?jwt=abc123&config.roomName=standup',
      configured
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.url).toBe(
        'https://meet.example.com/team-standup?jwt=abc123&config.roomName=standup'
      )
    }
  })

  it('accepts a teamwork:// deep link', () => {
    const result = resolveJitsiMeetingInput(
      'teamwork://join?url=https%3A%2F%2Fmeet.example.com%2Froom%3Fjwt%3Dabc',
      configured
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.url).toBe('https://meet.example.com/room?jwt=abc')
  })

  it('accepts the alternate jitsi deep-link host', () => {
    const extracted = extractDeepLinkTarget(
      'teamwork://jitsi?url=https%3A%2F%2Fmeet.example.com%2Froom'
    )
    expect(extracted.ok).toBe(true)
  })

  it('rejects meetings on another origin', () => {
    const result = validateJitsiMeetingUrl('https://evil.example.com/room', configured)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('configured Jitsi server')
  })

  it('rejects non-http URLs', () => {
    expect(validateJitsiMeetingUrl('javascript:alert(1)', configured).ok).toBe(false)
    expect(validateJitsiMeetingUrl('file:///tmp/meeting.html', configured).ok).toBe(false)
  })

  it('rejects URLs containing credentials', () => {
    const result = validateJitsiMeetingUrl('https://user:pass@meet.example.com/room', configured)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('credentials')
  })

  it('requires a configured Jitsi URL', () => {
    const result = validateJitsiMeetingUrl('https://meet.example.com/room', '')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Set the Jitsi Meet URL')
  })

  it('rejects malformed deep links', () => {
    expect(extractDeepLinkTarget('teamwork://join').ok).toBe(false)
    expect(extractDeepLinkTarget('teamwork://open?url=https%3A%2F%2Fmeet.example.com').ok).toBe(
      false
    )
    expect(extractDeepLinkTarget('https://meet.example.com/room').ok).toBe(false)
  })

  it('finds a deep link in a process argument list', () => {
    expect(
      findDeepLinkInArgv([
        '/opt/TeamWork/teamwork',
        '--no-sandbox',
        'teamwork://join?url=https%3A%2F%2Fmeet.example.com%2Froom'
      ])
    ).toBe('teamwork://join?url=https%3A%2F%2Fmeet.example.com%2Froom')
    expect(findDeepLinkInArgv(['/opt/TeamWork/teamwork'])).toBeNull()
  })

  it('redacts meeting tokens from log output', () => {
    expect(safeUrlForLog('https://meet.example.com/room?jwt=secret#config')).toBe(
      'https://meet.example.com/room'
    )
  })
})
