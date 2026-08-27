import type { ExerciseInputMode, Subject, Topic } from '@/types'

export interface DiagnosticItem {
  topicId: string
  skillArea: string
  inputMode: ExerciseInputMode
  /** Order in which to present, easiest/most-core first. */
  order: number
}

const RELEVANCE_RANK: Record<Topic['examRelevance'], number> = {
  core: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/**
 * Builds a short diagnostic spanning the most exam-relevant topics while
 * covering distinct skill areas, so weak areas are detected before adaptation.
 */
export function buildDiagnostic(
  subject: Subject,
  maxItems = 6,
): DiagnosticItem[] {
  const sorted = [...subject.topicTree].sort(
    (a, b) =>
      RELEVANCE_RANK[a.examRelevance] - RELEVANCE_RANK[b.examRelevance] ||
      a.difficulty.localeCompare(b.difficulty),
  )

  const picked: Topic[] = []
  const seenSkillAreas = new Set<string>()
  // First pass: one topic per skill area for breadth.
  for (const t of sorted) {
    if (picked.length >= maxItems) break
    if (!seenSkillAreas.has(t.skillArea)) {
      picked.push(t)
      seenSkillAreas.add(t.skillArea)
    }
  }
  // Second pass: fill remaining slots with the next most relevant topics.
  for (const t of sorted) {
    if (picked.length >= maxItems) break
    if (!picked.includes(t)) picked.push(t)
  }

  const defaultMode = subject.exerciseTypes[0]?.inputMode ?? 'short_answer'
  return picked.map((t, i) => ({
    topicId: t.id,
    skillArea: t.skillArea,
    inputMode:
      subject.exerciseTypes.find((e) => e.subjectId === t.subjectId)?.inputMode ??
      defaultMode,
    order: i,
  }))
}
