import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { loadDashboard, type DashboardData } from '@/services'
import { getTopic } from '@/data/subjectRegistry'
import { examPapersForSubject } from '@/data/exams'
import { useAppStore } from '@/app/store'
import { localize } from '@/i18n/localize'
import { StatCard, DeltaBadge, ScoreBar } from '@/components/widgets'

export function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const profile = useAppStore((s) => s.profile)
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    if (!profile) return
    void loadDashboard(profile.currentSubjectId, {
      studyMode: profile.studyMode,
      ...(profile.examDate ? { examDate: profile.examDate } : {}),
    }).then(setData)
  }, [profile])

  if (!profile || !data) return <p>{t('common.loading')}</p>
  const lang = profile.interfaceLanguage

  const topicTitle = (topicId: string) =>
    localize(getTopic(profile.currentSubjectId, topicId)?.title, lang) || topicId

  const hasActivity = data.comparison.vsLastMonth.current.count > 0 || data.xp > 0
  // "Readiness" is a real mastery-based estimate for every subject, but it's
  // only checked against an actual official exam (ExamPaper + barem) for
  // subjects that have one — for the rest it's honest to say so, rather than
  // let it read as "you're ready for the real test" when no real test was
  // ever involved (see the "насколько актуальны тесты по разделам" analysis).
  const hasRealExam = examPapersForSubject(profile.currentSubjectId).length > 0

  return (
    <div>
      <h1>{t('dashboard.title')}</h1>

      {!hasActivity && (
        <p className="warning">
          {t('dashboard.noData')}{' '}
          <button type="button" className="primary" onClick={() => navigate('/diagnostic')}>
            {t('nav.diagnostic')}
          </button>
        </p>
      )}

      <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
        <StatCard
          label={t('dashboard.readiness')}
          value={`${Math.round(data.readiness * 100)}%`}
          hint={!hasRealExam ? t('dashboard.readinessEstimateNote') : undefined}
        />
        <StatCard label={t('dashboard.streak')} value={`${data.streakDays} ${t('dashboard.days')}`} />
        <StatCard label={t('dashboard.xp')} value={`${data.xp} · L${data.level}`} />
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <ScoreBar value={data.readiness} label={t('dashboard.readiness')} />
        <div className="grid cols-3" style={{ marginTop: '0.8rem' }}>
          <div>
            <div className="muted">{t('dashboard.vsYesterday')}</div>
            <DeltaBadge delta={data.comparison.vsYesterday.deltaScore} />
          </div>
          <div>
            <div className="muted">{t('dashboard.vsLastWeek')}</div>
            <DeltaBadge delta={data.comparison.vsLastWeek.deltaScore} />
          </div>
          <div>
            <div className="muted">{t('dashboard.vsLastMonth')}</div>
            <DeltaBadge delta={data.comparison.vsLastMonth.deltaScore} />
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <section className="card">
          <h2>{t('dashboard.weakTopics')}</h2>
          {data.weakTopics.length === 0 ? (
            <p className="muted">—</p>
          ) : (
            <ul>
              {data.weakTopics.slice(0, 6).map((m) => (
                <li key={m.topicId}>
                  {topicTitle(m.topicId)}{' '}
                  <span className="badge">
                    {Math.round(m.masteryScore * 100)}%
                    {m.weakReason ? ` · ${t(`weakReason.${m.weakReason}`)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>
            {profile.studyMode === 'sprint' ? t('dashboard.sprintPriority') : t('dashboard.recommended')}
          </h2>
          <ol>
            {data.sessionPlan.map((r) => (
              <li key={r.topicId} style={{ marginBottom: '0.4rem' }}>
                {topicTitle(r.topicId)}
                <button
                  type="button"
                  style={{ marginLeft: '0.5rem' }}
                  onClick={() =>
                    navigate(`/practice?topic=${encodeURIComponent(r.topicId)}`)
                  }
                >
                  {t('dashboard.practiceNow')}
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>🏅</h2>
        <div className="row">
          {data.badges.map((b) => (
            <span key={b.id} className="badge" style={{ opacity: b.earned ? 1 : 0.4 }}>
              {b.earned ? '✓' : '·'} {t(b.labelKey)}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
