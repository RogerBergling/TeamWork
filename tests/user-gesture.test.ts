import { describe, expect, it } from 'vitest'
import { isUserGestureInput, UserGestureTracker } from '../src/main/user-gesture'

describe('user gesture tracking', () => {
  it('recognises interaction input types only', () => {
    expect(isUserGestureInput('mouseDown')).toBe(true)
    expect(isUserGestureInput('keyDown')).toBe(true)
    expect(isUserGestureInput('gestureTap')).toBe(true)
    expect(isUserGestureInput('mouseMove')).toBe(false)
    expect(isUserGestureInput('mouseWheel')).toBe(false)
    expect(isUserGestureInput(undefined)).toBe(false)
  })

  it('consumes a recent interaction once', () => {
    let now = 1_000
    const tracker = new UserGestureTracker(5_000, () => now)
    tracker.noteInput('element')
    now += 1_000

    expect(tracker.consume('element')).toBe(true)
    expect(tracker.consume('element')).toBe(false)
  })

  it('rejects stale or missing interactions', () => {
    let now = 1_000
    const tracker = new UserGestureTracker(5_000, () => now)
    expect(tracker.consume('jitsi')).toBe(false)

    tracker.noteInput('jitsi')
    now += 5_001
    expect(tracker.consume('jitsi')).toBe(false)
  })

  it('keeps gestures scoped to the view that received them', () => {
    const tracker = new UserGestureTracker(5_000, () => 1_000)
    tracker.noteInput('element')
    expect(tracker.consume('jitsi')).toBe(false)
    expect(tracker.consume('element')).toBe(true)
  })
})
