/**
 * Shared primitive unions used across the domain model.
 * Kept separate so subjects, screens and storage all agree on the same literals.
 */

export type InterfaceLanguage = 'en' | 'ru' | 'ro'

/** Languages a subject can be *learned* in (may differ from interface language). */
export type LearningLanguage = 'ro' | 'en' | 'ru' | 'bio' | 'hist' | string

export type ThemeMode = 'light' | 'dark'

export type StudyMode = 'year_long' | 'sprint'

export type SubjectId =
  | 'romanian'
  | 'english'
  | 'biology'
  | 'history'
  | 'russian'
  | 'math'
  | 'chemistry'
  | string

/** Exam level a subject can be studied for. `en9` = Evaluarea Națională (grade 9,
 * gimnaziu); `bac12` = Bacalaureat (grade 12, liceu). */
export type ExamTrack = 'en9' | 'bac12'

/** Moldovan liceu curriculum track from grade 10 onward — splits course depth/load
 * for biology, chemistry, history, english, russian and math ("real" = STEM-heavy,
 * "umanist" = humanities-heavy). Grade 9 and below (Evaluarea Națională) has no
 * split — a paper/profile with no track applies uniformly. */
export type CurriculumProfile = 'real' | 'umanist'

/**
 * Default embedding dimensionality for newly-seeded packs (bge-m3, multilingual).
 * Not a hard global constraint — each SubjectPack records its own authoritative
 * `embeddingDim`, so packs from different models/dimensions can coexist during a
 * migration. See docs/ARCHITECTURE.md §RAG.
 */
export const DEFAULT_EMBEDDING_DIM = 1024 as const

/** Localised string keyed by interface language. */
export type LocalizedText = Partial<Record<InterfaceLanguage, string>> & {
  en: string
}
