import type { SettingsSnapshot, ShellView, ViewStatus } from '@shared/types'
import { hostOf } from '@shared/urls'
import { Icon } from '../lib/icons'

interface StatusBarProps {
  active: ShellView
  snapshot: SettingsSnapshot
  status: ViewStatus | null
  onOpenLogs: () => void
}

function message(active: ShellView, snapshot: SettingsSnapshot, status: ViewStatus | null): string {
  if (active === 'settings') return 'All settings are saved to the configuration file'
  if (active === 'logs') return 'Debug and warning output'
  if (!status) return 'Starting…'

  const url =
    active === 'element'
      ? snapshot.settings.servers.elementUrl
      : snapshot.settings.servers.jitsiUrl
  const host = url ? hostOf(url) : ''

  switch (status.state) {
    case 'ready':
      return host ? `Connected to ${host}` : 'Connected'
    case 'loading':
      return host ? `Loading ${host}…` : 'Loading…'
    case 'error':
      return status.message ?? 'The page could not be loaded'
    case 'unconfigured':
      return `Set the ${active === 'element' ? 'Element' : 'Jitsi'} URL in Settings`
    default:
      return ''
  }
}

export function StatusBar({
  active,
  snapshot,
  status,
  onOpenLogs
}: StatusBarProps): React.JSX.Element {
  const { settings, meta } = snapshot

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <span className={`statusbar-indicator status-${status?.state ?? 'idle'}`} />
        <span className="statusbar-message">{message(active, snapshot, status)}</span>
      </div>

      <div className="statusbar-right">
        <button
          type="button"
          className={`statusbar-chip${settings.logging.debug ? ' is-debug' : ''}`}
          title={settings.logging.debug ? 'Debug logging is enabled' : 'Open logs'}
          onClick={onOpenLogs}
        >
          <Icon name={settings.logging.debug ? 'bug' : 'logs'} size={13} />
          {settings.logging.debug ? 'Debug' : 'Logs'}
        </button>
        {meta.isWayland ? (
          <span className="statusbar-chip" title="Running on Wayland">
            <Icon name="monitor" size={13} />
            Wayland
          </span>
        ) : null}
        <span className="statusbar-version" title={meta.configPath}>
          v{meta.appVersion}
        </span>
      </div>
    </footer>
  )
}
