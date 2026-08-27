import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { TopicMastery } from '@/types'
import { getSubject } from '@/data/subjectRegistry'
import { masteryRepo } from '@/storage'
import { useAppStore } from '@/app/store'
import { localize } from '@/i18n/localize'

export function Review() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const profile = useAppStore((s) => s.profile)
  const subject = profile ? getSubject(profile.currentSubjectId) : undefined
  const lang = profile?.interfaceLanguage ?? 'ru'
  const [masteries, setMasteries] = useState<TopicMastery[]>([])

  useEffect(() => {
    if (profile) void masteryRepo.listBySubject(profile.currentSubjectId).then(setMasteries)
  }, [profile])

  if (!profile || !subject) return <p>{t('common.loading')}</p>
  const topics = subject.topicTree

  const go = (topicId: string) => navigate(`/practice?topic=${encodeURIComponent(topicId)}`)

  function randomTopic() {
    const pick = topics[Math.floor(Math.random() * topics.length)]
    if (pick) go(pick.id)
  }
  function weakTopic() {
    const weak = [...masteries].sort((a, b) => a.masteryScore - b.masteryScore)[0]
    go(weak?.topicId ?? topics[0]?.id ?? '')
  }
  function teacherTopic() {
    const core = topics.find((t2) => t2.examRelevance === 'core') ?? topics[0]
    if (core) go(core.id)
  }

  return (
    <div>
      <h1>{t('review.title')}</h1>
      <div className="grid cols-2" style={{ marginBottom: '1rem' }}>
        <button type="button" className="primary" onClick={randomTopic}>🎲 {t('review.random')}</button>
        <button type="button" onClick={weakTopic} disabled={masteries.length === 0}>📉 {t('review.weak')}</button>
        <button type="button" onClick={teacherTopic}>👩‍🏫 {t('review.teacher')}</button>
      </div>

      <section className="card">
        <h2>{t('review.byTree')}</h2>
        <ul>
          {topics.map((topic) => (
            <li key={topic.id} style={{ marginLeft: topic.parentTopicId ? '1.2rem' : 0, marginBottom: '0.3rem' }}>
              <button type="button" onClick={() => go(topic.id)}>
                {localize(topic.title, lang)}
              </button>{' '}
              <span className="badge">{topic.examRelevance}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
