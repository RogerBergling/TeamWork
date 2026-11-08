import { redactTokenLike } from './log-redaction'

export type UrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export type DeepLinkAction = 'jitsi' | 'matrix'

export type ParsedDeepLink =
  | { ok: true; action: DeepLinkAction; url: string }
  | { ok: false; error: string }

export type ResolvedDeepLink =
  | { ok: true; view: 'jitsi' | 'element'; url: string }
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
    const extracted = parseTeamworkDeepLink(trimmed)
    if (!extracted.ok) return extracted
    if (extracted.action !== 'jitsi') {
      return { ok: false, error: 'The TeamWork link does not point to a Jitsi meeting.' }
    }
    target = extracted.url
  }

  return validateJitsiMeetingUrl(target, configuredJitsiUrl)
}

export function parseTeamworkDeepLink(raw: string): ParsedDeepLink {
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
  const actionName = host || path
  let action: DeepLinkAction
  if (actionName === 'join' || actionName === 'jitsi') {
    action = 'jitsi'
  } else if (actionName === 'matrix' || actionName === 'element') {
    action = 'matrix'
  } else {
    return { ok: false, error: 'The TeamWork link has an unsupported action.' }
  }

  const target = link.searchParams.get('url')
  if (!target) {
    return { ok: false, error: 'The TeamWork link has no target URL.' }
  }
  if (target.length > MAX_URL_LENGTH) {
    return { ok: false, error: 'The target URL is too long.' }
  }

  return { ok: true, action, url: target }
}

export function extractDeepLinkTarget(raw: string): UrlResult {
  const parsed = parseTeamworkDeepLink(raw)
  if (!parsed.ok) return parsed
  if (parsed.action !== 'jitsi') {
    return { ok: false, error: 'The TeamWork link does not point to a Jitsi meeting.' }
  }
  return { ok: true, url: parsed.url }
}

export function resolveTeamworkDeepLink(
  raw: string,
  configuredJitsiUrl: string,
  configuredElementUrl: string
): ResolvedDeepLink {
  const parsed = parseTeamworkDeepLink(raw)
  if (!parsed.ok) return parsed

  if (parsed.action === 'jitsi') {
    const result = validateJitsiMeetingUrl(parsed.url, configuredJitsiUrl)
    if (!result.ok) return result
    return { ok: true, view: 'jitsi', url: result.url }
  }

  const result = resolveMatrixLink(parsed.url, configuredElementUrl)
  if (!result.ok) return result
  return { ok: true, view: 'element', url: result.url }
}

export function resolveMatrixLink(target: string, configuredElementUrl: string): UrlResult {
  const trimmed = target.trim()
  if (!trimmed) return { ok: false, error: 'Enter a Matrix or Element link.' }
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: 'The Matrix link is too long.' }
  }
  if (!configuredElementUrl.trim()) {
    return {
      ok: false,
      error: 'Set the Element URL in Settings before opening a Matrix room.'
    }
  }

  let link: URL
  let configured: URL
  try {
    link = new URL(trimmed)
    configured = new URL(configuredElementUrl.trim())
  } catch {
    return { ok: false, error: 'The Matrix or Element link is not valid.' }
  }

  if (link.protocol !== 'http:' && link.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// Matrix links are supported.' }
  }
  if (link.username || link.password) {
    return { ok: false, error: 'Matrix links containing credentials are not allowed.' }
  }
  if (configured.protocol !== 'http:' && configured.protocol !== 'https:') {
    return { ok: false, error: 'The configured Element URL is not a valid web address.' }
  }

  if (link.hostname.toLowerCase() === 'matrix.to') {
    const fragment = link.hash.startsWith('#/') ? link.hash.slice(2) : ''
    if (!fragment || !/^[!#@]/.test(fragment)) {
      return { ok: false, error: 'The matrix.to link does not contain a room or user.' }
    }

    const basePath = configured.pathname.endsWith('/')
      ? configured.pathname
      : `${configured.pathname}/`
    const view = fragment.startsWith('@') ? 'user' : 'room'
    const elementUrl = `${configured.origin}${basePath}#/${view}/${fragment}`
    return { ok: true, url: new URL(elementUrl).toString() }
  }

  if (link.origin !== configured.origin) {
    return {
      ok: false,
      error: `The Matrix link must belong to the configured Element server (${configured.origin}).`
    }
  }

  if (!/^#\/(?:room|user)\//.test(link.hash)) {
    return {
      ok: false,
      error: 'The Element link is not a room or user permalink.'
    }
  }

  return { ok: true, url: link.toString() }
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
    return redactTokenLike(`${url.origin}${url.pathname}`)
  } catch {
    return redactTokenLike(value.split('?')[0]?.split('#')[0] ?? value)
  }
}
