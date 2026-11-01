import { describe, expect, it } from 'vitest'
import { StartupTimer } from '../src/main/startup-timing'

describe('StartupTimer', () => {
  it('records each mark once', () => {
    const timer = new StartupTimer()
    expect(timer.mark('window-created')).toBe(true)
    expect(timer.mark('window-created')).toBe(false)
    expect(timer.get('window-created')).toBeTypeOf('number')
  })

  it('returns a JSON-friendly snapshot', () => {
    const timer = new StartupTimer()
    timer.mark('app-ready')
    timer.mark('renderer-ready')
    const snapshot = timer.snapshot()
    expect(snapshot['app-ready']).toBeGreaterThanOrEqual(0)
    expect(snapshot['renderer-ready']).toBeGreaterThanOrEqual(snapshot['app-ready'])
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })
})
