import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ManagedView } from '../shared/types'

const DEFAULT_TTL_MS = 30 * 60 * 1000

interface PendingRecord {
  view: ManagedView
  createdAt: number
}

/**
 * A one-shot marker proving that TeamWork itself sent a sign-in navigation to
 * the system browser. Without this check, any local process or website could
 * invoke teamwork://auth and force a same-origin login URL into an embedded
 * session (login CSRF).
 *
 * The marker is persisted with mode 0600 so a callback that launches a fresh
 * application instance can still complete an in-flight sign-in.
 */
export class PendingAuthStore {
  constructor(
    private readonly filePath: string,
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now
  ) {}

  record(view: ManagedView): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 })
      const record: PendingRecord = { view, createdAt: this.now() }
      writeFileSync(this.filePath, `${JSON.stringify(record)}\n`, { mode: 0o600 })
    } catch {
      // The callback will fail closed if the marker cannot be written.
    }
  }

  consume(view?: ManagedView): boolean {
    try {
      if (!existsSync(this.filePath)) return false
      const raw = readFileSync(this.filePath, 'utf8')
      unlinkSync(this.filePath)
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed !== 'object' || parsed === null) return false
      const record = parsed as Partial<PendingRecord>
      if (record.view !== 'element' && record.view !== 'jitsi') return false
      if (typeof record.createdAt !== 'number' || !Number.isFinite(record.createdAt)) return false
      const age = this.now() - record.createdAt
      if (age < 0 || age > this.ttlMs) return false
      if (view && record.view !== view) return false
      return true
    } catch {
      return false
    }
  }

  clear(): void {
    try {
      if (existsSync(this.filePath)) unlinkSync(this.filePath)
    } catch {
      // Best effort.
    }
  }
}
