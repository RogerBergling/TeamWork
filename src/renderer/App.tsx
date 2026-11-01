import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import type {
  ManagedView,
  ScreenShareRequest,
  SettingsSnapshot,
  ShellView,
  ViewStatus,
  WindowState
} from '@shared/types'
import type { Settings } from '@shared/settings-fields'
import defaultLogo from './assets/logo.svg'
import { TitleBar } from './components/TitleBar'
import { Rail } from './components/Rail'
import { ContextBar } from './components/ContextBar'
import { StatusBar } from './components/StatusBar'
import { ContentState } from './components/ContentState'
import { Toast, type ToastKind, type ToastMessage } from './components/Toast'
import { Icon } from './lib/icons'
import { bridge } from './lib/bridge'
import { applyAppearance, systemThemeQuery } from './lib/theme'

const SettingsView = lazy(() =>
  import('./components/SettingsView').then((module) => ({ default: module.SettingsView }))
)
const LogsView = lazy(() =>
  import('./components/LogsView').then((module) => ({ default: module.LogsView }))
)
const ScreenShareModal = lazy(() =>
  import('./components/ScreenShareModal').then((module) => ({
    default: module.ScreenShareModal
  }))
)
const JoinMeetingModal = lazy(() =>
  import('./components/JoinMeetingModal').then((module) => ({
    default: module.JoinMeetingModal
  }))
)

const EMPTY_STATUS: Record<ManagedView, ViewStatus> = {
  element: { view: 'element', state: 'unconfigured' },
  jitsi: { view: 'jitsi', state: 'unconfigured' }
}

function chooseInitialView(snapshot: SettingsSnapshot): ShellView {
  const { elementUrl, jitsiUrl, startView } = snapshot.settings.servers
  if (snapshot.meta.loadError) return 'settings'
  if (!elementUrl && !jitsiUrl) return 'settings'
  if (startView === 'jitsi') {
    if (jitsiUrl) return 'jitsi'
    return elementUrl ? 'element' : 'settings'
  }
  if (elementUrl) return 'element'
  return jitsiUrl ? 'jitsi' : 'settings'
}

function isManaged(view: ShellView): view is ManagedView {
  return view === 'element' || view === 'jitsi'
}

export default function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [active, setActive] = useState<ShellView>('settings')
  const [statuses, setStatuses] =
    useState<Record<ManagedView, ViewStatus>>(EMPTY_STATUS)
  const [windowState, setWindowState] = useState<WindowState>({
    maximized: false,
    fullScreen: false
  })
  const [logoData, setLogoData] = useState<string | null>(null)
  const [screenRequest, setScreenRequest] = useState<ScreenShareRequest | null>(null)
  const [joinMeetingOpen, setJoinMeetingOpen] = useState(false)
  const [settingsMounted, setSettingsMounted] = useState(false)
  const [logsMounted, setLogsMounted] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastTimer = useRef<number | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const ready = snapshot !== null

  const showToast = useCallback((message: string, kind: ToastKind = 'info'): void => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    const next: ToastMessage = { id: Date.now(), message, kind }
    setToast(next)
    toastTimer.current = window.setTimeout(() => {
      setToast((current) => (current?.id === next.id ? null : current))
      toastTimer.current = null
    }, 4500)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async (): Promise<void> => {
      try {
        if (!window.teamwork) {
          throw new Error(
            'The secure preload bridge is unavailable. Start TeamWork through Electron rather than opening the renderer directly.'
          )
        }
        const result = await window.teamwork.getSettings()
        if (cancelled) return
        setSnapshot(result)
        const initial = chooseInitialView(result)
        if (initial === 'settings') setSettingsMounted(true)
        setActive(initial)
        window.teamwork.activateView(initial)
        const [state, initialStatuses] = await Promise.all([
          window.teamwork.getWindowState(),
          window.teamwork.getViewStatuses()
        ])
        if (!cancelled) {
          setWindowState(state)
          setStatuses((current) => {
            const next = { ...current }
            for (const status of initialStatuses) next[status.view] = status
            return next
          })
          window.teamwork.rendererReady()
        }
      } catch (error) {
        if (!cancelled) {
          setFatal(error instanceof Error ? error.message : String(error))
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const unsubscribeStatus = bridge.onViewStatus((status) => {
      setStatuses((current) => ({ ...current, [status.view]: status }))
    })
    const unsubscribeSettings = bridge.onSettingsChanged((next) => setSnapshot(next))
    const unsubscribeScreenShare = bridge.onScreenShareRequest((request) =>
      setScreenRequest(request)
    )
    const unsubscribeScreenShareCancelled = bridge.onScreenShareCancelled((id) => {
      setScreenRequest((current) => (current?.id === id ? null : current))
    })
    const unsubscribeCommand = bridge.onCommand((command) => {
      if (command === 'element' || command === 'jitsi' || command === 'settings' || command === 'logs') {
        setJoinMeetingOpen(false)
        setActive(command)
      }
      if (command === 'join-meeting') {
        setActive('jitsi')
        setJoinMeetingOpen(true)
      }
    })
    const unsubscribeWindow = bridge.onWindowState((state) => setWindowState(state))

    return () => {
      unsubscribeStatus()
      unsubscribeSettings()
      unsubscribeScreenShare()
      unsubscribeScreenShareCancelled()
      unsubscribeCommand()
      unsubscribeWindow()
    }
  }, [])

  useEffect(() => {
    const onError = (event: ErrorEvent): void => {
      window.teamwork?.reportRendererError(
        `Uncaught renderer error: ${event.message}`,
        `${event.filename}:${event.lineno}:${event.colno}\n${event.error?.stack ?? ''}`
      )
    }
    const onRejection = (event: PromiseRejectionEvent): void => {
      const reason = event.reason
      window.teamwork?.reportRendererError(
        'Unhandled renderer promise rejection',
        reason instanceof Error
          ? `${reason.message}\n${reason.stack ?? ''}`
          : String(reason).slice(0, 2000)
      )
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  useEffect(() => {
    if (active === 'settings') setSettingsMounted(true)
    if (active === 'logs') setLogsMounted(true)
    window.teamwork?.activateView(active)
  }, [active])

  useEffect(() => {
    if (joinMeetingOpen) window.teamwork.suspendViews()
    else window.teamwork.resumeViews()
    return () => {
      if (joinMeetingOpen) window.teamwork.resumeViews()
    }
  }, [joinMeetingOpen])

  useLayoutEffect(() => {
    if (!ready) return
    const element = contentRef.current
    if (!element) return

    const sendBounds = (): void => {
      const rect = element.getBoundingClientRect()
      window.teamwork.setViewBounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      })
    }

    sendBounds()
    const observer = new ResizeObserver(sendBounds)
    observer.observe(element)
    window.addEventListener('resize', sendBounds)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sendBounds)
    }
  }, [ready])

  useEffect(() => {
    if (!snapshot) return
    applyAppearance(snapshot.settings)
    document.title = snapshot.settings.appearance.appName

    const query = systemThemeQuery()
    if (!query) return
    const onChange = (): void => {
      if (snapshot.settings.appearance.theme === 'system') {
        applyAppearance(snapshot.settings)
      }
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [
    snapshot,
    snapshot?.settings.appearance.theme,
    snapshot?.settings.appearance.accentColor,
    snapshot?.settings.appearance.density
  ])

  useEffect(() => {
    let cancelled = false
    const path = snapshot?.settings.appearance.logoPath ?? ''
    if (!path) {
      setLogoData(null)
      return
    }

    void window.teamwork.getLogoDataUrl(path).then((data) => {
      if (!cancelled) setLogoData(data)
    })
    return () => {
      cancelled = true
    }
  }, [snapshot?.settings.appearance.logoPath])

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    }
  }, [])

  const handleSave = useCallback(async (draft: Settings) => {
    const result = await window.teamwork.saveSettings(draft)
    if (result.ok && result.settings) {
      setSnapshot((current) => (current ? { ...current, settings: result.settings! } : current))
    }
    return result
  }, [])

  const handleReset = useCallback(async () => {
    const result = await window.teamwork.resetSettings()
    if (result.ok && result.settings) {
      setSnapshot((current) => (current ? { ...current, settings: result.settings! } : current))
    }
    return result
  }, [])

  const handleImport = useCallback(async () => {
    const result = await window.teamwork.importSettings()
    if (result.ok && result.settings) {
      setSnapshot((current) => (current ? { ...current, settings: result.settings! } : current))
    }
    return result
  }, [])

  const handleChooseLogo = useCallback(() => window.teamwork.chooseLogo(), [])
  const handleLogoData = useCallback(
    (path: string) => window.teamwork.getLogoDataUrl(path),
    []
  )

  const handleClearSession = useCallback(async (view: ManagedView) => {
    await window.teamwork.clearSession(view)
  }, [])

  const handleJoinJitsi = useCallback(async (input: string) => {
    const result = await window.teamwork.joinJitsiMeeting(input)
    if (result.ok) setActive('jitsi')
    return result
  }, [])

  const selectScreenSource = (sourceId: string): void => {
    if (!screenRequest) return
    window.teamwork.selectScreenShare(screenRequest.id, sourceId)
    setScreenRequest(null)
  }

  const cancelScreenShare = (): void => {
    if (!screenRequest) return
    window.teamwork.selectScreenShare(screenRequest.id, null)
    setScreenRequest(null)
  }

  if (fatal) {
    return (
      <div className="splash">
        <div className="splash-card">
          <div className="content-state-icon is-error">
            <Icon name="alert" size={32} />
          </div>
          <h1>TeamWork could not start its interface</h1>
          <p>{fatal}</p>
          <button type="button" className="button primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="splash">
        <img src={defaultLogo} alt="" className="splash-logo" />
        <div className="spinner" />
        <p>Starting TeamWork…</p>
      </div>
    )
  }

  const settings = snapshot.settings
  const managedActive = isManaged(active)
  const activeStatus = managedActive ? statuses[active] : null
  const logo = logoData ?? defaultLogo

  return (
    <div className="app">
      <TitleBar
        appName={settings.appearance.appName}
        organizationName={settings.appearance.organizationName}
        logo={logo}
        windowState={windowState}
        onMinimize={() => window.teamwork.windowMinimize()}
        onMaximize={() => window.teamwork.windowMaximize()}
        onClose={() => window.teamwork.windowClose()}
      />

      <div className="shell">
        <Rail active={active} onChange={setActive} />

        <div className="workspace">
          <ContextBar
            active={active}
            snapshot={snapshot}
            status={activeStatus}
            onReload={() => {
              if (managedActive) window.teamwork.reloadView(active)
            }}
            onOpenExternal={() => {
              if (managedActive) window.teamwork.openViewInBrowser(active)
            }}
            onJoinMeeting={() => setJoinMeetingOpen(true)}
            onOpenSettings={() => setActive('settings')}
            onOpenLogs={() => setActive('logs')}
          />

          <main className="content" ref={contentRef}>
            {settingsMounted ? (
              <div className={`pane${active === 'settings' ? ' is-visible' : ''}`}>
                <Suspense fallback={<PaneLoading label="Loading settings…" />}>
                  <SettingsView
                    snapshot={snapshot}
                    fallbackLogo={defaultLogo}
                    onSave={handleSave}
                    onReset={handleReset}
                    onExport={() => window.teamwork.exportSettings()}
                    onImport={handleImport}
                    onChooseLogo={handleChooseLogo}
                    onLogoData={handleLogoData}
                    onOpenConfig={() => void window.teamwork.openConfigFile()}
                    onOpenLogs={() => setActive('logs')}
                    onRestart={() => void window.teamwork.restartApp()}
                    onClearSession={handleClearSession}
                    onNotify={showToast}
                  />
                </Suspense>
              </div>
            ) : active === 'settings' ? (
              <div className="pane is-visible">
                <PaneLoading label="Loading settings…" />
              </div>
            ) : null}

            {logsMounted ? (
              <div className={`pane${active === 'logs' ? ' is-visible' : ''}`}>
                <Suspense fallback={<PaneLoading label="Loading logs…" />}>
                  <LogsView active={active === 'logs'} snapshot={snapshot} />
                </Suspense>
              </div>
            ) : active === 'logs' ? (
              <div className="pane is-visible">
                <PaneLoading label="Loading logs…" />
              </div>
            ) : null}

            {managedActive ? (
              <ContentState
                view={active}
                status={activeStatus ?? EMPTY_STATUS[active]}
                onRetry={() => window.teamwork.reloadView(active)}
                onSettings={() => setActive('settings')}
                onOpenBrowser={() => window.teamwork.openViewInBrowser(active)}
              />
            ) : null}
          </main>

          <StatusBar
            active={active}
            snapshot={snapshot}
            status={activeStatus}
            onOpenLogs={() => setActive('logs')}
          />
        </div>
      </div>

      {settings.appearance.customCss ? <style>{settings.appearance.customCss}</style> : null}

      <Suspense fallback={null}>
        {screenRequest ? (
          <ScreenShareModal
            request={screenRequest}
            onSelect={selectScreenSource}
            onCancel={cancelScreenShare}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={null}>
        {joinMeetingOpen ? (
          <JoinMeetingModal
            configuredUrl={settings.servers.jitsiUrl}
            onJoin={handleJoinJitsi}
            onClose={() => setJoinMeetingOpen(false)}
            onOpenSettings={() => {
              setJoinMeetingOpen(false)
              setActive('settings')
            }}
          />
        ) : null}
      </Suspense>

      {toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  )
}

function PaneLoading({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="content-state">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  )
}
