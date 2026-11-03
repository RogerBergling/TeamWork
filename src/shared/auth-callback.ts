import type { ResolvedDeepLink } from './deep-links'
import { parseHttpUrl, sameOrigin } from './urls'

export const AUTH_CALLBACK_URL = 'teamwork://auth'
export const AUTH_CALLBACK_PATH = 'teamwork://auth/callback'

const MAX_CALLBACK_LENGTH = 16_384
const MAX_TARGET_LENGTH = 8_192

/**
 * Returns true when a teamwork:// URL is intended for the external-browser SSO
 * callback. Accepts teamwork://auth, teamwork://auth/callback and
 * teamwork:auth for compatibility with different URI normalisers.
 */
export function isAuthCallbackLink(raw: string): boolean {
  try {
    const link = new URL(raw.trim())
    if (link.protocol !== 'teamwork:') return false
    const host = link.hostname.toLowerCase()
    const path = link.pathname.replace(/^\/+/, '').toLowerCase()
    if (host === 'auth') return path === '' || path === 'callback'
    return !host && path === 'auth'
  } catch {
    return false
  }
}

/**
 * Resolves a system-browser SSO callback to an embedded view. The caller must
 * only load the returned URL after this origin validation. Tokens and query
 * parameters are preserved for the embedded application but must not be logged.
 */
export function resolveAuthCallback(
  raw: string,
  configuredElementUrl: string,
  configuredJitsiUrl: string
): ResolvedDeepLink {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'The sign-in callback is empty.' }
  }
  if (trimmed.length > MAX_CALLBACK_LENGTH) {
    return { ok: false, error: 'The sign-in callback is too long.' }
  }
  if (!isAuthCallbackLink(trimmed)) {
    return { ok: false, error: 'The link is not a TeamWork sign-in callback.' }
  }

  let link: URL
  try {
    link = new URL(trimmed)
  } catch {
    return { ok: false, error: 'The sign-in callback is not valid.' }
  }

  const viewParam = (link.searchParams.get('view') ?? '').trim().toLowerCase()
  if (viewParam && viewParam !== 'element' && viewParam !== 'jitsi') {
    return { ok: false, error: 'The sign-in callback has an unsupported view.' }
  }
  const preferredView = (viewParam || undefined) as 'element' | 'jitsi' | undefined
  const target = link.searchParams.get('url')

  if (target !== null) {
    const result = validateReturnUrl(target, configuredElementUrl, configuredJitsiUrl, preferredView)
    if (!result.ok) return result
    return result
  }

  if (preferredView) {
    const configured =
      preferredView === 'element' ? configuredElementUrl.trim() : configuredJitsiUrl.trim()
    if (!configured) {
      return {
        ok: false,
        error: `Set the ${preferredView === 'element' ? 'Element' : 'Jitsi'} URL before completing sign-in.`
      }
    }
    const validated = parseHttpUrl(configured)
    if (!validated) {
      return { ok: false, error: 'The configured application URL is not a valid web address.' }
    }
    return { ok: true, view: preferredView, url: validated.toString() }
  }

  const configuredViews: Array<'element' | 'jitsi'> = []
  if (configuredElementUrl.trim()) configuredViews.push('element')
  if (configuredJitsiUrl.trim()) configuredViews.push('jitsi')

  if (configuredViews.length === 0) {
    return {
      ok: false,
      error: 'Set the Element or Jitsi URL in Settings before completing sign-in.'
    }
  }
  if (configuredViews.length > 1) {
    return {
      ok: false,
      error: 'The sign-in callback must specify view=element or view=jitsi.'
    }
  }

  const view = configuredViews[0]
  const configured = view === 'element' ? configuredElementUrl.trim() : configuredJitsiUrl.trim()
  const validated = parseHttpUrl(configured)
  if (!validated) {
    return { ok: false, error: 'The configured application URL is not a valid web address.' }
  }
  return { ok: true, view, url: validated.toString() }
}

function validateReturnUrl(
  raw: string,
  configuredElementUrl: string,
  configuredJitsiUrl: string,
  preferredView?: 'element' | 'jitsi'
): ResolvedDeepLink {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'The sign-in callback has an empty target URL.' }
  }
  if (trimmed.length > MAX_TARGET_LENGTH) {
    return { ok: false, error: 'The sign-in callback target URL is too long.' }
  }

  let target: URL
  try {
    target = new URL(trimmed)
  } catch {
    return { ok: false, error: 'The sign-in callback target URL is not valid.' }
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// sign-in targets are supported.' }
  }
  if (!target.hostname) {
    return { ok: false, error: 'The sign-in callback target has no host.' }
  }
  if (target.username || target.password) {
    return { ok: false, error: 'Sign-in callback targets containing credentials are not allowed.' }
  }

  const matchesElement = sameOrigin(trimmed, configuredElementUrl)
  const matchesJitsi = sameOrigin(trimmed, configuredJitsiUrl)

  if (preferredView === 'element' && !matchesElement) {
    return {
      ok: false,
      error: `The sign-in target must belong to the configured Element server (${configuredElementUrl}).`
    }
  }
  if (preferredView === 'jitsi' && !matchesJitsi) {
    return {
      ok: false,
      error: `The sign-in target must belong to the configured Jitsi server (${configuredJitsiUrl}).`
    }
  }

  if (preferredView) {
    return { ok: true, view: preferredView, url: target.toString() }
  }
  if (matchesElement && matchesJitsi) {
    return {
      ok: false,
      error: 'The sign-in target matches both applications; specify view=element or view=jitsi.'
    }
  }
  if (matchesElement) return { ok: true, view: 'element', url: target.toString() }
  if (matchesJitsi) return { ok: true, view: 'jitsi', url: target.toString() }

  return {
    ok: false,
    error: 'The sign-in target does not belong to the configured Element or Jitsi server.'
  }
}
