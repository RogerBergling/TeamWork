import type { LinkKind } from './links'
import { normalizeDomains } from './links'

export type OpenMode = 'auto' | 'ask' | 'click'

export interface ExtensionSettings {
  jitsiDomains: string[]
  elementDomains: string[]
  mode: OpenMode
  detectPublicJitsi: boolean
  detectMatrixTo: boolean
  interceptAllSites: boolean
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  jitsiDomains: [],
  elementDomains: [],
  mode: 'auto',
  detectPublicJitsi: true,
  detectMatrixTo: true,
  interceptAllSites: false
}

const MODES: OpenMode[] = ['auto', 'ask', 'click']

export function normalizeSettings(input: unknown): ExtensionSettings {
  const value = (input ?? {}) as Partial<ExtensionSettings>
  return {
    jitsiDomains: normalizeDomains(Array.isArray(value.jitsiDomains) ? value.jitsiDomains : []),
    elementDomains: normalizeDomains(
      Array.isArray(value.elementDomains) ? value.elementDomains : []
    ),
    mode: MODES.includes(value.mode as OpenMode) ? (value.mode as OpenMode) : DEFAULT_SETTINGS.mode,
    detectPublicJitsi:
      typeof value.detectPublicJitsi === 'boolean'
        ? value.detectPublicJitsi
        : DEFAULT_SETTINGS.detectPublicJitsi,
    detectMatrixTo:
      typeof value.detectMatrixTo === 'boolean'
        ? value.detectMatrixTo
        : DEFAULT_SETTINGS.detectMatrixTo,
    interceptAllSites:
      typeof value.interceptAllSites === 'boolean'
        ? value.interceptAllSites
        : DEFAULT_SETTINGS.interceptAllSites
  }
}

export async function loadManagedSettings(): Promise<Partial<ExtensionSettings>> {
  try {
    const managed = (await chrome.storage.managed.get(null)) as Partial<ExtensionSettings>
    return managed ?? {}
  } catch {
    return {}
  }
}

export async function loadSettings(): Promise<ExtensionSettings> {
  let stored: Partial<ExtensionSettings> = {}
  try {
    const result = (await chrome.storage.sync.get('settings')) as {
      settings?: Partial<ExtensionSettings>
    }
    stored = result.settings ?? {}
  } catch {
    stored = {}
  }

  const managed = await loadManagedSettings()
  return normalizeSettings({ ...stored, ...managed })
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.sync.set({ settings: normalizeSettings(settings) })
}

export function settingsForDisplay(
  settings: ExtensionSettings
): Array<{ label: string; value: string }> {
  return [
    { label: 'Jitsi domains', value: settings.jitsiDomains.join(', ') || 'None configured' },
    {
      label: 'Element domains',
      value: settings.elementDomains.join(', ') || 'None configured'
    },
    {
      label: 'Mode',
      value:
        settings.mode === 'auto'
          ? 'Automatic'
          : settings.mode === 'ask'
            ? 'Ask first'
            : 'Click only'
    }
  ]
}

export function allSitesOrigins(): string[] {
  return ['https://*/*', 'http://*/*']
}

export async function hasAllSitesPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: allSitesOrigins() })
  } catch {
    return false
  }
}

export async function syncAllSitesContentScript(enabled: boolean): Promise<void> {
  const id = 'teamwork-all-sites'
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] })
  } catch {
    // Not registered.
  }

  if (!enabled) return
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: allSitesOrigins(),
      js: ['content.js'],
      runAt: 'document_start',
      allFrames: true
    }
  ])
}

export function linkKindLabel(kind: LinkKind): string {
  return kind === 'jitsi' ? 'Jitsi meeting' : 'Matrix / Element link'
}
