export function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.hostname.length === 0) return null
    return url
  } catch {
    return null
  }
}

export function originOf(value: string): string | null {
  return parseHttpUrl(value)?.origin ?? null
}

export function sameOrigin(left: string, right: string): boolean {
  const leftOrigin = originOf(left)
  const rightOrigin = originOf(right)
  return leftOrigin !== null && leftOrigin === rightOrigin
}

export function normalizeOrigin(value: string): string | null {
  const url = parseHttpUrl(value)
  return url ? url.origin : null
}

export function isTrustedOrigin(target: string, trustedOrigins: string[]): boolean {
  const targetOrigin = originOf(target)
  if (!targetOrigin) return false

  return trustedOrigins.some((entry) => {
    const trustedOrigin = normalizeOrigin(entry)
    return trustedOrigin !== null && trustedOrigin === targetOrigin
  })
}

/**
 * Decides whether a navigation should leave the embedded application and open in
 * the system browser. Keeping every navigation in-app when no trusted auth
 * origins are configured is intentional: SAML and OpenID redirect chains cross
 * many origins and breaking them would make web login impossible.
 */
export function shouldOpenExternally(
  target: string,
  appUrl: string,
  trustedAuthOrigins: string[]
): boolean {
  if (!parseHttpUrl(target)) return true
  if (sameOrigin(target, appUrl)) return false
  if (trustedAuthOrigins.length === 0) return false
  return !isTrustedOrigin(target, trustedAuthOrigins)
}

export function isExternalProtocolAllowed(value: string): boolean {
  return /^(mailto|tel):/i.test(value)
}

export function hostOf(value: string): string {
  return parseHttpUrl(value)?.host ?? value
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}
