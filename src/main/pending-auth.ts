import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ManagedView } from '../shared/types'
import { originOf } from '../shared/urls'

const DEFAULT_TTL_MS = 30 * 60 * 1000
const MIN_STATE_LENGTH = 32
const MAX_STATE_LENGTH = 256

export interface PendingAuthRecord {
  view: ManagedView
  /** Random nonce that the callback must echo. */
  state: string
  /** Application URL expected to be returned after sign-in. */
  returnUrl: string
}

interface StoredPendingRecord extends PendingAuthRecord {
  createdAt: number
}

/**
 * A one-shot marker proving that TeamWork itself sent a sign-in navigation to
 * the system browser. Without this check, any local process or website could
 * invoke teamwork://auth and force a same-origin login URL into an embedded
 * session (login CSRF).
 *
 * The marker is bound to a random state and the expected return origin. It is
 * persisted with mode 0600 so a callback that launches a fresh application
 * instance can still complete an in-flight sign-in.
 */
export class PendingAuthStore {
  constructor(
    private readonly filePath: string,
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now
  ) {}

  record(record: PendingAuthRecord): void {
    try {
      if (!this.isStateValid(record.state)) return
      mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 })
      const stored: StoredPendingRecord = {
        view: record.view,
        state: record.state,
        returnUrl: record.returnUrl,
        createdAt: this.now()
      }
      writeFileSync(this.filePath, `${JSON.stringify(stored)}\n`, { mode: 0o600 })
    } catch {
      // The callback will fail closed if the marker cannot be written.
    }
  }

  consume(
    view: ManagedView | undefined,
    state: string | undefined,
    returnUrl: string | undefined
  ): boolean {
    let raw: string
    try {
      if (!existsSync(this.filePath)) return false
      raw = readFileSync(this.filePath, 'utf8')
    } catch {
      return false
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      this.clear()
      return false
    }
    if (typeof parsed !== 'object' || parsed === null) {
      this.clear()
      return false
    }

    const record = parsed as Partial<StoredPendingRecord>
    if (record.view !== 'element' && record.view !== 'jitsi') {
      this.clear()
      return false
    }
    if (!this.isStateValid(record.state)) {
      this.clear()
      return false
    }
    if (typeof record.returnUrl !== 'string' || originOf(record.returnUrl) === null) {
      this.clear()
      return false
    }
    if (typeof record.createdAt !== 'number' || !Number.isFinite(record.createdAt)) {
      this.clear()
      return false
    }

    const age = this.now() - record.createdAt
    if (age < 0 || age > this.ttlMs) {
      this.clear()
      return false
    }

    if (!view || record.view !== view) return false
    if (!state || record.state !== state) return false
    const expectedOrigin = originOf(record.returnUrl)
    const actualOrigin = returnUrl ? originOf(returnUrl) : null
    if (!expectedOrigin || expectedOrigin !== actualOrigin) return false

    // Only a matching callback consumes the marker; a forged callback must not
    // be able to cancel the legitimate sign-in that is still in progress.
    this.clear()
    return true
  }

  clear(): void {
    try {
      if (existsSync(this.filePath)) unlinkSync(this.filePath)
    } catch {
      // Best effort.
    }
  }

  private isStateValid(state: unknown): state is string {
    return (
      typeof state === 'string' &&
      state.length >= MIN_STATE_LENGTH &&
      state.length <= MAX_STATE_LENGTH &&
      /^[a-f0-9]+$/i.test(state)
    )
  }
}
