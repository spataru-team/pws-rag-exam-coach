import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CurriculumProfile, InterfaceLanguage, StudyMode, SubjectId, ThemeMode } from '@/types'
import { listSubjects } from '@/data/subjectRegistry'
import {
  PROVIDER_PRESETS,
  isCloudProvider,
  checkProxyCapability,
  pickInitialProviderId,
  type LLMProviderConfig,
} from '@/llm'
import { subjectDataManager } from '@/packs'
import { applyAppearance } from '@/theme/applyAppearance'
import { setLanguage, SUPPORTED_LANGUAGES } from '@/i18n'
import { localize } from '@/i18n/localize'
import { useAppStore } from '@/app/store'

// Mock first — it is the zero-setup default for `npm run dev` / `npm run preview`
// and needs no running server or key.
const PROVIDER_ORDER = ['mock', 'worker', 'ollama', 'lmstudio', 'openvino', 'openai', 'openrouter']

export function Onboarding() {
  const { t } = useTranslation()
  const completeOnboarding = useAppStore((s) => s.completeOnboarding)

  const [language, setLang] = useState<InterfaceLanguage>('ru')
  const [theme, setTheme] = useState<ThemeMode>('light')
  const [dyslexia, setDyslexia] = useState(false)
  const [studyMode, setStudyMode] = useState<StudyMode>('sprint')
  const [subjectId, setSubjectId] = useState<SubjectId>('romanian')
  const [curriculumProfile, setCurriculumProfile] = useState<CurriculumProfile | ''>('')
  // Start synchronously on the offline Mock provider — the only one guaranteed
  // to work under the documented `npm run dev` / `npm run preview`. An async
  // capability probe (below) may upgrade this to the cloud proxy, but ONLY on a
  // deployed / `cf:dev` build where a configured `/api/v1` actually answers.
  const [providerId, setProviderId] = useState<string>('mock')
  // Once the user picks a provider by hand, the probe must never override it.
  const providerTouched = useRef(false)
  const [examDate, setExamDate] = useState('')
  const [busy, setBusy] = useState(false)

  const subjects = listSubjects()
  const provider = PROVIDER_PRESETS[providerId] as LLMProviderConfig

  useEffect(() => {
    let cancelled = false
    void checkProxyCapability().then((cap) => {
      if (cancelled || providerTouched.current) return
      // Never downgrades a manual choice; only lifts the initial Mock to Worker
      // when a configured same-origin proxy is present.
      setProviderId((current) => (current === 'mock' ? pickInitialProviderId(cap) : current))
    })
    return () => {
      cancelled = true
    }
  }, [])

  function selectProvider(id: string) {
    providerTouched.current = true
    setProviderId(id)
  }

  function applyLang(l: InterfaceLanguage) {
    setLang(l)
    setLanguage(l)
  }
  function applyTheme(next: ThemeMode) {
    setTheme(next)
    applyAppearance(next, dyslexia)
  }
  function applyDyslexia(next: boolean) {
    setDyslexia(next)
    applyAppearance(theme, next)
  }

  async function finish() {
    setBusy(true)
    try {
      await subjectDataManager.download(subjectId)
      await completeOnboarding({
        interfaceLanguage: language,
        theme,
        dyslexiaMode: dyslexia,
        studyMode,
        currentSubjectId: subjectId,
        ...(examDate ? { examDate } : {}),
        ...(curriculumProfile ? { curriculumProfile } : {}),
        providerConfig: provider,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1>{t('onboarding.title')}</h1>
      <p className="muted">{t('onboarding.intro')}</p>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('language.label')}</h2>
        <div className="row">
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={language === l}
              className={language === l ? 'primary' : ''}
              onClick={() => applyLang(l)}
            >
              {t(`language.${l}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('theme.label')} · {t('dyslexia.label')}</h2>
        <div className="row">
          <button type="button" aria-pressed={theme === 'light'} className={theme === 'light' ? 'primary' : ''} onClick={() => applyTheme('light')}>
            {t('theme.light')}
          </button>
          <button type="button" aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'primary' : ''} onClick={() => applyTheme('dark')}>
            {t('theme.dark')}
          </button>
          <button type="button" aria-pressed={dyslexia} className={dyslexia ? 'primary' : ''} onClick={() => applyDyslexia(!dyslexia)}>
            {t('dyslexia.label')}
          </button>
        </div>
        <p className="muted">{t('dyslexia.hint')}</p>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('studyMode.label')}</h2>
        <div className="row">
          {(['year_long', 'sprint'] as StudyMode[]).map((m) => (
            <button key={m} type="button" aria-pressed={studyMode === m} className={studyMode === m ? 'primary' : ''} onClick={() => setStudyMode(m)}>
              {t(`studyMode.${m}`)}
            </button>
          ))}
        </div>
        {studyMode === 'sprint' && (
          <p style={{ marginTop: '0.6rem' }}>
            <label htmlFor="exam-date">{t('onboarding.examDate')}</label>
            <input id="exam-date" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </p>
        )}
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('onboarding.chooseSubject')}</h2>
        <div className="grid cols-2">
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={subjectId === s.id}
              className={subjectId === s.id ? 'primary' : ''}
              disabled={!s.enabled}
              onClick={() => setSubjectId(s.id)}
              style={{ textAlign: 'left' }}
            >
              {localize(s.interfaceTitleByLanguage, language)}
              {!s.enabled && <span className="muted"> · {t('common.comingSoon')}</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('curriculumProfile.label')}</h2>
        <p className="muted">{t('curriculumProfile.hint')}</p>
        <div className="row">
          {(['real', 'umanist'] as CurriculumProfile[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={curriculumProfile === p}
              className={curriculumProfile === p ? 'primary' : ''}
              onClick={() => setCurriculumProfile((cur) => (cur === p ? '' : p))}
            >
              {t(`curriculumProfile.${p}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('onboarding.chooseLlm')}</h2>
        <p className="muted">{t('onboarding.aiModeHint')}</p>
        <div className="grid cols-2">
          {PROVIDER_ORDER.map((id) => {
            const p = PROVIDER_PRESETS[id] as LLMProviderConfig
            return (
              <button key={id} type="button" aria-pressed={providerId === id} className={providerId === id ? 'primary' : ''} onClick={() => selectProvider(id)} style={{ textAlign: 'left' }}>
                {p.name}
              </button>
            )
          })}
        </div>
        {isCloudProvider(provider) && <p className="warning" style={{ marginTop: '0.7rem' }}>⚠️ {t('llm.cloudWarning')}</p>}
      </section>

      <button type="button" className="primary" disabled={busy} onClick={() => void finish()} style={{ fontSize: '1.1rem', padding: '0.8rem 1.4rem' }}>
        {busy ? t('common.loading') : t('onboarding.finish')}
      </button>
    </div>
  )
}
