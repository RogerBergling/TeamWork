import { describe, expect, it } from 'vitest'
import {
  extractDeepLinkTarget,
  findDeepLinkInArgv,
  parseTeamworkDeepLink,
  resolveJitsiMeetingInput,
  resolveMatrixLink,
  resolveTeamworkDeepLink,
  safeUrlForLog,
  validateJitsiMeetingUrl
} from '../src/shared/deep-links'

const configured = 'https://meet.example.com'
const configuredElement = 'https://element.example.com'

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

  it('parses Matrix deep links and routes them to Element', () => {
    const parsed = parseTeamworkDeepLink(
      'teamwork://matrix?url=https%3A%2F%2Fmatrix.to%2F%23%2F%21room%3Aexample.com'
    )
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.action).toBe('matrix')
      expect(parsed.url).toBe('https://matrix.to/#/!room:example.com')
    }

    const resolved = resolveTeamworkDeepLink(
      'teamwork://matrix?url=https%3A%2F%2Fmatrix.to%2F%23%2F%21room%3Aexample.com',
      configured,
      configuredElement
    )
    expect(resolved.ok).toBe(true)
    if (resolved.ok) {
      expect(resolved.view).toBe('element')
      expect(resolved.url).toBe('https://element.example.com/#/room/!room:example.com')
    }
  })

  it('converts matrix.to room links into Element permalinks', () => {
    const result = resolveMatrixLink(
      'https://matrix.to/#/!room:example.com?via=example.com',
      configuredElement
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.url).toBe(
        'https://element.example.com/#/room/!room:example.com?via=example.com'
      )
    }
  })

  it('converts matrix.to user links into Element user permalinks', () => {
    const result = resolveMatrixLink('https://matrix.to/#/@alice:example.com', configuredElement)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.url).toBe('https://element.example.com/#/user/@alice:example.com')
    }
  })

  it('accepts direct Element room links on the configured origin', () => {
    const result = resolveMatrixLink(
      'https://element.example.com/#/room/#team:example.com',
      configuredElement
    )
    expect(result.ok).toBe(true)
  })

  it('rejects Element links on another origin', () => {
    const result = resolveMatrixLink(
      'https://other.example.com/#/room/!room:example.com',
      configuredElement
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('configured Element server')
  })

  it('requires a configured Element URL for Matrix links', () => {
    expect(resolveMatrixLink('https://matrix.to/#/!room:example.com', '').ok).toBe(false)
  })

  it('rejects malformed matrix.to links', () => {
    expect(resolveMatrixLink('https://matrix.to/', configuredElement).ok).toBe(false)
    expect(resolveMatrixLink('https://matrix.to/#/not-a-room', configuredElement).ok).toBe(false)
  })

  it('does not route a Matrix URL through the Jitsi deep link', () => {
    const result = resolveJitsiMeetingInput(
      'teamwork://matrix?url=https%3A%2F%2Fmatrix.to%2F%23%2F%21room%3Aexample.com',
      configured
    )
    expect(result.ok).toBe(false)
  })
})
