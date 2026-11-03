import { z } from 'zod'
import {
  DEFAULT_SETTINGS,
  isPlainObject,
  type Settings,
  type SettingsFieldError
} from './settings-fields'

export * from './settings-fields'

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

export function isProxyUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return ['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol) && url.hostname.length > 0
  } catch {
    return false
  }
}

const optionalHttpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === '' || isHttpUrl(value), 'Enter a valid http:// or https:// URL')

const optionalProxyUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === '' || isProxyUrl(value), 'Enter a valid http(s) or socks proxy URL')

export const settingsSchema = z
  .object({
    version: z.literal(1),
    servers: z.object({
      elementUrl: optionalHttpUrl,
      jitsiUrl: optionalHttpUrl,
      elementUserAgent: z.string().trim().max(1024),
      jitsiUserAgent: z.string().trim().max(1024),
      startView: z.enum(['element', 'jitsi'])
    }),
    appearance: z.object({
      appName: z.string().trim().min(1, 'The application name cannot be empty').max(60),
      organizationName: z.string().trim().max(120),
      logoPath: z.string().trim().max(4096),
      theme: z.enum(['system', 'light', 'dark']),
      accentColor: z
        .string()
        .trim()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour such as #5b5fc7'),
      density: z.enum(['comfortable', 'compact']),
      customCss: z.string().max(200_000),
      showTrayIcon: z.boolean()
    }),
    authentication: z.object({
      trustedAuthOrigins: z
        .array(
          z
            .string()
            .trim()
            .max(2048)
            .refine((value) => isHttpUrl(value), 'Each entry must be a valid http:// or https:// origin')
        )
        .max(100),
      externalBrowserSso: z.boolean(),
      allowInsecureCertificates: z.boolean(),
      clearSessionsOnExit: z.boolean(),
      notifications: z.boolean()
    }),
    logging: z.object({
      debug: z.boolean(),
      level: z.enum(['error', 'warn', 'info', 'debug']),
      toFile: z.boolean(),
      maxFileSizeMb: z.number().int().min(1).max(100)
    }),
    window: z.object({
      closeToTray: z.boolean(),
      startMinimized: z.boolean(),
      rememberBounds: z.boolean()
    }),
    network: z.object({
      proxyMode: z.enum(['system', 'direct', 'custom']),
      proxyUrl: optionalProxyUrl
    }),
    linux: z.object({
      ozonePlatform: z.enum(['auto', 'wayland', 'x11'])
    }),
    advanced: z.object({
      hardwareAcceleration: z.boolean(),
      zoomFactor: z.number().min(0.5).max(2),
      enableDevTools: z.boolean(),
      spellcheck: z.boolean()
    })
  })
  .superRefine((value, ctx) => {
    if (value.network.proxyMode === 'custom' && value.network.proxyUrl === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['network', 'proxyUrl'],
        message: 'A proxy URL is required when the proxy mode is custom'
      })
    }
    if (
      value.authentication.externalBrowserSso &&
      value.authentication.trustedAuthOrigins.length === 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['authentication', 'trustedAuthOrigins'],
        message: 'Add at least one trusted authentication origin before enabling system-browser SSO'
      })
    }
  })

/** Merge persisted values over defaults without losing newly added settings. */
export function mergeSettings(defaults: unknown, persisted: unknown): unknown {
  if (!isPlainObject(defaults) || !isPlainObject(persisted)) {
    return persisted === undefined ? defaults : persisted
  }

  const merged: Record<string, unknown> = { ...defaults }
  for (const [key, value] of Object.entries(persisted)) {
    if (value === undefined) continue
    merged[key] = key in defaults ? mergeSettings(defaults[key], value) : value
  }
  return merged
}

export function parseSettings(input: unknown): Settings {
  return settingsSchema.parse(mergeSettings(DEFAULT_SETTINGS, input))
}

export function safeParseSettings(
  input: unknown
): { ok: true; settings: Settings } | { ok: false; errors: SettingsFieldError[] } {
  const result = settingsSchema.safeParse(mergeSettings(DEFAULT_SETTINGS, input))
  if (result.success) return { ok: true, settings: result.data }

  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    }))
  }
}
