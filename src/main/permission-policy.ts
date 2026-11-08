/**
 * Permissions the embedded applications may use without a prompt when the
 * request comes from their configured origin. Anything outside this set must
 * not be auto-granted merely because the origin matches.
 */
export const APP_PERMISSIONS: ReadonlySet<string> = new Set([
  'media',
  'display-capture',
  'fullscreen',
  'clipboard-read',
  'clipboard-sanitized-write',
  'speaker-selection',
  'storage-access',
  'top-level-storage-access',
  'persistent-storage',
  'pointerLock',
  'screen-wake-lock',
  'window-management',
  'openExternal'
])

export const ALWAYS_ALLOWED: ReadonlySet<string> = new Set([
  'storage-access',
  'top-level-storage-access',
  'openExternal'
])

export function appPermissionAllowed(
  permission: string,
  notificationsEnabled: boolean
): boolean {
  if (permission === 'notifications') return notificationsEnabled
  return APP_PERMISSIONS.has(permission)
}

/**
 * Mirrors the permission *check* handler: app origins get the explicit
 * allow-list (notifications stay behind the setting), everything else falls
 * through to a real request/prompt.
 */
export function permissionCheckDecision(options: {
  permission: string
  requestingOrigin: string | null
  appOrigin: string | null
  notificationsEnabled: boolean
}): boolean {
  if (ALWAYS_ALLOWED.has(options.permission)) return true
  if (
    options.requestingOrigin !== null &&
    options.appOrigin !== null &&
    options.requestingOrigin === options.appOrigin
  ) {
    return appPermissionAllowed(options.permission, options.notificationsEnabled)
  }
  return false
}
