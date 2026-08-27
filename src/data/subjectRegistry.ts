import type { Subject, SubjectId } from '@/types'
import { romanianSubject } from './subjects/romanian'
import { englishSubject } from './subjects/english'
import { biologySubject } from './subjects/biology'
import { historySubject } from './subjects/history'
import { chemistrySubject } from './subjects/chemistry'
import { mathSubject } from './subjects/math'
import { russianSubject } from './subjects/russian'

/**
 * Central registry. Adding a subject = add its config here + ship a pack.
 * No core code needs to change. Structural metadata (topic tree, exercise
 * types, rubrics) lives here and is always available; heavy chunk data is
 * downloaded separately as a pack.
 */
const SUBJECTS: Subject[] = [
  romanianSubject,
  englishSubject,
  biologySubject,
  historySubject,
  chemistrySubject,
  mathSubject,
  russianSubject,
]

export const subjectRegistry: Record<SubjectId, Subject> = Object.fromEntries(
  SUBJECTS.map((s) => [s.id, s]),
)

export function listSubjects(): Subject[] {
  return SUBJECTS
}

export function listEnabledSubjects(): Subject[] {
  return SUBJECTS.filter((s) => s.enabled)
}

export function getSubject(id: SubjectId): Subject | undefined {
  return subjectRegistry[id]
}

export function getTopics(id: SubjectId) {
  return subjectRegistry[id]?.topicTree ?? []
}

export function getTopic(subjectId: SubjectId, topicId: string) {
  return getTopics(subjectId).find((t) => t.id === topicId)
}
