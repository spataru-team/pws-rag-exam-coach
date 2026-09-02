import type { BaremResult, ExamAttempt, ExamPaper, RescueForecast, RescueSkillEvidence, RescueSkillTag, ScoringAtom } from '@/types'
import { gradeAttempt, type GradeDeps, gradeItem } from './examGraderService'
import { buildScoringAtoms, evaluateSkillEvidence, selectRescueRoute, computeForecast } from '@/learning/rescueEngine'
import { microdrillsForSkill } from '@/data/exams/microdrills'
import { newId, nowIso } from '@/app/ids'

export interface DiagnosticResult {
  attempt: ExamAttempt
  atoms: ScoringAtom[]
  evidence: RescueSkillEvidence[]
  route: RescueSkillTag[]
}

/** Grades a paper (reusing the existing gradeAttempt pipeline unchanged), then derives
 * scoring atoms, skill evidence and a recovery route from that single grading pass. */
export async function runDiagnostic(
  paper: ExamPaper,
  answersByItemId: Record<string, string>,
  deps: GradeDeps,
  corroboratingAtoms: ScoringAtom[] = [],
): Promise<DiagnosticResult> {
  const graded = await gradeAttempt(paper, answersByItemId, deps)
  const attempt: ExamAttempt = {
    id: newId('rescue-diag'),
    subjectId: paper.subjectId,
    paperId: paper.id,
    startedAt: nowIso(),
    submittedAt: nowIso(),
    timeSpentSec: 0,
    answersByItemId,
    results: graded.results,
    totalAwarded: graded.totalAwarded,
    totalMax: graded.totalMax,
  }
  return diagnosticFromAttempt(paper, attempt, corroboratingAtoms)
}

/**
 * The derive-only half of `runDiagnostic`: scoring atoms → skill evidence →
 * recovery route from an attempt that is **already graded**. Pure (no I/O, no
 * LLM). Used for the seeded DEMO diagnostic (`src/data/exams/demoAttempt.ts`),
 * which lets a visitor explore the whole Rescue flow with zero grading calls.
 */
export function diagnosticFromAttempt(
  paper: ExamPaper,
  attempt: ExamAttempt,
  corroboratingAtoms: ScoringAtom[] = [],
): DiagnosticResult {
  const atoms = buildScoringAtoms(paper, attempt.answersByItemId, attempt.results)
  const evidence = evaluateSkillEvidence(atoms, corroboratingAtoms)
  const route = selectRescueRoute(evidence, attempt.totalAwarded)
  return { attempt, atoms, evidence, route }
}

/** Grades every microdrill for one skill against student-provided answers, reusing gradeItem
 * unchanged (drills share the ExamItem barem shape via DrillItem). */
export async function runDrillsForSkill(
  skillTag: RescueSkillTag,
  answersByDrillId: Record<string, string>,
  deps: GradeDeps,
): Promise<BaremResult[]> {
  const drills = microdrillsForSkill(skillTag)
  const results: BaremResult[] = []
  for (const drill of drills) {
    const answer = answersByDrillId[drill.id] ?? ''
    results.push(await gradeItem(drill, answer, deps))
  }
  return results
}

/**
 * Picks a "Test B" paper — a fresh variant to confirm the drilled skills actually
 * transfer, not just that the student re-answered the exact same diagnostic items.
 * Pure (no I/O): caller fetches `candidates` (`examPapersForSubject(subjectId)`) and
 * `attemptedPaperIds` (from `examAttemptRepo.listBySubject`) once. Prefers a paper the
 * student has never sat; if every other registered paper has already been attempted,
 * falls back to the whole pool rather than returning nothing (a repeat is still more
 * signal than skipping Test B). Tie-break is recency (highest `year` first) — a
 * generalization of the original Romanian-specific "ss > sb > pr" session-type
 * preference (see docs/superpowers/specs/2026-08-11-exam-rescue-mode-design.md §B),
 * which doesn't generalize across subjects without a shared session-type vocabulary.
 *
 * Curriculum-profile-safe: if the diagnostic paper has a `profile` (grade 10+ split
 * — real vs umanist, see CurriculumProfile), Test B is restricted to papers with the
 * SAME profile (or no profile at all — a profile-agnostic paper is always fair game).
 * Without this, a real-track student could be handed an umanist Test B of the same
 * subject and vice versa — different course depth, not actually a fair transfer check.
 */
export function selectTestBPaper(
  candidates: ExamPaper[],
  diagnosticPaper: ExamPaper,
  attemptedPaperIds: ReadonlySet<string>,
): ExamPaper | undefined {
  const pool = candidates.filter(
    (p) => p.id !== diagnosticPaper.id && (!diagnosticPaper.profile || !p.profile || p.profile === diagnosticPaper.profile),
  )
  if (pool.length === 0) return undefined
  const unseen = pool.filter((p) => !attemptedPaperIds.has(p.id))
  const ranked = [...(unseen.length > 0 ? unseen : pool)].sort((a, b) => b.year - a.year)
  return ranked[0]
}

export function buildForecast(
  officialScore: number,
  perSkillLostPoints: { skillTag: RescueSkillTag; lostPoints: number }[],
  drillResultsBySkill: { skillTag: RescueSkillTag; results: BaremResult[] }[],
  // No default: silently falling back to Romanian's 50-point scale bit us once
  // already (Rescue.tsx's "no rescue needed" fast path) and would misreport
  // every forecast for a paper of a different length. Always pass paper.totalPoints.
  paperMaxPoints: number,
): RescueForecast {
  const drillsByTag = new Map(drillResultsBySkill.map((d) => [d.skillTag, d.results]))
  const perSkill = perSkillLostPoints.map(({ skillTag, lostPoints }) => ({
    skillTag,
    lostPoints,
    drillResults: drillsByTag.get(skillTag) ?? [],
  }))
  return computeForecast(officialScore, paperMaxPoints, perSkill)
}
