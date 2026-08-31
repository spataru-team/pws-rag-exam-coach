import type { BaremResult, ExamAttempt } from '@/types'

/**
 * DEMO provenance — the ONE structured source of truth.
 *
 * A `BaremResult` or `ExamAttempt` produced for demonstration (the offline Mock
 * grader, the seeded sample attempt) carries `demo: true`. Every eval / metrics /
 * "measured performance" path decides what to exclude by calling these guards —
 * never by string-matching a `[DEMO]` prefix, which is presentation only and can
 * appear in genuine content.
 */

export function isDemoResult(result: Pick<BaremResult, 'demo'>): boolean {
  return result.demo === true
}

export function isDemoAttempt(attempt: Pick<ExamAttempt, 'demo'>): boolean {
  return attempt.demo === true
}

export function hasDemoData(results: readonly Pick<BaremResult, 'demo'>[]): boolean {
  return results.some(isDemoResult)
}
