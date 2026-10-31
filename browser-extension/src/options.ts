import { matchLink } from './lib/links'
import {
  DEFAULT_SETTINGS,
  allSitesOrigins,
  hasAllSitesPermission,
  loadManagedSettings,
  loadSettings,
  normalizeSettings,
  saveSettings,
  syncAllSitesContentScript,
  type ExtensionSettings,
  type OpenMode
} from './lib/settings'

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`Missing element #${id}`)
  return value as T
}

const form = element<HTMLFormElement>('settings-form')
const jitsiDomains = element<HTMLTextAreaElement>('jitsi-domains')
const elementDomains = element<HTMLTextAreaElement>('element-domains')
const detectPublicJitsi = element<HTMLInputElement>('detect-public-jitsi')
const detectMatrixTo = element<HTMLInputElement>('detect-matrix-to')
const mode = element<HTMLSelectElement>('mode')
const modeHelp = element<HTMLParagraphElement>('mode-help')
const interceptAllSites = element<HTMLInputElement>('intercept-all-sites')
const permissionNote = element<HTMLParagraphElement>('permission-note')
const testUrl = element<HTMLInputElement>('test-url')
const testResult = element<HTMLPreElement>('test-result')
const status = element<HTMLSpanElement>('status')
const managedBanner = element<HTMLDivElement>('managed-banner')

let managed: Partial<ExtensionSettings> = {}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function collectSettings(): ExtensionSettings {
  return normalizeSettings({
    jitsiDomains: lines(jitsiDomains.value),
    elementDomains: lines(elementDomains.value),
    detectPublicJitsi: detectPublicJitsi.checked,
    detectMatrixTo: detectMatrixTo.checked,
    mode: mode.value as OpenMode,
    interceptAllSites: interceptAllSites.checked
  })
}

function updateModeHelp(): void {
  const text =
    mode.value === 'auto'
      ? 'Matching links open TeamWork immediately. The browser may ask once for protocol permission.'
      : mode.value === 'ask'
        ? 'Matching links show an intermediate page with “Open in TeamWork” and “Continue in browser”.'
        : 'Matching links are only converted when clicked inside a supported mail site, through the context menu, or from the popup.'
  modeHelp.textContent = text
}

function setStatus(message: string, kind: 'success' | 'error' = 'success'): void {
  status.textContent = message
  status.className = `status is-${kind}`
  if (kind === 'success') {
    window.setTimeout(() => {
      if (status.textContent === message) {
        status.textContent = ''
        status.className = 'status'
      }
    }, 3500)
  }
}

function applyManagedState(): void {
  const keys = new Set(Object.keys(managed))
  if (keys.size === 0) return

  managedBanner.classList.remove('hidden')
  const map: Array<[string, HTMLElement]> = [
    ['jitsiDomains', jitsiDomains],
    ['elementDomains', elementDomains],
    ['detectPublicJitsi', detectPublicJitsi],
    ['detectMatrixTo', detectMatrixTo],
    ['mode', mode],
    ['interceptAllSites', interceptAllSites]
  ]
  for (const [key, control] of map) {
    if (keys.has(key)) {
      control.setAttribute('disabled', 'true')
    }
  }
}

async function updatePermissionNote(): Promise<void> {
  const granted = await hasAllSitesPermission()
  if (interceptAllSites.checked && !granted) {
    permissionNote.textContent =
      'Permission to read all websites has not been granted. Save or re-enable the option to request it.'
  } else if (managed.interceptAllSites === true && !granted) {
    permissionNote.textContent =
      'Your organization enabled all-site interception, but the browser permission is not granted. Click Save to request it.'
  } else if (granted) {
    permissionNote.textContent = 'All-site access is granted.'
  } else {
    permissionNote.textContent = ''
  }
}

async function apply(settings: ExtensionSettings): Promise<void> {
  jitsiDomains.value = settings.jitsiDomains.join('\n')
  elementDomains.value = settings.elementDomains.join('\n')
  detectPublicJitsi.checked = settings.detectPublicJitsi
  detectMatrixTo.checked = settings.detectMatrixTo
  mode.value = settings.mode
  const permission = await hasAllSitesPermission()
  interceptAllSites.checked = settings.interceptAllSites && permission
  updateModeHelp()
  applyManagedState()
  await updatePermissionNote()
}

async function requestAllSites(): Promise<boolean> {
  try {
    const granted = await hasAllSitesPermission()
    if (granted) return true
    return await chrome.permissions.request({ origins: allSitesOrigins() })
  } catch {
    return false
  }
}

async function disableAllSites(): Promise<void> {
  await syncAllSitesContentScript(false)
  try {
    await chrome.permissions.remove({ origins: allSitesOrigins() })
  } catch {
    // Permission may already be gone.
  }
}

async function save(): Promise<void> {
  const next = collectSettings()
  const wantsAllSites = interceptAllSites.checked || managed.interceptAllSites === true

  if (wantsAllSites) {
    const granted = await requestAllSites()
    if (!granted) {
      if (managed.interceptAllSites === true) {
        setStatus(
          'The browser did not grant all-site access. The managed setting cannot take effect without it.',
          'error'
        )
        return
      }
      interceptAllSites.checked = false
      next.interceptAllSites = false
      setStatus('All-site access was not granted; local-only interception is still active.', 'error')
    } else {
      next.interceptAllSites = true
    }
  } else {
    next.interceptAllSites = false
    await disableAllSites()
  }

  try {
    await saveSettings(next)
    await syncAllSitesContentScript(next.interceptAllSites)
    setStatus('Settings saved.')
    await updatePermissionNote()
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not save settings.', 'error')
  }
}

function testCurrentLink(): void {
  const value = testUrl.value.trim()
  if (!value) {
    testResult.textContent = 'Paste a link first.'
    return
  }
  if (/^teamwork:/i.test(value)) {
    testResult.textContent = 'This is already a TeamWork deep link. Paste a normal HTTPS link.'
    return
  }

  const match = matchLink(value, collectSettings())
  if (!match) {
    testResult.textContent =
      'Not recognized. Check the hostname and make sure it is listed as a trusted Jitsi or Element domain.'
    return
  }

  testResult.textContent = [
    `Type: ${match.kind === 'jitsi' ? 'Jitsi meeting' : 'Matrix / Element link'}`,
    `Target: ${match.target}`,
    `TeamWork link: ${match.deepLink}`
  ].join('\n')
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  void save()
})

mode.addEventListener('change', updateModeHelp)
testUrl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    testCurrentLink()
  }
})
element<HTMLButtonElement>('test-button').addEventListener('click', testCurrentLink)
element<HTMLButtonElement>('reset-button').addEventListener('click', () => {
  if (!window.confirm('Reset local extension settings to defaults? Managed settings are preserved.')) {
    return
  }
  void disableAllSites()
    .then(() => chrome.storage.sync.remove('settings'))
    .finally(() => window.location.reload())
})

interceptAllSites.addEventListener('change', () => {
  if (!interceptAllSites.checked) {
    void disableAllSites().then(updatePermissionNote)
    return
  }
  if (managed.interceptAllSites === true) return
  void requestAllSites().then((granted) => {
    if (!granted) interceptAllSites.checked = false
    else setStatus('Permission granted. Click Save settings to enable all-site interception.')
    void updatePermissionNote()
  })
})

void Promise.all([loadSettings(), loadManagedSettings()])
  .then(async ([settings, managedSettings]) => {
    managed = managedSettings
    await apply(settings)
  })
  .catch((error) => {
    setStatus(error instanceof Error ? error.message : 'Could not load settings.', 'error')
    void apply(DEFAULT_SETTINGS)
  })
