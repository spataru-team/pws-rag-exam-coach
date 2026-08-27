import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelRunMetrics } from '@/types'
import { metricsRepo } from '@/storage'
import { summarizeModelRuns, type MetricsOverview } from '@/stats/modelStats'
import { getSubject } from '@/data/subjectRegistry'
import { useAppStore } from '@/app/store'
import { localize } from '@/i18n/localize'
import { StatCard, ScoreBar } from '@/components/widgets'

const th: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid var(--color-border)',
  padding: '0.4rem',
}
const td: React.CSSProperties = {
  borderBottom: '1px solid var(--color-border)',
  padding: '0.4rem',
}

export function Stats() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const lang = profile?.interfaceLanguage ?? 'ru'
  const [metrics, setMetrics] = useState<ModelRunMetrics[]>([])
  const [overview, setOverview] = useState<MetricsOverview | null>(null)

  useEffect(() => {
    void metricsRepo.all().then((all) => {
      setMetrics(all)
      setOverview(summarizeModelRuns(all))
    })
  }, [])

  function subjectTitle(id: string): string {
    return localize(getSubject(id)?.interfaceTitleByLanguage, lang) || id
  }

  function exportStats() {
    const payload = { exportedAt: new Date().toISOString(), overview, metrics }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `model-stats-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!overview) return <p>{t('common.loading')}</p>

  if (overview.totalRuns === 0) {
    return (
      <div>
        <h1>{t('stats.title')}</h1>
        <p className="muted">{t('stats.intro')}</p>
        <p className="warning">{t('stats.empty')}</p>
      </div>
    )
  }

  const pct = (n: number) => `${Math.round(n * 100)}%`

  return (
    <div>
      <h1>{t('stats.title')}</h1>
      <p className="muted">{t('stats.intro')}</p>

      <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
        <StatCard label={t('stats.totalRuns')} value={overview.totalRuns} />
        <StatCard label={t('stats.avgLatency')} value={`${Math.round(overview.avgLatencyMs)} ${t('stats.ms')}`} />
        <StatCard label={t('stats.p50')} value={`${Math.round(overview.p50LatencyMs)} ${t('stats.ms')}`} />
        <StatCard label={t('stats.p95')} value={`${Math.round(overview.p95LatencyMs)} ${t('stats.ms')}`} />
        <StatCard label={t('stats.avgGroundedness')} value={pct(overview.avgGroundedness)} />
        <StatCard label={t('stats.avgFormat')} value={pct(overview.avgFormatCompliance)} />
        <StatCard label={t('stats.tokens')} value={`${overview.totalTokensIn}/${overview.totalTokensOut}`} />
        <StatCard label={t('stats.cost')} value={`$${overview.totalEstimatedCost.toFixed(4)}`} />
      </div>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('stats.byModel')}</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('llm.model')}</th>
                <th style={th}>{t('stats.runs')}</th>
                <th style={th}>{t('stats.avgLatency')}</th>
                <th style={th}>{t('stats.p95')}</th>
                <th style={th}>{t('stats.tokens')}</th>
                <th style={th}>{t('modelLab.groundedness')}</th>
                <th style={th}>{t('modelLab.format')}</th>
                <th style={th}>{t('modelLab.rating')}</th>
                <th style={th}>{t('stats.cost')}</th>
              </tr>
            </thead>
            <tbody>
              {overview.byProviderModel.map((r) => (
                <tr key={r.key}>
                  <td style={td}>{r.key}</td>
                  <td style={td}>{r.runs}</td>
                  <td style={td}>{Math.round(r.avgLatencyMs)} {t('stats.ms')}</td>
                  <td style={td}>{Math.round(r.p95LatencyMs)} {t('stats.ms')}</td>
                  <td style={td}>{r.totalTokensIn}/{r.totalTokensOut}</td>
                  <td style={td}>{pct(r.avgGroundedness)}</td>
                  <td style={td}>{pct(r.avgFormatCompliance)}</td>
                  <td style={td}>{r.avgUserRating === null ? '—' : pct(r.avgUserRating)}</td>
                  <td style={td}>${r.totalEstimatedCost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('stats.bySubject')}</h2>
        <div className="grid cols-2">
          {overview.bySubject.map((s) => (
            <div key={s.subjectId}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>{subjectTitle(s.subjectId)}</span>
                <span className="badge">{s.runs}</span>
              </div>
              <ScoreBar value={s.avgGroundedness} label={t('modelLab.groundedness')} />
            </div>
          ))}
        </div>
      </section>

      <button type="button" onClick={exportStats}>⬇ {t('stats.export')}</button>
    </div>
  )
}
