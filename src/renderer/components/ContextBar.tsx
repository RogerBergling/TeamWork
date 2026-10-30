import type { ManagedView, SettingsSnapshot, ShellView, ViewStatus } from '@shared/types'
import { hostOf } from '@shared/urls'
import { Icon } from '../lib/icons'

interface ContextBarProps {
  active: ShellView
  snapshot: SettingsSnapshot
  status: ViewStatus | null
  onReload: () => void
  onOpenExternal: () => void
  onJoinMeeting: () => void
  onOpenSettings: () => void
  onOpenLogs: () => void
}

const TITLES: Record<ShellView, string> = {
  element: 'Chat · Element',
  jitsi: 'Meet · Jitsi',
  settings: 'Settings',
  logs: 'Logs'
}

const SUBTITLES: Record<ShellView, string> = {
  element: 'Matrix rooms, spaces and direct messages',
  jitsi: 'Video meetings and conferences',
  settings: 'Configure connections, branding, authentication and logging',
  logs: 'Runtime diagnostics for the shell and both embedded applications'
}

function isManaged(view: ShellView): view is ManagedView {
  return view === 'element' || view === 'jitsi'
}

function statusLabel(status: ViewStatus | null): string {
  switch (status?.state) {
    case 'ready':
      return 'Connected'
    case 'loading':
      return 'Loading'
    case 'error':
      return 'Error'
    case 'unconfigured':
      return 'Not configured'
    default:
      return 'Idle'
  }
}

export function ContextBar({
  active,
  snapshot,
  status,
  onReload,
  onOpenExternal,
  onJoinMeeting,
  onOpenSettings,
  onOpenLogs
}: ContextBarProps): React.JSX.Element {
  const managed = isManaged(active)
  const url = managed
    ? active === 'element'
      ? snapshot.settings.servers.elementUrl
      : snapshot.settings.servers.jitsiUrl
    : ''
  const host = url ? hostOf(url) : ''

  return (
    <div className="contextbar">
      <div className="contextbar-heading">
        <div className="contextbar-title">{TITLES[active]}</div>
        <div className="contextbar-subtitle">
          {managed && host ? host : SUBTITLES[active]}
        </div>
      </div>

      {managed ? (
        <div className={`status-pill status-${status?.state ?? 'unconfigured'}`}>
          <span className="status-dot" />
          {statusLabel(status)}
        </div>
      ) : null}

      <div className="contextbar-actions">
        {active === 'jitsi' ? (
          <button
            type="button"
            className="button secondary contextbar-button"
            title="Join a Jitsi meeting by URL"
            onClick={onJoinMeeting}
          >
            <Icon name="video" size={15} />
            Join meeting
          </button>
        ) : null}
        {managed ? (
          <>
            <button
              type="button"
              className="icon-button"
              title="Reload this view"
              aria-label="Reload this view"
              onClick={onReload}
              disabled={!url}
            >
              <Icon name="refresh" size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Open this page in the system browser"
              aria-label="Open this page in the system browser"
              onClick={onOpenExternal}
              disabled={!url}
            >
              <Icon name="external" size={18} />
            </button>
          </>
        ) : null}
        {active === 'settings' ? (
          <button type="button" className="icon-button" title="Logs" onClick={onOpenLogs}>
            <Icon name="logs" size={18} />
          </button>
        ) : null}
        {active !== 'settings' ? (
          <button
            type="button"
            className="icon-button"
            title="Settings"
            aria-label="Settings"
            onClick={onOpenSettings}
          >
            <Icon name="settings" size={18} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
