import type { ReactNode } from 'react'

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
