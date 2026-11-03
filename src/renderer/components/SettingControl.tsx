import { useEffect, useState } from 'react'
import type { SettingField } from '@shared/settings-fields'
import { Icon } from '../lib/icons'

interface SettingControlProps {
  field: SettingField
  value: unknown
  fallbackLogo: string
  disabled?: boolean
  onChange: (value: unknown) => void
  onChooseLogo: () => Promise<string | null>
  onLogoData: (path: string) => Promise<string | null>
}

export function SettingControl({
  field,
  value,
  fallbackLogo,
  disabled = false,
  onChange,
  onChooseLogo,
  onLogoData
}: SettingControlProps): React.JSX.Element {
  const id = `setting-${field.path.replaceAll('.', '-')}`

  if (field.type === 'boolean') {
    return (
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={Boolean(value)}
        aria-disabled={disabled}
        disabled={disabled}
        className={`toggle${value ? ' is-on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <span className="toggle-thumb" />
        <span className="toggle-text">{value ? 'Enabled' : 'Disabled'}</span>
      </button>
    )
  }

  if (field.type === 'select') {
    return (
      <select
        id={id}
        className="input select"
        value={String(value ?? '')}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'number') {
    return (
      <input
        id={id}
        className="input input-number"
        type="number"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={typeof value === 'number' ? value : 0}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    )
  }

  if (field.type === 'color') {
    const color = typeof value === 'string' ? value : '#5b5fc7'
    const validColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#5b5fc7'
    return (
      <div className="color-control">
        <input
          id={id}
          className="color-swatch"
          type="color"
          value={validColor}
          aria-label={`${field.label} colour picker`}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          className="input color-text"
          type="text"
          value={color}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        id={id}
        className="input textarea code"
        rows={field.path === 'appearance.customCss' ? 10 : 4}
        value={String(value ?? '')}
        placeholder={field.placeholder}
        spellCheck={false}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  if (field.type === 'list') {
    return (
      <ListControl
        id={id}
        value={Array.isArray(value) ? value.map(String) : []}
        placeholder={field.placeholder}
        disabled={disabled}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'file') {
    return (
      <FileControl
        id={id}
        value={String(value ?? '')}
        placeholder={field.placeholder}
        fallbackLogo={fallbackLogo}
        disabled={disabled}
        onChange={onChange}
        onChooseLogo={onChooseLogo}
        onLogoData={onLogoData}
      />
    )
  }

  return (
    <input
      id={id}
      className="input"
      type={field.type === 'url' ? 'url' : 'text'}
      value={String(value ?? '')}
      placeholder={field.placeholder}
      spellCheck={false}
      autoComplete="off"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function ListControl({
  id,
  value,
  placeholder,
  disabled,
  onChange
}: {
  id: string
  value: string[]
  placeholder?: string
  disabled: boolean
  onChange: (value: unknown) => void
}): React.JSX.Element {
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState(value.join('\n'))

  useEffect(() => {
    if (!focused) setRaw(value.join('\n'))
  }, [value, focused])

  return (
    <textarea
      id={id}
      className="input textarea list-input"
      rows={4}
      value={raw}
      placeholder={placeholder}
      spellCheck={false}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value
        setRaw(next)
        onChange(
          next
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        )
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}

function FileControl({
  id,
  value,
  placeholder,
  fallbackLogo,
  disabled,
  onChange,
  onChooseLogo,
  onLogoData
}: {
  id: string
  value: string
  placeholder?: string
  fallbackLogo: string
  disabled: boolean
  onChange: (value: unknown) => void
  onChooseLogo: () => Promise<string | null>
  onLogoData: (path: string) => Promise<string | null>
}): React.JSX.Element {
  const [preview, setPreview] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!value) {
      setPreview(null)
      setInvalid(false)
      return
    }

    void onLogoData(value).then((data) => {
      if (cancelled) return
      setPreview(data)
      setInvalid(data === null)
    })
    return () => {
      cancelled = true
    }
  }, [value, onLogoData])

  return (
    <div className="file-control">
      <div className="file-row">
        <input
          id={id}
          className="input"
          type="text"
          value={value}
          placeholder={placeholder ?? 'Bundled logo'}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="button secondary"
          disabled={disabled}
          onClick={() => {
            void onChooseLogo().then((path) => {
              if (path) onChange(path)
            })
          }}
        >
          Browse…
        </button>
      </div>
      <div className="logo-preview">
        <img src={preview ?? fallbackLogo} alt="Logo preview" />
        <span>
          {invalid
            ? 'The selected file could not be read. Using the bundled logo.'
            : value
              ? 'Custom logo preview'
              : 'Bundled TeamWork logo'}
        </span>
        {value ? (
          <button
            type="button"
            className="link-button"
            disabled={disabled}
            onClick={() => onChange('')}
          >
            <Icon name="close" size={13} />
            Use bundled logo
          </button>
        ) : null}
      </div>
    </div>
  )
}
