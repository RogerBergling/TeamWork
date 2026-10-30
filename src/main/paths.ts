import { homedir } from 'node:os'
import { join } from 'node:path'

export interface AppPaths {
  configHome: string
  stateHome: string
  configDir: string
  configFile: string
  windowStateFile: string
  logDir: string
  logFile: string
}

export function resolveAppPaths(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir()
): AppPaths {
  const configHome = env.XDG_CONFIG_HOME?.trim() || join(home, '.config')
  const stateHome = env.XDG_STATE_HOME?.trim() || join(home, '.local', 'state')
  const configDir = env.TEAMWORK_CONFIG_DIR?.trim() || join(configHome, 'teamwork')
  const logDir = env.TEAMWORK_STATE_DIR?.trim()
    ? join(env.TEAMWORK_STATE_DIR.trim(), 'logs')
    : join(stateHome, 'teamwork', 'logs')

  return {
    configHome,
    stateHome,
    configDir,
    configFile: join(configDir, 'config.json'),
    windowStateFile: join(configDir, 'window-state.json'),
    logDir,
    logFile: join(logDir, 'teamwork.log')
  }
}
