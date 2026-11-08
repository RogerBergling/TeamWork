import { lstatSync, readFileSync } from 'node:fs'
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

export interface PolicyFileInfo {
  isFile(): boolean
  isSymbolicLink(): boolean
  uid: number
  mode: number
  size: number
}

/**
 * A managed policy is only trustworthy when it is a plain, root-owned file that
 * unprivileged users cannot rewrite. Tests may relax the ownership rule, but
 * production always requires root.
 */
export function validatePolicyFileInfo(
  info: PolicyFileInfo,
  options: { requireRootOwner?: boolean } = {}
): void {
  if (info.isSymbolicLink()) {
    throw new Error('Policy file must not be a symbolic link')
  }
  if (!info.isFile()) {
    throw new Error('Policy file must be a regular file')
  }
  if (options.requireRootOwner !== false && info.uid !== 0) {
    throw new Error('Policy file must be owned by root')
  }
  if ((info.mode & 0o022) !== 0) {
    throw new Error('Policy file must not be group- or world-writable')
  }
  if (info.size > MAX_POLICY_BYTES) {
    throw new Error(`Policy file is larger than ${MAX_POLICY_BYTES} bytes`)
  }
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
  private failedClosed = false

  constructor(
    readonly filePath: string,
    private readonly onWarning: (message: string, error?: unknown) => void = () => undefined,
    private readonly options: { requireRootOwner?: boolean } = {}
  ) {}

  load(base: Settings = DEFAULT_SETTINGS): PolicyLoadResult {
    this.policy = null
    this.lockedFields = []
    this.loadError = undefined
    this.failedClosed = false

    let info: ReturnType<typeof lstatSync>
    try {
      info = lstatSync(this.filePath)
    } catch (error) {
      // A genuinely absent file means no managed policy. Any other access
      // failure (permissions, I/O) must not silently discard a managed policy.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { lockedFields: [] }
      return this.failClosed(error)
    }

    try {
      validatePolicyFileInfo(info, this.options)

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
      return this.failClosed(error)
    }
  }

  private failClosed(error: unknown): PolicyLoadResult {
    const message = error instanceof Error ? error.message : String(error)
    this.policy = null
    this.lockedFields = []
    this.loadError = message
    this.failedClosed = true
    this.onWarning(
      'Could not load the system policy; safe defaults are in use until it is fixed',
      error
    )
    return { lockedFields: [], error: message }
  }

  apply(base: Settings): Settings {
    // A managed policy exists but could not be read or validated. Do not fall
    // back to user settings: that would silently discard administrator locks.
    if (this.failedClosed) return structuredClone(DEFAULT_SETTINGS)

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
