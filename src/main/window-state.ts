import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { WindowBounds } from '../shared/types'

export interface PersistedWindowState extends WindowBounds {
  maximized: boolean
}

const DEFAULT_STATE: PersistedWindowState = {
  x: 80,
  y: 60,
  width: 1280,
  height: 820,
  maximized: false
}

export class WindowStateStore {
  constructor(
    private readonly filePath: string,
    private readonly onWarning: (message: string, error?: unknown) => void = () => undefined
  ) {}

  load(): PersistedWindowState {
    try {
      if (!existsSync(this.filePath)) return { ...DEFAULT_STATE }
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<PersistedWindowState>
      if (
        typeof parsed.x !== 'number' ||
        typeof parsed.y !== 'number' ||
        typeof parsed.width !== 'number' ||
        typeof parsed.height !== 'number'
      ) {
        return { ...DEFAULT_STATE }
      }

      return {
        x: Math.round(parsed.x),
        y: Math.round(parsed.y),
        width: Math.max(940, Math.round(parsed.width)),
        height: Math.max(600, Math.round(parsed.height)),
        maximized: Boolean(parsed.maximized)
      }
    } catch (error) {
      this.onWarning('Could not load window state', error)
      return { ...DEFAULT_STATE }
    }
  }

  save(state: PersistedWindowState): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 })
      const temporary = `${this.filePath}.tmp-${process.pid}`
      writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
      renameSync(temporary, this.filePath)
    } catch (error) {
      this.onWarning('Could not save window state', error)
    }
  }
}
