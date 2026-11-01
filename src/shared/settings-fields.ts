// Types, defaults and GUI metadata that are safe to import in the renderer.
// This module intentionally has no Zod dependency.

export type ThemeMode = 'system' | 'light' | 'dark'
export type Density = 'comfortable' | 'compact'
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'
export type ProxyMode = 'system' | 'direct' | 'custom'
export type OzonePlatform = 'auto' | 'wayland' | 'x11'
export type StartView = 'element' | 'jitsi'

export interface Settings {
  version: 1
  servers: {
    elementUrl: string
    jitsiUrl: string
    elementUserAgent: string
    jitsiUserAgent: string
    startView: StartView
  }
  appearance: {
    appName: string
    organizationName: string
    logoPath: string
    theme: ThemeMode
    accentColor: string
    density: Density
    customCss: string
    showTrayIcon: boolean
  }
  authentication: {
    trustedAuthOrigins: string[]
    allowInsecureCertificates: boolean
    clearSessionsOnExit: boolean
    notifications: boolean
  }
  logging: {
    debug: boolean
    level: LogLevel
    toFile: boolean
    maxFileSizeMb: number
  }
  window: {
    closeToTray: boolean
    startMinimized: boolean
    rememberBounds: boolean
  }
  network: {
    proxyMode: ProxyMode
    proxyUrl: string
  }
  linux: {
    ozonePlatform: OzonePlatform
  }
  advanced: {
    hardwareAcceleration: boolean
    zoomFactor: number
    enableDevTools: boolean
    spellcheck: boolean
  }
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  servers: {
    elementUrl: '',
    jitsiUrl: '',
    elementUserAgent: '',
    jitsiUserAgent: '',
    startView: 'element'
  },
  appearance: {
    appName: 'TeamWork',
    organizationName: '',
    logoPath: '',
    theme: 'system',
    accentColor: '#5b5fc7',
    density: 'comfortable',
    customCss: '',
    showTrayIcon: true
  },
  authentication: {
    trustedAuthOrigins: [],
    allowInsecureCertificates: false,
    clearSessionsOnExit: false,
    notifications: true
  },
  logging: {
    debug: false,
    level: 'info',
    toFile: true,
    maxFileSizeMb: 10
  },
  window: {
    closeToTray: false,
    startMinimized: false,
    rememberBounds: true
  },
  network: {
    proxyMode: 'system',
    proxyUrl: ''
  },
  linux: {
    ozonePlatform: 'auto'
  },
  advanced: {
    hardwareAcceleration: true,
    zoomFactor: 1,
    enableDevTools: false,
    spellcheck: true
  }
}

export interface SettingsFieldError {
  path: string
  message: string
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type SettingFieldType =
  | 'text'
  | 'url'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'
  | 'textarea'
  | 'list'
  | 'file'

export interface SettingOption {
  value: string
  label: string
}

export interface SettingField {
  path: string
  section: SettingsSectionId
  label: string
  type: SettingFieldType
  description?: string
  placeholder?: string
  options?: SettingOption[]
  min?: number
  max?: number
  step?: number
  restart?: boolean
}

export type SettingsSectionId =
  | 'connection'
  | 'appearance'
  | 'authentication'
  | 'logging'
  | 'window'
  | 'network'
  | 'linux'
  | 'advanced'

export interface SettingsSection {
  id: SettingsSectionId
  label: string
  description: string
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'connection',
    label: 'Connection',
    description: 'Element and Jitsi deployment addresses and browser identity.'
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Branding, colour, theme and layout of the desktop shell.'
  },
  {
    id: 'authentication',
    label: 'Authentication',
    description: 'Single sign-on behaviour, trusted identity providers and certificates.'
  },
  {
    id: 'logging',
    label: 'Logging',
    description: 'Log levels, debug output and log retention.'
  },
  {
    id: 'window',
    label: 'Window & tray',
    description: 'Startup and close behaviour.'
  },
  {
    id: 'network',
    label: 'Network',
    description: 'Proxy configuration used by both embedded applications.'
  },
  {
    id: 'linux',
    label: 'Linux integration',
    description: 'Display server and screen-sharing behaviour. Some changes require a restart.'
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Hardware acceleration, zoom and diagnostics.'
  }
]

export const SETTINGS_FIELDS: SettingField[] = [
  {
    path: 'servers.elementUrl',
    section: 'connection',
    label: 'Element URL',
    type: 'url',
    placeholder: 'https://element.example.com',
    description: 'Base URL of your Element Web deployment. Leave empty to show setup instructions.'
  },
  {
    path: 'servers.jitsiUrl',
    section: 'connection',
    label: 'Jitsi Meet URL',
    type: 'url',
    placeholder: 'https://meet.example.com',
    description: 'Base URL of your Jitsi Meet deployment. Leave empty to show setup instructions.'
  },
  {
    path: 'servers.startView',
    section: 'connection',
    label: 'Startup view',
    type: 'select',
    options: [
      { value: 'element', label: 'Element (chat)' },
      { value: 'jitsi', label: 'Jitsi (meetings)' }
    ],
    description: 'Which application is shown when TeamWork starts.'
  },
  {
    path: 'servers.elementUserAgent',
    section: 'connection',
    label: 'Element user agent override',
    type: 'text',
    placeholder: 'Leave empty for the standard Chrome user agent',
    description:
      'Only change this if your identity provider rejects the embedded browser. An empty value uses Chrome’s normal user agent.'
  },
  {
    path: 'servers.jitsiUserAgent',
    section: 'connection',
    label: 'Jitsi user agent override',
    type: 'text',
    placeholder: 'Leave empty for the standard Chrome user agent',
    description: 'Optional user-agent override for Jitsi.'
  },
  {
    path: 'appearance.appName',
    section: 'appearance',
    label: 'Application name',
    type: 'text',
    description: 'Shown in the title bar, tray tooltip and window title.'
  },
  {
    path: 'appearance.organizationName',
    section: 'appearance',
    label: 'Organisation name',
    type: 'text',
    placeholder: 'Optional',
    description: 'Shown beneath the application name.'
  },
  {
    path: 'appearance.logoPath',
    section: 'appearance',
    label: 'Logo',
    type: 'file',
    description: 'PNG, JPEG, WebP or SVG image. Leave empty to use the bundled TeamWork logo.'
  },
  {
    path: 'appearance.theme',
    section: 'appearance',
    label: 'Theme',
    type: 'select',
    options: [
      { value: 'system', label: 'Follow system' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' }
    ],
    description: 'Theme for the TeamWork shell. Embedded apps follow the system colour scheme.'
  },
  {
    path: 'appearance.accentColor',
    section: 'appearance',
    label: 'Accent colour',
    type: 'color',
    description: 'Used for highlights, selected navigation items and primary buttons.'
  },
  {
    path: 'appearance.density',
    section: 'appearance',
    label: 'Density',
    type: 'select',
    options: [
      { value: 'comfortable', label: 'Comfortable' },
      { value: 'compact', label: 'Compact' }
    ],
    description: 'Controls spacing in the TeamWork shell.'
  },
  {
    path: 'appearance.customCss',
    section: 'appearance',
    label: 'Custom CSS',
    type: 'textarea',
    placeholder: '/* optional CSS applied to the shell and embedded apps */',
    description:
      'Advanced branding hook. Applied to the shell and injected into Element and Jitsi after every page load.'
  },
  {
    path: 'appearance.showTrayIcon',
    section: 'appearance',
    label: 'Show tray icon',
    type: 'boolean',
    description: 'Adds a system tray icon. Required for close-to-tray.'
  },
  {
    path: 'authentication.trustedAuthOrigins',
    section: 'authentication',
    label: 'Trusted authentication origins',
    type: 'list',
    placeholder: 'https://login.example.com\nhttps://sso.example.com',
    description:
      'One origin per line. Navigation and popups to these origins stay inside TeamWork. Leave empty to keep every http(s) redirect in-app (maximum SAML/OpenID compatibility). Add your IdP origins to send unrelated links to the system browser.'
  },
  {
    path: 'authentication.allowInsecureCertificates',
    section: 'authentication',
    label: 'Allow invalid TLS certificates',
    type: 'boolean',
    description:
      'Only for internal deployments with a private CA that cannot be installed system-wide. Every certificate error is logged as a warning.'
  },
  {
    path: 'authentication.clearSessionsOnExit',
    section: 'authentication',
    label: 'Clear sessions on exit',
    type: 'boolean',
    description: 'Removes cookies, storage and caches for both embedded apps when TeamWork quits.'
  },
  {
    path: 'authentication.notifications',
    section: 'authentication',
    label: 'Allow notifications',
    type: 'boolean',
    description: 'Grants Element and Jitsi permission to show desktop notifications.'
  },
  {
    path: 'logging.debug',
    section: 'logging',
    label: 'Debug mode',
    type: 'boolean',
    description: 'Forces the log level to debug, including console output from the embedded apps.'
  },
  {
    path: 'logging.level',
    section: 'logging',
    label: 'Log level',
    type: 'select',
    options: [
      { value: 'error', label: 'Error' },
      { value: 'warn', label: 'Warning' },
      { value: 'info', label: 'Info' },
      { value: 'debug', label: 'Debug' }
    ],
    description: 'Minimum severity written to the log. Debug mode overrides this value.'
  },
  {
    path: 'logging.toFile',
    section: 'logging',
    label: 'Write log file',
    type: 'boolean',
    description: 'Persist logs to disk. Console logging always remains available in a terminal.'
  },
  {
    path: 'logging.maxFileSizeMb',
    section: 'logging',
    label: 'Maximum log file size (MB)',
    type: 'number',
    min: 1,
    max: 100,
    step: 1,
    description: 'The log is rotated when it reaches this size.'
  },
  {
    path: 'window.closeToTray',
    section: 'window',
    label: 'Close to tray',
    type: 'boolean',
    description: 'Hide the window instead of quitting when the close button is pressed.'
  },
  {
    path: 'window.startMinimized',
    section: 'window',
    label: 'Start minimized',
    type: 'boolean',
    description: 'Start TeamWork hidden in the tray. Requires the tray icon.'
  },
  {
    path: 'window.rememberBounds',
    section: 'window',
    label: 'Remember window position and size',
    type: 'boolean',
    description: 'Restore the last window geometry on the next start.'
  },
  {
    path: 'network.proxyMode',
    section: 'network',
    label: 'Proxy mode',
    type: 'select',
    options: [
      { value: 'system', label: 'Use system proxy' },
      { value: 'direct', label: 'Direct connection' },
      { value: 'custom', label: 'Custom proxy' }
    ],
    description: 'Applied to both the Element and Jitsi sessions.'
  },
  {
    path: 'network.proxyUrl',
    section: 'network',
    label: 'Custom proxy URL',
    type: 'url',
    placeholder: 'http://proxy.example.com:8080',
    description: 'HTTP, HTTPS, SOCKS4 or SOCKS5 proxy. Used only when proxy mode is custom.'
  },
  {
    path: 'linux.ozonePlatform',
    section: 'linux',
    label: 'Display backend',
    type: 'select',
    options: [
      { value: 'auto', label: 'Auto (recommended)' },
      { value: 'wayland', label: 'Wayland' },
      { value: 'x11', label: 'X11 / XWayland' }
    ],
    description: 'Auto prefers Wayland when available and falls back to X11. Change this only for troubleshooting.',
    restart: true
  },
  {
    path: 'advanced.hardwareAcceleration',
    section: 'advanced',
    label: 'Hardware acceleration',
    type: 'boolean',
    description: 'Use GPU acceleration for video and interface rendering. Disable only for driver problems.',
    restart: true
  },
  {
    path: 'advanced.zoomFactor',
    section: 'advanced',
    label: 'Embedded app zoom',
    type: 'number',
    min: 0.5,
    max: 2,
    step: 0.05,
    description: 'Zoom factor applied to Element and Jitsi.'
  },
  {
    path: 'advanced.enableDevTools',
    section: 'advanced',
    label: 'Enable developer tools',
    type: 'boolean',
    description: 'Enables F12 and the developer-tools menu entry for troubleshooting.'
  },
  {
    path: 'advanced.spellcheck',
    section: 'advanced',
    label: 'Spell checking',
    type: 'boolean',
    description: 'Enable the Chromium spell checker in the embedded Element editor.'
  }
]

export function getSettingField(path: string): SettingField | undefined {
  return SETTINGS_FIELDS.find((field) => field.path === path)
}

export function getByPath(source: unknown, path: string): unknown {
  let cursor: unknown = source
  for (const part of path.split('.')) {
    if (!isPlainObject(cursor)) return undefined
    cursor = cursor[part]
  }
  return cursor
}

export function setByPath<T>(source: T, path: string, value: unknown): T {
  const clone = structuredClone(source) as Record<string, unknown>
  const parts = path.split('.')
  let cursor: Record<string, unknown> = clone
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    const next = cursor[part]
    if (!isPlainObject(next)) cursor[part] = {}
    cursor = cursor[part] as Record<string, unknown>
  }
  cursor[parts[parts.length - 1]] = value
  return clone as T
}

export function settingsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
