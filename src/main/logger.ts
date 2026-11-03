import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import log from 'electron-log/main'
import type { LogLevel, Settings } from '../shared/settings'

type Level = LogLevel | 'debug'

const LEVEL_ORDER: Record<Level, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
}

export class AppLogger {
  constructor(private readonly filePath: string) {
    log.transports.file.resolvePathFn = () => this.filePath
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
    log.transports.file.writeOptions = {
      encoding: 'utf8',
      flag: 'a',
      mode: 0o600
    }
    log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}'
    log.errorHandler.startCatching({ showDialog: false })

    try {
      if (existsSync(this.filePath)) chmodSync(this.filePath, 0o600)
    } catch {
      // The log directory permissions are the primary control. A failure to
      // tighten an existing file must not prevent the application from starting.
    }
  }

  configure(settings: Settings['logging']): void {
    const level: Level = settings.debug ? 'debug' : settings.level
    log.transports.file.level = settings.toFile ? level : false
    log.transports.console.level = level
    log.transports.file.maxSize = settings.maxFileSizeMb * 1024 * 1024
  }

  isEnabled(level: LogLevel, settings: Settings['logging']): boolean {
    const effective: Level = settings.debug ? 'debug' : settings.level
    return LEVEL_ORDER[level] <= LEVEL_ORDER[effective]
  }

  error(message: string, error?: unknown): void {
    log.error(message, error ?? '')
  }

  warn(message: string, error?: unknown): void {
    log.warn(message, error ?? '')
  }

  info(message: string, error?: unknown): void {
    log.info(message, error ?? '')
  }

  debug(message: string, error?: unknown): void {
    log.debug(message, error ?? '')
  }

  get path(): string {
    return this.filePath
  }

  read(tailLines = 500): { lines: string[]; size: number } {
    try {
      if (!existsSync(this.filePath)) return { lines: [], size: 0 }
      const raw = readFileSync(this.filePath, 'utf8')
      const lines = raw.split(/\r?\n/)
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
      return {
        lines: lines.slice(-Math.max(1, Math.min(tailLines, 5000))),
        size: statSync(this.filePath).size
      }
    } catch (error) {
      this.warn('Could not read the log file', error)
      return { lines: [], size: 0 }
    }
  }

  clear(): void {
    try {
      writeFileSync(this.filePath, '', { mode: 0o600 })
      this.info('Log file cleared by the user')
    } catch (error) {
      this.warn('Could not clear the log file', error)
    }
  }
}
