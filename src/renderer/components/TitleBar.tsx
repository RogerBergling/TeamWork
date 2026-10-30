import type { WindowState } from '@shared/types'
import { Icon } from '../lib/icons'

interface TitleBarProps {
  appName: string
  organizationName: string
  logo: string
  windowState: WindowState
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
}

export function TitleBar({
  appName,
  organizationName,
  logo,
  windowState,
  onMinimize,
  onMaximize,
  onClose
}: TitleBarProps): React.JSX.Element {
  return (
    <header className="titlebar" onDoubleClick={onMaximize}>
      <div className="titlebar-brand">
        <img className="titlebar-logo" src={logo} alt="" draggable={false} />
        <div className="titlebar-titles">
          <span className="titlebar-name">{appName}</span>
          {organizationName ? (
            <span className="titlebar-organization">{organizationName}</span>
          ) : null}
        </div>
      </div>

      <div className="titlebar-drag" />

      <div className="window-controls" onDoubleClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="window-control"
          title="Minimize"
          aria-label="Minimize"
          onClick={onMinimize}
        >
          <Icon name="minimize" size={16} />
        </button>
        <button
          type="button"
          className="window-control"
          title={windowState.maximized ? 'Restore' : 'Maximize'}
          aria-label={windowState.maximized ? 'Restore' : 'Maximize'}
          onClick={onMaximize}
        >
          <Icon name={windowState.maximized ? 'restore' : 'maximize'} size={14} />
        </button>
        <button
          type="button"
          className="window-control window-control-close"
          title="Close"
          aria-label="Close"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </header>
  )
}
