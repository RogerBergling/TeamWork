import { useEffect } from 'react'
import type { ScreenShareRequest } from '@shared/types'
import { Icon } from '../lib/icons'

interface ScreenShareModalProps {
  request: ScreenShareRequest
  onSelect: (sourceId: string) => void
  onCancel: () => void
}

export function ScreenShareModal({
  request,
  onSelect,
  onCancel
}: ScreenShareModalProps): React.JSX.Element {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const app = request.view === 'element' ? 'Element' : 'Jitsi'
  const hasSources = request.sources.length > 0 && !request.error

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal screenshare-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshare-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="screenshare-title">Share your screen</h2>
            <p>
              Choose a screen or window to share with {app}. Your selection is passed directly to
              the web client.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cancel screen sharing"
            title="Cancel"
            onClick={onCancel}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {request.error ? (
          <div className="inline-alert error">
            <Icon name="alert" size={18} />
            <div>
              <strong>Could not list capture sources</strong>
              <p>{request.error}</p>
              <p>
                On Wayland, make sure xdg-desktop-portal and a PipeWire session are available. You
                can also start TeamWork with the display backend set to X11 as a fallback.
              </p>
            </div>
          </div>
        ) : null}

        {hasSources ? (
          <div className="screenshare-grid">
            {request.sources.map((source) => (
              <button
                key={source.id}
                type="button"
                className="screenshare-source"
                onClick={() => onSelect(source.id)}
              >
                <span className="screenshare-thumb">
                  <img src={source.thumbnail} alt="" />
                </span>
                <span className="screenshare-meta">
                  <span className="screenshare-name" title={source.name}>
                    {source.name || 'Unnamed source'}
                  </span>
                  <span className="screenshare-kind">
                    {source.displayId ? 'Screen' : 'Window'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {!request.error && !hasSources ? (
          <div className="modal-empty">
            <Icon name="monitor" size={30} />
            <p>No screens or windows are available to share.</p>
          </div>
        ) : null}

        <div className="modal-footer">
          {request.audioRequested ? (
            <span className="modal-note">
              Audio sharing is controlled by the desktop portal on Linux.
            </span>
          ) : (
            <span className="modal-note">The share starts immediately after selection.</span>
          )}
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
