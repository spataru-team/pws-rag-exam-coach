import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router-dom'
import type { ExerciseResult, LearningEvent } from '@/types'
import { getSubject, getTopic } from '@/data/subjectRegistry'
import { getTutorFeedback, recordLearningEvent, PROMPT_VERSION_IN_USE } from '@/services'
import type { TutorResponse } from '@/services'
import { prerequisiteChain } from '@/learning'
import { useAppStore } from '@/app/store'
import { newId, nowIso } from '@/app/ids'
import { localize } from '@/i18n/localize'
import { speak } from '@/a11y/speech'
import { FigureList } from '@/components/FigureView'

const POMODORO_SEC = 20 * 60

export function Practice() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const profile = useAppStore((s) => s.profile)
  const providerConfig = useAppStore((s) => s.providerConfig)
  const apiKey = useAppStore((s) => s.apiKey)

  const subject = profile ? getSubject(profile.currentSubjectId) : undefined
  const topicId = params.get('topic') ?? subject?.topicTree[0]?.id ?? ''
  const topic = profile ? getTopic(profile.currentSubjectId, topicId) : undefined
  const lang = profile?.interfaceLanguage ?? 'ru'

  const question = `${t('practice.title')}: «${localize(topic?.title, lang)}». ${promptInstruction(lang)}`
  // The prerequisite graph is real data already in every subject's topicTree
  // (src/data/subjects/*.ts) — this is a pure traversal, no retrieval call.
  const foundations = subject ? prerequisiteChain(subject.topicTree, topicId) : []

  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<TutorResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [confidence, setConfidence] = useState(0.5)
  const [selfResult, setSelfResult] = useState<ExerciseResult>('partial')
  const [reflection, setReflection] = useState({ difficult: '', rule: '', next: '' })
  const [elapsed, setElapsed] = useState(0)
  const [saved, setSaved] = useState(false)
  const startRef = useRef<number>(0)

  useEffect(() => {
    startRef.current = Date.now()
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      1000,
    )
    return () => clearInterval(id)
  }, [])

  if (!profile || !subject || !topic) return <p>{t('common.loading')}</p>

  async function runTutor(hintOnly: boolean) {
    if (!profile) return
    setBusy(true)
    try {
      const res = await getTutorFeedback({
        subjectId: profile.currentSubjectId,
        topicId,
        question,
        studentAnswer: hintOnly ? undefined : answer,
        supportLanguage: lang,
        providerConfig,
        apiKey,
        hintOnly,
      })
      setFeedback(res)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!profile) return
    const event: LearningEvent = {
      id: newId('ev'),
      timestamp: nowIso(),
      subjectId: profile.currentSubjectId,
      topicId,
      activityType: 'practice',
      exerciseType: 'ro-written',
      result: selfResult,
      score: resultToScore(selfResult),
      timeSpentSec: elapsed,
      writtenAnswer: answer,
      feedback: feedback?.answer,
      modelProvider: providerConfig.id,
      modelName: providerConfig.model,
      promptVersion: PROMPT_VERSION_IN_USE,
      retrievedChunkIds: feedback?.retrieved.map((r) => r.chunk.id) ?? [],
      confidenceSelfRating: confidence,
    }
    await recordLearningEvent(event)
    // Reflection is stored as its own lightweight event for metacognition.
    if (reflection.difficult || reflection.rule || reflection.next) {
      await recordLearningEvent({
        ...event,
        id: newId('ev'),
        activityType: 'reflection',
        writtenAnswer: `difficult: ${reflection.difficult}; rule: ${reflection.rule}; next: ${reflection.next}`,
        feedback: undefined,
      })
    }
    setSaved(true)
  }

  return (
    <div>
      <h1>{t('practice.title')}</h1>
      <p className="muted">
        {localize(subject.interfaceTitleByLanguage, lang)} · {localize(topic.title, lang)}
      </p>

      {elapsed >= POMODORO_SEC && (
        <p className="warning" role="status">⏱️ {t('practice.timerBreak')}</p>
      )}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <p><strong>{question}</strong></p>
        <label htmlFor="answer">{t('practice.yourAnswer')}</label>
        <textarea
          id="answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          lang={subject.learningLanguages[0] ?? 'ro'}
          spellCheck
        />
        <div className="row" style={{ marginTop: '0.6rem' }}>
          <button type="button" onClick={() => void runTutor(true)} disabled={busy}>
            💡 {t('practice.getHint')}
          </button>
          <button type="button" className="primary" onClick={() => void runTutor(false)} disabled={busy || !answer.trim()}>
            {t('practice.checkAnswer')}
          </button>
        </div>
      </section>

      {foundations.length > 0 && (
        <details style={{ marginBottom: '1rem' }}>
          <summary>{t('practice.foundations')} ({foundations.length})</summary>
          <ul>
            {foundations.map((step) => {
              const prereqTopic = getTopic(profile.currentSubjectId, step.topicId)
              if (!prereqTopic) return null
              return (
                <li key={step.topicId}>
                  <button
                    type="button"
                    onClick={() => navigate(`/practice?topic=${encodeURIComponent(step.topicId)}`)}
                  >
                    {localize(prereqTopic.title, lang)}
                  </button>
                </li>
              )
            })}
          </ul>
        </details>
      )}

      {feedback && (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{t('practice.feedback')}</h2>
            <button type="button" onClick={() => speak(feedback.answer, ttsLang(lang))}>
              🔊 {t('practice.speak')}
            </button>
          </div>
          {feedback.embeddingUnavailable ? (
            <p className="warning" role="alert">⚠️ {t('embeddings.unavailable')}</p>
          ) : (
            feedback.insufficient && <p className="warning">{t('practice.insufficient')}</p>
          )}
          {!feedback.embeddingUnavailable && (
            <p style={{ whiteSpace: 'pre-wrap' }}>{feedback.answer}</p>
          )}
          {feedback.retrieved.length > 0 && (
            <details>
              <summary>{t('practice.sources')} ({feedback.retrieved.length})</summary>
              <ul>
                {feedback.retrieved.map((r) => (
                  <li key={r.chunk.id}>
                    <code>[#{r.chunk.id}]</code> {r.chunk.text}
                    <span className="muted"> — {r.chunk.source}</span>
                    <FigureList assets={r.chunk.metadata?.figures} lang={lang} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {feedback && !feedback.insufficient && (
        <section className="card">
          <h2>{t('practice.reflectionTitle')}</h2>

          <label htmlFor="self-result">{t('common.submit')}</label>
          <div className="row" id="self-result">
            {(['correct', 'partial', 'incorrect'] as ExerciseResult[]).map((r) => (
              <button key={r} type="button" aria-pressed={selfResult === r} className={selfResult === r ? 'primary' : ''} onClick={() => setSelfResult(r)}>
                {r}
              </button>
            ))}
          </div>

          <label htmlFor="confidence" style={{ marginTop: '0.8rem', display: 'block' }}>
            {t('practice.confidence')}: {Math.round(confidence * 100)}%
          </label>
          <input id="confidence" type="range" min={0} max={1} step={0.1} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />

          <div className="grid" style={{ marginTop: '0.8rem' }}>
            <label>{t('practice.reflectDifficult')}
              <input value={reflection.difficult} onChange={(e) => setReflection({ ...reflection, difficult: e.target.value })} />
            </label>
            <label>{t('practice.reflectRule')}
              <input value={reflection.rule} onChange={(e) => setReflection({ ...reflection, rule: e.target.value })} />
            </label>
            <label>{t('practice.reflectNext')}
              <input value={reflection.next} onChange={(e) => setReflection({ ...reflection, next: e.target.value })} />
            </label>
          </div>

          <button type="button" className="primary" style={{ marginTop: '0.8rem' }} onClick={() => void save()} disabled={saved}>
            {saved ? '✓' : ''} {t('practice.saveResult')}
          </button>
        </section>
      )}
    </div>
  )
}

function promptInstruction(lang: string): string {
  if (lang === 'ru') return 'Напишите краткое объяснение и пример.'
  if (lang === 'ro') return 'Scrie o explicație scurtă și un exemplu.'
  return 'Write a short explanation and an example.'
}

function resultToScore(r: ExerciseResult): number {
  return { correct: 1, partial: 0.5, incorrect: 0, skipped: 0 }[r]
}

function ttsLang(lang: string): string {
  return { ru: 'ru-RU', ro: 'ro-RO', en: 'en-US' }[lang] ?? 'en-US'
}
