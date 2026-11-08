export interface SmokeOptions {
  enabled: boolean
  screenshotPath: string | null
  saveTest: boolean
  joinDialog: boolean
  uiJoinUrl: string | null
  expectedReadyView: string | null
}

const DISABLED: SmokeOptions = {
  enabled: false,
  screenshotPath: null,
  saveTest: false,
  joinDialog: false,
  uiJoinUrl: null,
  expectedReadyView: null
}

/**
 * Smoke-test hooks are development-only automation. Packaged applications must
 * ignore every TEAMWORK_SMOKE_* variable, including screenshot and save paths.
 */
export function readSmokeOptions(env: NodeJS.ProcessEnv, isPackaged: boolean): SmokeOptions {
  if (isPackaged) return { ...DISABLED }

  return {
    enabled: env.TEAMWORK_SMOKE_TEST === '1',
    screenshotPath: env.TEAMWORK_SMOKE_SCREENSHOT?.trim() || null,
    saveTest: env.TEAMWORK_SMOKE_SAVE_TEST === '1',
    joinDialog: env.TEAMWORK_SMOKE_JOIN_DIALOG === '1',
    uiJoinUrl: env.TEAMWORK_SMOKE_UI_JOIN_URL?.trim() || null,
    expectedReadyView: env.TEAMWORK_SMOKE_EXPECT_READY?.trim() || null
  }
}
