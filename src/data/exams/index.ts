import type { CurriculumProfile, ExamPaper, SubjectId } from '@/types'
import { romanianPr26 } from './romanian-pr26'
import { romanianSb26 } from './romanian-sb26'
import { mathSb26 } from './math-sb26'

/** Read-only exam papers per subject. pr26 stays first/default for the existing /exam screen. */
export const examPapersBySubject: Partial<Record<SubjectId, ExamPaper[]>> = {
  romanian: [romanianPr26, romanianSb26],
  math: [mathSb26],
}

/**
 * All registered papers for a subject, optionally narrowed to one curriculum
 * profile (grade 10+ split — see CurriculumProfile). Omitting `profile` returns
 * the full flat array unchanged — existing callers (`/exam`'s `[0]` pick, the
 * registry tests) keep working exactly as before this filter existed. When a
 * `profile` IS passed, papers with no `profile` set (grade-9, or any subject the
 * split doesn't apply to) are always included — they're profile-agnostic, not a
 * mismatch.
 */
export function examPapersForSubject(subjectId: SubjectId, profile?: CurriculumProfile): ExamPaper[] {
  const all = examPapersBySubject[subjectId] ?? []
  if (!profile) return all
  return all.filter((p) => !p.profile || p.profile === profile)
}

export function getExamPaper(paperId: string): ExamPaper | undefined {
  return Object.values(examPapersBySubject)
    .filter((papers): papers is ExamPaper[] => papers !== undefined)
    .flat()
    .find((p) => p.id === paperId)
}
