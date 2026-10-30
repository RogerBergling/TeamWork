import type {
  AppCommand,
  ScreenShareRequest,
  SettingsSnapshot,
  ViewStatus,
  WindowState
} from '@shared/types'

type Listener<T> = (value: T) => void
type Unsubscribe = () => void

const viewStatusListeners = new Set<Listener<ViewStatus>>()
const settingsListeners = new Set<Listener<SettingsSnapshot>>()
const screenShareListeners = new Set<Listener<ScreenShareRequest>>()
const screenShareCancelledListeners = new Set<Listener<number>>()
const commandListeners = new Set<Listener<AppCommand>>()
const windowStateListeners = new Set<Listener<WindowState>>()

let initialized = false

function init(): void {
  if (initialized || typeof window === 'undefined' || !window.teamwork) return
  initialized = true

  window.teamwork.onViewStatus((status) => {
    for (const listener of viewStatusListeners) listener(status)
  })
  window.teamwork.onSettingsChanged((snapshot) => {
    for (const listener of settingsListeners) listener(snapshot)
  })
  window.teamwork.onScreenShareRequest((request) => {
    for (const listener of screenShareListeners) listener(request)
  })
  window.teamwork.onScreenShareCancelled((id) => {
    for (const listener of screenShareCancelledListeners) listener(id)
  })
  window.teamwork.onCommand((command) => {
    for (const listener of commandListeners) listener(command)
  })
  window.teamwork.onWindowState((state) => {
    for (const listener of windowStateListeners) listener(state)
  })
}

function subscribe<T>(listeners: Set<Listener<T>>, callback: Listener<T>): Unsubscribe {
  init()
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export const bridge = {
  onViewStatus(callback: Listener<ViewStatus>): Unsubscribe {
    return subscribe(viewStatusListeners, callback)
  },
  onSettingsChanged(callback: Listener<SettingsSnapshot>): Unsubscribe {
    return subscribe(settingsListeners, callback)
  },
  onScreenShareRequest(callback: Listener<ScreenShareRequest>): Unsubscribe {
    return subscribe(screenShareListeners, callback)
  },
  onScreenShareCancelled(callback: Listener<number>): Unsubscribe {
    return subscribe(screenShareCancelledListeners, callback)
  },
  onCommand(callback: Listener<AppCommand>): Unsubscribe {
    return subscribe(commandListeners, callback)
  },
  onWindowState(callback: Listener<WindowState>): Unsubscribe {
    return subscribe(windowStateListeners, callback)
  }
}
