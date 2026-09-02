import type { BaremResult, ExamAttempt } from '@/types'

/**
 * A seeded DEMO diagnostic attempt at `ro-sb26` — hand-authored partial-credit
 * results spanning several skills, total below the internal safety target so
 * Rescue Mode produces a route. It lets a reviewer explore the whole
 * diagnose → 🟢🟡🔴 → route → forecast flow with **zero** grading calls.
 *
 * `demo: true` on the attempt and on every result is the single structured
 * provenance flag (`src/learning/demoProvenance.ts`): this attempt is held in
 * memory only, never written to IndexedDB, never counted in Stats, progress,
 * exports or any `eval:*`. The `[DEMO]` text is for the reader; filters key on
 * the flag.
 */

const DEMO_ADVICE = '[DEMO] Демонстрационные данные — не реальная работа и не оценка модели.'

const r = (
  itemId: string,
  perCriterion: { id: string; awarded: number; max: number }[],
  mode: BaremResult['mode'] = 'llm',
): BaremResult => {
  const awarded = perCriterion.reduce((s, c) => s + c.awarded, 0)
  return {
    itemId,
    perCriterion: perCriterion.map((c) => ({ ...c, comment: DEMO_ADVICE })),
    awarded,
    max: perCriterion.reduce((s, c) => s + c.max, 0),
    advice: DEMO_ADVICE,
    mode,
    demo: true,
  }
}

const ANSWER = 'Un răspuns parțial dezvoltat, cu câteva idei corecte, dar incomplet față de cerința baremului.'

export const demoAttempt: ExamAttempt = {
  id: 'demo-attempt-ro-sb26',
  subjectId: 'romanian',
  paperId: 'ro-sb26',
  startedAt: '2026-06-15T09:00:00.000Z',
  submittedAt: '2026-06-15T10:40:00.000Z',
  timeSpentSec: 6000,
  demo: true,
  answersByItemId: {
    'sb26-1': ANSWER, 'sb26-2': 'a renova, a plăti, mare, a pleca', 'sb26-3': ANSWER,
    'sb26-4': ANSWER, 'sb26-5': ANSWER, 'sb26-6': ANSWER, 'sb26-7': ANSWER,
    'sb26-8': ANSWER, 'sb26-9': ANSWER, 'sb26-10': ANSWER, 'sb26-11': '',
  },
  results: [
    r('sb26-1', [{ id: 'sb26-1', awarded: 2, max: 3 }]),
    r('sb26-2', [{ id: 'sb26-2', awarded: 2, max: 4 }], 'deterministic'),
    r('sb26-3', [{ id: 'sb26-3', awarded: 1, max: 2 }]),
    r('sb26-4', [{ id: 'sb26-4', awarded: 2, max: 4 }]),
    r('sb26-5', [{ id: 'sb26-5', awarded: 1, max: 3 }]),
    r('sb26-6', [{ id: 'sb26-6', awarded: 1, max: 2 }]),
    r('sb26-7', [{ id: 'sb26-7', awarded: 1, max: 5 }]),
    r('sb26-8', [
      { id: 'lexic', awarded: 1, max: 2 },
      { id: 'replici', awarded: 1, max: 4 },
    ]),
    r('sb26-9', [
      { id: 'adresare', awarded: 1, max: 1 },
      { id: 'ocazie', awarded: 1, max: 1 },
      { id: 'urare', awarded: 0, max: 2 },
      { id: 'asezare', awarded: 0, max: 1 },
    ]),
    r('sb26-10', [
      { id: 'repere', awarded: 1, max: 3 },
      { id: 'coerenta', awarded: 0, max: 2 },
      { id: 'volum', awarded: 1, max: 4 },
    ]),
    { ...r('sb26-11', [{ id: 'sb26-11', awarded: 1, max: 7 }]), lowConfidence: true },
  ],
  totalAwarded: 17,
  totalMax: 50,
}
