import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SubjectId } from '@/types'
import { listEnabledSubjects } from '@/data/subjectRegistry'
import { subjectDataManager } from '@/packs'
import { localize } from '@/i18n/localize'
import { useAppStore } from '@/app/store'

/**
 * Lets the student change which subject they're currently working on without
 * redoing onboarding — the only way to do this before this component existed
 * (see docs/superpowers/plans, "выбор дисциплины" analysis). Reuses
 * `updateProfile` (a generic patch, already zustand-reactive everywhere) and
 * `subjectDataManager` exactly as Onboarding does, so retrieval never silently
 * returns empty because the pack for a newly-picked subject wasn't downloaded
 * yet.
 */
export function SubjectSwitcher() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const updateProfile = useAppStore((s) => s.updateProfile)
  const [busy, setBusy] = useState(false)

  if (!profile) return null
  const subjects = listEnabledSubjects()
  const lang = profile.interfaceLanguage

  async function selectSubject(id: SubjectId) {
    if (!profile || id === profile.currentSubjectId || busy) return
    setBusy(true)
    try {
      const status = await subjectDataManager.getStatus(id)
      if (!status.downloaded) {
        await subjectDataManager.download(id)
      }
      await updateProfile({
        currentSubjectId: id,
        activeSubjects: Array.from(new Set([...profile.activeSubjects, id])),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="row" role="group" aria-label={t('common.subject')}>
      <label className="visually-hidden" htmlFor="subject-switch">
        {t('common.subject')}
      </label>
      <select
        id="subject-switch"
        value={profile.currentSubjectId}
        disabled={busy}
        onChange={(e) => void selectSubject(e.target.value as SubjectId)}
        style={{ width: 'auto' }}
      >
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {localize(s.interfaceTitleByLanguage, lang)}
          </option>
        ))}
      </select>
      {busy && (
        <span className="muted" role="status">
          {t('common.loading')}
        </span>
      )}
    </div>
  )
}
