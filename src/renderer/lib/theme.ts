import type { Settings } from '@shared/settings'

export function applyAppearance(settings: Settings): void {
  const root = document.documentElement
  const followsSystem = settings.appearance.theme === 'system'
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  const resolvedTheme = followsSystem
    ? prefersDark
      ? 'dark'
      : 'light'
    : settings.appearance.theme

  root.dataset.theme = resolvedTheme
  root.dataset.density = settings.appearance.density
  root.style.setProperty('--accent', settings.appearance.accentColor)
  root.style.setProperty('--accent-soft', hexToRgba(settings.appearance.accentColor, 0.14))
  root.style.setProperty('--accent-strong', shade(settings.appearance.accentColor, -16))
}

export function systemThemeQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  return window.matchMedia('(prefers-color-scheme: dark)')
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const parsed = Number.parseInt(normalized, 16)
  if (!Number.isFinite(parsed)) return `rgba(91, 95, 199, ${alpha})`
  const red = (parsed >> 16) & 255
  const green = (parsed >> 8) & 255
  const blue = parsed & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function shade(hex: string, amount: number): string {
  const normalized = hex.replace('#', '')
  const parsed = Number.parseInt(normalized, 16)
  if (!Number.isFinite(parsed)) return hex
  const clamp = (value: number) => Math.max(0, Math.min(255, value))
  const red = clamp(((parsed >> 16) & 255) + amount)
  const green = clamp(((parsed >> 8) & 255) + amount)
  const blue = clamp((parsed & 255) + amount)
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}
