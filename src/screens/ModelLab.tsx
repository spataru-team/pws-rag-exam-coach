import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSubject } from '@/data/subjectRegistry'
import { PROVIDER_PRESETS, isCloudProvider, type LLMProviderConfig } from '@/llm'
import { getTutorFeedback, type TutorResponse } from '@/services'
import { useAppStore } from '@/app/store'
import { localize } from '@/i18n/localize'

interface LabRow {
  providerId: string
  response: TutorResponse
  userRating?: number
}

const COMPARABLE = ['mock', 'ollama', 'lmstudio', 'openvino', 'openai', 'openrouter']

export function ModelLab() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const apiKey = useAppStore((s) => s.apiKey)
  const subject = profile ? getSubject(profile.currentSubjectId) : undefined
  const lang = profile?.interfaceLanguage ?? 'ru'

  const [selected, setSelected] = useState<string[]>(['mock'])
  const [question, setQuestion] = useState('')
  const [rows, setRows] = useState<LabRow[]>([])
  const [busy, setBusy] = useState(false)

  if (!profile || !subject) return <p>{t('common.loading')}</p>
  const topicId = subject.topicTree[0]?.id ?? ''

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function run() {
    if (!profile || !subject) return
    setBusy(true)
    setRows([])
    try {
      const results: LabRow[] = []
      for (const providerId of selected) {
        const config = PROVIDER_PRESETS[providerId] as LLMProviderConfig
        try {
          const response = await getTutorFeedback({
            subjectId: profile.currentSubjectId,
            topicId,
            question: question || `${localize(subject.topicTree[0]?.title, lang)}`,
            supportLanguage: lang,
            providerConfig: config,
            apiKey,
          })
          results.push({ providerId, response })
        } catch (err) {
          // Surface provider failures (e.g. Ollama down) without aborting others.
          results.push({
            providerId,
            response: errorRow(providerId, config.model, String(err)),
          })
        }
      }
      setRows(results)
    } finally {
      setBusy(false)
    }
  }

  function exportResults() {
    const payload = {
      exportedAt: new Date().toISOString(),
      subjectId: profile?.currentSubjectId,
      question,
      results: rows.map((r) => ({ ...r.response.metrics, provider: r.providerId, userRating: r.userRating })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `model-lab-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h1>{t('modelLab.title')}</h1>
      <p className="muted">{t('modelLab.intro')}</p>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <label htmlFor="lab-q">{t('common.subject')}: {localize(subject.interfaceTitleByLanguage, lang)}</label>
        <textarea id="lab-q" value={question} onChange={(e) => setQuestion(e.target.value)} style={{ minHeight: '5rem' }} />
        <fieldset style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', marginTop: '0.8rem' }}>
          <legend>{t('llm.provider')}</legend>
          <div className="row">
            {COMPARABLE.map((id) => {
              const p = PROVIDER_PRESETS[id] as LLMProviderConfig
              return (
                <label key={id} className="badge">
                  <input type="checkbox" style={{ width: 'auto' }} checked={selected.includes(id)} onChange={() => toggle(id)} />
                  {p.name}
                </label>
              )
            })}
          </div>
        </fieldset>
        {selected.some((id) => isCloudProvider(PROVIDER_PRESETS[id] as LLMProviderConfig)) && (
          <p className="warning" style={{ marginTop: '0.6rem' }}>⚠️ {t('llm.cloudWarning')}</p>
        )}
        <button type="button" className="primary" style={{ marginTop: '0.8rem' }} onClick={() => void run()} disabled={busy || selected.length === 0}>
          {busy ? t('common.loading') : t('modelLab.run')}
        </button>
      </section>

      {rows.some((r) => r.response.embeddingUnavailable) && (
        <p className="warning" role="alert">⚠️ {t('embeddings.unavailable')}</p>
      )}

      {rows.length > 0 && (
        <section className="card">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{t('llm.model')}</th>
                  <th style={th}>{t('modelLab.latency')}</th>
                  <th style={th}>{t('modelLab.tokens')}</th>
                  <th style={th}>{t('modelLab.groundedness')}</th>
                  <th style={th}>{t('modelLab.format')}</th>
                  <th style={th}>{t('modelLab.rating')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.providerId}>
                    <td style={td}>{r.response.metrics.provider} / {r.response.metrics.model}</td>
                    <td style={td}>{r.response.metrics.latencyMs}</td>
                    <td style={td}>{r.response.metrics.tokensIn}/{r.response.metrics.tokensOut}</td>
                    <td style={td}>{Math.round(r.response.groundednessScore * 100)}%</td>
                    <td style={td}>{Math.round(r.response.formatCompliance * 100)}%</td>
                    <td style={td}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" aria-label={`rate ${n}`} onClick={() => setRows((prev) => prev.map((x) => (x.providerId === r.providerId ? { ...x, userRating: n / 5 } : x)))} style={{ padding: '0.1rem 0.3rem' }}>
                          {r.userRating && r.userRating >= n / 5 ? '★' : '☆'}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" style={{ marginTop: '0.8rem' }} onClick={exportResults}>
            ⬇ {t('modelLab.exportResults')}
          </button>
        </section>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid var(--color-border)', padding: '0.4rem' }
const td: React.CSSProperties = { borderBottom: '1px solid var(--color-border)', padding: '0.4rem' }

function errorRow(providerId: string, model: string, message: string): TutorResponse {
  return {
    answer: `⚠️ ${message}`,
    retrieved: [],
    citedChunkIds: [],
    insufficient: true,
    embeddingUnavailable: false,
    corpusEmpty: false,
    synthetic: false,
    groundednessScore: 0,
    formatCompliance: 0,
    metrics: {
      id: `err_${Date.now()}`,
      timestamp: new Date().toISOString(),
      provider: providerId,
      model,
      subjectId: 'romanian',
      topicId: '',
      latencyMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      estimatedCost: 0,
      retrievalTopK: 0,
      contextChunkIds: [],
      groundednessScore: 0,
      formatCompliance: 0,
    },
  }
}
