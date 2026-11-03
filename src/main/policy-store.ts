import { existsSync, readFileSync, statSync } from 'node:fs'
import {
  DEFAULT_SETTINGS,
  getByPath,
  isPlainObject,
  setByPath,
  type Settings
} from '../shared/settings-fields'
import { mergeSettings, safeParseSettings } from '../shared/settings'

const MAX_POLICY_BYTES = 1024 * 1024
const IGNORED_POLICY_KEYS = new Set(['version'])

export function flattenSettingPaths(value: unknown, prefix = ''): string[] {
  if (!isPlainObject(value)) return prefix ? [prefix] : []

  const paths: string[] = []
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (isPlainObject(child)) {
      paths.push(...flattenSettingPaths(child, path))
    } else {
      paths.push(path)
    }
  }
  return paths
}

const KNOWN_SETTING_PATHS = new Set(flattenSettingPaths(DEFAULT_SETTINGS))

export interface PolicyLoadResult {
  lockedFields: string[]
  error?: string
}

/**
 * Reads a read-only system policy file and applies it over user settings.
 * Policy errors are reported to the GUI and logged, but never prevent startup.
 * Only fields explicitly present in the policy file are locked and enforced.
 */
export class PolicyStore {
  private policy: Record<string, unknown> | null = null
  private lockedFields: string[] = []
  private loadError?: string

  constructor(
    readonly filePath: string,
    private readonly onWarning: (message: string, error?: unknown) => void = () => undefined
  ) {}

  load(base: Settings = DEFAULT_SETTINGS): PolicyLoadResult {
    this.policy = null
    this.lockedFields = []
    this.loadError = undefined

    if (!existsSync(this.filePath)) return { lockedFields: [] }

    try {
      const info = statSync(this.filePath)
      if (info.size > MAX_POLICY_BYTES) {
        throw new Error(`Policy file is larger than ${MAX_POLICY_BYTES} bytes`)
      }
      // A policy file that is writable by another local user is not a policy.
      if ((info.mode & 0o022) !== 0) {
        throw new Error('Policy file must not be group- or world-writable')
      }

      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
      if (!isPlainObject(parsed)) {
        throw new Error('Policy file must contain a JSON object')
      }

      const unknownFields = flattenSettingPaths(parsed).filter(
        (path) => !KNOWN_SETTING_PATHS.has(path) && !path.startsWith('$')
      )
      if (unknownFields.length > 0) {
        throw new Error(`Unknown policy field(s): ${unknownFields.join(', ')}`)
      }

      // Validate the policy in the context of the current user configuration.
      // This allows a policy to set one side of a cross-field rule while the
      // user configuration or another policy field supplies the other side.
      const validated = safeParseSettings(mergeSettings(base, parsed))
      if (!validated.ok) {
        throw new Error(
          `Invalid policy: ${validated.errors.map((entry) => `${entry.path}: ${entry.message}`).join('; ')}`
        )
      }

      const lockedFields = flattenSettingPaths(parsed).filter(
        (path) => KNOWN_SETTING_PATHS.has(path) && !IGNORED_POLICY_KEYS.has(path)
      )
      this.policy = parsed
      this.lockedFields = lockedFields
      return { lockedFields }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.loadError = message
      this.onWarning('Could not load the system policy; user settings are in use', error)
      return { lockedFields: [], error: message }
    }
  }

  apply(base: Settings): Settings {
    let effective = structuredClone(base)
    if (!this.policy) return effective

    for (const path of this.lockedFields) {
      const value = getByPath(this.policy, path)
      if (value !== undefined) effective = setByPath(effective, path, value)
    }
    return effective
  }

  get locked(): string[] {
    return [...this.lockedFields]
  }

  get error(): string | undefined {
    return this.loadError
  }
}
