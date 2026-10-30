export type UrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

const MAX_URL_LENGTH = 4096

export function findDeepLinkInArgv(argv: string[]): string | null {
  return argv.find((argument) => /^teamwork:\/\//i.test(argument.trim())) ?? null
}

/**
 * Accepts either a native Jitsi URL or a TeamWork deep link such as
 * teamwork://join?url=https%3A%2F%2Fmeet.example.com%2Froom
 */
export function resolveJitsiMeetingInput(input: string, configuredJitsiUrl: string): UrlResult {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Enter a Jitsi meeting URL.' }
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: 'The meeting URL is too long.' }
  }

  let target = trimmed
  if (/^teamwork:/i.test(trimmed)) {
    const extracted = extractDeepLinkTarget(trimmed)
    if (!extracted.ok) return extracted
    target = extracted.url
  }

  return validateJitsiMeetingUrl(target, configuredJitsiUrl)
}

export function extractDeepLinkTarget(raw: string): UrlResult {
  let link: URL
  try {
    link = new URL(raw)
  } catch {
    return { ok: false, error: 'The TeamWork link is not valid.' }
  }

  if (link.protocol !== 'teamwork:') {
    return { ok: false, error: 'The link does not use the teamwork:// protocol.' }
  }

  const host = link.hostname.toLowerCase()
  const path = link.pathname.replace(/^\/+/, '').toLowerCase()
  if (!['join', 'jitsi'].includes(host) && !['join', 'jitsi'].includes(path)) {
    return { ok: false, error: 'The TeamWork link does not point to a Jitsi meeting.' }
  }

  const target = link.searchParams.get('url')
  if (!target) {
    return { ok: false, error: 'The TeamWork link has no Jitsi meeting URL.' }
  }
  if (target.length > MAX_URL_LENGTH) {
    return { ok: false, error: 'The Jitsi meeting URL is too long.' }
  }

  return { ok: true, url: target }
}

export function validateJitsiMeetingUrl(target: string, configuredJitsiUrl: string): UrlResult {
  const trimmed = target.trim()
  if (!trimmed) return { ok: false, error: 'Enter a Jitsi meeting URL.' }
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: 'The Jitsi meeting URL is too long.' }
  }

  if (!configuredJitsiUrl.trim()) {
    return {
      ok: false,
      error: 'Set the Jitsi Meet URL in Settings before joining a meeting.'
    }
  }

  let meeting: URL
  let configured: URL
  try {
    meeting = new URL(trimmed)
    configured = new URL(configuredJitsiUrl.trim())
  } catch {
    return { ok: false, error: 'The Jitsi meeting URL is not valid.' }
  }

  if (meeting.protocol !== 'http:' && meeting.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// meeting links are supported.' }
  }
  if (meeting.username || meeting.password) {
    return { ok: false, error: 'Meeting links containing credentials are not allowed.' }
  }
  if (configured.protocol !== 'http:' && configured.protocol !== 'https:') {
    return { ok: false, error: 'The configured Jitsi URL is not a valid web address.' }
  }
  if (meeting.origin !== configured.origin) {
    return {
      ok: false,
      error: `The meeting must belong to the configured Jitsi server (${configured.origin}).`
    }
  }

  return { ok: true, url: meeting.toString() }
}

export function safeUrlForLog(value: string): string {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return value.split('?')[0]?.split('#')[0] ?? value
  }
}
