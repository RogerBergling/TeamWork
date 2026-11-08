import { isTrustedContentDeepLink, matchLink, type LinkMatch } from './lib/links'
import {
  DEFAULT_SETTINGS,
  hasAllSitesPermission,
  loadSettings,
  syncAllSitesContentScript,
  type ExtensionSettings
} from './lib/settings'

let settingsCache: ExtensionSettings = DEFAULT_SETTINGS
let settingsReady = false
let settingsLoading: Promise<ExtensionSettings> | null = null

const bypass = new Map<number, { url: string; until: number }>()
const recentRedirects = new Map<number, { url: string; at: number }>()

async function getSettings(force = false): Promise<ExtensionSettings> {
  if (settingsReady && !force) return settingsCache
  if (!settingsLoading || force) {
    settingsLoading = loadSettings()
      .then((settings) => {
        settingsCache = settings
        settingsReady = true
        return settings
      })
      .finally(() => {
        settingsLoading = null
      })
  }
  return settingsLoading
}

function createMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'open-link',
      title: 'Open link in TeamWork',
      contexts: ['link']
    })
    chrome.contextMenus.create({
      id: 'open-page',
      title: 'Open this page in TeamWork',
      contexts: ['page']
    })
  })
}

function notify(message: string): void {
  void chrome.notifications
    .create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'TeamWork Link Opener',
      message
    })
    .catch((error) => console.warn('Could not show notification', error))
}

async function showInterstitial(
  tabId: number,
  target: string,
  deepLink: string
): Promise<void> {
  const url =
    chrome.runtime.getURL('interstitial.html') +
    `?target=${encodeURIComponent(target)}&deep=${encodeURIComponent(deepLink)}`
  await chrome.tabs.update(tabId, { url })
}

async function openMatch(tabId: number | undefined, match: LinkMatch): Promise<void> {
  try {
    if (tabId !== undefined) {
      await chrome.tabs.update(tabId, { url: match.deepLink })
    } else {
      await chrome.tabs.create({ url: match.deepLink })
    }
  } catch (error) {
    console.warn('Could not launch TeamWork protocol', error)
    if (tabId !== undefined) {
      try {
        await showInterstitial(tabId, match.target, match.deepLink)
      } catch (interstitialError) {
        console.warn('Could not show fallback page', interstitialError)
        notify('TeamWork could not be launched. Is the desktop application installed?')
      }
      return
    }
    notify('TeamWork could not be launched. Is the desktop application installed?')
  }
}

interface NavigationDetails {
  tabId: number
  frameId: number
  url: string
}

async function handleNavigation(details: NavigationDetails): Promise<void> {
  if (details.tabId < 0 || details.frameId !== 0) return
  if (!/^https?:/i.test(details.url)) return

  const bypassEntry = bypass.get(details.tabId)
  if (bypassEntry) {
    if (Date.now() < bypassEntry.until && bypassEntry.url === details.url) {
      bypass.delete(details.tabId)
      return
    }
    bypass.delete(details.tabId)
  }

  const settings = await getSettings()
  if (settings.mode === 'click') return

  const match = matchLink(details.url, settings)
  if (!match) return

  const recent = recentRedirects.get(details.tabId)
  if (recent && recent.url === details.url && Date.now() - recent.at < 5000) return
  recentRedirects.set(details.tabId, { url: details.url, at: Date.now() })

  if (settings.mode === 'auto') {
    await openMatch(details.tabId, match)
  } else {
    await showInterstitial(details.tabId, match.target, match.deepLink)
  }
}

async function ensureDynamicScript(): Promise<void> {
  const settings = await getSettings()
  const permission = await hasAllSitesPermission()
  try {
    await syncAllSitesContentScript(settings.interceptAllSites && permission)
  } catch (error) {
    console.warn('Could not update all-sites content script', error)
  }
}

function contextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): void {
  const raw = info.menuItemId === 'open-link' ? info.linkUrl : info.pageUrl
  if (!raw) return

  void getSettings().then(async (settings) => {
    const match = matchLink(raw, settings)
    if (!match) {
      notify(
        'This link is not a configured Jitsi or Element meeting. Add its domain in the extension settings.'
      )
      return
    }
    await openMatch(tab?.id, match)
  })
}

chrome.runtime.onInstalled.addListener(() => {
  createMenus()
  void getSettings(true).then(() => ensureDynamicScript())
})

chrome.runtime.onStartup.addListener(() => {
  createMenus()
  void ensureDynamicScript()
})

chrome.contextMenus.onClicked.addListener(contextMenuClick)

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  void handleNavigation(details).catch((error) =>
    console.warn('Could not process navigation', error)
  )
})

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'sync' && area !== 'managed') return
  settingsReady = false
  void getSettings(true).then(() => ensureDynamicScript())
})

chrome.permissions.onAdded.addListener(() => {
  void ensureDynamicScript()
})

chrome.permissions.onRemoved.addListener(() => {
  void ensureDynamicScript()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const data = (message ?? {}) as {
    type?: string
    kind?: 'jitsi' | 'matrix'
    deepLink?: string
    target?: string
  }

  if (
    data.type === 'open-link' &&
    typeof data.deepLink === 'string' &&
    typeof data.target === 'string'
  ) {
    const target = data.target
    const deepLink = data.deepLink
    void getSettings().then(async (settings) => {
      if (!isTrustedContentDeepLink(target, deepLink, settings)) {
        console.warn('Ignored an untrusted TeamWork link message from a content script')
        sendResponse({ ok: false })
        return
      }
      const match = matchLink(target, settings)
      if (!match) {
        sendResponse({ ok: false })
        return
      }
      await openMatch(sender.tab?.id, match)
      sendResponse({ ok: true })
    }).catch(() => sendResponse({ ok: false }))
    return true
  }

  if (data.type === 'continue-browser' && typeof data.target === 'string') {
    const tabId = sender.tab?.id
    let target: URL
    try {
      target = new URL(data.target)
    } catch {
      sendResponse({ ok: false })
      return false
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      sendResponse({ ok: false })
      return false
    }
    if (tabId === undefined) {
      sendResponse({ ok: false })
      return false
    }
    bypass.set(tabId, { url: target.toString(), until: Date.now() + 15000 })
    void chrome.tabs.update(tabId, { url: target.toString() }).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false })
    )
    return true
  }

  if (data.type === 'open-target' && typeof data.target === 'string') {
    void getSettings().then(async (settings) => {
      const match = matchLink(data.target as string, settings)
      if (!match) {
        notify('This link is not a configured Jitsi or Element meeting.')
        sendResponse({ ok: false })
        return
      }
      await openMatch(sender.tab?.id, match)
      sendResponse({ ok: true })
    })
    return true
  }

  if (data.type === 'get-settings') {
    void getSettings().then((settings) => sendResponse(settings))
    return true
  }

  return false
})

void getSettings(true).then(() => ensureDynamicScript())
