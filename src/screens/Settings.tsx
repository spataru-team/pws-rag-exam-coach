import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CurriculumProfile, InterfaceLanguage, SubjectId } from '@/types'
import { listSubjects } from '@/data/subjectRegistry'
import {
  PROVIDER_PRESETS,
  isCloudProvider,
  isOllamaReachable,
  isOvmsReachable,
  checkProxyCapability,
  visibleProviderIds,
  validateProviderConfig,
  type LLMProviderConfig,
  type ProxyCapability,
} from '@/llm'
import {
  DEFAULT_EMBEDDING_CONFIG,
  DEFAULT_OPENAI_EMBED_BASE_URL,
  type EmbeddingRuntimeConfig,
} from '@/rag'
import { subjectDataManager, type PackStatus } from '@/packs'
import { resetAllData, settingsRepo, SETTING_KEYS } from '@/storage'
import { useAppStore } from '@/app/store'
import { localize } from '@/i18n/localize'
import { SUPPORTED_LANGUAGES } from '@/i18n'

export function Settings() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const providerConfig = useAppStore((s) => s.providerConfig)
  const apiKey = useAppStore((s) => s.apiKey)
  const updateProfile = useAppStore((s) => s.updateProfile)
  const setProviderConfig = useAppStore((s) => s.setProviderConfig)
  const setApiKey = useAppStore((s) => s.setApiKey)

  const [statuses, setStatuses] = useState<PackStatus[]>([])
  const [embCfg, setEmbCfg] = useState<EmbeddingRuntimeConfig>(DEFAULT_EMBEDDING_CONFIG)
  const [ollamaAvailable, setOllamaAvailable] = useState(false)
  const [ovmsAvailable, setOvmsAvailable] = useState(false)
  const [capability, setCapability] = useState<ProxyCapability>({
    available: false,
    embeddingsConfigured: false,
    chatConfigured: false,
  })
  const lang = profile?.interfaceLanguage ?? 'ru'

  function loadStatuses() {
    return Promise.all(listSubjects().map((s) => subjectDataManager.getStatus(s.id)))
  }
  async function refreshPacks() {
    setStatuses(await loadStatuses())
  }
  useEffect(() => {
    void loadStatuses().then(setStatuses)
    void settingsRepo
      .get<EmbeddingRuntimeConfig>(SETTING_KEYS.embeddingConfig)
      .then((c) => setEmbCfg(c ?? DEFAULT_EMBEDDING_CONFIG))
  }, [])

  useEffect(() => {
    void isOllamaReachable().then(setOllamaAvailable)
    void isOvmsReachable().then(setOvmsAvailable)
    void checkProxyCapability().then(setCapability)
  }, [])

  // `worker` (managed chat) is offered only where the deployment enabled it;
  // a currently-selected provider is always kept in the list so the user can
  // switch away from it.
  const providerIds = (() => {
    const ids = visibleProviderIds(capability)
    return ids.includes(providerConfig.id) ? ids : [providerConfig.id, ...ids]
  })()

  function saveEmbCfg(next: EmbeddingRuntimeConfig) {
    setEmbCfg(next)
    void settingsRepo.set(SETTING_KEYS.embeddingConfig, next)
  }

  // OVMS serves embeddings, rerank and chat off the same base URL (see
  // ovms/README.md) — one click sets both the chat provider and the
  // embeddings backend consistently, instead of two separate settings that
  // can drift into a broken combination (e.g. chat on OVMS, embeddings still
  // on Ollama).
  function useOvms() {
    void setProviderConfig(PROVIDER_PRESETS.openvino as LLMProviderConfig)
    saveEmbCfg({ backend: 'openai-compatible', baseUrl: DEFAULT_OPENAI_EMBED_BASE_URL })
  }

  if (!profile) return <p>{t('common.loading')}</p>

  async function toggleSubject(subjectId: SubjectId, downloaded: boolean) {
    if (downloaded) {
      await subjectDataManager.remove(subjectId)
      await updateProfile({
        activeSubjects: profile!.activeSubjects.filter((s) => s !== subjectId),
      })
    } else {
      await subjectDataManager.download(subjectId)
      await updateProfile({
        activeSubjects: Array.from(new Set([...profile!.activeSubjects, subjectId])),
      })
    }
    await refreshPacks()
  }

  const validation = validateProviderConfig(providerConfig, apiKey)

  return (
    <div>
      <h1>{t('settings.title')}</h1>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('language.label')} · {t('theme.label')}</h2>
        <div className="row">
          <select value={lang} onChange={(e) => void updateProfile({ interfaceLanguage: e.target.value as InterfaceLanguage })} style={{ width: 'auto' }}>
            {SUPPORTED_LANGUAGES.map((l) => (<option key={l} value={l}>{t(`language.${l}`)}</option>))}
          </select>
          <button type="button" onClick={() => void updateProfile({ theme: profile.theme === 'dark' ? 'light' : 'dark' })}>
            {t(`theme.${profile.theme}`)}
          </button>
          <button type="button" aria-pressed={profile.dyslexiaMode} onClick={() => void updateProfile({ dyslexiaMode: !profile.dyslexiaMode })}>
            {t('dyslexia.label')}: {profile.dyslexiaMode ? t('common.yes') : t('common.no')}
          </button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('curriculumProfile.label')}</h2>
        <p className="muted">{t('curriculumProfile.hint')}</p>
        <select
          value={profile.curriculumProfile ?? ''}
          onChange={(e) =>
            void updateProfile({
              curriculumProfile: (e.target.value || undefined) as CurriculumProfile | undefined,
            })
          }
          style={{ width: 'auto' }}
        >
          <option value="">{t('common.none')}</option>
          <option value="real">{t('curriculumProfile.real')}</option>
          <option value="umanist">{t('curriculumProfile.umanist')}</option>
        </select>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('settings.subjects')}</h2>
        <p className="muted">{t('privacy.localOnly')}</p>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {listSubjects().map((s) => {
            const status = statuses.find((x) => x.subjectId === s.id)
            const downloaded = status?.downloaded ?? false
            return (
              <li key={s.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', padding: '0.5rem 0' }}>
                <span>
                  {localize(s.interfaceTitleByLanguage, lang)}
                  {!s.enabled && <span className="muted"> · {t('common.comingSoon')}</span>}
                  {downloaded && status?.empty && (
                    <span
                      className="badge"
                      style={{ marginLeft: '0.4rem', color: 'var(--color-warning)', borderColor: 'var(--color-warning)' }}
                    >
                      ⚠️ {t('settings.packEmpty')}
                    </span>
                  )}
                  {downloaded && !status?.empty && (
                    <span className="badge" style={{ marginLeft: '0.4rem' }}>
                      {status?.chunkCount} · {status?.embeddingModel}
                      {status?.synthetic ? ` · ${t('settings.packSynthetic')}` : ''}
                    </span>
                  )}
                </span>
                <button type="button" disabled={!s.enabled} onClick={() => void toggleSubject(s.id, downloaded)}>
                  {downloaded ? t('common.remove') : t('common.download')}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="muted" style={{ marginTop: '0.5rem' }}>{t('settings.corpusRegenNote')}</p>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('settings.embeddings')}</h2>
        <label htmlFor="emb-backend">{t('settings.embBackend')}</label>
        <select
          id="emb-backend"
          value={embCfg.backend}
          onChange={(e) =>
            saveEmbCfg(
              e.target.value === 'openai-compatible'
                ? { backend: 'openai-compatible', baseUrl: embCfg.baseUrl ?? DEFAULT_OPENAI_EMBED_BASE_URL }
                : { backend: 'ollama' },
            )
          }
          style={{ width: 'auto' }}
        >
          <option value="ollama">{t('settings.embOllama')}</option>
          <option value="openai-compatible">{t('settings.embOpenai')}</option>
        </select>

        {embCfg.backend === 'openai-compatible' && (
          <div style={{ marginTop: '0.6rem' }}>
            <label htmlFor="emb-url">{t('llm.baseUrl')}</label>
            <input
              id="emb-url"
              value={embCfg.baseUrl ?? DEFAULT_OPENAI_EMBED_BASE_URL}
              onChange={(e) => saveEmbCfg({ ...embCfg, baseUrl: e.target.value })}
              placeholder={DEFAULT_OPENAI_EMBED_BASE_URL}
            />
            <label htmlFor="emb-key" style={{ marginTop: '0.4rem', display: 'block' }}>
              {t('llm.apiKey')}
            </label>
            <input
              id="emb-key"
              type="password"
              autoComplete="off"
              value={embCfg.apiKey ?? ''}
              onChange={(e) =>
                saveEmbCfg({ ...embCfg, apiKey: e.target.value || undefined })
              }
            />
          </div>
        )}
        <p className="muted" style={{ marginTop: '0.5rem' }}>{t('settings.embModelNote')}</p>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('llm.mode')}</h2>
        <p className="muted">{t('llm.hostedRetrievalNote')}</p>
        <select
          value={providerConfig.id}
          onChange={(e) => void setProviderConfig(PROVIDER_PRESETS[e.target.value] as LLMProviderConfig)}
          style={{ width: 'auto' }}
        >
          {providerIds.map((id) => {
            const p = PROVIDER_PRESETS[id] as LLMProviderConfig
            return <option key={id} value={id}>{p.name}</option>
          })}
        </select>
        <p className="muted" style={{ marginTop: '0.5rem' }}>{t('llm.baseUrl')}: {providerConfig.baseUrl || '—'} · {providerConfig.model}</p>

        {ollamaAvailable && providerConfig.id === 'worker' && (
          <div className="row" style={{ marginTop: '0.5rem', gap: '0.5rem' }}>
            <span className="muted">{t('settings.ollamaDetected')}</span>
            <button
              type="button"
              onClick={() => void setProviderConfig(PROVIDER_PRESETS.ollama as LLMProviderConfig)}
            >
              {t('settings.useOllamaForGrading')}
            </button>
          </div>
        )}

        {ovmsAvailable && providerConfig.id !== 'openvino' && (
          <div className="row" style={{ marginTop: '0.5rem', gap: '0.5rem' }}>
            <span className="muted">{t('settings.ovmsDetected')}</span>
            <button type="button" onClick={useOvms}>
              {t('settings.useOvms')}
            </button>
          </div>
        )}

        {providerConfig.apiKeyMode === 'user_key' && (
          <p>
            <label htmlFor="api-key">{t('llm.apiKey')}</label>
            <input id="api-key" type="password" value={apiKey} onChange={(e) => void setApiKey(e.target.value)} autoComplete="off" />
            <span className="muted">{t('llm.apiKeyHint')}</span>
            <span className="muted">{t('llm.byokHint')}</span>
          </p>
        )}
        {isCloudProvider(providerConfig) && <p className="warning">⚠️ {t('llm.cloudWarning')}</p>}
        {validation.warnings.map((w) => (<p key={w} className="muted">• {w}</p>))}
      </section>

      <section className="card">
        <h2>{t('settings.data')}</h2>
        <button
          type="button"
          onClick={() => {
            if (confirm(t('settings.resetConfirm'))) {
              void resetAllData().then(() => window.location.reload())
            }
          }}
          style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
        >
          🗑 {t('settings.resetData')}
        </button>
      </section>
    </div>
  )
}
