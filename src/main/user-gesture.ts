import type { ManagedView } from '../shared/types'

const DEFAULT_WINDOW_MS = 5000

const GESTURE_INPUT_TYPES = new Set([
  'mouseDown',
  'keyDown',
  'rawKeyDown',
  'gestureTap',
  'pointerDown',
  'touchStart'
])

export function isUserGestureInput(type: string | undefined): boolean {
  return type !== undefined && GESTURE_INPUT_TYPES.has(type)
}

/**
 * Tracks recent input in the embedded views so a system-browser sign-in can be
 * armed only when a user actually interacted with the application. A page that
 * redirects itself in the background must not create a pending-auth marker.
 */
export class UserGestureTracker {
  private readonly lastInput = new Map<ManagedView, number>()

  constructor(
    private readonly windowMs = DEFAULT_WINDOW_MS,
    private readonly now: () => number = Date.now
  ) {}

  noteInput(view: ManagedView): void {
    this.lastInput.set(view, this.now())
  }

  consume(view: ManagedView): boolean {
    const at = this.lastInput.get(view)
    this.lastInput.delete(view)
    if (at === undefined) return false
    const age = this.now() - at
    return age >= 0 && age <= this.windowMs
  }
}
