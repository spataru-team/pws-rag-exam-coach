import { create } from 'zustand'
import type {
  CurriculumProfile,
  InterfaceLanguage,
  StudentProfile,
  SubjectId,
  ThemeMode,
} from '@/types'
import {
  profileRepo,
  newAnonymousId,
  settingsRepo,
  SETTING_KEYS,
} from '@/storage'
import { PROVIDER_PRESETS, DEFAULT_PROVIDER_ID, checkProxyCapability, type LLMProviderConfig } from '@/llm'
import { applyAppearance } from '@/theme/applyAppearance'
import { setLanguage } from '@/i18n'

interface AppState {
  loaded: boolean
  profile: StudentProfile | null
  providerConfig: LLMProviderConfig
  apiKey: string
  load: () => Promise<void>
  completeOnboarding: (input: OnboardingInput) => Promise<void>
  updateProfile: (patch: Partial<StudentProfile>) => Promise<void>
  setProviderConfig: (config: LLMProviderConfig) => Promise<void>
  setApiKey: (key: string) => Promise<void>
}

export interface OnboardingInput {
  interfaceLanguage: InterfaceLanguage
  theme: ThemeMode
  dyslexiaMode: boolean
  studyMode: 'year_long' | 'sprint'
  currentSubjectId: SubjectId
  examDate?: string
  /** Optional — grade 10+ liceu track; leave unset for grade 9 and below. */
  curriculumProfile?: CurriculumProfile
  providerConfig: LLMProviderConfig
}

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  profile: null,
  providerConfig: PROVIDER_PRESETS[DEFAULT_PROVIDER_ID] as LLMProviderConfig,
  apiKey: '',

  async load() {
    const profile = (await profileRepo.getCurrent()) ?? null
    const stored =
      (await settingsRepo.get<LLMProviderConfig>(SETTING_KEYS.llmProviderConfig)) ??
      (PROVIDER_PRESETS[DEFAULT_PROVIDER_ID] as LLMProviderConfig)
    // A previously-selected managed-chat provider (`worker`) that THIS deployment
    // no longer offers: fall back to Mock for this session. The stored choice is
    // left untouched in IndexedDB — it becomes active again on a deployment that
    // has managed chat enabled. (Only `worker` is proxy-gated; BYOK/local
    // choices are always usable, so they never trigger the probe.)
    let providerConfig = stored
    if (stored.id === 'worker' && !(await checkProxyCapability()).chatConfigured) {
      providerConfig = PROVIDER_PRESETS[DEFAULT_PROVIDER_ID] as LLMProviderConfig
    }
    const apiKey = (await settingsRepo.get<string>(SETTING_KEYS.llmApiKey)) ?? ''

    if (profile) {
      applyAppearance(profile.theme, profile.dyslexiaMode)
      setLanguage(profile.interfaceLanguage)
    }
    set({ loaded: true, profile, providerConfig, apiKey })
  },

  async completeOnboarding(input) {
    const now = new Date().toISOString()
    const profile: StudentProfile = {
      localId: newAnonymousId(),
      interfaceLanguage: input.interfaceLanguage,
      preferredLearningLanguage: 'ro',
      activeSubjects: [input.currentSubjectId],
      currentSubjectId: input.currentSubjectId,
      dyslexiaMode: input.dyslexiaMode,
      theme: input.theme,
      studyMode: input.studyMode,
      ...(input.examDate ? { examDate: input.examDate } : {}),
      ...(input.curriculumProfile ? { curriculumProfile: input.curriculumProfile } : {}),
      createdAt: now,
      updatedAt: now,
    }
    await profileRepo.save(profile)
    await settingsRepo.set(SETTING_KEYS.llmProviderConfig, input.providerConfig)
    applyAppearance(profile.theme, profile.dyslexiaMode)
    setLanguage(profile.interfaceLanguage)
    set({ profile, providerConfig: input.providerConfig })
  },

  async updateProfile(patch) {
    const current = get().profile
    if (!current) return
    const updated = await profileRepo.update(current.localId, patch)
    if (updated) {
      applyAppearance(updated.theme, updated.dyslexiaMode)
      setLanguage(updated.interfaceLanguage)
      set({ profile: updated })
    }
  },

  async setProviderConfig(config) {
    await settingsRepo.set(SETTING_KEYS.llmProviderConfig, config)
    set({ providerConfig: config })
  },

  async setApiKey(key) {
    await settingsRepo.set(SETTING_KEYS.llmApiKey, key)
    set({ apiKey: key })
  },
}))
