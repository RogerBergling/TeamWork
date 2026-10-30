function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`Missing element #${id}`)
  return value as T
}

const params = new URLSearchParams(window.location.search)
const target = params.get('target') ?? ''
const deepLink = params.get('deep') ?? ''
const host = element<HTMLElement>('host')
const targetElement = element<HTMLElement>('target')
const error = element<HTMLElement>('error')
const openButton = element<HTMLButtonElement>('open-button')
const continueButton = element<HTMLButtonElement>('continue-button')

function showError(message: string): void {
  error.textContent = message
  error.classList.remove('hidden')
  openButton.disabled = true
  continueButton.disabled = true
}

try {
  const parsed = new URL(target)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unsupported link')
  }
  host.textContent = parsed.host
  targetElement.textContent = target
  targetElement.title = target
} catch {
  showError('This link is invalid or unsupported.')
}

if (!deepLink || !/^teamwork:/i.test(deepLink)) {
  showError('This is not a valid TeamWork link.')
}

openButton.addEventListener('click', () => {
  void chrome.tabs
    .getCurrent()
    .then((tab) => {
      if (tab?.id !== undefined) {
        return chrome.tabs.update(tab.id, { url: deepLink })
      }
      window.location.href = deepLink
      return undefined
    })
    .catch(() => {
      window.location.href = deepLink
    })
})

continueButton.addEventListener('click', () => {
  void chrome.runtime
    .sendMessage({ type: 'continue-browser', target })
    .then((response: { ok?: boolean } | undefined) => {
      if (!response?.ok) window.location.href = target
    })
    .catch(() => {
      window.location.href = target
    })
})
