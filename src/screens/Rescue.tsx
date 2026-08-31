import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BaremResult, ExamPaper, RescueForecast, RescueSession, RescueSkillEvidence, RescueSkillTag, SubjectId } from '@/types'
import { getExamPaper, examPapersForSubject } from '@/data/exams'
import { demoAttempt } from '@/data/exams/demoAttempt'
import { microdrillsForSkill } from '@/data/exams/microdrills'
import { runDiagnostic, diagnosticFromAttempt, runDrillsForSkill, buildForecast, selectTestBPaper } from '@/services'
import { RESCUE_CONFIG } from '@/learning'
import { examAttemptRepo, rescueSessionRepo } from '@/storage'
import { useAppStore } from '@/app/store'
import { newId, nowIso } from '@/app/ids'
import { StatCard, ScoreBar } from '@/components/widgets'
import { FigureList } from '@/components/FigureView'

type Phase = 'intro' | 'diagnosing' | 'route' | 'drill' | 'final' | 'testB-intro' | 'testB-grading' | 'testB-done'

// Rescue Mode's skill catalog (RESCUE_CONFIG.perSkill), microdrills and route
// engine are currently authored for the Romanian pr26/sb26 papers only — see
// docs/superpowers/plans/2026-08-11-exam-rescue-mode.md. Keyed explicitly by
// subject (rather than falling back to examPapersForSubject(...)[0]) so this
// never silently picks the wrong paper for a subject it isn't tuned for —
// romanian's own /exam screen deliberately uses pr26 first, sb26 as the
// separate diagnostic (see src/data/exams/index.ts), so reusing "paper #1"
// here would be wrong even for romanian. Other subjects fall through to the
// existing "no paper" empty state until Rescue Mode is generalized per-subject.
const DIAGNOSTIC_PAPER_ID_BY_SUBJECT: Partial<Record<SubjectId, string>> = {
  romanian: 'ro-sb26',
}

export function Rescue() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const providerConfig = useAppStore((s) => s.providerConfig)
  const apiKey = useAppStore((s) => s.apiKey)

  const diagnosticPaperId = profile ? DIAGNOSTIC_PAPER_ID_BY_SUBJECT[profile.currentSubjectId] : undefined
  const paper = diagnosticPaperId ? getExamPaper(diagnosticPaperId) : undefined
  const lang = profile?.interfaceLanguage ?? 'ru'

  const [phase, setPhase] = useState<Phase>('intro')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [officialScore, setOfficialScore] = useState(0)
  const [evidence, setEvidence] = useState<RescueSkillEvidence[]>([])
  const [route, setRoute] = useState<RescueSkillTag[]>([])
  const [activeSkillIndex, setActiveSkillIndex] = useState(0)
  const [drillAnswers, setDrillAnswers] = useState<Record<string, string>>({})
  const [drillResultsBySkill, setDrillResultsBySkill] = useState<{ skillTag: RescueSkillTag; results: BaremResult[] }[]>([])
  const [forecast, setForecast] = useState<RescueForecast | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [session, setSession] = useState<RescueSession | null>(null)
  const [testBPaper, setTestBPaper] = useState<ExamPaper | undefined>(undefined)
  const [testBAnswers, setTestBAnswers] = useState<Record<string, string>>({})
  const [testBScore, setTestBScore] = useState<{ awarded: number; max: number } | null>(null)
  const [isDemo, setIsDemo] = useState(false)

  if (!profile) return <p>{t('common.loading')}</p>
  if (!paper) return <p>{t('exam.noPaper')}</p>

  // Seeded DEMO diagnostic — a pre-graded sample attempt run through the real
  // route engine, entirely in memory (no grading call, no IndexedDB write, no
  // session, never in Stats/exports). Lets a reviewer see the whole flow with
  // nothing to type and no provider.
  function loadDemoDiagnostic() {
    const res = diagnosticFromAttempt(paper!, demoAttempt)
    setOfficialScore(demoAttempt.totalAwarded)
    setEvidence(res.evidence)
    setRoute(res.route)
    setIsDemo(true)
    setPhase('route')
  }

  async function startDiagnostic() {
    if (!profile || submitting) return
    setSubmitting(true)
    setPhase('diagnosing')
    const result = await runDiagnostic(paper!, answers, {
      supportLanguage: lang, providerConfig, apiKey, subjectId: profile.currentSubjectId,
    })
    await examAttemptRepo.add(result.attempt)
    const newSession: RescueSession = {
      id: newId('rescue-session'),
      subjectId: profile.currentSubjectId,
      diagnosticAttemptId: result.attempt.id,
      diagnosticPaperId: paper!.id,
      seenPaperIds: [paper!.id],
      selectedSkills: result.route,
      skillEvidence: result.evidence,
      drillResults: [],
      forecastHistory: [],
      startedAt: nowIso(),
      updatedAt: nowIso(),
    }
    await rescueSessionRepo.add(newSession)
    setSession(newSession)
    setOfficialScore(result.attempt.totalAwarded)
    setEvidence(result.evidence)
    setRoute(result.route)
    setSubmitting(false)
    if (result.route.length === 0) {
      const initialForecast = buildForecast(result.attempt.totalAwarded, [], [], paper!.totalPoints)
      setForecast(initialForecast)
      await rescueSessionRepo.update({ ...newSession, forecastHistory: [initialForecast], updatedAt: nowIso() })
      setPhase('final')
    } else {
      setPhase('route')
    }
  }

  async function submitDrillsForCurrentSkill() {
    if (!profile || submitting) return
    setSubmitting(true)
    const skillTag = route[activeSkillIndex]!
    const results = await runDrillsForSkill(skillTag, drillAnswers, {
      supportLanguage: lang, providerConfig, apiKey, subjectId: profile.currentSubjectId,
    })
    const updated = [...drillResultsBySkill, { skillTag, results }]
    setDrillResultsBySkill(updated)
    setDrillAnswers({})
    setSubmitting(false)

    if (activeSkillIndex + 1 < route.length) {
      setActiveSkillIndex((i) => i + 1)
    } else {
      const perSkillLostPoints = route.map((tag) => {
        const ev = evidence.find((e) => e.skillTag === tag)!
        return { skillTag: tag, lostPoints: ev.maxPoints - ev.earnedPoints }
      })
      const finalForecast = buildForecast(officialScore, perSkillLostPoints, updated, paper!.totalPoints)
      setForecast(finalForecast)
      if (session) {
        const updatedSession: RescueSession = {
          ...session,
          drillResults: updated,
          forecastHistory: [...session.forecastHistory, finalForecast],
          updatedAt: nowIso(),
        }
        await rescueSessionRepo.update(updatedSession)
        setSession(updatedSession)
      }
      setPhase('final')
    }
  }

  // Test B: a fresh, un-drilled variant of the same paper family — confirms the
  // trained skills actually transfer, rather than the student having just
  // re-learned the diagnostic's specific items. See selectTestBPaper (rescueService.ts).
  async function startTestB() {
    if (!profile || !session || submitting) return
    const attempts = await examAttemptRepo.listBySubject(profile.currentSubjectId)
    const attemptedPaperIds = new Set(attempts.map((a) => a.paperId))
    const picked = selectTestBPaper(
      examPapersForSubject(profile.currentSubjectId),
      paper!,
      attemptedPaperIds,
    )
    if (!picked) return // no second registered paper for this subject yet
    setTestBPaper(picked)
    setTestBAnswers({})
    setPhase('testB-intro')
  }

  async function submitTestB() {
    if (!profile || !session || !testBPaper || submitting) return
    setSubmitting(true)
    setPhase('testB-grading')
    const result = await runDiagnostic(testBPaper, testBAnswers, {
      supportLanguage: lang, providerConfig, apiKey, subjectId: profile.currentSubjectId,
    })
    await examAttemptRepo.add(result.attempt)
    const updatedSession: RescueSession = {
      ...session,
      seenPaperIds: [...session.seenPaperIds, testBPaper.id],
      testBPaperId: testBPaper.id,
      testBAttemptId: result.attempt.id,
      updatedAt: nowIso(),
    }
    await rescueSessionRepo.update(updatedSession)
    setSession(updatedSession)
    setTestBScore({ awarded: result.attempt.totalAwarded, max: testBPaper.totalPoints })
    setSubmitting(false)
    setPhase('testB-done')
  }

  const safe = evidence.filter((e) => e.state === 'likelyStrong' || e.state === 'confirmedStrong')
  const recoverable = evidence.filter((e) => e.state === 'recoverable')
  const expensive = evidence.filter((e) => e.state === 'expensive')
  const activeSkill = route[activeSkillIndex]
  const activeDrills = activeSkill ? microdrillsForSkill(activeSkill) : []

  return (
    <div>
      <h1>{t('rescue.title')}</h1>
      {isDemo && <p className="warning">{t('rescue.demoBanner')}</p>}

      {phase === 'intro' && (
        <section className="card">
          <p>{t('rescue.intro')}</p>
          <p>
            <button type="button" onClick={loadDemoDiagnostic}>
              {t('rescue.openDemoDiagnostic')}
            </button>
          </p>
          {paper.sourceText && (
            <details open>
              <summary>{t('exam.readingText')}</summary>
              <p
                style={{ whiteSpace: 'pre-wrap' }}
                lang="ro"
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
              >
                {paper.sourceText}
              </p>
            </details>
          )}
          <FigureList assets={paper.sourceAssets} lang={lang} />
          {paper.items.map((item) => (
            <div key={item.id} style={{ marginTop: '0.6rem' }}>
              <label htmlFor={`rescue-ans-${item.id}`}>{item.order}. {item.prompt}</label>
              <FigureList assets={item.assets} lang={lang} />
              <textarea
                id={`rescue-ans-${item.id}`}
                value={answers[item.id] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [item.id]: e.target.value }))}
              />
            </div>
          ))}
          <button type="button" className="primary" onClick={() => void startDiagnostic()} disabled={submitting}>
            {t('rescue.startDiagnostic')}
          </button>
        </section>
      )}

      {phase === 'diagnosing' && <p role="status">{t('rescue.grading')}</p>}

      {(phase === 'route' || phase === 'final') && (
        <section className="card">
          <StatCard label={t('rescue.currentResult')} value={`${officialScore} / ${paper.totalPoints}`} />
          <ScoreBar value={officialScore / paper.totalPoints} />
          <p>{t('rescue.passThreshold')}: {RESCUE_CONFIG.passThreshold}</p>
          <p>{t('rescue.safetyTarget')}: {RESCUE_CONFIG.safetyTarget}</p>
          {officialScore >= RESCUE_CONFIG.safetyTarget && <p>{t('rescue.alreadySafe')}</p>}

          <h2>🟢 {t('rescue.safeZoneTitle')}</h2>
          <ul>{safe.map((e) => <li key={e.skillTag}>{t(`rescue.skillTag.${e.skillTag}`)}</li>)}</ul>

          <h2>🟡 {t('rescue.recoverableZoneTitle')}</h2>
          <ul>
            {recoverable.map((e) => (
              <li key={e.skillTag}>
                {t(`rescue.skillTag.${e.skillTag}`)} +{e.estimatedRecoverablePoints.toFixed(1)}
              </li>
            ))}
          </ul>

          {expensive.length > 0 && (
            <>
              <h2>🔴 {t('rescue.expensiveZoneTitle')}</h2>
              <ul>{expensive.map((e) => <li key={e.skillTag}>{t(`rescue.skillTag.${e.skillTag}`)}</li>)}</ul>
            </>
          )}

          {phase === 'route' && route.length > 0 && (
            <button type="button" className="primary" onClick={() => setPhase('drill')}>
              {t('rescue.startRoute', {
                points: route.reduce((s, tag) => s + (evidence.find((e) => e.skillTag === tag)?.estimatedRecoverablePoints ?? 0), 0).toFixed(1),
              })}
            </button>
          )}
        </section>
      )}

      {phase === 'drill' && activeSkill && (
        <section className="card">
          <h2>{t(`rescue.skillTag.${activeSkill}`)}</h2>
          {activeDrills.map((drill, i) => (
            <div key={drill.id} style={{ marginBottom: '0.6rem' }}>
              <p>{t('rescue.drillProgress', { current: i + 1, total: activeDrills.length })}</p>
              <p>{drill.prompt}</p>
              <FigureList assets={drill.assets} lang={lang} />
              <textarea
                value={drillAnswers[drill.id] ?? ''}
                onChange={(e) => setDrillAnswers((a) => ({ ...a, [drill.id]: e.target.value }))}
              />
            </div>
          ))}
          <button type="button" className="primary" onClick={() => void submitDrillsForCurrentSkill()} disabled={submitting}>
            {t('rescue.drillDone')}
          </button>
        </section>
      )}

      {phase === 'final' && forecast && (
        <section className="card">
          <p>{t('rescue.before')}: {forecast.officialScore}</p>
          <p>{t('rescue.confirmedGain')}: +{forecast.confirmedGain.toFixed(1)}</p>
          <p>{t('rescue.potentialGain')}: +{forecast.potentialGain.toFixed(1)}</p>
          <p><strong>{t('rescue.conservativeForecast')}: {Math.round(forecast.conservativeForecast)}</strong></p>
          <p>{t('rescue.expectedForecast')}: {Math.round(forecast.expectedForecast)}</p>
          {testBScore ? (
            <p>
              Test B ({testBPaper?.title}): {testBScore.awarded} / {testBScore.max} —{' '}
              <strong>
                {testBScore.awarded / testBScore.max >= officialScore / paper.totalPoints
                  ? t('rescue.transferConfirmed')
                  : t('rescue.transferNotConfirmed')}
              </strong>
            </p>
          ) : (
            !isDemo &&
            examPapersForSubject(profile!.currentSubjectId, profile!.curriculumProfile).length > 1 && (
              <>
                <p className="muted">{t('rescue.testBIntro')}</p>
                <button type="button" onClick={() => void startTestB()} disabled={submitting}>
                  {t('rescue.startTestB')}
                </button>
              </>
            )
          )}
        </section>
      )}

      {phase === 'testB-intro' && testBPaper && (
        <section className="card">
          <h2>{t('rescue.startTestB')}</h2>
          <p className="muted">{testBPaper.title}</p>
          {testBPaper.sourceText && (
            <details open>
              <summary>{t('exam.readingText')}</summary>
              <p
                style={{ whiteSpace: 'pre-wrap' }}
                lang="ro"
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
              >
                {testBPaper.sourceText}
              </p>
            </details>
          )}
          <FigureList assets={testBPaper.sourceAssets} lang={lang} />
          {testBPaper.items.map((item) => (
            <div key={item.id} style={{ marginTop: '0.6rem' }}>
              <label htmlFor={`testb-ans-${item.id}`}>{item.order}. {item.prompt}</label>
              <FigureList assets={item.assets} lang={lang} />
              <textarea
                id={`testb-ans-${item.id}`}
                value={testBAnswers[item.id] ?? ''}
                onChange={(e) => setTestBAnswers((a) => ({ ...a, [item.id]: e.target.value }))}
              />
            </div>
          ))}
          <button type="button" className="primary" onClick={() => void submitTestB()} disabled={submitting}>
            {t('exam.submit')}
          </button>
        </section>
      )}

      {phase === 'testB-grading' && <p role="status">{t('rescue.grading')}</p>}

      {phase === 'testB-done' && testBScore && (
        <section className="card">
          <p>
            Test B: {testBScore.awarded} / {testBScore.max}
          </p>
          <p>
            <strong>
              {testBScore.awarded / testBScore.max >= officialScore / paper.totalPoints
                ? t('rescue.transferConfirmed')
                : t('rescue.transferNotConfirmed')}
            </strong>
          </p>
          <button type="button" className="primary" onClick={() => setPhase('final')}>
            {t('common.back')}
          </button>
        </section>
      )}
    </div>
  )
}
