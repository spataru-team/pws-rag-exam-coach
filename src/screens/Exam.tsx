import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BaremResult, ExamAttempt, ExamFeedback } from '@/types'
import { examPapersForSubject } from '@/data/exams'
import { gradeAttempt } from '@/services'
import { examAttemptRepo } from '@/storage'
import { useAppStore } from '@/app/store'
import { newId, nowIso } from '@/app/ids'
import { FigureList } from '@/components/FigureView'

type Phase = 'intro' | 'inprogress' | 'grading' | 'results'

/** Anti-cheat: auto-submit the exam after this many tab-leaves. */
const AUTO_SUBMIT_AFTER = 5

export function Exam() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const providerConfig = useAppStore((s) => s.providerConfig)
  const apiKey = useAppStore((s) => s.apiKey)

  // [0] of the full list is still the curated default (see src/data/exams/index.ts —
  // deliberately NOT "most recent", per docs/superpowers/specs/2026-08-11-exam-rescue-mode-design.md).
  // Profile-matching is an orthogonal, additive filter on top of that curation: when the
  // student's curriculumProfile is known, prefer [0] of the profile-matching subset; if
  // that subset is empty (only the other track is registered so far), fall back to the
  // unfiltered [0] rather than showing "no paper" when one does technically exist.
  const paper = profile
    ? (examPapersForSubject(profile.currentSubjectId, profile.curriculumProfile)[0] ??
      examPapersForSubject(profile.currentSubjectId)[0])
    : undefined
  const lang = profile?.interfaceLanguage ?? 'ru'

  const [phase, setPhase] = useState<Phase>('intro')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [results, setResults] = useState<BaremResult[]>([])
  const [totalAwarded, setTotalAwarded] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [tabLeaves, setTabLeaves] = useState(0)
  const [submittedAttempt, setSubmittedAttempt] = useState<ExamAttempt | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<ExamFeedback>({ clear: true, useful: true, comment: '' })
  const [feedbackSaved, setFeedbackSaved] = useState(false)
  const startRef = useRef<number>(0)

  async function submit() {
    if (!profile || !paper || submitting) return
    setSubmitting(true)
    setPhase('grading')
    try {
      const graded = await gradeAttempt(paper, answers, {
        supportLanguage: lang,
        providerConfig,
        apiKey,
        subjectId: profile.currentSubjectId,
      })
      const attempt: ExamAttempt = {
        id: newId('exam'),
        subjectId: profile.currentSubjectId,
        paperId: paper.id,
        startedAt: new Date(startRef.current).toISOString(),
        submittedAt: nowIso(),
        timeSpentSec: elapsed,
        answersByItemId: answers,
        results: graded.results,
        totalAwarded: graded.totalAwarded,
        totalMax: graded.totalMax,
        tabLeaves,
      }
      await examAttemptRepo.add(attempt)
      setSubmittedAttempt(attempt)
      setResults(graded.results)
      setTotalAwarded(graded.totalAwarded)
      setPhase('results')
    } catch {
      // Grading failed unexpectedly — return to the exam so the student can retry.
      setPhase('inprogress')
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (phase !== 'inprogress') return
    startRef.current = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [phase])

  // Anti-cheat: browsers cannot block tab/app switching, but we can detect it.
  // Count each time the exam tab is hidden during the exam; the count is shown
  // to the student and saved with the attempt for the teacher.
  useEffect(() => {
    if (phase !== 'inprogress') return
    const onHidden = () => {
      if (document.hidden) setTabLeaves((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [phase])

  // Anti-cheat: after AUTO_SUBMIT_AFTER tab-leaves, submit the exam automatically.
  // submit() reads the latest answers from this render's closure.
  useEffect(() => {
    if (phase !== 'inprogress' || tabLeaves < AUTO_SUBMIT_AFTER || submitting) return
    // Defer out of the effect body so submit()'s setState isn't called synchronously.
    const id = setTimeout(() => void submit(), 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabLeaves, phase, submitting])

  if (!profile) return <p>{t('common.loading')}</p>
  if (!paper) return <p>{t('exam.noPaper')}</p>

  const remaining = Math.max(0, paper.timeLimitMin * 60 - elapsed)
  const mmss = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`

  async function saveFeedback() {
    if (!submittedAttempt) return
    await examAttemptRepo.add({ ...submittedAttempt, feedback }) // put = upsert by id
    setFeedbackSaved(true)
  }

  return (
    // Anti-cheat: block the right-click context menu across the exam screen.
    <div onContextMenu={(e) => e.preventDefault()}>
      <h1>{t('exam.title')}</h1>
      <p className="muted">{paper.title}</p>

      {phase === 'intro' && (
        <section className="card">
          <p>{t('exam.intro', { points: paper.totalPoints, minutes: paper.timeLimitMin })}</p>
          {paper.sourceText && (
            <details>
              <summary>{t('exam.readingText')}</summary>
              <p
              style={{ whiteSpace: 'pre-wrap' }}
              lang="ro"
              // Anti-cheat: block copying the reading text out of the exam.
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
            >
              {paper.sourceText}
            </p>
            </details>
          )}
          <FigureList assets={paper.sourceAssets} lang={lang} />
          <button type="button" className="primary" onClick={() => setPhase('inprogress')}>
            {t('exam.start')}
          </button>
        </section>
      )}

      {phase === 'inprogress' && (
        <>
          <p className="warning" role="status">⏱️ {t('exam.timeLeft')}: {mmss}</p>
          {tabLeaves > 0 && (
            <p className="warning" role="alert">⚠️ {t('exam.tabWarning', { count: tabLeaves, max: AUTO_SUBMIT_AFTER })}</p>
          )}
          {paper.sourceText && (
            <details open>
              <summary>{t('exam.readingText')}</summary>
              <p
              style={{ whiteSpace: 'pre-wrap' }}
              lang="ro"
              // Anti-cheat: block copying the reading text out of the exam.
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
            >
              {paper.sourceText}
            </p>
            </details>
          )}
          <FigureList assets={paper.sourceAssets} lang={lang} />
          {paper.items.map((item) => (
            <section key={item.id} className="card" style={{ marginBottom: '1rem' }}>
              <p><strong>{item.order}.</strong> {item.prompt} <span className="muted">({item.maxPoints} p.)</span></p>
              <FigureList assets={item.assets} lang={lang} />
              <label htmlFor={`ans-${item.id}`} className="visually-hidden">{t('exam.yourAnswer')} {item.order}</label>
              <textarea
                id={`ans-${item.id}`}
                lang="ro"
                spellCheck
                value={answers[item.id] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [item.id]: e.target.value }))}
                // Anti-cheat: block pasting answers into exam fields (Ctrl-V,
                // context-menu and middle-click paste, plus drag-and-drop text).
                onPaste={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
                title={t('exam.noPaste')}
              />
            </section>
          ))}
          <button type="button" className="primary" onClick={() => void submit()} disabled={submitting}>
            {t('exam.submit')}
          </button>
        </>
      )}

      {phase === 'grading' && <p role="status">{t('exam.grading')}</p>}

      {phase === 'results' && (
        <>
          <section className="card">
            <h2>{t('exam.total')}: {totalAwarded} / {paper.totalPoints}</h2>
          </section>
          {paper.items.map((item) => {
            const r = results.find((x) => x.itemId === item.id)
            if (!r) return null
            return (
              <section key={item.id} className="card" style={{ marginBottom: '1rem' }}>
                <p><strong>{item.order}.</strong> {r.awarded} / {r.max} <span className="muted">· {t(`exam.mode.${r.mode}`)}</span></p>
                <FigureList assets={item.assets} lang={lang} />
                {r.lowConfidence && <p className="muted">{t('exam.lowConfidence')}</p>}
                {r.perCriterion.filter((c) => c.comment).map((c) => (
                  <p key={c.id} style={{ margin: '0.2rem 0' }}>• {c.awarded}/{c.max} — {c.comment}</p>
                ))}
                {r.advice && <p><em>{t('exam.advice')}:</em> {r.advice}</p>}
              </section>
            )
          })}

          <section className="card">
            <h2>{t('exam.feedbackTitle')}</h2>
            <label className="row" style={{ gap: '0.5rem' }}>
              <input type="checkbox" checked={feedback.clear} onChange={(e) => setFeedback((f) => ({ ...f, clear: e.target.checked }))} />
              {t('exam.clear')}
            </label>
            <label className="row" style={{ gap: '0.5rem' }}>
              <input type="checkbox" checked={feedback.useful} onChange={(e) => setFeedback((f) => ({ ...f, useful: e.target.checked }))} />
              {t('exam.useful')}
            </label>
            <label>{t('exam.comment')}
              <input value={feedback.comment ?? ''} onChange={(e) => setFeedback((f) => ({ ...f, comment: e.target.value }))} />
            </label>
            <button type="button" className="primary" style={{ marginTop: '0.6rem' }} onClick={() => void saveFeedback()} disabled={feedbackSaved}>
              {feedbackSaved ? `✓ ${t('exam.saved')}` : t('exam.saveFeedback')}
            </button>
          </section>
        </>
      )}
    </div>
  )
}
