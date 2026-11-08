import { describe, expect, it } from 'vitest'
import { safeUrlForLog } from '../src/shared/deep-links'
import {
  redactConsoleMessage,
  redactTokenLike
} from '../src/shared/log-redaction'

const jwt =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signatureABCDEFGH'

describe('log redaction', () => {
  it('removes query strings and hashes from logged URLs', () => {
    expect(safeUrlForLog('https://meet.example.com/room?jwt=secret#config')).toBe(
      'https://meet.example.com/room'
    )
  })

  it('redacts JWT-like tokens embedded in URL paths', () => {
    const logged = safeUrlForLog(`https://meet.example.com/room/${jwt}/join`)
    expect(logged).not.toContain(jwt)
    expect(logged).toContain('[redacted-token]')
  })

  it('redacts tokens in text and console output', () => {
    const message = [
      `Authorization: Bearer ${jwt}`,
      `url=https://element.example.com/callback?access_token=${jwt}&x=1`,
      `token=${jwt}`
    ].join(' ')
    const redacted = redactTokenLike(message)
    expect(redacted).not.toContain(jwt)
    expect(redacted).not.toContain('access_token=eyJ')
    expect(redacted).toContain('[redacted-token]')
  })

  it('bounds and normalises remote console messages', () => {
    const message = `line one\nline two\u0000${jwt}`
    const redacted = redactConsoleMessage(message, 40)
    expect(redacted.length).toBeLessThanOrEqual(40)
    expect(redacted).not.toContain(jwt)
    expect(redacted).not.toContain('\n')
    expect(redacted).not.toContain('\u0000')
  })
})
