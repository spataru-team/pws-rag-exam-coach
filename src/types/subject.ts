import type {
  InterfaceLanguage,
  LearningLanguage,
  LocalizedText,
  SubjectId,
} from './common'

/** Difficulty band shared by topics and exercises. */
export type Difficulty = 'intro' | 'basic' | 'intermediate' | 'advanced'

/** How relevant a topic is to the national/exam test. */
export type ExamRelevance = 'low' | 'medium' | 'high' | 'core'

export type ExerciseInputMode =
  | 'written'
  | 'multiple_choice'
  | 'short_answer'
  | 'classification'
  | 'matching'
  | 'explanation'

export type FeedbackMode =
  | 'immediate'
  | 'delayed'
  | 'rubric_based'
  | 'self_assessed'

/** A scoring criterion inside an assessment rubric. */
export interface RubricCriterion {
  id: string
  title: LocalizedText
  description: LocalizedText
  maxPoints: number
}

/** 5. ExerciseType */
export interface ExerciseType {
  id: string
  subjectId: SubjectId
  title: LocalizedText
  inputMode: ExerciseInputMode
  feedbackMode: FeedbackMode
  rubricId?: string
}

/** 5. AssessmentRubric */
export interface AssessmentRubric {
  id: string
  subjectId: SubjectId
  title: LocalizedText
  criteria: RubricCriterion[]
  /** e.g. 0..10 national grading, or 0..4 holistic band. */
  scoringScale: { min: number; max: number; label?: string }
  /** Language the rubric text is authored in. */
  language: InterfaceLanguage
}

/** 2. Topic */
export interface Topic {
  id: string
  subjectId: SubjectId
  parentTopicId?: string
  title: LocalizedText
  /** Coarse skill grouping, e.g. "grammar", "reading", "vocabulary". */
  skillArea: string
  prerequisites: string[]
  difficulty: Difficulty
  gradeLevel: number
  examRelevance: ExamRelevance
  metadata?: Record<string, unknown>
}

/** 1. Subject — the registry entry that makes the platform multi-subject. */
export interface Subject {
  id: SubjectId
  title: string
  interfaceTitleByLanguage: Partial<Record<InterfaceLanguage, string>>
  learningLanguages: LearningLanguage[]
  enabled: boolean
  examModeAvailable: boolean
  defaultGradeLevel: number
  topicTree: Topic[]
  exerciseTypes: ExerciseType[]
  assessmentRubrics: AssessmentRubric[]
  recommendedSessionLengthMin: number
  metadata?: Record<string, unknown>
}
