import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CurriculumProfile, InterfaceLanguage, StudyMode, SubjectId, ThemeMode } from '@/types'
import { listSubjects } from '@/data/subjectRegistry'
import {
  PROVIDER_PRESETS,
  isCloudProvider,
  checkProxyCapability,
  visibleProviderIds,
  type LLMProviderConfig,
  type ProxyCapability,
} from '@/llm'
import { subjectDataManager } from '@/packs'
import { applyAppearance } from '@/theme/applyAppearance'
import { setLanguage, SUPPORTED_LANGUAGES } from '@/i18n'
import { localize } from '@/i18n/localize'
import { useAppStore } from '@/app/store'

// Transport-only "nothing detected yet" — Mock is the default regardless, and
// `worker` (managed chat) only appears once a deployment reports it enabled.
const NO_CAPABILITY: ProxyCapability = {
  available: false,
  embeddingsConfigured: false,
  chatConfigured: false,
}

export function Onboarding() {
  const { t } = useTranslation()
  const completeOnboarding = useAppStore((s) => s.completeOnboarding)

  const [language, setLang] = useState<InterfaceLanguage>('ru')
  const [theme, setTheme] = useState<ThemeMode>('light')
  const [dyslexia, setDyslexia] = useState(false)
  const [studyMode, setStudyMode] = useState<StudyMode>('sprint')
  const [subjectId, setSubjectId] = useState<SubjectId>('romanian')
  const [curriculumProfile, setCurriculumProfile] = useState<CurriculumProfile | ''>('')
  // Mock is the zero-setup default for every run mode, the deployed site
  // included — it is grounded and deterministic, so the whole workflow is
  // inspectable with no key and no team-funded spend. The capability probe
  // (below) never changes this selection; it only reveals `worker` (managed
  // chat) when a deployment has explicitly enabled it.
  const [providerId, setProviderId] = useState<string>('mock')
  const [capability, setCapability] = useState<ProxyCapability>(NO_CAPABILITY)
  // Once the user picks a provider by hand, nothing overrides it.
  const providerTouched = useRef(false)
  const [examDate, setExamDate] = useState('')
  const [busy, setBusy] = useState(false)

  const subjects = listSubjects()
  const provider = PROVIDER_PRESETS[providerId] as LLMProviderConfig
  const providerOrder = visibleProviderIds(capability)

  useEffect(() => {
    let cancelled = false
    void checkProxyCapability().then((cap) => {
      if (cancelled) return
      setCapability(cap)
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
        <p className="muted">{t('llm.hostedRetrievalNote')}</p>
        <div className="grid cols-2">
          {providerOrder.map((id) => {
            const p = PROVIDER_PRESETS[id] as LLMProviderConfig
            return (
              <button key={id} type="button" aria-pressed={providerId === id} className={providerId === id ? 'primary' : ''} onClick={() => selectProvider(id)} style={{ textAlign: 'left' }}>
                {p.name}
              </button>
            )
          })}
        </div>
        {isCloudProvider(provider) && <p className="warning" style={{ marginTop: '0.7rem' }}>⚠️ {t('llm.cloudWarning')}</p>}
        {provider.apiKeyMode === 'user_key' && <p className="muted">{t('llm.byokHint')}</p>}
      </section>

      <button type="button" className="primary" disabled={busy} onClick={() => void finish()} style={{ fontSize: '1.1rem', padding: '0.8rem 1.4rem' }}>
        {busy ? t('common.loading') : t('onboarding.finish')}
      </button>
    </div>
  )
}
