const DEBUGGING_SWITCHES: RegExp[] = [
  /^--remote-debugging-port(?:=|$)/i,
  /^--remote-debugging-pipe(?:=|$)/i,
  /^--remote-debugging-address(?:=|$)/i,
  /^--inspect(?:-brk|-port)?(?:=|$)/i,
  /^--debug(?:-brk)?(?:=|$)/i
]

/**
 * Finds Chromium/Node debugging switches in the process arguments. Packaged
 * builds refuse these because an open DevTools endpoint gives any local process
 * full control over an authenticated application session.
 */
export function findDebuggingSwitch(argv: string[]): string | null {
  for (const argument of argv) {
    const value = argument.trim()
    if (DEBUGGING_SWITCHES.some((pattern) => pattern.test(value))) {
      return value.split('=', 1)[0]
    }
  }
  return null
}
