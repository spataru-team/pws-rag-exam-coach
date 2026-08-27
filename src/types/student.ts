import type {
  CurriculumProfile,
  InterfaceLanguage,
  LearningLanguage,
  StudyMode,
  SubjectId,
  ThemeMode,
} from './common'

/**
 * 6. StudentProfile — local-first identity. No real name is stored; only an
 * anonymous localId generated on the device.
 */
export interface StudentProfile {
  localId: string
  interfaceLanguage: InterfaceLanguage
  preferredLearningLanguage: LearningLanguage
  activeSubjects: SubjectId[]
  currentSubjectId: SubjectId
  dyslexiaMode: boolean
  theme: ThemeMode
  studyMode: StudyMode
  /** ISO date; used by sprint mode to prioritise. */
  examDate?: string
  /** Liceu curriculum track (grade 10+ only) — undefined for grade 9 and below, or
   * if the student hasn't set it. Undefined must be treated as "no filter", not an
   * error — see CurriculumProfile. */
  curriculumProfile?: CurriculumProfile
  createdAt: string
  updatedAt: string
}

export type ActivityType =
  | 'diagnostic'
  | 'practice'
  | 'review'
  | 'reflection'
  | 'model_lab'

export type ExerciseResult = 'correct' | 'partial' | 'incorrect' | 'skipped'

/** 7. LearningEvent — append-only record of a single learning interaction. */
export interface LearningEvent {
  id: string
  timestamp: string
  subjectId: SubjectId
  topicId: string
  activityType: ActivityType
  exerciseType: string
  result: ExerciseResult
  /** 0..1 normalised score for the attempt. */
  score: number
  timeSpentSec: number
  writtenAnswer?: string
  selectedAnswer?: string
  feedback?: string
  modelProvider?: string
  modelName?: string
  promptVersion?: string
  retrievedChunkIds: string[]
  /** Learner's self-reported confidence 0..1 after answering. */
  confidenceSelfRating?: number
}

/** Reason a topic is flagged as weak, used to drive recommendations. */
export type WeakReason =
  | 'low_accuracy'
  | 'low_confidence'
  | 'few_attempts'
  | 'overdue_review'
  | 'never_practiced'

/** 8. TopicMastery — derived adaptive state per (subject, topic). */
export interface TopicMastery {
  subjectId: SubjectId
  topicId: string
  /** 0..1 overall mastery. */
  masteryScore: number
  /** 0..1 rolling accuracy. */
  accuracy: number
  /** 0..1 rolling confidence. */
  confidence: number
  attempts: number
  lastPracticedAt?: string
  /** ISO date of next spaced-repetition review. */
  nextReviewAt?: string
  weakReason?: WeakReason
}
