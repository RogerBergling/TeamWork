const ORIGIN = typeof performance !== 'undefined' ? performance.now() : Date.now()

function elapsed(): number {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return Math.round((now - ORIGIN) * 10) / 10
}

/**
 * Lightweight, dependency-free startup instrumentation. Marks are idempotent so
 * reloads and repeated activations do not pollute the initial timeline.
 */
export class StartupTimer {
  private readonly marks = new Map<string, number>()

  mark(name: string): boolean {
    if (this.marks.has(name)) return false
    this.marks.set(name, elapsed())
    return true
  }

  get(name: string): number | undefined {
    return this.marks.get(name)
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.marks)
  }
}

export const startupTimer = new StartupTimer()
