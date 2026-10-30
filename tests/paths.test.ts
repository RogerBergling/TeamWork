import { describe, expect, it } from 'vitest'
import { resolveAppPaths } from '../src/main/paths'

describe('application paths', () => {
  it('follows XDG defaults', () => {
    const paths = resolveAppPaths({}, '/home/alice')
    expect(paths.configFile).toBe('/home/alice/.config/teamwork/config.json')
    expect(paths.logFile).toBe('/home/alice/.local/state/teamwork/logs/teamwork.log')
  })

  it('honours XDG environment variables', () => {
    const paths = resolveAppPaths(
      {
        XDG_CONFIG_HOME: '/tmp/config',
        XDG_STATE_HOME: '/tmp/state'
      },
      '/home/alice'
    )
    expect(paths.configDir).toBe('/tmp/config/teamwork')
    expect(paths.logDir).toBe('/tmp/state/teamwork/logs')
  })

  it('allows complete profile overrides for testing and portable use', () => {
    const paths = resolveAppPaths(
      {
        TEAMWORK_CONFIG_DIR: '/opt/teamwork-profile',
        TEAMWORK_STATE_DIR: '/var/tmp/teamwork-state'
      },
      '/home/alice'
    )
    expect(paths.configFile).toBe('/opt/teamwork-profile/config.json')
    expect(paths.windowStateFile).toBe('/opt/teamwork-profile/window-state.json')
    expect(paths.logFile).toBe('/var/tmp/teamwork-state/logs/teamwork.log')
  })
})
