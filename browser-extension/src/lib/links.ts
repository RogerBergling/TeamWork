export type LinkKind = 'jitsi' | 'matrix'

export interface LinkMatch {
  kind: LinkKind
  target: string
  deepLink: string
}

export interface MatchSettings {
  jitsiDomains: string[]
  elementDomains: string[]
  detectPublicJitsi: boolean
  detectMatrixTo: boolean
}

export const PUBLIC_JITSI_HOSTS = ['meet.jit.si', '8x8.vc', '*.8x8.vc']

const REDIRECT_PARAMS = [
  'url',
  'u',
  'target',
  'redirect',
  'redirect_uri',
  'destination',
  'dest'
]

const JITSI_ASSET_PREFIXES = [
  '/config',
  '/libs',
  '/css',
  '/fonts',
  '/images',
  '/img',
  '/sounds',
  '/lang',
  '/api',
  '/http-bind',
  '/external_api',
  '/iframe_api',
  '/static',
  '/assets',
  '/_'
]

export function normalizeDomains(values: string[]): string[] {
  const normalized: string[] = []
  for (const raw of values) {
    let value = raw.trim().toLowerCase()
    if (!value) continue
    value = value.replace(/^[a-z]+:\/\//, '').split('/')[0] ?? ''
    if (!value) continue
    value = value.split(':')[0] ?? value
    if (value.startsWith('*.')) {
      value = value.slice(2)
      if (!value.includes('.')) continue
      normalized.push(`*.${value}`)
      continue
    }
    if (!value.includes('.') && value !== 'localhost') continue
    normalized.push(value)
  }
  return [...new Set(normalized)]
}

export function hostMatches(hostname: string, patterns: string[]): boolean {
  const host = hostname.toLowerCase()
  return patterns.some((pattern) => {
    const normalized = pattern.toLowerCase().trim()
    if (!normalized) return false
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(1)
      return host.endsWith(suffix) && host.length > suffix.length
    }
    return host === normalized
  })
}

export function unwrapRedirectUrl(raw: string): string {
  let current = raw.trim()
  for (let depth = 0; depth < 3; depth += 1) {
    let url: URL
    try {
      url = new URL(current)
    } catch {
      break
    }

    let next: string | null = null
    for (const parameter of REDIRECT_PARAMS) {
      const value = url.searchParams.get(parameter)
      if (!value) continue
      try {
        const candidate = new URL(value)
        if (candidate.protocol === 'http:' || candidate.protocol === 'https:') {
          next = candidate.toString()
          break
        }
      } catch {
        // Not a URL; keep looking at other parameters.
      }
    }

    if (!next || next === current) break
    current = next
  }
  return current
}

function isJitsiMeetingPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '')
  if (path === '' || path === '/') return false
  return !JITSI_ASSET_PREFIXES.some(
    (prefix) =>
      path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}.`)
  )
}

function isElementPermalink(url: URL): boolean {
  return /^#\/(?:room|user)\//.test(url.hash)
}

export function matchLink(raw: string, settings: MatchSettings): LinkMatch | null {
  let url: URL
  try {
    url = new URL(unwrapRedirectUrl(raw))
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null

  const host = url.hostname.toLowerCase()

  const jitsiHosts = normalizeDomains(settings.jitsiDomains)
  const publicJitsi = settings.detectPublicJitsi
    ? PUBLIC_JITSI_HOSTS
    : []
  const isJitsi =
    hostMatches(host, jitsiHosts) ||
    (publicJitsi.length > 0 && hostMatches(host, publicJitsi))

  if (isJitsi && isJitsiMeetingPath(url.pathname)) {
    return {
      kind: 'jitsi',
      target: url.toString(),
      deepLink: buildDeepLink('jitsi', url.toString())
    }
  }

  const elementHosts = normalizeDomains(settings.elementDomains)
  const isElement = hostMatches(host, elementHosts) && isElementPermalink(url)
  const isMatrixTo =
    settings.detectMatrixTo &&
    host === 'matrix.to' &&
    url.hash.startsWith('#/') &&
    /^[!#@]/.test(url.hash.slice(2))

  if (isElement || isMatrixTo) {
    return {
      kind: 'matrix',
      target: url.toString(),
      deepLink: buildDeepLink('matrix', url.toString())
    }
  }

  return null
}

export function buildDeepLink(kind: LinkKind, target: string): string {
  const action = kind === 'jitsi' ? 'join' : 'matrix'
  return `teamwork://${action}?url=${encodeURIComponent(target)}`
}
