import { describe, expect, it } from 'vitest'
import {
  appPermissionAllowed,
  permissionCheckDecision
} from '../src/main/permission-policy'

const appOrigin = 'https://element.example.com'

function decision(permission: string, origin = appOrigin, notificationsEnabled = true): boolean {
  return permissionCheckDecision({
    permission,
    requestingOrigin: origin,
    appOrigin,
    notificationsEnabled
  })
}

describe('permission policy', () => {
  it('auto-grants only the explicit app allow-list for the app origin', () => {
    for (const permission of [
      'media',
      'display-capture',
      'fullscreen',
      'clipboard-read',
      'clipboard-sanitized-write',
      'speaker-selection',
      'persistent-storage',
      'pointerLock',
      'screen-wake-lock',
      'window-management'
    ]) {
      expect(decision(permission)).toBe(true)
    }
  })

  it('does not grant unrelated permissions merely because the origin matches', () => {
    for (const permission of ['geolocation', 'midi', 'midiSysex', 'hid', 'serial', 'usb']) {
      expect(decision(permission)).toBe(false)
    }
  })

  it('keeps notifications behind the setting', () => {
    expect(decision('notifications', appOrigin, true)).toBe(true)
    expect(decision('notifications', appOrigin, false)).toBe(false)
    expect(appPermissionAllowed('notifications', false)).toBe(false)
  })

  it('does not auto-grant app permissions from another origin', () => {
    expect(decision('media', 'https://evil.example.com')).toBe(false)
    expect(decision('display-capture', 'https://other.example.com')).toBe(false)
  })

  it('keeps the existing always-allowed storage and openExternal behaviour', () => {
    expect(decision('storage-access', 'https://other.example.com')).toBe(true)
    expect(decision('top-level-storage-access', 'https://other.example.com')).toBe(true)
    expect(decision('openExternal', 'https://other.example.com')).toBe(true)
  })
})
