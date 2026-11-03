import { describe, expect, it } from 'vitest'
import { findDebuggingSwitch } from '../src/main/startup-guards'

describe('packaged startup guards', () => {
  it('detects remote debugging switches', () => {
    expect(findDebuggingSwitch(['teamwork', '--remote-debugging-port=9222'])).toBe(
      '--remote-debugging-port'
    )
    expect(findDebuggingSwitch(['teamwork', '--remote-debugging-port', '9222'])).toBe(
      '--remote-debugging-port'
    )
    expect(findDebuggingSwitch(['teamwork', '--remote-debugging-pipe'])).toBe(
      '--remote-debugging-pipe'
    )
  })

  it('detects Node inspector switches as defence in depth', () => {
    expect(findDebuggingSwitch(['teamwork', '--inspect=127.0.0.1:9229'])).toBe('--inspect')
    expect(findDebuggingSwitch(['teamwork', '--inspect-brk'])).toBe('--inspect-brk')
  })

  it('allows ordinary arguments', () => {
    expect(findDebuggingSwitch(['teamwork', '--no-sandbox', '--disable-gpu'])).toBeNull()
    expect(findDebuggingSwitch(['teamwork', '--ozone-platform-hint=auto'])).toBeNull()
  })
})
