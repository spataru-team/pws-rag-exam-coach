import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { ExerciseResult, LearningEvent } from '@/types'
import { getSubject, getTopic } from '@/data/subjectRegistry'
import { buildDiagnostic } from '@/learning'
import { recordLearningEvent } from '@/services'
import { useAppStore } from '@/app/store'
import { localize } from '@/i18n/localize'

export function Diagnostic() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const profile = useAppStore((s) => s.profile)
  const subject = profile ? getSubject(profile.currentSubjectId) : undefined
  const lang = profile?.interfaceLanguage ?? 'ru'

  const items = useMemo(() => (subject ? buildDiagnostic(subject) : []), [subject])
  const [index, setIndex] = useState(0)
  const [confidence, setConfidence] = useState(0.5)
  const [done, setDone] = useState(false)

  if (!profile || !subject) return <p>{t('common.loading')}</p>

  const current = items[index]

  async function answer(result: ExerciseResult) {
    if (!profile || !current) return
    const event: LearningEvent = {
      id: `dg_${Date.now()}_${index}`,
      timestamp: new Date().toISOString(),
      subjectId: profile.currentSubjectId,
      topicId: current.topicId,
      activityType: 'diagnostic',
      exerciseType: current.inputMode,
      result,
      score: { correct: 1, partial: 0.5, incorrect: 0, skipped: 0 }[result],
      timeSpentSec: 20,
      retrievedChunkIds: [],
      confidenceSelfRating: confidence,
    }
    await recordLearningEvent(event)
    if (index + 1 >= items.length) setDone(true)
    else {
      setIndex(index + 1)
      setConfidence(0.5)
    }
  }

  if (done) {
    return (
      <div>
        <h1>{t('diagnostic.finishTitle')}</h1>
        <p>{t('diagnostic.finishBody')}</p>
        <button type="button" className="primary" onClick={() => navigate('/')}>
          {t('nav.dashboard')}
        </button>
      </div>
    )
  }

  if (!current) return <p>{t('common.loading')}</p>
  const topic = getTopic(profile.currentSubjectId, current.topicId)

  return (
    <div>
      <h1>{t('diagnostic.title')}</h1>
      <p className="muted">{t('diagnostic.intro')}</p>
      <p>{t('diagnostic.question', { n: index + 1, total: items.length })}</p>

      <section className="card">
        <h2>{localize(topic?.title, lang)}</h2>
        <p className="muted">{current.skillArea}</p>

        <label htmlFor="dg-confidence">
          {t('diagnostic.confidence')}: {Math.round(confidence * 100)}%
        </label>
        <input
          id="dg-confidence"
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
        />

        <div className="row" style={{ marginTop: '0.8rem' }}>
          <button type="button" className="primary" onClick={() => void answer('correct')}>
            ✓ {t('common.yes')}
          </button>
          <button type="button" onClick={() => void answer('partial')}>
            ~ {t('common.next')}
          </button>
          <button type="button" onClick={() => void answer('incorrect')}>
            ✗ {t('common.no')}
          </button>
        </div>
      </section>
    </div>
  )
}
