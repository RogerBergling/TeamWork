import type { ManagedView, ViewStatus } from '@shared/types'
import { hostOf } from '@shared/urls'
import { Icon } from '../lib/icons'

interface ContentStateProps {
  view: ManagedView
  status: ViewStatus
  onRetry: () => void
  onSettings: () => void
  onOpenBrowser: () => void
}

const LABEL: Record<ManagedView, string> = {
  element: 'Element',
  jitsi: 'Jitsi'
}

export function ContentState({
  view,
  status,
  onRetry,
  onSettings,
  onOpenBrowser
}: ContentStateProps): React.JSX.Element | null {
  if (status.state === 'ready') return null

  const label = LABEL[view]
  const host = status.url ? hostOf(status.url) : ''
  const certificateError =
    typeof status.code === 'number' && status.code <= -200 && status.code >= -299

  if (status.state === 'loading') {
    return (
      <div className="content-state" aria-live="polite">
        <div className="spinner" />
        <h2>Loading {label}</h2>
        <p>{host ? `Connecting to ${host}…` : 'Starting the embedded application…'}</p>
      </div>
    )
  }

  if (status.state === 'unconfigured') {
    return (
      <div className="content-state" aria-live="polite">
        <div className="content-state-icon">
          <Icon name="settings" size={34} />
        </div>
        <h2>{label} is not configured yet</h2>
        <p>
          Add the address of your {label} deployment in Settings. TeamWork loads the official web
          client, so your SAML/OpenID sign-in and existing features stay available.
        </p>
        <button type="button" className="button primary" onClick={onSettings}>
          Open settings
        </button>
      </div>
    )
  }

  return (
    <div className="content-state" aria-live="assertive">
      <div className="content-state-icon is-error">
        <Icon name="alert" size={34} />
      </div>
      <h2>Could not load {label}</h2>
      <p className="content-state-error">{status.message ?? 'Unknown error'}</p>
      {status.code ? <p className="content-state-code">Network error {status.code}</p> : null}
      <div className="content-state-actions">
        <button type="button" className="button primary" onClick={onRetry}>
          <Icon name="refresh" size={16} />
          Retry
        </button>
        <button type="button" className="button secondary" onClick={onSettings}>
          Check settings
        </button>
        {status.url ? (
          <button type="button" className="button ghost" onClick={onOpenBrowser}>
            Open in browser
          </button>
        ) : null}
      </div>
      {certificateError ? (
        <p className="content-state-hint">
          If your organisation uses a private certificate authority, install the CA system-wide or
          enable “Allow invalid TLS certificates” under Authentication.
        </p>
      ) : null}
    </div>
  )
}
