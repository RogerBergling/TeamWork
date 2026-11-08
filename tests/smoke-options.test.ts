import { describe, expect, it } from 'vitest'
import { readSmokeOptions } from '../src/main/smoke-options'

const env = {
  TEAMWORK_SMOKE_TEST: '1',
  TEAMWORK_SMOKE_SCREENSHOT: '/tmp/teamwork-smoke.png',
  TEAMWORK_SMOKE_SAVE_TEST: '1',
  TEAMWORK_SMOKE_JOIN_DIALOG: '1',
  TEAMWORK_SMOKE_UI_JOIN_URL: 'https://meet.example.com/room',
  TEAMWORK_SMOKE_EXPECT_READY: 'element'
}

describe('smoke-test options', () => {
  it('reads every hook in development', () => {
    expect(readSmokeOptions(env, false)).toEqual({
      enabled: true,
      screenshotPath: '/tmp/teamwork-smoke.png',
      saveTest: true,
      joinDialog: true,
      uiJoinUrl: 'https://meet.example.com/room',
      expectedReadyView: 'element'
    })
  })

  it('ignores every smoke hook in packaged builds', () => {
    expect(readSmokeOptions(env, true)).toEqual({
      enabled: false,
      screenshotPath: null,
      saveTest: false,
      joinDialog: false,
      uiJoinUrl: null,
      expectedReadyView: null
    })
  })

  it('requires an explicit enabled flag', () => {
    expect(readSmokeOptions({ ...env, TEAMWORK_SMOKE_TEST: '0' }, false).enabled).toBe(false)
    expect(readSmokeOptions({}, false).enabled).toBe(false)
  })
})
