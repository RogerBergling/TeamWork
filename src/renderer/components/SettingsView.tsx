import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SETTINGS_FIELDS,
  SETTINGS_SECTIONS,
  getByPath,
  setByPath,
  type SettingField,
  type Settings,
  type SettingsFieldError,
  type SettingsSectionId
} from '@shared/settings-fields'
import type { ImportExportResult, ManagedView, SaveResult, SettingsSnapshot } from '@shared/types'
import { Icon } from '../lib/icons'
import { SettingControl } from './SettingControl'
import type { ToastKind } from './Toast'

type SettingsTab = SettingsSectionId | 'about'

interface SettingsViewProps {
  snapshot: SettingsSnapshot
  fallbackLogo: string
  onSave: (settings: Settings) => Promise<SaveResult>
  onReset: () => Promise<SaveResult>
  onExport: () => Promise<ImportExportResult>
  onImport: () => Promise<ImportExportResult>
  onChooseLogo: () => Promise<string | null>
  onLogoData: (path: string) => Promise<string | null>
  onOpenConfig: () => void
  onOpenLogs: () => void
  onRestart: () => void
  onClearSession: (view: ManagedView) => Promise<void>
  onNotify: (message: string, kind?: ToastKind) => void
}

export function SettingsView({
  snapshot,
  fallbackLogo,
  onSave,
  onReset,
  onExport,
  onImport,
  onChooseLogo,
  onLogoData,
  onOpenConfig,
  onOpenLogs,
  onRestart,
  onClearSession,
  onNotify
}: SettingsViewProps): React.JSX.Element {
  const { settings, meta } = snapshot
  const lockedFields = useMemo(() => new Set(meta.lockedFields), [meta.lockedFields])
  const [draft, setDraft] = useState<Settings>(settings)
  const [errors, setErrors] = useState<SettingsFieldError[]>([])
  const [activeTab, setActiveTab] = useState<SettingsTab>('connection')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings])
  const dirtyRef = useRef(dirty)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    if (!dirtyRef.current) setDraft(settings)
  }, [settings])

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [activeTab, query])

  const normalizedQuery = query.trim().toLowerCase()
  const matchingFields = useMemo(() => {
    if (!normalizedQuery) return []
    return SETTINGS_FIELDS.filter((field) => {
      const section = SETTINGS_SECTIONS.find((entry) => entry.id === field.section)
      return [field.label, field.description ?? '', field.path, section?.label ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [normalizedQuery])

  const updateField = (path: string, value: unknown): void => {
    setDraft((current) => setByPath(current, path, value))
    setErrors((current) => current.filter((error) => error.path !== path))
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const result = await onSave(draft)
      if (result.ok && result.settings) {
        setDraft(result.settings)
        setErrors([])
        onNotify('Settings saved.', 'success')
      } else {
        setErrors(result.errors ?? [])
        onNotify(result.message ?? 'Some settings are invalid.', 'error')
      }
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not save settings.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async (): Promise<void> => {
    if (
      !window.confirm(
        'Reset every setting to its default value? This cannot be undone. Settings managed by policy keep their policy values.'
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const result = await onReset()
      if (result.ok && result.settings) {
        setDraft(result.settings)
        setErrors([])
        onNotify('Settings reset to defaults.', 'success')
      } else {
        setErrors(result.errors ?? [])
        onNotify(result.message ?? 'Could not reset settings.', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await onExport()
      if (result.ok) onNotify(result.message ?? 'Configuration exported.', 'success')
      else if (result.message !== 'Export cancelled.') {
        onNotify(result.message ?? 'Could not export configuration.', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await onImport()
      if (result.ok && result.settings) {
        setDraft(result.settings)
        setErrors([])
        onNotify(result.message ?? 'Configuration imported.', 'success')
      } else if (result.message !== 'Import cancelled.') {
        setErrors(result.errors ?? [])
        onNotify(result.message ?? 'Could not import configuration.', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleClearSession = async (view: ManagedView): Promise<void> => {
    const label = view === 'element' ? 'Element' : 'Jitsi'
    if (!window.confirm(`Clear all cookies and local storage for ${label}? You will be signed out.`)) {
      return
    }
    setBusy(true)
    try {
      await onClearSession(view)
      onNotify(`${label} session cleared.`, 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not clear the session.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const renderField = (field: SettingField): React.JSX.Element => {
    const error = errors.find((entry) => entry.path === field.path)
    const locked = lockedFields.has(field.path)
    const inputId = `setting-${field.path.replaceAll('.', '-')}`
    const errorId = `error-${field.path.replaceAll('.', '-')}`

    return (
      <div
        key={field.path}
        className={`setting-row${error ? ' has-error' : ''}${locked ? ' is-locked' : ''}`}
        data-setting-path={field.path}
      >
        <div className="setting-copy">
          <label htmlFor={inputId}>{field.label}</label>
          {field.restart ? <span className="badge restart-badge">Restart required</span> : null}
          {locked ? <span className="badge managed-badge">Managed by policy</span> : null}
          {field.description ? <p className="setting-description">{field.description}</p> : null}
          {error ? (
            <p className="setting-error" id={errorId}>
              {error.message}
            </p>
          ) : null}
        </div>
        <div className="setting-input" aria-describedby={error ? errorId : undefined}>
          <SettingControl
            field={field}
            value={getByPath(draft, field.path)}
            fallbackLogo={fallbackLogo}
            disabled={locked}
            onChange={(value) => updateField(field.path, value)}
            onChooseLogo={onChooseLogo}
            onLogoData={onLogoData}
          />
        </div>
      </div>
    )
  }

  const renderSection = (
    sectionId: SettingsSectionId,
    fields: SettingField[]
  ): React.JSX.Element => {
    const section = SETTINGS_SECTIONS.find((entry) => entry.id === sectionId)
    return (
      <section className="settings-section" key={sectionId}>
        <div className="settings-section-heading">
          <h2>{section?.label ?? sectionId}</h2>
          <p>{section?.description}</p>
        </div>
        <div className="settings-card">{fields.map(renderField)}</div>

        {sectionId === 'authentication' && !normalizedQuery ? (
          <div className="settings-card">
            <div className="card-heading">
              <div>
                <h3>Embedded sessions</h3>
                <p>
                  Element and Jitsi keep separate browser sessions so their sign-in flows do not
                  interfere with each other.
                </p>
              </div>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void handleClearSession('element')}
              >
                Clear Element session
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void handleClearSession('jitsi')}
              >
                Clear Jitsi session
              </button>
            </div>
          </div>
        ) : null}
      </section>
    )
  }

  const renderAbout = (): React.JSX.Element => (
    <section className="settings-section">
      <div className="settings-section-heading">
        <h2>Application</h2>
        <p>Runtime details, configuration file and maintenance actions.</p>
      </div>

      <div className="settings-card about-grid">
        <InfoRow label="Application" value={`${settings.appearance.appName} ${meta.appVersion}`} />
        <InfoRow label="Build number" value={meta.buildNumber} />
        <InfoRow label="Build date" value={meta.buildDate} />
        <InfoRow label="Build time" value={`${meta.buildTime} (hour ${meta.buildHour})`} />
        <InfoRow label="Electron" value={meta.electronVersion} />
        <InfoRow label="Chromium" value={meta.chromeVersion} />
        <InfoRow label="Node" value={meta.nodeVersion} />
        <InfoRow
          label="Session"
          value={`${meta.sessionType}${meta.isWayland ? ' · Wayland' : ''}`}
        />
        <InfoRow label="Platform" value={meta.platform} />
        <InfoRow label="Configuration" value={meta.configPath} mono />
        <InfoRow label="Log file" value={meta.logPath} mono />
      </div>

      <div className="settings-card">
        <div className="card-heading">
          <div>
            <h3>Configuration file</h3>
            <p>
              Every setting in this window is stored in one JSON file. Export it for backup or to
              provision other machines.
            </p>
          </div>
        </div>
        <code className="path-box">{meta.configPath}</code>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={onOpenConfig}>
            <Icon name="folder" size={16} />
            Open file
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void handleExport()}
          >
            <Icon name="download" size={16} />
            Export
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void handleImport()}
          >
            <Icon name="upload" size={16} />
            Import
          </button>
          <button type="button" className="button ghost" onClick={onOpenLogs}>
            <Icon name="logs" size={16} />
            Open logs
          </button>
        </div>
      </div>

      <div className="settings-card">
        <div className="card-heading">
          <div>
            <h3>Restart TeamWork</h3>
            <p>
              Required after changing the display backend or hardware acceleration. Other settings
              apply immediately.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            if (window.confirm('Restart TeamWork now?')) onRestart()
          }}
        >
          <Icon name="restart" size={16} />
          Restart application
        </button>
      </div>

      <div className="settings-card danger-card">
        <div className="card-heading">
          <div>
            <h3>Reset all settings</h3>
            <p>
              Restores every option to its default. Embedded session data is not deleted by this
              action.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="button danger"
          disabled={busy}
          onClick={() => void handleReset()}
        >
          Reset settings
        </button>
      </div>
    </section>
  )

  return (
    <div className="settings-view">
      <header className="settings-header">
        <div>
          <h1>Settings</h1>
          <p>
            {meta.lockedFields.length > 0
              ? 'User-editable settings are stored in the configuration file. Fields marked as managed come from system policy.'
              : 'Everything is stored in the configuration file and applied immediately.'}
          </p>
        </div>
        <div className="settings-header-actions">
          {dirty ? <span className="unsaved-label">Unsaved changes</span> : null}
          <button
            type="button"
            className="button secondary"
            disabled={!dirty || saving}
            onClick={() => setDraft(settings)}
          >
            Revert
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
          >
            <Icon name="save" size={16} />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </header>

      {meta.loadError ? (
        <div className="inline-alert error" role="alert">
          <Icon name="alert" size={18} />
          <div>
            <strong>The configuration file could not be loaded.</strong>
            <p>{meta.loadError}</p>
            <p>Defaults are in use. The previous file was preserved with an .invalid suffix.</p>
          </div>
        </div>
      ) : null}

      {meta.policyError ? (
        <div className="inline-alert error" role="alert">
          <Icon name="alert" size={18} />
          <div>
            <strong>The system policy could not be loaded.</strong>
            <p>{meta.policyError}</p>
            <p>
              User settings are in use, and no fields are locked. Ask your administrator to correct{' '}
              <code>{meta.policyPath}</code>.
            </p>
          </div>
        </div>
      ) : null}

      {meta.lockedFields.length > 0 ? (
        <div className="inline-alert info" role="status">
          <Icon name="info" size={18} />
          <div>
            <strong>Managed by system policy</strong>
            <p>
              {meta.lockedFields.length} setting{meta.lockedFields.length === 1 ? '' : 's'} come
              from <code>{meta.policyPath}</code> and cannot be changed in this window.
            </p>
          </div>
        </div>
      ) : null}

      <div className="settings-layout">
        <aside className="settings-nav">
          <label className="search-box">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={query}
              placeholder="Search settings"
              aria-label="Search settings"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <nav aria-label="Settings sections">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-nav-item${activeTab === section.id && !normalizedQuery ? ' is-active' : ''}`}
                onClick={() => {
                  setQuery('')
                  setActiveTab(section.id)
                }}
              >
                {section.label}
              </button>
            ))}
            <button
              type="button"
              className={`settings-nav-item${activeTab === 'about' && !normalizedQuery ? ' is-active' : ''}`}
              onClick={() => {
                setQuery('')
                setActiveTab('about')
              }}
            >
              Application
            </button>
          </nav>
        </aside>

        <div className="settings-content" ref={contentRef}>
          {normalizedQuery ? (
            matchingFields.length > 0 ? (
              <>
                <div className="search-summary">
                  {matchingFields.length} result{matchingFields.length === 1 ? '' : 's'} for “
                  {query.trim()}”
                </div>
                {SETTINGS_SECTIONS.map((section) => {
                  const fields = matchingFields.filter((field) => field.section === section.id)
                  return fields.length > 0 ? renderSection(section.id, fields) : null
                })}
              </>
            ) : (
              <div className="settings-empty">
                <Icon name="search" size={28} />
                <h2>No matching settings</h2>
                <p>Try a label such as “URL”, “theme”, “proxy”, “debug” or “certificate”.</p>
              </div>
            )
          ) : activeTab === 'about' ? (
            renderAbout()
          ) : (
            renderSection(
              activeTab,
              SETTINGS_FIELDS.filter((field) => field.section === activeTab)
            )
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono
}: {
  label: string
  value: string
  mono?: boolean
}): React.JSX.Element {
  return (
    <div className="info-row">
      <span>{label}</span>
      <code className={mono ? 'mono wrap' : undefined}>{value}</code>
    </div>
  )
}
