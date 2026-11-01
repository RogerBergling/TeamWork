import { describe, expect, it } from 'vitest'
import { buildLabel, formatBuildParts } from '../src/shared/build-info'

describe('build information', () => {
  it('formats a timestamp into local date, time and hour', () => {
    const parts = formatBuildParts('2026-11-01T10:21:00Z')
    expect(parts.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(parts.time).toMatch(/^\d{2}:\d{2}$/)
    expect(parts.hour).toMatch(/^\d{2}$/)
  })

  it('handles invalid timestamps and formats the status label', () => {
    expect(formatBuildParts('not-a-date')).toEqual({
      date: 'unknown',
      time: 'unknown',
      hour: 'unknown'
    })
    expect(buildLabel('0.1.0', '202611011021')).toBe('v0.1.0 · build 202611011021')
  })
})
