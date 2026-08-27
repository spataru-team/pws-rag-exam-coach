import type { BaremResult, ExamItemType, ExamSubCriterion } from './exam'
import type { SubjectId } from './common'
import type { VisualAsset } from './asset'

/** Skill areas used by Exam Rescue Mode. Not tied to item order — see Appendix AK. */
export type RescueSkillTag =
  | 'completare-text'
  | 'sinonime-antonime'
  | 'enunt-reflexiv'
  | 'intrebari-directe'
  | 'concluzii'
  | 'portret-caracterizare'
  | 'transformare-gramaticala'
  | 'dialog'
  | 'felicitare'
  | 'eseu-repere'
  | 'eseu-coerenta'
  | 'eseu-volum'
  | 'corectitudine'

/** Why a scoring atom lost points; 'unknown' is preferred over false certainty. */
export type RescueErrorType =
  | 'blank'
  | 'insufficient-volume'
  | 'unknown'

/** Credit-vs-confidence status, replacing the earlier 3-state model. */
export type ReviewStatus = 'correct' | 'partial' | 'incorrect' | 'needs_review'

export type StrengthState =
  | 'uncertain'
  | 'likelyStrong'
  | 'confirmedStrong'
  | 'recoverable'
  | 'expensive'

/** One independently-scored criterion: a whole item (no subCriteria) or one subCriterion. */
export interface ScoringAtom {
  id: string
  paperId: string
  itemId: string
  subCriterionId?: string
  skillTag: RescueSkillTag
  earnedPoints: number
  maxPoints: number
  /** 1.0 = deterministic/confident LLM grade; 0.5 = self/lowConfidence. */
  gradingConfidence: number
  errorType: RescueErrorType
  reviewStatus: ReviewStatus
  source: 'exam-parent' | 'exam-subcriterion'
}

export interface RescueSkillEvidence {
  skillTag: RescueSkillTag
  observations: number
  earnedPoints: number
  maxPoints: number
  performanceRatio: number
  errorTypes: RescueErrorType[]
  evidenceConfidence: number
  state: StrengthState
  estimatedRecoverablePoints: number
  trainingCost: number
  transferReliability: number
  priority: number
}

export interface RescueForecast {
  officialScore: number
  confirmedGain: number
  potentialGain: number
  conservativeForecast: number
  expectedForecast: number
  passThreshold: number
  safetyTarget: number
  evidenceConfidence: number
}

export type PaperExposureStatus = 'unknown' | 'seen' | 'completed' | 'fresh'

export interface PaperExposure {
  paperId: string
  status: PaperExposureStatus
  source: 'local-history' | 'teacher' | 'student'
}

export interface DrillResultEntry {
  skillTag: RescueSkillTag
  results: BaremResult[]
}

export interface RescueSession {
  id: string
  subjectId: SubjectId
  diagnosticAttemptId: string
  diagnosticPaperId: string
  seenPaperIds: string[]
  selectedSkills: RescueSkillTag[]
  skillEvidence: RescueSkillEvidence[]
  drillResults: DrillResultEntry[]
  forecastHistory: RescueForecast[]
  testBPaperId?: string
  testBAttemptId?: string
  startedAt: string
  updatedAt: string
}

/** A practice item for microdrills. Same shape as ExamItem so gradeItem() works unchanged
 * (`order` is just this drill's position within its skill's drill list, 1-based). */
export interface DrillItem {
  id: string
  order: number
  skillTag: RescueSkillTag
  type: ExamItemType
  prompt: string
  maxPoints: number
  baremRule: string
  acceptedAnswers?: string[]
  subCriteria?: ExamSubCriterion[]
  assets?: VisualAsset[]
}
