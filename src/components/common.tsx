import type { FormEvent, ReactNode } from 'react'
import { ShieldAlert, X } from 'lucide-react'

// Khung hộp thoại theo kiểu các modal sẵn có; truyền onSubmit để cả hộp thoại là một form
export function Modal({
  kicker,
  title,
  onClose,
  onSubmit,
  className = '',
  children,
  actions,
}: {
  kicker: string
  title: string
  onClose: () => void
  onSubmit?: () => void
  className?: string
  children: ReactNode
  actions: ReactNode
}) {
  const body = (
    <>
      <div className="modal-heading">
        <div>
          <div className="section-kicker">{kicker}</div>
          <h2>{title}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
          <X size={20} />
        </button>
      </div>
      {children}
      <div className="modal-actions">{actions}</div>
    </>
  )
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      {onSubmit ? (
        <form
          className={`modal ${className}`}
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          {body}
        </form>
      ) : (
        <div className={`modal ${className}`}>{body}</div>
      )}
    </div>
  )
}

export function FormError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="error-message">
      <ShieldAlert size={15} />
      {message}
    </div>
  )
}

export function Stat({ icon, tone, label, value, note }: { icon: ReactNode; tone: string; label: string; value: string; note: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  )
}

export function ActivityItem({ tone, icon, title, detail, time }: { tone: string; icon: ReactNode; title: string; detail: string; time: string }) {
  return (
    <div className="activity-item">
      <div className={`activity-icon ${tone}`}>{icon}</div>
      <div className="activity-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <time>{time}</time>
    </div>
  )
}

export function EmptyState({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}
