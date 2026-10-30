import { Icon } from '../lib/icons'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: number
  message: string
  kind: ToastKind
}

export function Toast({
  toast,
  onDismiss
}: {
  toast: ToastMessage
  onDismiss: () => void
}): React.JSX.Element {
  return (
    <div className={`toast toast-${toast.kind}`} role="status" aria-live="polite">
      <Icon
        name={toast.kind === 'success' ? 'check' : toast.kind === 'error' ? 'alert' : 'info'}
        size={18}
      />
      <span>{toast.message}</span>
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
