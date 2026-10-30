import { matchLink } from './lib/links'
import { loadSettings, type ExtensionSettings } from './lib/settings'

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`Missing element #${id}`)
  return value as T
}

const matched = element<HTMLElement>('matched')
const unmatched = element<HTMLElement>('unmatched')
const pageTitle = element<HTMLElement>('page-title')
const pageUrl = element<HTMLElement>('page-url')
const matchKind = element<HTMLElement>('match-kind')
const matchDescription = element<HTMLElement>('match-description')
const openButton = element<HTMLButtonElement>('open-button')
const modeLabel = element<HTMLElement>('mode-label')

let currentTab: chrome.tabs.Tab | null = null
let settings: ExtensionSettings | null = null

function modeText(mode: ExtensionSettings['mode']): string {
  if (mode === 'auto') return 'Automatic opening'
  if (mode === 'ask') return 'Ask before opening'
  return 'Click only'
}

async function main(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  currentTab = tabs[0] ?? null
  settings = await loadSettings()
  modeLabel.textContent = modeText(settings.mode)

  const url = currentTab?.url ?? ''
  pageTitle.textContent = currentTab?.title || 'Untitled page'
  pageUrl.textContent = url
  pageUrl.title = url

  const match = url ? matchLink(url, settings) : null
  if (!match) {
    unmatched.classList.remove('hidden')
    return
  }

  matched.classList.remove('hidden')
  matchKind.textContent = match.kind === 'jitsi' ? 'Jitsi meeting' : 'Matrix / Element'
  matchDescription.textContent = new URL(match.target).host
  openButton.addEventListener('click', () => {
    if (!currentTab?.id) return
    const tabId = currentTab.id
    void chrome.tabs
      .update(tabId, { url: match.deepLink })
      .catch(() => {
        const fallback =
          chrome.runtime.getURL('interstitial.html') +
          `?target=${encodeURIComponent(match.target)}&deep=${encodeURIComponent(match.deepLink)}`
        return chrome.tabs.update(tabId, { url: fallback })
      })
      .finally(() => window.close())
  })
}

element<HTMLButtonElement>('settings-button').addEventListener('click', () => {
  void chrome.runtime.openOptionsPage()
})

void main()
