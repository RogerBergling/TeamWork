import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname } from 'node:path'
import {
  DEFAULT_SETTINGS,
  parseSettings,
  safeParseSettings,
  type Settings,
  type SettingsFieldError
} from '../shared/settings'

export interface ConfigLoadResult {
  settings: Settings
  loadError?: string
}

export interface SaveConfigResult {
  ok: boolean
  settings?: Settings
  errors?: SettingsFieldError[]
  message?: string
}

const MAX_CONFIG_BYTES = 2 * 1024 * 1024

export class ConfigStore {
  private settings: Settings = DEFAULT_SETTINGS
  private loadError?: string

  constructor(
    private readonly configFile: string,
    private readonly onWarning: (message: string, error?: unknown) => void = () => undefined
  ) {}

  get path(): string {
    return this.configFile
  }

  get warning(): string | undefined {
    return this.loadError
  }

  get value(): Settings {
    return this.settings
  }

  load(): ConfigLoadResult {
    try {
      mkdirSync(dirname(this.configFile), { recursive: true, mode: 0o700 })

      if (!existsSync(this.configFile)) {
        this.settings = parseSettings(DEFAULT_SETTINGS)
        this.write(this.settings)
        return { settings: this.settings }
      }

      const size = statSync(this.configFile).size
      if (size > MAX_CONFIG_BYTES) {
        throw new Error(`Configuration file is larger than ${MAX_CONFIG_BYTES} bytes`)
      }

      const raw = readFileSync(this.configFile, 'utf8')
      const parsed = safeParseSettings(JSON.parse(raw))
      if (!parsed.ok) {
        throw new Error(
          `Invalid configuration: ${parsed.errors.map((entry) => `${entry.path}: ${entry.message}`).join('; ')}`
        )
      }

      this.settings = parsed.settings
      this.loadError = undefined
      return { settings: this.settings }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.loadError = message
      this.onWarning('Could not load configuration; using defaults', error)

      try {
        if (existsSync(this.configFile)) {
          const backup = `${this.configFile}.invalid-${Date.now()}`
          copyFileSync(this.configFile, backup)
          this.onWarning(`Previous configuration preserved at ${backup}`)
        }
      } catch (backupError) {
        this.onWarning('Could not preserve the invalid configuration file', backupError)
      }

      this.settings = parseSettings(DEFAULT_SETTINGS)
      try {
        this.write(this.settings)
      } catch (writeError) {
        this.onWarning('Could not write a default configuration file', writeError)
      }
      return { settings: this.settings, loadError: this.loadError }
    }
  }

  save(input: unknown): SaveConfigResult {
    const parsed = safeParseSettings(input)
    if (!parsed.ok) {
      return { ok: false, errors: parsed.errors, message: 'Some settings are invalid.' }
    }

    try {
      this.write(parsed.settings)
      this.settings = parsed.settings
      this.loadError = undefined
      return { ok: true, settings: this.settings }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.onWarning('Could not save configuration', error)
      return { ok: false, message: `Could not save the configuration: ${message}` }
    }
  }

  reset(): SaveConfigResult {
    return this.save(DEFAULT_SETTINGS)
  }

  exportTo(target: string): SaveConfigResult {
    const temporary = `${target}.tmp-${process.pid}`
    try {
      mkdirSync(dirname(target), { recursive: true })
      const raw = readFileSync(this.configFile)
      // Exports contain the same potentially sensitive settings as the user
      // configuration, so create the replacement privately and swap it in
      // atomically. rename(2) also replaces an existing target without a
      // window where its permissions are inherited from the old file.
      writeFileSync(temporary, raw, { mode: 0o600 })
      chmodSync(temporary, 0o600)
      renameSync(temporary, target)
      return { ok: true, message: `Configuration exported to ${target}` }
    } catch (error) {
      try {
        rmSync(temporary, { force: true })
      } catch {
        // Best effort cleanup.
      }
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, message: `Could not export the configuration: ${message}` }
    }
  }

  importFrom(source: string): SaveConfigResult {
    try {
      const size = statSync(source).size
      if (size > MAX_CONFIG_BYTES) {
        return { ok: false, message: 'The selected file is too large to be a configuration file.' }
      }
      const raw = readFileSync(source, 'utf8')
      const result = this.save(JSON.parse(raw))
      if (result.ok) result.message = `Configuration imported from ${source}`
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, message: `Could not import the configuration: ${message}` }
    }
  }

  private write(settings: Settings): void {
    mkdirSync(dirname(this.configFile), { recursive: true, mode: 0o700 })
    const temporary = `${this.configFile}.tmp-${process.pid}`
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, this.configFile)
  }
}
