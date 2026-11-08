import { isUserInitiatedClick, matchLink } from './lib/links'
import { DEFAULT_SETTINGS, loadSettings, type ExtensionSettings } from './lib/settings'

const INSTALLED_KEY = '__teamworkLinkContentScriptInstalled'

function init(): void {
  let settings: ExtensionSettings = DEFAULT_SETTINGS
  let settingsReady = false

  const refreshSettings = async (): Promise<void> => {
    try {
      settings = await loadSettings()
      settingsReady = true
    } catch {
      settings = DEFAULT_SETTINGS
    }
  }

  void refreshSettings()

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync' || area === 'managed') void refreshSettings()
  })

  document.addEventListener(
    'click',
    (event) => {
      if (!settingsReady || !isUserInitiatedClick(event)) return

      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return

      const saferedirect = anchor.getAttribute('data-saferedirecturl')
      const rawHref = saferedirect || anchor.href
      const match = matchLink(rawHref, settings)
      if (!match) return

      event.preventDefault()
      event.stopPropagation()

      void chrome.runtime
        .sendMessage({
          type: 'open-link',
          kind: match.kind,
          target: match.target,
          deepLink: match.deepLink
        })
        .catch(() => {
          window.location.assign(anchor.href)
        })
    },
    true
  )
}

if (!(globalThis as Record<string, unknown>)[INSTALLED_KEY]) {
  ;(globalThis as Record<string, unknown>)[INSTALLED_KEY] = true
  init()
}
