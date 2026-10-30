import { useEffect, useRef, useState } from 'react'
import type { JoinMeetingResult } from '@shared/types'
import { hostOf } from '@shared/urls'
import { Icon } from '../lib/icons'

interface JoinMeetingModalProps {
  configuredUrl: string
  onJoin: (input: string) => Promise<JoinMeetingResult>
  onClose: () => void
  onOpenSettings: () => void
}

export function JoinMeetingModal({
  configuredUrl,
  onJoin,
  onClose,
  onOpenSettings
}: JoinMeetingModalProps): React.JSX.Element {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const submit = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await onJoin(input)
      if (!result.ok) {
        setError(result.error ?? 'Could not open the meeting.')
        return
      }
      onClose()
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : String(joinError))
    } finally {
      setBusy(false)
    }
  }

  const host = configuredUrl ? hostOf(configuredUrl) : ''

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal join-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-meeting-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="join-meeting-title">Join a Jitsi meeting</h2>
            <p>
              Paste a Jitsi meeting URL from Outlook, an email or a chat message. The full link,
              including any JWT or query parameters, is opened in the Jitsi tab.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <form
          className="join-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label htmlFor="join-meeting-url">Meeting URL</label>
          <div className="file-row">
            <input
              id="join-meeting-url"
              ref={inputRef}
              className="input"
              type="text"
              value={input}
              placeholder="https://meet.example.com/team-standup"
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => {
                setInput(event.target.value)
                setError(null)
              }}
            />
            <button type="submit" className="button primary" disabled={busy || !input.trim()}>
              {busy ? 'Opening…' : 'Join'}
            </button>
          </div>

          {error ? (
            <p className="join-error" role="alert">
              <Icon name="alert" size={15} />
              {error}
            </p>
          ) : null}

          {configuredUrl ? (
            <p className="join-hint">
              The link must belong to <strong>{host}</strong>. For security, TeamWork rejects
              meeting URLs from other servers.
            </p>
          ) : (
            <div className="inline-alert error join-settings-alert">
              <Icon name="alert" size={17} />
              <div>
                <strong>Jitsi is not configured.</strong>
                <p>Set your Jitsi Meet URL before joining a meeting.</p>
                <button type="button" className="button secondary" onClick={onOpenSettings}>
                  Open settings
                </button>
              </div>
            </div>
          )}

          <p className="join-hint">
            In an invitation you can also use a TeamWork link:{' '}
            <code>teamwork://join?url=&lt;encoded Jitsi URL&gt;</code>
          </p>
        </form>
      </div>
    </div>
  )
}
