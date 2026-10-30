import type { ShellView } from '@shared/types'
import { Icon, type IconName } from '../lib/icons'

interface RailProps {
  active: ShellView
  onChange: (view: ShellView) => void
}

interface RailItem {
  id: ShellView
  label: string
  icon: IconName
}

const primaryItems: RailItem[] = [
  { id: 'element', label: 'Chat', icon: 'chat' },
  { id: 'jitsi', label: 'Meet', icon: 'video' }
]

const secondaryItems: RailItem[] = [
  { id: 'logs', label: 'Logs', icon: 'logs' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
]

function RailButton({
  item,
  active,
  onChange
}: {
  item: RailItem
  active: boolean
  onChange: (view: ShellView) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`rail-button${active ? ' is-active' : ''}`}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      onClick={() => onChange(item.id)}
    >
      <span className="rail-icon">
        <Icon name={item.icon} size={22} />
      </span>
      <span className="rail-label">{item.label}</span>
    </button>
  )
}

export function Rail({ active, onChange }: RailProps): React.JSX.Element {
  return (
    <nav className="rail" aria-label="Main navigation">
      <div className="rail-group">
        {primaryItems.map((item) => (
          <RailButton key={item.id} item={item} active={active === item.id} onChange={onChange} />
        ))}
      </div>
      <div className="rail-spacer" />
      <div className="rail-group rail-group-bottom">
        {secondaryItems.map((item) => (
          <RailButton key={item.id} item={item} active={active === item.id} onChange={onChange} />
        ))}
      </div>
    </nav>
  )
}
