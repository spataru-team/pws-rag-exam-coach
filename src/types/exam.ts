import type { CurriculumProfile, InterfaceLanguage, SubjectId } from './common'
import type { RescueSkillTag } from './rescue'
import type { VisualAsset } from './asset'

/** short = deterministic-first; open = LLM-graded; correctness = cross-cutting. */
export type ExamItemType = 'short' | 'open' | 'correctness'

/** A sub-criterion inside a structured barem (e.g. essay: repere/coherence/volume). */
export interface ExamSubCriterion {
  id: string
  title: Partial<Record<InterfaceLanguage, string>>
  maxPoints: number
  /** Human-readable scoring rule, fed to the LLM grader. */
  rule: string
  /** Rescue-Mode skill this sub-criterion trains; separate from the official barem. */
  skillTag?: RescueSkillTag
  /**
   * How this specific criterion is scored. Default (omitted) is `'llm'` — the
   * barem-grading LLM call scores it against `rule`, same as before this field
   * existed. `'deterministic'` skips the LLM for this criterion entirely and
   * compares the student's answer against `ExamItem.acceptedAnswers` with a
   * notation-aware comparator (see `src/learning/expressionMatch.ts`) — for
   * the "final numeric answer" criterion real barems split out separately
   * from the "method" criteria (e.g. a math item: 3 method steps an LLM
   * grades against prose rules, one exact final answer a computer can check
   * outright). Mixing modes within one item is what `GradeMode: 'hybrid'`
   * reports on the resulting `BaremResult`.
   */
  gradeMode?: 'llm' | 'deterministic'
}

/** One task in an exam paper, carrying its official barem. */
export interface ExamItem {
  id: string
  order: number
  type: ExamItemType
  /** Task prompt as printed in the test. */
  prompt: string
  maxPoints: number
  /** Scoring rule text from the official barem ("Specificări"). */
  baremRule: string
  /** Reference/accepted answers ("Răspuns corect/posibil"); also LLM guidance. */
  acceptedAnswers?: string[]
  /** Structured sub-barem when the item is scored by parts. */
  subCriteria?: ExamSubCriterion[]
  /** Rescue-Mode skill this item trains; only meaningful when subCriteria is absent. */
  skillTag?: RescueSkillTag
  /** Drawings/diagrams/formulas the item's prompt refers to (e.g. "see the figure"). */
  assets?: VisualAsset[]
}

/** A full past-year test = reading text + ordered items + total. */
export interface ExamPaper {
  id: string
  subjectId: SubjectId
  year: number
  /** School grade this paper was sat in (e.g. 9 = Evaluarea Națională, 12 = BAC) —
   * independent of the subject's own study-content `defaultGradeLevel`, since a
   * subject spans grades but one exam paper is always a specific grade's sitting. */
  grade: number
  /** Curriculum track this specific paper was written for — only meaningful for
   * grade 10+ (BAC) papers in the six split subjects; omit for grade-9 papers and
   * any subject/paper the split doesn't apply to. */
  profile?: CurriculumProfile
  title: string
  /** Shared reading passage, if the items refer to one. */
  sourceText?: string
  /** Visual materials shared by the whole paper (not tied to a single item). */
  sourceAssets?: VisualAsset[]
  timeLimitMin: number
  totalPoints: number
  items: ExamItem[]
}

/** Per-criterion awarded points produced by the grader. */
export interface BaremCriterionScore {
  id: string
  awarded: number
  max: number
  comment: string
}

/** How a single item's score was produced. `hybrid` = some sub-criteria were
 * checked deterministically (`gradeMode: 'deterministic'`) and others by LLM,
 * merged into one result — see `ExamSubCriterion.gradeMode`. */
export type GradeMode = 'deterministic' | 'llm' | 'self' | 'hybrid'

/** Grading result for one item. */
export interface BaremResult {
  itemId: string
  perCriterion: BaremCriterionScore[]
  awarded: number
  max: number
  advice: string
  mode: GradeMode
  /** Low confidence (e.g. correctness item, or LLM fallback). */
  lowConfidence?: boolean
  /** DEMO provenance — the offline Mock grader produced this. The single
   * structured flag every eval / metrics path filters on (see
   * `src/learning/demoProvenance.ts`); never inferred from a `[DEMO]` text
   * prefix, which is presentation only. */
  demo?: boolean
}

/** Mini end-of-mock feedback from the student. */
export interface ExamFeedback {
  clear: boolean
  useful: boolean
  comment?: string
}

/** A student's full attempt at an exam paper (stored & exported). */
export interface ExamAttempt {
  id: string
  subjectId: SubjectId
  paperId: string
  startedAt: string
  submittedAt: string
  timeSpentSec: number
  answersByItemId: Record<string, string>
  results: BaremResult[]
  totalAwarded: number
  totalMax: number
  /** Times the student left/hid the exam tab during the exam (anti-cheat signal). */
  tabLeaves?: number
  feedback?: ExamFeedback
  /** DEMO provenance — a seeded demonstration attempt, not a real sitting. Held
   * in memory only, never written to IndexedDB, never counted in Stats,
   * progress, exports or any eval. See `src/learning/demoProvenance.ts`. */
  demo?: boolean
}
