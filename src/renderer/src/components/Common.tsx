import { useEffect, type ReactNode } from 'react'
import type { Tone } from '../lib/flags'

export function Pill({ tone, icon, children }: { tone: Tone; icon?: string; children: ReactNode }) {
  return (
    <span className={`pill pill-${tone}`}>
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  )
}

export function Notice({
  tone,
  icon,
  children
}: {
  tone: 'info' | 'warn' | 'bad' | 'good'
  icon: string
  children: ReactNode
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <span className="notice-icon" aria-hidden>
        {icon}
      </span>
      <div>{children}</div>
    </div>
  )
}

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal>
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel
}: {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal onClose={onCancel}>
      <h2>{title}</h2>
      <div>{message}</div>
      <div className="btn-row">
        <button className="btn btn-large" onClick={onCancel} autoFocus>
          Nie, wróć
        </button>
        <button className={`btn btn-large ${danger ? 'btn-danger-solid' : 'btn-primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function Toast({ message, action, onClose }: { message: string; action?: { label: string; run: () => void }; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [message, onClose])

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {action && (
        <button
          onClick={() => {
            action.run()
            onClose()
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export function Spinner() {
  return <span className="spinner" aria-hidden />
}
