import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SettingsSnapshot } from '@shared/types'
import { Icon } from '../lib/icons'

interface LogsViewProps {
  active: boolean
  snapshot: SettingsSnapshot
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function LogsView({ active, snapshot }: LogsViewProps): React.JSX.Element {
  const [lines, setLines] = useState<string[]>([])
  const [size, setSize] = useState(0)
  const [path, setPath] = useState(snapshot.meta.logPath)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preRef = useRef<HTMLPreElement>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      const result = await window.teamwork.readLogs(1000)
      setLines(result.lines)
      setSize(result.size)
      setPath(result.path)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void load()
    if (!autoRefresh) return
    const timer = window.setInterval(() => void load(), 2500)
    return () => window.clearInterval(timer)
  }, [active, autoRefresh, load])

  useEffect(() => {
    if (!active || !autoRefresh) return
    const element = preRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [lines, active, autoRefresh])

  const visibleLines = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return lines
    return lines.filter((line) => line.toLowerCase().includes(needle))
  }, [filter, lines])

  const clear = async (): Promise<void> => {
    if (!window.confirm('Clear the log file? Existing diagnostics will be deleted.')) return
    await window.teamwork.clearLogs()
    await load()
  }

  const settings = snapshot.settings

  return (
    <div className="logs-view">
      <header className="logs-header">
        <div>
          <h1>Logs</h1>
          <p>
            Main process, shell, and embedded application output. Debug mode captures console
            messages from Element and Jitsi.
          </p>
        </div>
        <div className="logs-header-actions">
          <span className={`badge ${settings.logging.debug ? 'badge-debug' : ''}`}>
            <Icon name={settings.logging.debug ? 'bug' : 'logs'} size={13} />
            {settings.logging.debug ? 'Debug enabled' : `${settings.logging.level} level`}
          </span>
          <button type="button" className="button secondary" onClick={() => void load()}>
            <Icon name="refresh" size={16} />
            Refresh
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => void window.teamwork.openLogFolder()}
          >
            <Icon name="folder" size={16} />
            Open folder
          </button>
          <button type="button" className="button danger" onClick={() => void clear()}>
            Clear
          </button>
        </div>
      </header>

      <div className="logs-meta">
        <code className="path-box" title={path}>
          {path}
        </code>
        <span>{formatBytes(size)}</span>
        <span>
          {lines.length} line{lines.length === 1 ? '' : 's'}
        </span>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
          />
          Follow live output
        </label>
        <label className="search-box logs-filter">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={filter}
            placeholder="Filter lines"
            aria-label="Filter log lines"
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </div>

      {error ? (
        <div className="inline-alert error" role="alert">
          <Icon name="alert" size={18} />
          <div>
            <strong>Could not read logs</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      <div className="log-panel">
        {visibleLines.length > 0 ? (
          <pre ref={preRef} className="log-output">
            {visibleLines.join('\n')}
          </pre>
        ) : (
          <div className="log-empty">
            <Icon name="logs" size={30} />
            <h2>{lines.length === 0 ? 'No log entries yet' : 'No lines match the filter'}</h2>
            <p>
              {lines.length === 0
                ? 'Use the application and return here. Errors, warnings and debug output will appear.'
                : 'Clear the filter to see all log lines.'}
            </p>
            {loading ? <span className="log-loading">Refreshing…</span> : null}
          </div>
        )}
      </div>

      <footer className="logs-footer">
        <span>
          Log level: <strong>{settings.logging.debug ? 'debug (forced)' : settings.logging.level}</strong>
        </span>
        <span>
          File logging: <strong>{settings.logging.toFile ? 'on' : 'off'}</strong>
        </span>
        <span>Rotation: {settings.logging.maxFileSizeMb} MB</span>
      </footer>
    </div>
  )
}
