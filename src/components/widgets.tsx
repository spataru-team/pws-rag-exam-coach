import type { ReactNode } from 'react'

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: '0.85rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.2rem' }}>{value}</div>
      {hint && <div className="muted" style={{ fontSize: '0.85rem' }}>{hint}</div>}
    </div>
  )
}

/** Shows a delta with an explicit arrow + sign (never colour alone). */
export function DeltaBadge({ delta, suffix = '' }: { delta: number; suffix?: string }) {
  const rounded = Math.round(delta * 100) / 100
  if (rounded === 0) return <span className="muted">→ 0{suffix}</span>
  const up = rounded > 0
  return (
    <span className={up ? 'delta-up' : 'delta-down'}>
      {up ? '▲ +' : '▼ '}
      {rounded}
      {suffix}
    </span>
  )
}

/** Accessible progress bar in [0,1]. */
export function ScoreBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div>
      {label && <div className="muted" style={{ fontSize: '0.85rem' }}>{label}</div>}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        style={{ background: 'var(--color-surface-2)', borderRadius: 999, height: 12, overflow: 'hidden' }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-primary)' }} />
      </div>
      <div className="muted" style={{ fontSize: '0.8rem' }}>{pct}%</div>
    </div>
  )
}
