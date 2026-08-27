# Exam Rescue Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the P0 "добор баллов" loop — diagnostic (sb26) → skill evidence → 2–4 skill
recovery route → microdrills → conservative/potential forecast → one fresh Test B — without
touching existing `/exam` behavior, for 6 students before 14 August 2026.

**Architecture:** Pure, config-driven scoring/optimizer functions in
`src/learning/rescueEngine.ts`, reusing the existing barem grader (`gradeItem`/`gradeAttempt`,
`criteriaSlots`) unchanged. New additive Dexie table (v3) for rescue session state; diagnostic
and Test B sittings are ordinary `ExamAttempt`s via the existing repo. New `/rescue` screen,
new `romanian-sb26` exam paper, `skillTag` added to `ExamItem`/`ExamSubCriterion`.

**Tech Stack:** TypeScript, React 19, Zustand, Dexie, react-i18next, Vitest + Testing Library
(all already in the repo — no new dependencies).

**Source documents:**
`docs/superpowers/plans/2026-08-11-exam-rescue-mode.md` (corrected architecture — authoritative
for formulas/types/decisions used below) and its Appendix AK (verified per-paper skillTag
mapping, reused verbatim in Task 3/4).

## Global Constraints

- `passThreshold = 13`, `safetyTarget = 18` — from `RESCUE_CONFIG` in
  `src/learning/rescueConfig.ts`; never hardcoded elsewhere.
- `estimatedRecoverablePoints`/`priority`/`evidenceConfidence` are floats internally; round
  only in UI-facing formatting.
- Every optimizer weight (`trainability`, `trainingCost`, `transferReliability`,
  `errorTypeModifier`) lives in `RESCUE_CONFIG.perSkill` / `RESCUE_CONFIG.errorTypeModifiers`
  — one file, documented, no magic numbers scattered in `rescueEngine.ts`.
- `corectitudine` is never a candidate in skill ranking/route selection (cross-cutting, §F of
  the architecture plan).
- `confirmedGain <= lostPoints` and `potentialGain <= lostPoints` per skill, always; overall
  forecast `<= paper.totalPoints` (50), always.
- Do not modify `src/screens/Exam.tsx` behavior, `src/learning/baremGrader.ts`,
  `src/services/examGraderService.ts`, or existing Dexie v1/v2 table definitions.
- `skillTag` is set explicitly per item/subCriterion from the verified Appendix AK mapping —
  never derived from `item.order`.
- All new code follows existing patterns: `@/`-aliased imports, barrel `index.ts` re-exports,
  Vitest `describe/it/expect`, tests colocated as `*.test.ts` next to source.

---

## File Structure

```
src/types/rescue.ts                          (new) — all Rescue domain types
src/types/exam.ts                             (modify) — add skillTag fields
src/types/index.ts                            (modify) — re-export rescue types
src/learning/rescueConfig.ts                  (new) — grading scale + all heuristic weights
src/learning/rescueConfig.test.ts             (new)
src/learning/rescueEngine.ts                  (new) — pure functions: atoms, review status,
                                                error classification, evidence, route, forecast
src/learning/rescueEngine.test.ts             (new)
src/learning/index.ts                         (modify) — re-export rescueEngine/rescueConfig
src/data/exams/romanian-pr26.ts               (modify) — add skillTag to items/subCriteria
src/data/exams/romanian-pr26.test.ts          (modify) — assert skillTags present
src/data/exams/romanian-sb26.ts               (new) — sb26 paper, skillTag-tagged
src/data/exams/romanian-sb26.test.ts          (new)
src/data/exams/index.ts                       (modify) — register sb26
src/data/exams/microdrills.ts                 (new) — P0 microdrill content per skillTag
src/data/exams/microdrills.test.ts            (new)
src/storage/repositories/examAttemptRepo.ts   (modify) — add listByPaper
src/storage/repositories/examAttemptRepo.test.ts (modify)
src/storage/db.ts                             (modify) — v3 migration, rescueSessions table
src/storage/repositories/rescueSessionRepo.ts (new)
src/storage/repositories/rescueSessionRepo.test.ts (new)
src/storage/index.ts                          (modify) — export rescueSessionRepo, extend reset
src/services/rescueService.ts                 (new) — orchestration (diagnostic → route → drills → forecast → Test B)
src/services/rescueService.test.ts            (new)
src/services/index.ts                         (modify) — re-export rescueService
src/i18n/locales/en.json                      (modify) — rescue.* keys
src/i18n/locales/ro.json                      (modify)
src/i18n/locales/ru.json                      (modify)
src/screens/Rescue.tsx                        (new)
src/screens/index.ts                          (modify) — export Rescue
src/app/App.tsx                               (modify) — /rescue route
src/app/Layout.tsx                            (modify) — nav item
```

---

### Task 1: Rescue domain types

**Files:**
- Create: `src/types/rescue.ts`
- Modify: `src/types/exam.ts:16-29` (add `skillTag` to `ExamItem`/`ExamSubCriterion`)
- Modify: `src/types/index.ts` (re-export)

**Interfaces:**
- Produces: `RescueSkillTag`, `RescueErrorType`, `ReviewStatus`, `StrengthState`,
  `ScoringAtom`, `RescueSkillEvidence`, `RescueForecast`, `PaperExposureStatus`,
  `PaperExposure`, `RescueSession`, `DrillItem` — all consumed by every later task.

- [ ] **Step 1: Write `src/types/rescue.ts`**

```ts
import type { BaremResult, ExamItemType, ExamSubCriterion, SubjectId } from './exam'

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

/** A practice item for microdrills. Same shape as ExamItem so gradeItem() works unchanged. */
export interface DrillItem {
  id: string
  skillTag: RescueSkillTag
  type: ExamItemType
  prompt: string
  maxPoints: number
  baremRule: string
  acceptedAnswers?: string[]
  subCriteria?: ExamSubCriterion[]
}
```

- [ ] **Step 2: Add `skillTag` to `ExamItem`/`ExamSubCriterion`**

Edit `src/types/exam.ts`. In `ExamSubCriterion` (currently `id, title, maxPoints, rule`), add
after `rule`:

```ts
  /** Rescue-Mode skill this sub-criterion trains; separate from the official barem. */
  skillTag?: RescueSkillTag
```

In `ExamItem` (currently `id, order, type, prompt, maxPoints, baremRule, acceptedAnswers?,
subCriteria?`), add after `subCriteria?`:

```ts
  /** Rescue-Mode skill this item trains; only meaningful when subCriteria is absent. */
  skillTag?: RescueSkillTag
```

Add the import at the top of `src/types/exam.ts`:

```ts
import type { RescueSkillTag } from './rescue'
```

- [ ] **Step 3: Re-export from the types barrel**

Edit `src/types/index.ts`, add (matching the existing per-module `export * from` pattern):

```ts
export * from './rescue'
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this task only adds types/optional fields, nothing consumes them yet).

- [ ] **Step 5: Commit**

```bash
git add src/types/rescue.ts src/types/exam.ts src/types/index.ts
git commit -m "feat(rescue): add Rescue Mode domain types"
```

---

### Task 2: Rescue configuration

**Files:**
- Create: `src/learning/rescueConfig.ts`
- Test: `src/learning/rescueConfig.test.ts`

**Interfaces:**
- Consumes: `RescueSkillTag`, `RescueErrorType` (Task 1).
- Produces: `RO_GIMNAZIU_GRADING_SCALE: GradeBand[]`, `RESCUE_CONFIG` (object with
  `passThreshold`, `safetyTarget`, `maxRescueSkills`, `minRescueSkills`, `zoneThresholds`,
  `perSkill: Record<RescueSkillTag, SkillWeights>`, `errorTypeModifiers`,
  `partialCreditFormula`, `gradingConfidenceWeights`) — consumed by `rescueEngine.ts` (Task 6)
  and displayed by `Rescue.tsx` (Task 11).

- [ ] **Step 1: Write the failing test**

```ts
// src/learning/rescueConfig.test.ts
import { describe, it, expect } from 'vitest'
import { RO_GIMNAZIU_GRADING_SCALE, RESCUE_CONFIG } from './rescueConfig'

describe('RO_GIMNAZIU_GRADING_SCALE', () => {
  it('matches the official ANCE conversion table for grades 5-10', () => {
    const byGrade = Object.fromEntries(RO_GIMNAZIU_GRADING_SCALE.map((b) => [b.nota, b]))
    expect(byGrade[5]).toEqual({ nota: 5, min: 13, max: 20 })
    expect(byGrade[6]).toEqual({ nota: 6, min: 21, max: 28 })
    expect(byGrade[7]).toEqual({ nota: 7, min: 29, max: 36 })
    expect(byGrade[8]).toEqual({ nota: 8, min: 37, max: 44 })
    expect(byGrade[9]).toEqual({ nota: 9, min: 45, max: 47 })
    expect(byGrade[10]).toEqual({ nota: 10, min: 48, max: 50 })
  })

  it('does not fabricate bands below nota 5', () => {
    const grades = RO_GIMNAZIU_GRADING_SCALE.map((b) => b.nota)
    expect(grades).not.toContain(1)
    expect(grades).not.toContain(4)
  })
})

describe('RESCUE_CONFIG', () => {
  it('passThreshold equals the official nota-5 lower bound', () => {
    expect(RESCUE_CONFIG.passThreshold).toBe(13)
  })

  it('safetyTarget is a pedagogical value strictly above passThreshold', () => {
    expect(RESCUE_CONFIG.safetyTarget).toBe(18)
    expect(RESCUE_CONFIG.safetyTarget).toBeGreaterThan(RESCUE_CONFIG.passThreshold)
  })

  it('never assigns sinonime-antonime the cheapest training cost', () => {
    // Explicit regression for the corrected heuristic — see plan §M.
    expect(RESCUE_CONFIG.perSkill['sinonime-antonime'].trainingCost).toBeGreaterThan(1)
  })

  it('excludes corectitudine from ordinary rescue ranking', () => {
    expect(RESCUE_CONFIG.perSkill.corectitudine.excludedFromRanking).toBe(true)
  })

  it('defines weights for every RescueSkillTag', () => {
    const tags = [
      'completare-text', 'sinonime-antonime', 'enunt-reflexiv', 'intrebari-directe',
      'concluzii', 'portret-caracterizare', 'transformare-gramaticala', 'dialog',
      'felicitare', 'eseu-repere', 'eseu-coerenta', 'eseu-volum', 'corectitudine',
    ] as const
    for (const tag of tags) {
      expect(RESCUE_CONFIG.perSkill[tag]).toBeDefined()
      expect(RESCUE_CONFIG.perSkill[tag].trainability).toBeGreaterThan(0)
      expect(RESCUE_CONFIG.perSkill[tag].trainability).toBeLessThanOrEqual(1)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/learning/rescueConfig.test.ts`
Expected: FAIL — `Cannot find module './rescueConfig'`.

- [ ] **Step 3: Write `src/learning/rescueConfig.ts`**

```ts
import type { RescueSkillTag, RescueErrorType } from '@/types'

/** OFFICIAL: raw-score → grade bands. Confirmed by the teacher for nota 5-10 only;
 * nota 1-4 bands are not yet sourced from an official ANCE document — do not invent them. */
export interface GradeBand {
  nota: number
  min: number
  max: number
}

export const RO_GIMNAZIU_GRADING_SCALE: GradeBand[] = [
  { nota: 5, min: 13, max: 20 },
  { nota: 6, min: 21, max: 28 },
  { nota: 7, min: 29, max: 36 },
  { nota: 8, min: 37, max: 44 },
  { nota: 9, min: 45, max: 47 },
  { nota: 10, min: 48, max: 50 },
]

interface SkillWeights {
  /** PEDAGOGICAL: how coachable this skill is in a few days, 0..1. */
  trainability: number
  /** PEDAGOGICAL: relative microdrill effort, 1 (cheap) .. 5 (expensive). */
  trainingCost: number
  /** PEDAGOGICAL: confidence the trained skill transfers to an unseen paper, 0..1. */
  transferReliability: number
  /** true = never a route candidate (cross-cutting metric, see plan §F). */
  excludedFromRanking?: boolean
}

export const RESCUE_CONFIG = {
  /** OFFICIAL: lower bound of nota 5, from RO_GIMNAZIU_GRADING_SCALE. */
  passThreshold: 13,
  /** PEDAGOGICAL: comfortably inside the nota-5 band, not just clearing it. */
  safetyTarget: 18,
  maxRescueSkills: 4,
  minRescueSkills: 2,
  zoneThresholds: {
    /** earned/max >= this on a skill's atoms => likelyStrong/confirmedStrong. */
    safeRatio: 0.8,
    /** trainingCost above this makes a skill 'expensive' even if lostPoints is large. */
    expensiveCostAbove: 4,
    /** transferReliability below this makes a skill 'expensive' regardless of cost. */
    expensiveReliabilityBelow: 0.4,
  },
  /** PEDAGOGICAL: partialCreditFactor = base + span * (earned/max). Rewards "almost there"
   * atoms over "understands nothing" atoms of the same lostPoints, per plan §E worked example. */
  partialCreditFormula: { base: 0.4, span: 0.6 },
  /** How much we trust a scoring atom's earned/max reading, by how it was graded. */
  gradingConfidenceWeights: {
    deterministicOrConfidentLlm: 1.0,
    selfOrLowConfidence: 0.5,
  },
  /** PEDAGOGICAL: a zero caused by 'blank'/'insufficient-volume' is not equivalent to a zero
   * caused by not understanding the skill — nudges evidenceConfidence up for those. */
  errorTypeModifiers: {
    blank: 0.85,
    'insufficient-volume': 0.9,
    unknown: 1.0,
  } satisfies Record<RescueErrorType, number>,
  perSkill: {
    felicitare: { trainability: 0.85, trainingCost: 1, transferReliability: 0.85 },
    'eseu-volum': { trainability: 0.85, trainingCost: 1, transferReliability: 0.85 },
    'transformare-gramaticala': { trainability: 0.85, trainingCost: 1, transferReliability: 0.85 },
    dialog: { trainability: 0.7, trainingCost: 2, transferReliability: 0.7 },
    'intrebari-directe': { trainability: 0.7, trainingCost: 2, transferReliability: 0.7 },
    'enunt-reflexiv': { trainability: 0.7, trainingCost: 2, transferReliability: 0.7 },
    'eseu-repere': { trainability: 0.7, trainingCost: 2, transferReliability: 0.7 },
    concluzii: { trainability: 0.6, trainingCost: 2, transferReliability: 0.6 },
    'completare-text': { trainability: 0.6, trainingCost: 2, transferReliability: 0.6 },
    'sinonime-antonime': { trainability: 0.55, trainingCost: 3, transferReliability: 0.5 },
    'portret-caracterizare': { trainability: 0.4, trainingCost: 4, transferReliability: 0.4 },
    'eseu-coerenta': { trainability: 0.4, trainingCost: 4, transferReliability: 0.4 },
    corectitudine: { trainability: 0.3, trainingCost: 5, transferReliability: 0.3, excludedFromRanking: true },
  } satisfies Record<RescueSkillTag, SkillWeights>,
} as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/learning/rescueConfig.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/learning/rescueConfig.ts src/learning/rescueConfig.test.ts
git commit -m "feat(rescue): add pass/safety thresholds and optimizer weights config"
```

---

### Task 3: Tag `romanian-pr26.ts` with skillTag

**Files:**
- Modify: `src/data/exams/romanian-pr26.ts`
- Modify: `src/data/exams/romanian-pr26.test.ts`

**Interfaces:**
- Consumes: `RescueSkillTag` (Task 1).
- Produces: every `pr26` item/subCriterion now carries `skillTag`, enabling cross-paper
  corroboration in Task 6 (`confirmedStrong`) without requiring a second sitting of `sb26`.

- [ ] **Step 1: Write the failing test (append to the existing file)**

```ts
// append to src/data/exams/romanian-pr26.test.ts
it('every item (or its subCriteria) carries a skillTag', () => {
  for (const item of romanianPr26.items) {
    if (item.subCriteria && item.subCriteria.length > 0) {
      expect(item.skillTag).toBeUndefined() // atoms live on subCriteria, not both
      for (const c of item.subCriteria) expect(c.skillTag).toBeTruthy()
    } else {
      expect(item.skillTag).toBeTruthy()
    }
  }
})

it('item 5 is portret-caracterizare and item 6 is concluzii (pr26 order)', () => {
  expect(romanianPr26.items.find((i) => i.order === 5)?.skillTag).toBe('portret-caracterizare')
  expect(romanianPr26.items.find((i) => i.order === 6)?.skillTag).toBe('concluzii')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/exams/romanian-pr26.test.ts`
Expected: FAIL — `skillTag` is `undefined` everywhere.

- [ ] **Step 3: Add `skillTag` to every item/subCriterion in `romanian-pr26.ts`**

Using the verified Appendix AK mapping for `pr26`, add one `skillTag: '...'` line to each item
(or, where `subCriteria` exists, to each sub-criterion instead of the parent — never both):

```text
pr26-1  → skillTag: 'completare-text'
pr26-2  → skillTag: 'sinonime-antonime'
pr26-3  → skillTag: 'enunt-reflexiv'
pr26-4  → skillTag: 'intrebari-directe'
pr26-5  → skillTag: 'portret-caracterizare'
pr26-6  → skillTag: 'concluzii'
pr26-7  → skillTag: 'transformare-gramaticala'
pr26-8  → subCriteria: [ {id:'lexic', ..., skillTag:'dialog'}, {id:'replici', ..., skillTag:'dialog'} ]
pr26-9  → subCriteria: [ {id:'adresare',...,skillTag:'felicitare'}, {id:'ocazie',...,skillTag:'felicitare'}, {id:'urare',...,skillTag:'felicitare'}, {id:'asezare',...,skillTag:'felicitare'} ]
pr26-10 → subCriteria: [ {id:'repere',...,skillTag:'eseu-repere'}, {id:'coerenta',...,skillTag:'eseu-coerenta'}, {id:'volum',...,skillTag:'eseu-volum'} ]
pr26-11 → skillTag: 'corectitudine'
```

Edit each object literal in `src/data/exams/romanian-pr26.ts` in place — add the `skillTag`
field to the item (for 1,2,3,4,5,6,7,11) or to each entry of its `subCriteria` array (for
8,9,10). Do not add `skillTag` to the parent item when `subCriteria` is present.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/exams/romanian-pr26.test.ts`
Expected: PASS (all tests, including the two new ones and the three pre-existing ones).

- [ ] **Step 5: Run the full existing test/typecheck suite (regression gate)**

Run: `npm run typecheck && npx vitest run`
Expected: PASS — `skillTag` is optional in the type, so no other file should break.

- [ ] **Step 6: Commit**

```bash
git add src/data/exams/romanian-pr26.ts src/data/exams/romanian-pr26.test.ts
git commit -m "feat(rescue): tag pr26 items/subcriteria with Rescue skillTag"
```

---

### Task 4: Create `romanian-sb26.ts` and register it

**Files:**
- Create: `src/data/exams/romanian-sb26.ts`
- Create: `src/data/exams/romanian-sb26.test.ts`
- Modify: `src/data/exams/index.ts`

**Interfaces:**
- Consumes: `ExamPaper`, `RescueSkillTag` (Task 1).
- Produces: `romanianSb26: ExamPaper` (id `ro-sb26`), registered in `examPapersBySubject` and
  retrievable via `getExamPaper('ro-sb26')` — this is the diagnostic paper Task 9's
  `rescueService` uses.

- [ ] **Step 1: Write the failing test**

```ts
// src/data/exams/romanian-sb26.test.ts
import { describe, it, expect } from 'vitest'
import { romanianSb26 } from './romanian-sb26'

describe('romanianSb26', () => {
  it('has 11 items in order with unique ids', () => {
    expect(romanianSb26.items).toHaveLength(11)
    const ids = romanianSb26.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(11)
    expect(romanianSb26.items.map((i) => i.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('item maxPoints sum to the declared total (50)', () => {
    const sum = romanianSb26.items.reduce((s, i) => s + i.maxPoints, 0)
    expect(sum).toBe(romanianSb26.totalPoints)
    expect(romanianSb26.totalPoints).toBe(50)
  })

  it('carries the reading text and a 120-minute limit', () => {
    expect(romanianSb26.sourceText).toContain('Faptă mică')
    expect(romanianSb26.timeLimitMin).toBe(120)
  })

  it('item 5 is portret-caracterizare and item 6 is concluzii (sb26 order, matches pr26)', () => {
    expect(romanianSb26.items.find((i) => i.order === 5)?.skillTag).toBe('portret-caracterizare')
    expect(romanianSb26.items.find((i) => i.order === 6)?.skillTag).toBe('concluzii')
  })

  it('every item (or its subCriteria) carries a skillTag, never both', () => {
    for (const item of romanianSb26.items) {
      if (item.subCriteria && item.subCriteria.length > 0) {
        expect(item.skillTag).toBeUndefined()
        for (const c of item.subCriteria) expect(c.skillTag).toBeTruthy()
      } else {
        expect(item.skillTag).toBeTruthy()
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/exams/romanian-sb26.test.ts`
Expected: FAIL — `Cannot find module './romanian-sb26'`.

- [ ] **Step 3: Write `src/data/exams/romanian-sb26.ts`**

Full text/barem transcribed from `09_llroal_test_sb26.pdf` / `09_llroal_barem_sb26.pdf`
(official ANCE, Sesiunea de bază, 15.06.2026 — the exam these students actually sat).

```ts
import type { ExamPaper } from '@/types'

/**
 * ANCE (Republica Moldova) — Limba și literatura română, alolingvi,
 * Examen Național de Absolvire a Gimnaziului, Sesiunea de bază, 15.06.2026.
 * 120 min, total 50 puncte. Source PDFs: 09_llroal_test_sb26 / 09_llroal_barem_sb26.
 * `acceptedAnswers` ← "Răspuns corect/posibil"; `baremRule` ← "Specificări".
 * This is the real exam these students sat and need to recover points on — used as the
 * Exam Rescue Mode diagnostic paper (docs/superpowers/plans/2026-08-11-exam-rescue-mode.md).
 */
export const romanianSb26: ExamPaper = {
  id: 'ro-sb26',
  subjectId: 'romanian',
  year: 2026,
  title: 'Sesiunea de bază — Faptă mică sau… (gimnaziu, alolingvi)',
  timeLimitMin: 120,
  totalPoints: 50,
  sourceText: `Faptă mică sau …

Un bărbat a fost rugat să vopsească o barcă. Și-a adus vopsea, pensule și a început să lucreze. Barca trebuia să aibă o haină în roșu aprins. Așa i-a cerut proprietarul bărcii.

În timp ce vopsea, meșterul a observat o gaură (дыра) în carcasa bărcii și a reparat-o în liniște. Când a terminat de vopsit, a primit plata și a plecat.

A doua zi, stăpânul bărcii a venit la meșter și i-a înmânat un cec cu o sumă mult mai mare decât cea primită cu o zi înainte pentru vopsire.

Bărbatul a fost surprins:
– Dar mi-ați plătit deja pentru acest lucru, domnule!
– Dar această plată este pentru altceva, mult mai important. Este pentru că ai reparat barca.
– Of! Dar a fost un serviciu foarte mic... Nu merită să-mi plătiți o sumă atât de mare pentru ceva atât de mic, neînsemnat.
– Dragul meu, tu nu înțelegi. Uite ce s-a întâmplat. Când te-am rugat să vopsești barca, am uitat să-ți spun despre această gaură. Când barca s-a uscat, copiii mei au luat-o și au plecat la pescuit. Ei nu știau că exista o gaură. Iar eu nu eram acasă. Când m-am întors și am observat că ei au luat barca, m-am speriat. Eram disperat, pentru că mi-am amintit de gaură. Imaginează-ți bucuria mea când i-am văzut pe copii, întorcându-se de la pescuit sănătoși și voioși. Apoi am văzut că ai reparat-o! Arată atât de frumos! Acum înțelegi? Mi-ai salvat copiii, domnule! Nicio sumă de bani nu poate răsplăti micuța ta faptă mare. Îți mulțumesc din toată inima!`,
  items: [
    {
      id: 'sb26-1', order: 1, type: 'open', maxPoints: 3, skillTag: 'completare-text',
      prompt: 'Completează enunțurile, folosind textul. a) Proprietarul bărcii…; b) Meșterul…; c) Bucuria…',
      baremRule: 'Se acordă câte un punct pentru fiecare enunț completat corect. Se acceptă și alte variante adecvate.',
      acceptedAnswers: [
        '...a invitat un meșter să vopsească barca.',
        '...a renovat barca cu responsabilitate.',
        '... tatei era mare, copiii erau în siguranță.',
      ],
    },
    {
      id: 'sb26-2', order: 2, type: 'short', maxPoints: 4, skillTag: 'sinonime-antonime',
      prompt: 'Scrie, pentru cuvintele date, câte un sinonim, un antonim la forma inițială. a repara / a plăti (sinonime); mic / a se întoarce (antonime).',
      baremRule: 'Se acordă câte un punct pentru fiecare cuvânt identificat corect, la forma inițială. Nu se admit corectări.',
      acceptedAnswers: [
        'a renova', 'a vopsi', 'a face', 'a achita', 'a da bani',
        'mare', 'enorm', 'uriaș', 'a se duce', 'a merge', 'a pleca',
      ],
    },
    {
      id: 'sb26-3', order: 3, type: 'open', maxPoints: 2, skillTag: 'enunt-reflexiv',
      prompt: 'Scrie câte un enunț dezvoltat cu fiecare cuvânt: (1) a vedea; (2) a se vedea.',
      baremRule: 'Câte 1 punct pentru fiecare enunț logic, dezvoltat (subiect, predicat și minimum încă o parte de propoziție).',
    },
    {
      id: 'sb26-4', order: 4, type: 'open', maxPoints: 4, skillTag: 'intrebari-directe',
      prompt: 'Adresează-i meșterului 4 întrebări. Poți folosi cuvintele dumneavoastră sau vă/v-.',
      baremRule: 'Se acordă câte un punct pentru fiecare întrebare adecvată.',
    },
    {
      id: 'sb26-5', order: 5, type: 'open', maxPoints: 3, skillTag: 'portret-caracterizare',
      prompt: 'Realizează portretul moral al proprietarului bărcii în trei enunțuri argumentate.',
      baremRule: 'Se acordă câte un punct pentru fiecare enunț logic, argumentat.',
    },
    {
      id: 'sb26-6', order: 6, type: 'open', maxPoints: 2, skillTag: 'concluzii',
      prompt: 'Formulează două concluzii în baza textului citit.',
      baremRule: 'Se acordă câte un punct pentru fiecare concluzie adecvată.',
    },
    {
      id: 'sb26-7', order: 7, type: 'open', maxPoints: 5, skillTag: 'transformare-gramaticala',
      prompt: 'Pune cuvântul băieții la singular și rescrie enunțul, realizând modificările necesare: „Mergând spre casă, băieții, veseli și mulțumiți, au mers la o terasă și au băut ceai."',
      baremRule: 'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări). Nu se permit corectări.',
      acceptedAnswers: ['Mergând spre casă, băiatul, vesel și mulțumit, a mers la o terasă și a băut ceai.'],
    },
    {
      id: 'sb26-8', order: 8, type: 'open', maxPoints: 6,
      prompt: 'Continuă dialogul cu șase replici complete. Nu folosi replici de tipul: Bună ziua! La revedere! Respectă tema.\n- Victoria, vreau să organizăm acțiuni ecologice în satul/orașul nostru. Vrei să participi și tu?',
      baremRule: 'Se evaluează dialogul ca produs. Nu se acceptă replici dintr-un singur cuvânt.',
      subCriteria: [
        { id: 'lexic', title: { ru: 'Лексика', ro: 'Lexic' }, maxPoints: 2, rule: 'Lexic variat care corespunde temei (minimum 4-5 cuvinte).', skillTag: 'dialog' },
        { id: 'replici', title: { ru: 'Реплики', ro: 'Replici' }, maxPoints: 4, rule: '4 p. pentru 6 replici; 3 p. pentru 5 replici.', skillTag: 'dialog' },
      ],
    },
    {
      id: 'sb26-9', order: 9, type: 'open', maxPoints: 5,
      prompt: 'Scrie, în numele colegilor, o felicitare adresată Crinei Mogorean din Chișinău cu ocazia obținerii medaliei de bronz la Olimpiada Internațională de Chimie. Utilizează urări deosebite. Respectă rigorile de aranjare a textului în pagină.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'adresare', title: { ru: 'Обращение и концовка', ro: 'Adresare + încheiere' }, maxPoints: 1, rule: '1 p. pentru formula de adresare + cea de încheiere (dacă doar una → 0 p.).', skillTag: 'felicitare' },
        { id: 'ocazie', title: { ru: 'Повод', ro: 'Ocazia' }, maxPoints: 1, rule: '1 p. pentru indicarea ocaziei.', skillTag: 'felicitare' },
        { id: 'urare', title: { ru: 'Пожелание', ro: 'Urare' }, maxPoints: 2, rule: '2 p. pentru o urare deosebită; 1 p. pentru una simplă.', skillTag: 'felicitare' },
        { id: 'asezare', title: { ru: 'Оформление', ro: 'Așezare în pagină' }, maxPoints: 1, rule: '1 p. pentru așezarea corectă a textului în pagină.', skillTag: 'felicitare' },
      ],
    },
    {
      id: 'sb26-10', order: 10, type: 'open', maxPoints: 9,
      prompt: 'Scrie, în opt enunțuri, un eseu, pornind de la afirmația lui Nicolae Labiș: „Învățătura este o comoară pe care nimeni nu ți-o poate lua". Explică ce înseamnă pentru tine învățătura/cunoștințele; argumentează cu un exemplu din literatura română (Nicolae Dabija, „Rege între filozofi, filozof între regi") sau din viață; formulează o concluzie.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'repere', title: { ru: 'Соблюдение опор', ro: 'Respectarea reperelor' }, maxPoints: 3, rule: 'Respectarea celor trei repere date.', skillTag: 'eseu-repere' },
        { id: 'coerenta', title: { ru: 'Связность', ro: 'Coerență' }, maxPoints: 2, rule: '2 p. coerență deplină; 1 p. parțială; 0 p. lipsă.', skillTag: 'eseu-coerenta' },
        { id: 'volum', title: { ru: 'Объём', ro: 'Volum' }, maxPoints: 4, rule: '4 p. pentru 8 enunțuri; 3 p. pentru 6-7 enunțuri.', skillTag: 'eseu-volum' },
      ],
    },
    {
      id: 'sb26-11', order: 11, type: 'correctness', maxPoints: 7, skillTag: 'corectitudine',
      prompt: 'Corectitudinea exprimării în întreaga lucrare.',
      baremRule: '7 p. pentru 0-3 greșeli; 6 p. pentru 4-7; 5 p. pentru 8-11; 4 p. pentru 12-15; 3 p. pentru 16-19; 2 p. pentru 20-23; 1 p. pentru 24-27. Estimare cu încredere redusă.',
    },
  ],
}
```

Note item 8 has no `skillTag` on the parent (only its subCriteria do) — same rule as item 9/10.

- [ ] **Step 4: Register `sb26` in the exam index**

Edit `src/data/exams/index.ts`:

```ts
import type { ExamPaper, SubjectId } from '@/types'
import { romanianPr26 } from './romanian-pr26'
import { romanianSb26 } from './romanian-sb26'

/** Read-only exam papers per subject. pr26 stays first/default for the existing /exam screen. */
export const examPapersBySubject: Partial<Record<SubjectId, ExamPaper[]>> = {
  romanian: [romanianPr26, romanianSb26],
}
```

(`examPapersForSubject`/`getExamPaper` are unchanged — appending `romanianSb26` keeps
`examPapersForSubject('romanian')[0] === romanianPr26`, so `/exam`'s default is untouched.)

- [ ] **Step 5: Add a registry regression test**

Find `src/data/exams/index.test.ts`; if it does not exist, create it:

```ts
// src/data/exams/index.test.ts
import { describe, it, expect } from 'vitest'
import { examPapersForSubject, getExamPaper } from './index'

describe('exam paper registry', () => {
  it('still defaults romanian[0] to pr26 (existing /exam behavior unchanged)', () => {
    expect(examPapersForSubject('romanian')[0]?.id).toBe('ro-pr26')
  })

  it('registers sb26 alongside pr26', () => {
    const ids = examPapersForSubject('romanian').map((p) => p.id)
    expect(ids).toEqual(['ro-pr26', 'ro-sb26'])
  })

  it('getExamPaper finds sb26 by id', () => {
    expect(getExamPaper('ro-sb26')?.title).toContain('Faptă mică')
  })
})
```

- [ ] **Step 6: Run tests to verify everything passes**

Run: `npx vitest run src/data/exams/`
Expected: PASS — `romanian-pr26.test.ts`, `romanian-sb26.test.ts`, `index.test.ts` all green.

- [ ] **Step 7: Commit**

```bash
git add src/data/exams/romanian-sb26.ts src/data/exams/romanian-sb26.test.ts src/data/exams/index.ts src/data/exams/index.test.ts
git commit -m "feat(rescue): ingest sb26 as the Rescue Mode diagnostic paper"
```

---

### Task 5: `examAttemptRepo.listByPaper`

**Files:**
- Modify: `src/storage/repositories/examAttemptRepo.ts`
- Modify: `src/storage/repositories/examAttemptRepo.test.ts`

**Interfaces:**
- Produces: `examAttemptRepo.listByPaper(paperId: string): Promise<ExamAttempt[]>` — consumed
  by Task 9 (`rescueService`) for exposure/corroboration checks.

- [ ] **Step 1: Write the failing test (append to the existing file)**

```ts
it('listByPaper returns only attempts for that paper', async () => {
  await examAttemptRepo.add(makeAttempt({ id: 'a1', paperId: 'ro-pr26' }))
  await examAttemptRepo.add(makeAttempt({ id: 'a2', paperId: 'ro-sb26' }))
  await examAttemptRepo.add(makeAttempt({ id: 'a3', paperId: 'ro-pr26' }))
  const result = await examAttemptRepo.listByPaper('ro-pr26')
  expect(result.map((a) => a.id).sort()).toEqual(['a1', 'a3'])
})
```

Check the top of the existing test file for its `makeAttempt`-style fixture helper name and
reuse it verbatim; if none exists, add a minimal local factory matching `ExamAttempt`'s shape
(same fields `Exam.tsx` builds — see `src/screens/Exam.tsx:47-58`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/repositories/examAttemptRepo.test.ts`
Expected: FAIL — `examAttemptRepo.listByPaper is not a function`.

- [ ] **Step 3: Add the method**

Edit `src/storage/repositories/examAttemptRepo.ts`, add alongside `listBySubject`:

```ts
  async listByPaper(paperId: string): Promise<ExamAttempt[]> {
    return db.examAttempts.where('paperId').equals(paperId).toArray()
  },
```

(`paperId` is already an indexed field per the v2 Dexie schema, `'id, subjectId, paperId,
submittedAt'` — no migration needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/repositories/examAttemptRepo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/repositories/examAttemptRepo.ts src/storage/repositories/examAttemptRepo.test.ts
git commit -m "feat(rescue): add examAttemptRepo.listByPaper for exposure checks"
```

---

### Task 6a: Rescue engine — scoring atoms, review status, error classification

**Files:**
- Create: `src/learning/rescueEngine.ts`
- Test: `src/learning/rescueEngine.test.ts`

**Interfaces:**
- Consumes: `ExamItem`, `ExamPaper`, `BaremResult` (existing), `criteriaSlots` (from
  `@/learning/baremGrader`), `ScoringAtom`, `ReviewStatus`, `RescueErrorType` (Task 1),
  `RESCUE_CONFIG` (Task 2).
- Produces: `buildScoringAtoms(paper: ExamPaper, answersByItemId: Record<string,string>,
  results: BaremResult[]): ScoringAtom[]`, `reviewStatus(awarded: number, max: number, mode:
  GradeMode, lowConfidence?: boolean): ReviewStatus`, `classifyErrorType(item: ExamItem,
  subCriterionId: string | undefined, answer: string, awarded: number, max: number):
  RescueErrorType` — consumed by Task 6b/6c/9.

- [ ] **Step 1: Write the failing tests**

```ts
// src/learning/rescueEngine.test.ts
import { describe, it, expect } from 'vitest'
import { buildScoringAtoms, reviewStatus, classifyErrorType } from './rescueEngine'
import { romanianSb26 } from '@/data/exams/romanian-sb26'
import type { BaremResult, ExamItem } from '@/types'

describe('reviewStatus', () => {
  it('5/5 confident => correct', () => {
    expect(reviewStatus(5, 5, 'deterministic')).toBe('correct')
  })
  it('3/5 confident => partial', () => {
    expect(reviewStatus(3, 5, 'llm')).toBe('partial')
  })
  it('reliable 0/5 => incorrect', () => {
    expect(reviewStatus(0, 5, 'llm')).toBe('incorrect')
  })
  it('self mode => needs_review regardless of awarded', () => {
    expect(reviewStatus(5, 5, 'self')).toBe('needs_review')
  })
  it('lowConfidence => needs_review even with full credit', () => {
    expect(reviewStatus(5, 5, 'llm', true)).toBe('needs_review')
  })
})

describe('classifyErrorType', () => {
  const dialogItem: ExamItem = {
    id: 'x', order: 8, type: 'open', maxPoints: 6, prompt: 'p', baremRule: 'r',
    subCriteria: [
      { id: 'lexic', title: { en: 'l' }, maxPoints: 2, rule: 'r', skillTag: 'dialog' },
      { id: 'replici', title: { en: 'r' }, maxPoints: 4, rule: 'r', skillTag: 'dialog' },
    ],
  }
  it('blank answer => blank', () => {
    expect(classifyErrorType(dialogItem, 'replici', '   ', 0, 4)).toBe('blank')
  })
  it('dialog with fewer than 6 reply-lines and lost points => insufficient-volume', () => {
    const answer = '- Da.\n- Poate.\n- Nu știu.'
    expect(classifyErrorType(dialogItem, 'replici', answer, 2, 4)).toBe('insufficient-volume')
  })
  it('full credit => unknown (no error to classify)', () => {
    const answer = '- A.\n- B.\n- C.\n- D.\n- E.\n- F.'
    expect(classifyErrorType(dialogItem, 'replici', answer, 4, 4)).toBe('unknown')
  })
})

describe('buildScoringAtoms', () => {
  it('creates one atom per whole item when subCriteria is absent', () => {
    const results: BaremResult[] = [{
      itemId: 'sb26-5', perCriterion: [{ id: 'sb26-5', awarded: 2, max: 3, comment: '' }],
      awarded: 2, max: 3, advice: '', mode: 'llm',
    }]
    const atoms = buildScoringAtoms(romanianSb26, { 'sb26-5': 'text' }, results)
    const item5Atoms = atoms.filter((a) => a.itemId === 'sb26-5')
    expect(item5Atoms).toHaveLength(1)
    expect(item5Atoms[0]).toMatchObject({
      skillTag: 'portret-caracterizare', earnedPoints: 2, maxPoints: 3, source: 'exam-parent',
    })
  })

  it('creates one atom per subCriterion, never a parent atom, when subCriteria is present', () => {
    const results: BaremResult[] = [{
      itemId: 'sb26-9',
      perCriterion: [
        { id: 'adresare', awarded: 1, max: 1, comment: '' },
        { id: 'ocazie', awarded: 0, max: 1, comment: '' },
        { id: 'urare', awarded: 1, max: 2, comment: '' },
        { id: 'asezare', awarded: 1, max: 1, comment: '' },
      ],
      awarded: 3, max: 5, advice: '', mode: 'llm',
    }]
    const atoms = buildScoringAtoms(romanianSb26, { 'sb26-9': 'text' }, results)
    const item9Atoms = atoms.filter((a) => a.itemId === 'sb26-9')
    expect(item9Atoms).toHaveLength(4) // never a 5th "parent" atom
    expect(item9Atoms.reduce((s, a) => s + a.maxPoints, 0)).toBe(5) // no double counting
    expect(item9Atoms.every((a) => a.skillTag === 'felicitare')).toBe(true)
  })

  it('total atom maxPoints across the whole paper equals the paper total (50)', () => {
    const results: BaremResult[] = romanianSb26.items.map((item) => {
      const slots = item.subCriteria?.length
        ? item.subCriteria.map((c) => ({ id: c.id, awarded: 0, max: c.maxPoints, comment: '' }))
        : [{ id: item.id, awarded: 0, max: item.maxPoints, comment: '' }]
      return { itemId: item.id, perCriterion: slots, awarded: 0, max: item.maxPoints, advice: '', mode: 'self' as const }
    })
    const atoms = buildScoringAtoms(romanianSb26, {}, results)
    expect(atoms.reduce((s, a) => s + a.maxPoints, 0)).toBe(50)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/learning/rescueEngine.test.ts`
Expected: FAIL — `Cannot find module './rescueEngine'`.

- [ ] **Step 3: Write `src/learning/rescueEngine.ts` (this task's portion)**

```ts
import type {
  BaremResult, ExamItem, ExamPaper, GradeMode, RescueErrorType, ReviewStatus, ScoringAtom,
} from '@/types'
import { criteriaSlots } from './baremGrader'
import { RESCUE_CONFIG } from './rescueConfig'

/** 4-state credit/confidence status. Confidence (mode/lowConfidence) always wins over credit. */
export function reviewStatus(
  awarded: number,
  max: number,
  mode: GradeMode,
  lowConfidence?: boolean,
): ReviewStatus {
  if (mode === 'self' || lowConfidence) return 'needs_review'
  if (awarded >= max) return 'correct'
  if (awarded > 0) return 'partial'
  return 'incorrect'
}

const REPLY_LINE_RE = /^\s*[-–—]/

/** Deterministic-only classification (§G of the architecture plan): blank and
 * insufficient-volume are cheap to detect reliably; everything else stays 'unknown'
 * rather than guessing. */
export function classifyErrorType(
  item: ExamItem,
  subCriterionId: string | undefined,
  answer: string,
  awarded: number,
  max: number,
): RescueErrorType {
  if (!answer.trim()) return 'blank'
  if (awarded >= max) return 'unknown'

  if (subCriterionId === 'replici') {
    const replyLines = answer.split('\n').filter((l) => REPLY_LINE_RE.test(l)).length
    if (replyLines > 0 && replyLines < 5) return 'insufficient-volume'
  }
  if (subCriterionId === 'volum') {
    const sentences = answer.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean).length
    if (sentences > 0 && sentences < 6) return 'insufficient-volume'
  }
  return 'unknown'
}

function gradingConfidence(mode: GradeMode, lowConfidence?: boolean): number {
  const w = RESCUE_CONFIG.gradingConfidenceWeights
  return mode === 'self' || lowConfidence ? w.selfOrLowConfidence : w.deterministicOrConfidentLlm
}

/** Normalizes one BaremResult into ScoringAtoms: one atom per subCriterion when present,
 * else one atom for the whole item — reusing criteriaSlots() so this can never disagree
 * with what the grader itself already treats as the scoring unit. Never both levels at once. */
export function buildScoringAtoms(
  paper: ExamPaper,
  answersByItemId: Record<string, string>,
  results: BaremResult[],
): ScoringAtom[] {
  const resultByItemId = new Map(results.map((r) => [r.itemId, r]))
  const atoms: ScoringAtom[] = []

  for (const item of paper.items) {
    const result = resultByItemId.get(item.id)
    if (!result) continue
    const slots = criteriaSlots(item)
    const answer = answersByItemId[item.id] ?? ''
    const hasSubCriteria = Boolean(item.subCriteria && item.subCriteria.length > 0)

    for (const slot of slots) {
      const criterion = result.perCriterion.find((c) => c.id === slot.id)
      const awarded = criterion?.awarded ?? 0
      const skillTag = hasSubCriteria
        ? item.subCriteria?.find((c) => c.id === slot.id)?.skillTag
        : item.skillTag
      if (!skillTag) continue // data-integrity: every atom must be explicitly tagged (Task 3/4)

      atoms.push({
        id: `${paper.id}:${item.id}:${slot.id}`,
        paperId: paper.id,
        itemId: item.id,
        subCriterionId: hasSubCriteria ? slot.id : undefined,
        skillTag,
        earnedPoints: awarded,
        maxPoints: slot.max,
        gradingConfidence: gradingConfidence(result.mode, result.lowConfidence),
        errorType: classifyErrorType(item, hasSubCriteria ? slot.id : undefined, answer, awarded, slot.max),
        reviewStatus: reviewStatus(awarded, slot.max, result.mode, result.lowConfidence),
        source: hasSubCriteria ? 'exam-subcriterion' : 'exam-parent',
      })
    }
  }
  return atoms
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/learning/rescueEngine.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/learning/rescueEngine.ts src/learning/rescueEngine.test.ts
git commit -m "feat(rescue): scoring atoms, reviewStatus, deterministic error classification"
```

---

### Task 6b: Rescue engine — skill evidence and strength state

**Files:**
- Modify: `src/learning/rescueEngine.ts`
- Modify: `src/learning/rescueEngine.test.ts`

**Interfaces:**
- Consumes: `ScoringAtom[]` (Task 6a), `RESCUE_CONFIG` (Task 2), optionally a second paper's
  `ScoringAtom[]` for corroboration.
- Produces: `evaluateSkillEvidence(atoms: ScoringAtom[], corroboratingAtoms?: ScoringAtom[]):
  RescueSkillEvidence[]` — consumed by Task 6c (route selection) and Task 11 (UI zones).

- [ ] **Step 1: Write the failing tests (append)**

```ts
import { evaluateSkillEvidence } from './rescueEngine'
import type { ScoringAtom } from '@/types'

function atom(overrides: Partial<ScoringAtom>): ScoringAtom {
  return {
    id: 'a', paperId: 'ro-sb26', itemId: 'i', skillTag: 'felicitare',
    earnedPoints: 0, maxPoints: 1, gradingConfidence: 1, errorType: 'unknown',
    reviewStatus: 'incorrect', source: 'exam-parent', ...overrides,
  }
}

describe('evaluateSkillEvidence', () => {
  it('felicitare (4/5, near-complete) beats eseu-coerenta (0/2) in priority — worked example', () => {
    const felicitareAtoms = [atom({ skillTag: 'felicitare', earnedPoints: 4, maxPoints: 5 })]
    const coerentaAtoms = [atom({ skillTag: 'eseu-coerenta', earnedPoints: 0, maxPoints: 2 })]
    const evidence = evaluateSkillEvidence([...felicitareAtoms, ...coerentaAtoms])
    const felicitare = evidence.find((e) => e.skillTag === 'felicitare')!
    const coerenta = evidence.find((e) => e.skillTag === 'eseu-coerenta')!
    expect(felicitare.priority).toBeGreaterThan(coerenta.priority)
  })

  it('estimatedRecoverablePoints is a float, not rounded', () => {
    const evidence = evaluateSkillEvidence([atom({ earnedPoints: 4, maxPoints: 5 })])
    expect(Number.isInteger(evidence[0].estimatedRecoverablePoints)).toBe(false)
  })

  it('ratio >= safeRatio with confident grading and no corroboration => likelyStrong', () => {
    const evidence = evaluateSkillEvidence([atom({ earnedPoints: 5, maxPoints: 5, reviewStatus: 'correct' })])
    expect(evidence[0].state).toBe('likelyStrong')
  })

  it('ratio >= safeRatio corroborated by another paper => confirmedStrong', () => {
    const diagnostic = [atom({ paperId: 'ro-sb26', earnedPoints: 5, maxPoints: 5, reviewStatus: 'correct' })]
    const corroboration = [atom({ paperId: 'ro-pr26', earnedPoints: 4, maxPoints: 5, reviewStatus: 'correct' })]
    const evidence = evaluateSkillEvidence(diagnostic, corroboration)
    expect(evidence[0].state).toBe('confirmedStrong')
  })

  it('high trainingCost or low transferReliability => expensive, not recoverable', () => {
    const evidence = evaluateSkillEvidence([atom({ skillTag: 'portret-caracterizare', earnedPoints: 0, maxPoints: 3 })])
    expect(evidence[0].state).toBe('expensive')
  })

  it('corectitudine is excluded from ranking (priority 0, flagged expensive/excluded)', () => {
    const evidence = evaluateSkillEvidence([atom({ skillTag: 'corectitudine', earnedPoints: 2, maxPoints: 7 })])
    expect(evidence[0].priority).toBe(0)
  })

  it('needs_review-only evidence is uncertain, not recoverable', () => {
    const evidence = evaluateSkillEvidence([atom({ earnedPoints: 0, maxPoints: 5, reviewStatus: 'needs_review', gradingConfidence: 0.5 })])
    expect(evidence[0].state).toBe('uncertain')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/learning/rescueEngine.test.ts`
Expected: FAIL — `evaluateSkillEvidence is not exported`.

- [ ] **Step 3: Add `evaluateSkillEvidence` to `rescueEngine.ts`**

```ts
import type { RescueSkillEvidence, RescueSkillTag, StrengthState } from '@/types'

function partialCreditFactor(earned: number, max: number): number {
  const { base, span } = RESCUE_CONFIG.partialCreditFormula
  return max > 0 ? base + span * (earned / max) : base
}

function groupBySkill(atoms: import('@/types').ScoringAtom[]): Map<RescueSkillTag, import('@/types').ScoringAtom[]> {
  const map = new Map<RescueSkillTag, import('@/types').ScoringAtom[]>()
  for (const a of atoms) {
    const list = map.get(a.skillTag) ?? []
    list.push(a)
    map.set(a.skillTag, list)
  }
  return map
}

function classifyState(
  ratio: number,
  weights: { trainingCost: number; transferReliability: number; excludedFromRanking?: boolean },
  corroborated: boolean,
  allNeedsReview: boolean,
): StrengthState {
  const { safeRatio, expensiveCostAbove, expensiveReliabilityBelow } = RESCUE_CONFIG.zoneThresholds
  if (allNeedsReview) return 'uncertain'
  if (ratio >= safeRatio) return corroborated ? 'confirmedStrong' : 'likelyStrong'
  if (weights.trainingCost > expensiveCostAbove || weights.transferReliability < expensiveReliabilityBelow) {
    return 'expensive'
  }
  return 'recoverable'
}

/** Aggregates atoms per skillTag into evidence + priority. `corroboratingAtoms`, if given
 * (e.g. from a different already-attempted paper), can promote likelyStrong to
 * confirmedStrong per plan §I — one diagnostic observation alone is never "confirmed". */
export function evaluateSkillEvidence(
  atoms: import('@/types').ScoringAtom[],
  corroboratingAtoms: import('@/types').ScoringAtom[] = [],
): RescueSkillEvidence[] {
  const bySkill = groupBySkill(atoms)
  const corroborationBySkill = groupBySkill(corroboratingAtoms)

  return Array.from(bySkill.entries()).map(([skillTag, skillAtoms]) => {
    const earnedPoints = skillAtoms.reduce((s, a) => s + a.earnedPoints, 0)
    const maxPoints = skillAtoms.reduce((s, a) => s + a.maxPoints, 0)
    const lostPoints = maxPoints - earnedPoints
    const ratio = maxPoints > 0 ? earnedPoints / maxPoints : 0
    const weights = RESCUE_CONFIG.perSkill[skillTag]
    const allNeedsReview = skillAtoms.every((a) => a.reviewStatus === 'needs_review')

    const avgGradingConfidence = skillAtoms.reduce((s, a) => s + a.gradingConfidence, 0) / skillAtoms.length
    const errorModifier = skillAtoms.length
      ? skillAtoms.reduce((s, a) => s + RESCUE_CONFIG.errorTypeModifiers[a.errorType], 0) / skillAtoms.length
      : 1
    const evidenceConfidence = clamp01(avgGradingConfidence * partialCreditFactor(earnedPoints, maxPoints) * errorModifier)

    const corroboration = corroborationBySkill.get(skillTag)
    const corroborated = Boolean(
      corroboration && corroboration.reduce((s, a) => s + a.maxPoints, 0) > 0 &&
      corroboration.reduce((s, a) => s + a.earnedPoints, 0) / corroboration.reduce((s, a) => s + a.maxPoints, 0) >= RESCUE_CONFIG.zoneThresholds.safeRatio,
    )
    const state = classifyState(ratio, weights, corroborated, allNeedsReview)

    const excluded = Boolean(weights.excludedFromRanking) || state === 'confirmedStrong' || state === 'likelyStrong' || state === 'uncertain' || state === 'expensive'
    const estimatedRecoverablePoints = weights.excludedFromRanking
      ? 0
      : lostPoints * weights.trainability * weights.transferReliability * evidenceConfidence
    const priority = excluded || weights.trainingCost === 0 ? 0 : estimatedRecoverablePoints / weights.trainingCost

    return {
      skillTag,
      observations: skillAtoms.length,
      earnedPoints,
      maxPoints,
      performanceRatio: ratio,
      errorTypes: Array.from(new Set(skillAtoms.map((a) => a.errorType))),
      evidenceConfidence,
      state,
      estimatedRecoverablePoints,
      trainingCost: weights.trainingCost,
      transferReliability: weights.transferReliability,
      priority: state === 'recoverable' ? priority : 0,
    }
  })
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/learning/rescueEngine.test.ts`
Expected: PASS (18 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/learning/rescueEngine.ts src/learning/rescueEngine.test.ts
git commit -m "feat(rescue): skill evidence aggregation with likely/confirmed strength"
```

---

### Task 6c: Rescue engine — route selection

**Files:**
- Modify: `src/learning/rescueEngine.ts`
- Modify: `src/learning/rescueEngine.test.ts`

**Interfaces:**
- Consumes: `RescueSkillEvidence[]` (Task 6b), `currentScore: number`, `RESCUE_CONFIG`.
- Produces: `selectRescueRoute(evidence: RescueSkillEvidence[], currentScore: number):
  RescueSkillTag[]` — consumed by Task 9/11.

- [ ] **Step 1: Write the failing tests (append)**

```ts
import { selectRescueRoute } from './rescueEngine'

function evidence(overrides: Partial<import('@/types').RescueSkillEvidence>): import('@/types').RescueSkillEvidence {
  return {
    skillTag: 'felicitare', observations: 1, earnedPoints: 0, maxPoints: 5,
    performanceRatio: 0, errorTypes: ['unknown'], evidenceConfidence: 0.5,
    state: 'recoverable', estimatedRecoverablePoints: 1, trainingCost: 1,
    transferReliability: 0.8, priority: 1, ...overrides,
  }
}

describe('selectRescueRoute', () => {
  it('student already at/above safetyTarget (19/50) gets an empty route', () => {
    const route = selectRescueRoute([evidence({ priority: 5 })], 19)
    expect(route).toEqual([])
  })

  it('stops adding skills once the projected total reaches safetyTarget (18)', () => {
    const evs = [
      evidence({ skillTag: 'felicitare', priority: 3, estimatedRecoverablePoints: 5 }),
      evidence({ skillTag: 'dialog', priority: 2, estimatedRecoverablePoints: 4 }),
      evidence({ skillTag: 'intrebari-directe', priority: 1, estimatedRecoverablePoints: 3 }),
    ]
    const route = selectRescueRoute(evs, 10) // 10 + 5 + 4 = 19 >= 18, third skill not needed
    expect(route).toEqual(['felicitare', 'dialog'])
  })

  it('never selects more than maxRescueSkills (4)', () => {
    const evs = Array.from({ length: 6 }, (_, i) =>
      evidence({ skillTag: (['felicitare','dialog','intrebari-directe','concluzii','completare-text','enunt-reflexiv'] as const)[i], priority: 6 - i, estimatedRecoverablePoints: 0.5 }))
    const route = selectRescueRoute(evs, 0)
    expect(route.length).toBeLessThanOrEqual(4)
  })

  it('never includes expensive/confirmedStrong/uncertain skills', () => {
    const evs = [
      evidence({ skillTag: 'felicitare', state: 'recoverable', priority: 2 }),
      evidence({ skillTag: 'portret-caracterizare', state: 'expensive', priority: 0 }),
      evidence({ skillTag: 'eseu-coerenta', state: 'confirmedStrong', priority: 0 }),
    ]
    const route = selectRescueRoute(evs, 5)
    expect(route).not.toContain('portret-caracterizare')
    expect(route).not.toContain('eseu-coerenta')
  })

  it('a single skill can be enough (route need not have a hard minimum)', () => {
    const route = selectRescueRoute([evidence({ priority: 5, estimatedRecoverablePoints: 10 })], 12)
    expect(route).toEqual(['felicitare'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/learning/rescueEngine.test.ts`
Expected: FAIL — `selectRescueRoute is not exported`.

- [ ] **Step 3: Add `selectRescueRoute` to `rescueEngine.ts`**

```ts
import type { RescueSkillTag } from '@/types'

/** Greedy, priority-ranked selection of 2–4 (never forced) recoverable skills, stopping once
 * the plausible projected total reaches safetyTarget. Never selects 'expensive',
 * 'confirmedStrong', 'likelyStrong', or 'uncertain' skills — see plan §N. */
export function selectRescueRoute(
  evidence: import('@/types').RescueSkillEvidence[],
  currentScore: number,
): RescueSkillTag[] {
  if (currentScore >= RESCUE_CONFIG.safetyTarget) return []

  const candidates = evidence
    .filter((e) => e.state === 'recoverable' && e.priority > 0)
    .sort((a, b) => b.priority - a.priority)

  const route: RescueSkillTag[] = []
  let projected = currentScore
  for (const candidate of candidates) {
    if (route.length >= RESCUE_CONFIG.maxRescueSkills) break
    if (projected >= RESCUE_CONFIG.safetyTarget) break
    route.push(candidate.skillTag)
    projected += candidate.estimatedRecoverablePoints
  }
  return route
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/learning/rescueEngine.test.ts`
Expected: PASS (23 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/learning/rescueEngine.ts src/learning/rescueEngine.test.ts
git commit -m "feat(rescue): deterministic route selection stopping at safetyTarget"
```

---

### Task 6d: Rescue engine — forecast

**Files:**
- Modify: `src/learning/rescueEngine.ts`
- Modify: `src/learning/rescueEngine.test.ts`

**Interfaces:**
- Consumes: `officialScore: number`, `paperMaxPoints: number`, per-skill
  `{skillTag, lostPoints, drillResults: BaremResult[]}[]`, `RESCUE_CONFIG`.
- Produces: `computeForecast(officialScore: number, paperMaxPoints: number, perSkillDrills:
  {skillTag: RescueSkillTag; lostPoints: number; drillResults: BaremResult[]}[]):
  RescueForecast` — consumed by Task 9/11.

- [ ] **Step 1: Write the failing tests (append)**

```ts
import { computeForecast } from './rescueEngine'
import type { BaremResult } from '@/types'

function drillResult(awarded: number, max: number, mode: BaremResult['mode'] = 'llm'): BaremResult {
  return { itemId: 'd', perCriterion: [{ id: 'd', awarded, max, comment: '' }], awarded, max, advice: '', mode }
}

describe('computeForecast', () => {
  it('never adds drill points directly to the official score', () => {
    const forecast = computeForecast(10, 50, [
      { skillTag: 'felicitare', lostPoints: 3, drillResults: [drillResult(5, 5), drillResult(5, 5)] },
    ])
    // Even with perfect drills, gain is capped by lostPoints (3), not the drill's own scale.
    expect(forecast.confirmedGain).toBeLessThanOrEqual(3)
    expect(forecast.potentialGain).toBeLessThanOrEqual(3)
  })

  it('confirmedGain and potentialGain never exceed that skill\'s lostPoints', () => {
    const forecast = computeForecast(10, 50, [
      { skillTag: 'dialog', lostPoints: 1, drillResults: [drillResult(6, 6), drillResult(6, 6), drillResult(6, 6)] },
    ])
    expect(forecast.confirmedGain).toBeLessThanOrEqual(1)
    expect(forecast.potentialGain).toBeLessThanOrEqual(1)
  })

  it('no drills yet => zero gain, forecast equals officialScore', () => {
    const forecast = computeForecast(10, 50, [{ skillTag: 'felicitare', lostPoints: 3, drillResults: [] }])
    expect(forecast.confirmedGain).toBe(0)
    expect(forecast.potentialGain).toBe(0)
    expect(forecast.conservativeForecast).toBe(10)
    expect(forecast.expectedForecast).toBe(10)
  })

  it('forecast never exceeds the paper max, even summed across many strong skills', () => {
    const perSkill = ['felicitare', 'dialog', 'intrebari-directe', 'concluzii'].map((skillTag) => ({
      skillTag: skillTag as import('@/types').RescueSkillTag,
      lostPoints: 20,
      drillResults: [drillResult(6, 6), drillResult(6, 6)],
    }))
    const forecast = computeForecast(45, 50, perSkill)
    expect(forecast.conservativeForecast).toBeLessThanOrEqual(50)
    expect(forecast.expectedForecast).toBeLessThanOrEqual(50)
  })

  it('confirmedForecast is always <= expectedForecast', () => {
    const forecast = computeForecast(10, 50, [
      { skillTag: 'felicitare', lostPoints: 3, drillResults: [drillResult(2, 5), drillResult(4, 5)] },
    ])
    expect(forecast.conservativeForecast).toBeLessThanOrEqual(forecast.expectedForecast)
  })

  it('officialScore field is the untouched diagnostic score', () => {
    const forecast = computeForecast(10, 50, [])
    expect(forecast.officialScore).toBe(10)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/learning/rescueEngine.test.ts`
Expected: FAIL — `computeForecast is not exported`.

- [ ] **Step 3: Add `computeForecast` to `rescueEngine.ts`**

```ts
import type { RescueForecast } from '@/types'

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** Drill performance is evidence, never exam points. confirmedGain requires the last two
 * drills (if there are at least two) to be confident and strong; potentialGain uses the best
 * single observation. Both are capped by lostPoints — see plan §Q/§R. */
function estimateSkillGain(
  lostPoints: number,
  drillResults: BaremResult[],
): { confirmedGain: number; potentialGain: number } {
  if (drillResults.length === 0) return { confirmedGain: 0, potentialGain: 0 }

  const ratios = drillResults.map((r) => (r.max > 0 ? r.awarded / r.max : 0))
  const allConfident = drillResults.every((r) => r.mode !== 'self' && !r.lowConfidence)
  const lastTwo = ratios.slice(-2)
  const consistentlyStrong = lastTwo.length >= 2 && lastTwo.every((r) => r >= 0.8) && allConfident
  const confirmedRatio = consistentlyStrong ? lastTwo.reduce((s, r) => s + r, 0) / lastTwo.length : 0
  const potentialRatio = Math.max(...ratios, confirmedRatio)

  const confirmedGain = clamp(lostPoints * confirmedRatio, 0, lostPoints)
  const potentialGain = clamp(Math.max(lostPoints * potentialRatio, confirmedGain), 0, lostPoints)
  return { confirmedGain, potentialGain }
}

export function computeForecast(
  officialScore: number,
  paperMaxPoints: number,
  perSkillDrills: { skillTag: import('@/types').RescueSkillTag; lostPoints: number; drillResults: BaremResult[] }[],
): RescueForecast {
  let confirmedGain = 0
  let potentialGain = 0
  for (const { lostPoints, drillResults } of perSkillDrills) {
    const gain = estimateSkillGain(lostPoints, drillResults)
    confirmedGain += gain.confirmedGain
    potentialGain += gain.potentialGain
  }

  const conservativeForecast = clamp(officialScore + confirmedGain, 0, paperMaxPoints)
  const expectedForecast = clamp(officialScore + potentialGain, 0, paperMaxPoints)
  const overallConfidence = perSkillDrills.length
    ? perSkillDrills.reduce((s, d) => s + (d.drillResults.length > 0 ? 1 : 0), 0) / perSkillDrills.length
    : 0

  return {
    officialScore,
    confirmedGain,
    potentialGain,
    conservativeForecast,
    expectedForecast,
    passThreshold: RESCUE_CONFIG.passThreshold,
    safetyTarget: RESCUE_CONFIG.safetyTarget,
    evidenceConfidence: overallConfidence,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/learning/rescueEngine.test.ts`
Expected: PASS (29 tests total).

- [ ] **Step 5: Re-export from the learning barrel**

Edit `src/learning/index.ts`, add:

```ts
export * from './rescueEngine'
export * from './rescueConfig'
```

- [ ] **Step 6: Run the full test suite + typecheck (regression gate)**

Run: `npm run typecheck && npx vitest run`
Expected: PASS, all pre-existing suites green.

- [ ] **Step 7: Commit**

```bash
git add src/learning/rescueEngine.ts src/learning/rescueEngine.test.ts src/learning/index.ts
git commit -m "feat(rescue): conservative/potential forecast with per-skill gain caps"
```

---

### Task 7: Dexie v3 migration — `rescueSessions`

**Files:**
- Modify: `src/storage/db.ts`
- Create: `src/storage/repositories/rescueSessionRepo.ts`
- Create: `src/storage/repositories/rescueSessionRepo.test.ts`
- Modify: `src/storage/index.ts`

**Interfaces:**
- Consumes: `RescueSession` (Task 1).
- Produces: `rescueSessionRepo.{add,get,update}` — consumed by Task 9.

- [ ] **Step 1: Write the failing test**

```ts
// src/storage/repositories/rescueSessionRepo.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../db'
import { rescueSessionRepo } from './rescueSessionRepo'
import type { RescueSession } from '@/types'

function makeSession(overrides: Partial<RescueSession> = {}): RescueSession {
  return {
    id: 'r1', subjectId: 'romanian', diagnosticAttemptId: 'a1', diagnosticPaperId: 'ro-sb26',
    seenPaperIds: ['ro-sb26', 'ro-pr26'], selectedSkills: ['felicitare'], skillEvidence: [],
    drillResults: [], forecastHistory: [], startedAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z', ...overrides,
  }
}

describe('rescueSessionRepo', () => {
  beforeEach(async () => { await db.rescueSessions.clear() })

  it('adds and retrieves a session by id', async () => {
    await rescueSessionRepo.add(makeSession())
    const found = await rescueSessionRepo.get('r1')
    expect(found?.selectedSkills).toEqual(['felicitare'])
  })

  it('update() upserts by id (matches examAttemptRepo.add pattern)', async () => {
    await rescueSessionRepo.add(makeSession())
    await rescueSessionRepo.update({ ...makeSession(), selectedSkills: ['felicitare', 'dialog'] })
    const found = await rescueSessionRepo.get('r1')
    expect(found?.selectedSkills).toEqual(['felicitare', 'dialog'])
  })

  it('does not affect existing examAttempts table (v1/v2 tables preserved)', async () => {
    await db.examAttempts.put({
      id: 'a1', subjectId: 'romanian', paperId: 'ro-sb26', startedAt: '', submittedAt: '',
      timeSpentSec: 0, answersByItemId: {}, results: [], totalAwarded: 0, totalMax: 50,
    })
    await rescueSessionRepo.add(makeSession())
    expect(await db.examAttempts.get('a1')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/repositories/rescueSessionRepo.test.ts`
Expected: FAIL — `Cannot find module './rescueSessionRepo'` / `db.rescueSessions` undefined.

- [ ] **Step 3: Add the v3 migration to `src/storage/db.ts`**

Edit the `PwsDatabase` class: add the field and the new `.version(3)` block (additive, mirrors
how v2 added `examAttempts` without redefining v1's stores):

```ts
  rescueSessions!: EntityTable<RescueSession, 'id'>

  constructor() {
    super('pws-rag-exam-coach')
    this.version(1).stores({ /* unchanged */ })
    this.version(2).stores({ /* unchanged */ })
    this.version(3).stores({
      rescueSessions: 'id, subjectId, diagnosticPaperId, updatedAt',
    })
  }
```

Add `RescueSession` to the type-only import list at the top of the file (alongside
`ExamAttempt`, `LearningEvent`, etc.).

- [ ] **Step 4: Write `src/storage/repositories/rescueSessionRepo.ts`**

```ts
import type { RescueSession } from '@/types'
import { db } from '../db'

export const rescueSessionRepo = {
  async add(session: RescueSession): Promise<void> {
    await db.rescueSessions.put(session)
  },
  async update(session: RescueSession): Promise<void> {
    await db.rescueSessions.put(session) // put = upsert by id, matches examAttemptRepo
  },
  async get(id: string): Promise<RescueSession | undefined> {
    return db.rescueSessions.get(id)
  },
}
```

- [ ] **Step 5: Extend `resetAllData()` and the storage barrel**

Edit `src/storage/index.ts`:

```ts
export { rescueSessionRepo } from './repositories/rescueSessionRepo'
```

and in `resetAllData()`, add `db.rescueSessions.clear(),` to the `Promise.all([...])` array.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/storage/repositories/rescueSessionRepo.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite (migration regression gate)**

Run: `npm run typecheck && npx vitest run`
Expected: PASS — confirms the v1→v2→v3 upgrade path doesn't break `profileRepo`,
`examAttemptRepo`, or any other existing repo test (all use the same `fake-indexeddb`
in-memory DB per test file).

- [ ] **Step 8: Commit**

```bash
git add src/storage/db.ts src/storage/repositories/rescueSessionRepo.ts src/storage/repositories/rescueSessionRepo.test.ts src/storage/index.ts
git commit -m "feat(rescue): add rescueSessions Dexie table (v3 migration)"
```

---

### Task 8: Microdrill content

**Files:**
- Create: `src/data/exams/microdrills.ts`
- Test: `src/data/exams/microdrills.test.ts`

**Interfaces:**
- Consumes: `DrillItem`, `RescueSkillTag` (Task 1).
- Produces: `microdrillsBySkill: Partial<Record<RescueSkillTag, DrillItem[]>>`,
  `microdrillsForSkill(tag: RescueSkillTag): DrillItem[]` — consumed by Task 9/11.

- [ ] **Step 1: Write the failing test**

```ts
// src/data/exams/microdrills.test.ts
import { describe, it, expect } from 'vitest'
import { microdrillsForSkill, microdrillsBySkill } from './microdrills'

describe('microdrills', () => {
  const p0Skills = ['felicitare', 'transformare-gramaticala', 'dialog', 'intrebari-directe', 'eseu-repere', 'eseu-volum'] as const

  it('every P0 skill has 3-6 drills', () => {
    for (const tag of p0Skills) {
      const drills = microdrillsForSkill(tag)
      expect(drills.length).toBeGreaterThanOrEqual(3)
      expect(drills.length).toBeLessThanOrEqual(6)
    }
  })

  it('every drill is tagged with the skill it lives under', () => {
    for (const tag of p0Skills) {
      for (const drill of microdrillsForSkill(tag)) expect(drill.skillTag).toBe(tag)
    }
  })

  it('every drill has a unique id within its skill group', () => {
    for (const tag of p0Skills) {
      const ids = microdrillsForSkill(tag).map((d) => d.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('unknown skill returns an empty array, not undefined', () => {
    expect(microdrillsForSkill('portret-caracterizare')).toEqual([])
  })

  it('microdrillsBySkill only registers the P0 skills for now', () => {
    expect(Object.keys(microdrillsBySkill).sort()).toEqual([...p0Skills].sort())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/exams/microdrills.test.ts`
Expected: FAIL — `Cannot find module './microdrills'`.

- [ ] **Step 3: Write `src/data/exams/microdrills.ts`**

```ts
import type { DrillItem, RescueSkillTag } from '@/types'

/**
 * Hand-authored practice items for Exam Rescue Mode microdrills — NOT exam content,
 * ordinary training material (see docs/superpowers/plans/2026-08-11-exam-rescue-mode.md §G).
 * Reuses the ExamItem barem shape so gradeItem() grades these exactly like exam items.
 */
export const microdrillsBySkill: Partial<Record<RescueSkillTag, DrillItem[]>> = {
  felicitare: [
    {
      id: 'drill-felicitare-1', skillTag: 'felicitare', type: 'open', maxPoints: 5,
      prompt: 'Scrie, în numele clasei, o felicitare adresată prietenei tale Ana cu ocazia zilei de naștere. Utilizează o urare deosebită. Respectă rigorile de aranjare a textului în pagină.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'adresare', title: { ru: 'Обращение и концовка', ro: 'Adresare + încheiere' }, maxPoints: 1, rule: '1 p. pentru formula de adresare + cea de încheiere.', skillTag: 'felicitare' },
        { id: 'ocazie', title: { ru: 'Повод', ro: 'Ocazia' }, maxPoints: 1, rule: '1 p. pentru indicarea ocaziei.', skillTag: 'felicitare' },
        { id: 'urare', title: { ru: 'Пожелание', ro: 'Urare' }, maxPoints: 2, rule: '2 p. pentru o urare deosebită; 1 p. pentru una simplă.', skillTag: 'felicitare' },
        { id: 'asezare', title: { ru: 'Оформление', ro: 'Așezare în pagină' }, maxPoints: 1, rule: '1 p. pentru așezarea corectă a textului în pagină.', skillTag: 'felicitare' },
      ],
    },
    {
      id: 'drill-felicitare-2', skillTag: 'felicitare', type: 'open', maxPoints: 5,
      prompt: 'Scrie, în numele familiei, o felicitare adresată bunicii tale cu ocazia sărbătorii de 8 Martie. Utilizează o urare deosebită. Respectă rigorile de aranjare a textului în pagină.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'adresare', title: { ru: 'Обращение и концовка', ro: 'Adresare + încheiere' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
        { id: 'ocazie', title: { ru: 'Повод', ro: 'Ocazia' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
        { id: 'urare', title: { ru: 'Пожелание', ro: 'Urare' }, maxPoints: 2, rule: '2 p. deosebită / 1 p. simplă.', skillTag: 'felicitare' },
        { id: 'asezare', title: { ru: 'Оформление', ro: 'Așezare în pagină' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
      ],
    },
    {
      id: 'drill-felicitare-3', skillTag: 'felicitare', type: 'open', maxPoints: 5,
      prompt: 'Scrie, în numele colegilor, o felicitare adresată profesoarei de limba română cu ocazia Zilei Limbii Române (31 august). Utilizează o urare deosebită. Respectă rigorile de aranjare a textului în pagină.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'adresare', title: { ru: 'Обращение и концовка', ro: 'Adresare + încheiere' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
        { id: 'ocazie', title: { ru: 'Повод', ro: 'Ocazia' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
        { id: 'urare', title: { ru: 'Пожелание', ro: 'Urare' }, maxPoints: 2, rule: '2 p. deosebită / 1 p. simplă.', skillTag: 'felicitare' },
        { id: 'asezare', title: { ru: 'Оформление', ro: 'Așezare în pagină' }, maxPoints: 1, rule: '1 p.', skillTag: 'felicitare' },
      ],
    },
  ],
  'transformare-gramaticala': [
    {
      id: 'drill-transformare-1', skillTag: 'transformare-gramaticala', type: 'open', maxPoints: 5,
      prompt: 'Pune cuvântul copiii la singular și rescrie enunțul, realizând modificările necesare: „Copiii veseli au alergat repede spre casă și au povestit totul părinților."',
      baremRule: 'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări). Nu se admit corectări în cuvintele modificate.',
      acceptedAnswers: ['Copilul vesel a alergat repede spre casă și a povestit totul părinților.'],
    },
    {
      id: 'drill-transformare-2', skillTag: 'transformare-gramaticala', type: 'open', maxPoints: 5,
      prompt: 'Pune cuvântul fetele la singular și rescrie enunțul: „Fetele harnice au terminat tema și au ieșit la joacă în curte."',
      baremRule: 'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări).',
      acceptedAnswers: ['Fata harnică a terminat tema și a ieșit la joacă în curte.'],
    },
    {
      id: 'drill-transformare-3', skillTag: 'transformare-gramaticala', type: 'open', maxPoints: 5,
      prompt: 'Pune cuvântul elevii la singular și rescrie enunțul: „Elevii atenți au ascultat explicația și au notat ideile principale."',
      baremRule: 'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări).',
      acceptedAnswers: ['Elevul atent a ascultat explicația și a notat ideile principale.'],
    },
    {
      id: 'drill-transformare-4', skillTag: 'transformare-gramaticala', type: 'open', maxPoints: 5,
      prompt: 'Pune cuvântul prietenii la singular și rescrie enunțul: „Prietenii mei buni m-au ajutat mereu și m-au susținut la nevoie."',
      baremRule: 'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări).',
      acceptedAnswers: ['Prietenul meu bun m-a ajutat mereu și m-a susținut la nevoie.'],
    },
  ],
  dialog: [
    {
      id: 'drill-dialog-1', skillTag: 'dialog', type: 'open', maxPoints: 6,
      prompt: 'Continuă dialogul cu șase replici complete. Nu folosi replici de tipul: Bună ziua! La revedere! Respectă tema.\n- Andrei, ce plănuiești să faci în vacanța de vară?',
      baremRule: 'Se evaluează dialogul ca produs. Nu se acceptă replici dintr-un singur cuvânt.',
      subCriteria: [
        { id: 'lexic', title: { ru: 'Лексика', ro: 'Lexic' }, maxPoints: 2, rule: 'Lexic variat, minimum 4-5 cuvinte, corespunde temei.', skillTag: 'dialog' },
        { id: 'replici', title: { ru: 'Реплики', ro: 'Replici' }, maxPoints: 4, rule: '4 p. pentru 6 replici; 3 p. pentru 5 replici.', skillTag: 'dialog' },
      ],
    },
    {
      id: 'drill-dialog-2', skillTag: 'dialog', type: 'open', maxPoints: 6,
      prompt: 'Continuă dialogul cu șase replici complete. Nu folosi replici de tipul: Bună ziua! La revedere! Respectă tema.\n- Maria, ai citit vreo carte interesantă în ultima vreme? Care?',
      baremRule: 'Se evaluează dialogul ca produs. Nu se acceptă replici dintr-un singur cuvânt.',
      subCriteria: [
        { id: 'lexic', title: { ru: 'Лексика', ro: 'Lexic' }, maxPoints: 2, rule: 'Lexic variat, corespunde temei.', skillTag: 'dialog' },
        { id: 'replici', title: { ru: 'Реплики', ro: 'Replici' }, maxPoints: 4, rule: '4 p. pentru 6 replici; 3 p. pentru 5 replici.', skillTag: 'dialog' },
      ],
    },
    {
      id: 'drill-dialog-3', skillTag: 'dialog', type: 'open', maxPoints: 6,
      prompt: 'Continuă dialogul cu șase replici complete. Nu folosi replici de tipul: Bună ziua! La revedere! Respectă tema.\n- Nicu, crezi că este important să faci sport? De ce?',
      baremRule: 'Se evaluează dialogul ca produs. Nu se acceptă replici dintr-un singur cuvânt.',
      subCriteria: [
        { id: 'lexic', title: { ru: 'Лексика', ro: 'Lexic' }, maxPoints: 2, rule: 'Lexic variat, corespunde temei.', skillTag: 'dialog' },
        { id: 'replici', title: { ru: 'Реплики', ro: 'Replici' }, maxPoints: 4, rule: '4 p. pentru 6 replici; 3 p. pentru 5 replici.', skillTag: 'dialog' },
      ],
    },
  ],
  'intrebari-directe': [
    {
      id: 'drill-intrebari-1', skillTag: 'intrebari-directe', type: 'open', maxPoints: 4,
      prompt: 'Mihai este un elev pasionat de fotbal, care se antrenează zilnic în echipa școlii. Adresează-i lui Mihai patru întrebări directe, folosind: tu/tău/ție.',
      baremRule: 'Se acordă câte un punct pentru fiecare întrebare directă adecvată.',
    },
    {
      id: 'drill-intrebari-2', skillTag: 'intrebari-directe', type: 'open', maxPoints: 4,
      prompt: 'Doamna Popescu este bibliotecara școlii de 20 de ani și organizează cluburi de lectură pentru elevi. Adresează-i doamnei Popescu patru întrebări directe, folosind: dumneavoastră/vă.',
      baremRule: 'Se acordă câte un punct pentru fiecare întrebare directă adecvată.',
    },
    {
      id: 'drill-intrebari-3', skillTag: 'intrebari-directe', type: 'open', maxPoints: 4,
      prompt: 'Ana a câștigat locul întâi la un concurs național de robotică. Adresează-i Anei patru întrebări directe, folosind: tu/tău/ție.',
      baremRule: 'Se acordă câte un punct pentru fiecare întrebare directă adecvată.',
    },
  ],
  'eseu-repere': [
    {
      id: 'drill-eseu-repere-1', skillTag: 'eseu-repere', type: 'open', maxPoints: 2,
      prompt: 'Scrie un text de exact 4 enunțuri la tema „Prietenia adevărată". Respectă reperele: a) explică ce înseamnă pentru tine prietenia; b) dă un exemplu concret.',
      baremRule: '1 p. pentru fiecare reper respectat (2 repere).',
      subCriteria: [{ id: 'repere', title: { ru: 'Опоры', ro: 'Repere' }, maxPoints: 2, rule: '1 p. per reper respectat.', skillTag: 'eseu-repere' }],
    },
    {
      id: 'drill-eseu-repere-2', skillTag: 'eseu-repere', type: 'open', maxPoints: 2,
      prompt: 'Scrie un text de exact 4 enunțuri la tema „Munca și succesul". Respectă reperele: a) explică ce înseamnă pentru tine munca; b) dă un exemplu concret.',
      baremRule: '1 p. pentru fiecare reper respectat (2 repere).',
      subCriteria: [{ id: 'repere', title: { ru: 'Опоры', ro: 'Repere' }, maxPoints: 2, rule: '1 p. per reper respectat.', skillTag: 'eseu-repere' }],
    },
    {
      id: 'drill-eseu-repere-3', skillTag: 'eseu-repere', type: 'open', maxPoints: 2,
      prompt: 'Scrie un text de exact 4 enunțuri la tema „Natura și omul". Respectă reperele: a) explică ce înseamnă pentru tine natura; b) dă un exemplu concret.',
      baremRule: '1 p. pentru fiecare reper respectat (2 repere).',
      subCriteria: [{ id: 'repere', title: { ru: 'Опоры', ro: 'Repere' }, maxPoints: 2, rule: '1 p. per reper respectat.', skillTag: 'eseu-repere' }],
    },
  ],
  'eseu-volum': [
    {
      id: 'drill-eseu-volum-1', skillTag: 'eseu-volum', type: 'open', maxPoints: 2,
      prompt: 'Scrie exact 4 enunțuri despre cartea ta preferată.',
      baremRule: '2 p. pentru exact 4 enunțuri; 1 p. pentru 3 enunțuri; 0 p. pentru mai puțin.',
      subCriteria: [{ id: 'volum', title: { ru: 'Объём', ro: 'Volum' }, maxPoints: 2, rule: '2 p. pentru 4 enunțuri; 1 p. pentru 3.', skillTag: 'eseu-volum' }],
    },
    {
      id: 'drill-eseu-volum-2', skillTag: 'eseu-volum', type: 'open', maxPoints: 2,
      prompt: 'Scrie exact 4 enunțuri despre orașul/satul tău natal.',
      baremRule: '2 p. pentru exact 4 enunțuri; 1 p. pentru 3 enunțuri; 0 p. pentru mai puțin.',
      subCriteria: [{ id: 'volum', title: { ru: 'Объём', ro: 'Volum' }, maxPoints: 2, rule: '2 p. pentru 4 enunțuri; 1 p. pentru 3.', skillTag: 'eseu-volum' }],
    },
    {
      id: 'drill-eseu-volum-3', skillTag: 'eseu-volum', type: 'open', maxPoints: 2,
      prompt: 'Scrie exact 4 enunțuri despre un hobby pe care îl practici.',
      baremRule: '2 p. pentru exact 4 enunțuri; 1 p. pentru 3 enunțuri; 0 p. pentru mai puțin.',
      subCriteria: [{ id: 'volum', title: { ru: 'Объём', ro: 'Volum' }, maxPoints: 2, rule: '2 p. pentru 4 enunțuri; 1 p. pentru 3.', skillTag: 'eseu-volum' }],
    },
  ],
}

export function microdrillsForSkill(tag: RescueSkillTag): DrillItem[] {
  return microdrillsBySkill[tag] ?? []
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/exams/microdrills.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/exams/microdrills.ts src/data/exams/microdrills.test.ts
git commit -m "feat(rescue): author P0 microdrill content for 6 high-ROI skills"
```

---

### Task 9: `rescueService` orchestration

**Files:**
- Create: `src/services/rescueService.ts`
- Test: `src/services/rescueService.test.ts`
- Modify: `src/services/index.ts`

**Interfaces:**
- Consumes: `gradeAttempt`, `gradeItem` (existing `examGraderService.ts`), `buildScoringAtoms`,
  `evaluateSkillEvidence`, `selectRescueRoute`, `computeForecast` (Task 6), `microdrillsForSkill`
  (Task 8), `examAttemptRepo.listByPaper` (Task 5), `rescueSessionRepo` (Task 7).
- Produces: `runDiagnostic(paper, answers, deps): Promise<{attempt, atoms, evidence, route}>`,
  `runDrillsForSkill(skillTag, deps): Promise<BaremResult[]>` (grades every drill for that
  skill against provided answers), `buildForecast(officialScore, atoms, drillResultsBySkill):
  RescueForecast` — consumed by Task 11 (`Rescue.tsx`).

- [ ] **Step 1: Write the failing test**

```ts
// src/services/rescueService.test.ts
import { describe, it, expect } from 'vitest'
import { runDiagnostic, buildForecast } from './rescueService'
import { romanianSb26 } from '@/data/exams/romanian-sb26'

describe('runDiagnostic', () => {
  it('grades the sb26 paper, builds atoms, evidence and a route, all from one pass', async () => {
    const answers: Record<string, string> = {}
    for (const item of romanianSb26.items) answers[item.id] = '' // fully blank, worst case
    const result = await runDiagnostic(romanianSb26, answers, { supportLanguage: 'ru' })

    expect(result.attempt.paperId).toBe('ro-sb26')
    expect(result.attempt.totalAwarded).toBe(0) // blank => 0 everywhere
    expect(result.atoms.length).toBeGreaterThan(0)
    expect(result.evidence.every((e) => e.skillTag)).toBe(true)
    expect(Array.isArray(result.route)).toBe(true)
  })
})

describe('buildForecast', () => {
  it('produces a forecast object with all required fields, capped at paper max', () => {
    const forecast = buildForecast(10, [], [])
    expect(forecast.officialScore).toBe(10)
    expect(forecast.conservativeForecast).toBeLessThanOrEqual(50)
    expect(forecast.expectedForecast).toBeLessThanOrEqual(50)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/rescueService.test.ts`
Expected: FAIL — `Cannot find module './rescueService'`.

- [ ] **Step 3: Write `src/services/rescueService.ts`**

```ts
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
  const atoms = buildScoringAtoms(paper, answersByItemId, graded.results)
  const evidence = evaluateSkillEvidence(atoms, corroboratingAtoms)
  const route = selectRescueRoute(evidence, graded.totalAwarded)
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

export function buildForecast(
  officialScore: number,
  perSkillLostPoints: { skillTag: RescueSkillTag; lostPoints: number }[],
  drillResultsBySkill: { skillTag: RescueSkillTag; results: BaremResult[] }[],
  paperMaxPoints = 50,
): RescueForecast {
  const drillsByTag = new Map(drillResultsBySkill.map((d) => [d.skillTag, d.results]))
  const perSkill = perSkillLostPoints.map(({ skillTag, lostPoints }) => ({
    skillTag,
    lostPoints,
    drillResults: drillsByTag.get(skillTag) ?? [],
  }))
  return computeForecast(officialScore, paperMaxPoints, perSkill)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/rescueService.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-export from the services barrel**

Edit `src/services/index.ts`, add:

```ts
export * from './rescueService'
```

- [ ] **Step 6: Run the full test suite + typecheck (regression gate)**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/rescueService.ts src/services/rescueService.test.ts src/services/index.ts
git commit -m "feat(rescue): orchestration service wiring diagnostic, drills, and forecast"
```

---

### Task 10: i18n keys

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ro.json`
- Modify: `src/i18n/locales/ru.json`

**Interfaces:**
- Produces: `rescue.*` translation keys — consumed by Task 11 (`Rescue.tsx`).

- [ ] **Step 1: Add the `rescue` block to `en.json`** (insert as a top-level sibling of the
  existing `"exam": {...}` block)

```json
"rescue": {
  "navTitle": "Rescue",
  "title": "Recover exam points",
  "intro": "Take the diagnostic exam once, then get a short, targeted plan to recover points before the retake.",
  "startDiagnostic": "Start diagnostic",
  "grading": "Grading your diagnostic…",
  "currentResult": "Current result",
  "passThreshold": "Passing threshold",
  "safetyTarget": "Safety target",
  "toSafetyTarget": "To safety target",
  "alreadySafe": "You are already above the safety target. Use a short consolidation round or Test B instead.",
  "safeZoneTitle": "Points you already reliably earn",
  "recoverableZoneTitle": "Where more points are easiest to find",
  "expensiveZoneTitle": "Higher-cost points (set aside for now)",
  "startRoute": "Start recovering {{points}} points",
  "drillProgress": "Drill {{current}} of {{total}}",
  "drillDone": "Skill practice complete",
  "before": "Before",
  "confirmedGain": "Confirmed gain",
  "potentialGain": "Potential gain",
  "conservativeForecast": "Reliable forecast",
  "expectedForecast": "Potential forecast",
  "startTestB": "Take independent Test B",
  "testBIntro": "A fresh, unpracticed variant — checks whether the trained skills transfer.",
  "transferConfirmed": "Transfer confirmed",
  "transferNotConfirmed": "Transfer not yet confirmed",
  "needsReview": "needs review",
  "skillTag": {
    "completare-text": "Completing sentences from the text",
    "sinonime-antonime": "Synonyms/antonyms",
    "enunt-reflexiv": "Reflexive-verb sentences",
    "intrebari-directe": "Direct questions",
    "concluzii": "Conclusions",
    "portret-caracterizare": "Moral portrait/characterization",
    "transformare-gramaticala": "Singular/plural transformation",
    "dialog": "Dialogue",
    "felicitare": "Greeting card (felicitare)",
    "eseu-repere": "Essay: anchors",
    "eseu-coerenta": "Essay: coherence",
    "eseu-volum": "Essay: length",
    "corectitudine": "Overall correctness"
  }
}
```

- [ ] **Step 2: Add the matching Romanian block to `ro.json`**

```json
"rescue": {
  "navTitle": "Recuperare",
  "title": "Recuperează puncte la examen",
  "intro": "Susține diagnosticul o dată, apoi primești un plan scurt și țintit pentru a recupera puncte înainte de restanță.",
  "startDiagnostic": "Începe diagnosticul",
  "grading": "Se evaluează diagnosticul…",
  "currentResult": "Rezultatul actual",
  "passThreshold": "Pragul de promovare",
  "safetyTarget": "Ținta de siguranță",
  "toSafetyTarget": "Până la ținta de siguranță",
  "alreadySafe": "Ești deja peste ținta de siguranță. Folosește o consolidare scurtă sau Testul B.",
  "safeZoneTitle": "Puncte deja sigure",
  "recoverableZoneTitle": "Unde e cel mai ușor de găsit puncte în plus",
  "expensiveZoneTitle": "Puncte costisitoare (deocamdată amânate)",
  "startRoute": "Începe recuperarea a {{points}} puncte",
  "drillProgress": "Exercițiul {{current}} din {{total}}",
  "drillDone": "Exercițiile pentru acest subiect s-au încheiat",
  "before": "Înainte",
  "confirmedGain": "Câștig confirmat",
  "potentialGain": "Câștig potențial",
  "conservativeForecast": "Prognoză sigură",
  "expectedForecast": "Prognoză potențială",
  "startTestB": "Susține Testul B independent",
  "testBIntro": "Un variant nou, neexersat — verifică dacă abilitățile antrenate se transferă.",
  "transferConfirmed": "Transfer confirmat",
  "transferNotConfirmed": "Transfer neconfirmat încă",
  "needsReview": "de verificat",
  "skillTag": {
    "completare-text": "Completarea enunțurilor din text",
    "sinonime-antonime": "Sinonime/antonime",
    "enunt-reflexiv": "Enunțuri cu verb reflexiv",
    "intrebari-directe": "Întrebări directe",
    "concluzii": "Concluzii",
    "portret-caracterizare": "Portret moral/caracterizare",
    "transformare-gramaticala": "Transformare singular/plural",
    "dialog": "Dialog",
    "felicitare": "Felicitare",
    "eseu-repere": "Eseu: repere",
    "eseu-coerenta": "Eseu: coerență",
    "eseu-volum": "Eseu: volum",
    "corectitudine": "Corectitudine generală"
  }
}
```

- [ ] **Step 3: Add the matching Russian block to `ru.json`**

```json
"rescue": {
  "navTitle": "Добор баллов",
  "title": "Добрать баллы на экзамене",
  "intro": "Пройдите диагностику один раз, затем получите короткий целевой план, чтобы добрать баллы до пересдачи.",
  "startDiagnostic": "Начать диагностику",
  "grading": "Проверяем диагностику…",
  "currentResult": "Текущий результат",
  "passThreshold": "Минимум для прохождения",
  "safetyTarget": "Безопасная цель",
  "toSafetyTarget": "До безопасной цели",
  "alreadySafe": "Вы уже выше безопасной цели. Используйте короткое закрепление или Test B.",
  "safeZoneTitle": "Уже ваши баллы",
  "recoverableZoneTitle": "Где проще всего найти ещё баллы",
  "expensiveZoneTitle": "Дорогие баллы (пока откладываем)",
  "startRoute": "Начать добор +{{points}} баллов",
  "drillProgress": "Упражнение {{current}} из {{total}}",
  "drillDone": "Серия упражнений завершена",
  "before": "Было",
  "confirmedGain": "Подтверждённый прирост",
  "potentialGain": "Потенциальный прирост",
  "conservativeForecast": "Надёжный прогноз",
  "expectedForecast": "Потенциальный прогноз",
  "startTestB": "Пройти независимый Test B",
  "testBIntro": "Свежий, ещё не тренированный вариант — проверяет, переносится ли навык.",
  "transferConfirmed": "Перенос подтверждён",
  "transferNotConfirmed": "Перенос пока не подтверждён",
  "needsReview": "нужна проверка",
  "skillTag": {
    "completare-text": "Дополнение предложений по тексту",
    "sinonime-antonime": "Синонимы/антонимы",
    "enunt-reflexiv": "Предложения с возвратным глаголом",
    "intrebari-directe": "Прямые вопросы",
    "concluzii": "Выводы",
    "portret-caracterizare": "Моральный портрет/характеристика",
    "transformare-gramaticala": "Преобразование ед./мн. число",
    "dialog": "Диалог",
    "felicitare": "Поздравление (felicitare)",
    "eseu-repere": "Эссе: опоры",
    "eseu-coerenta": "Эссе: связность",
    "eseu-volum": "Эссе: объём",
    "corectitudine": "Общая грамотность"
  }
}
```

- [ ] **Step 4: Verify JSON validity and run the app's i18n smoke check**

Run: `npm run typecheck` (catches malformed JSON imports) and, if one exists,
`npx vitest run src/i18n/` — if no i18n test file exists, skip this half and rely on
typecheck + Task 11's screen test.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/ro.json src/i18n/locales/ru.json
git commit -m "feat(rescue): add rescue.* i18n keys (en/ro/ru)"
```

---

### Task 11: `/rescue` screen

**Files:**
- Create: `src/screens/Rescue.tsx`
- Test: `src/screens/Rescue.test.tsx` (if the repo has screen-level tests; otherwise this
  task's test step is manual verification via `npm run dev`, per existing screens — check for
  a `*.test.tsx` next to `Dashboard.tsx`/`Practice.tsx` first to match convention)
- Modify: `src/screens/index.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/Layout.tsx`

**Interfaces:**
- Consumes: `runDiagnostic`, `runDrillsForSkill`, `buildForecast` (Task 9),
  `getExamPaper('ro-sb26')` (Task 4), `rescueSessionRepo` (Task 7), `examAttemptRepo`
  (existing), `useAppStore` (existing), `StatCard`/`DeltaBadge`/`ScoreBar` (existing
  `@/components/widgets`).
- Produces: `Rescue` screen component, mounted at `/rescue`.

- [ ] **Step 1: Check whether screen-level tests exist in this repo**

Run: `ls src/screens/*.test.tsx 2>/dev/null || echo "none"`

If none exist (expected — confirmed no `*.test.tsx` files under `src/screens/` in this
codebase as of this plan), skip straight to Step 2 and verify manually in Step 6/7 instead
of writing a component test, matching the existing convention (screens are covered by the
services/engine tests underneath them, not component tests).

- [ ] **Step 2: Write `src/screens/Rescue.tsx`**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RescueForecast, RescueSkillEvidence, RescueSkillTag } from '@/types'
import { getExamPaper } from '@/data/exams'
import { microdrillsForSkill } from '@/data/exams/microdrills'
import { runDiagnostic, runDrillsForSkill, buildForecast } from '@/services'
import { examAttemptRepo } from '@/storage'
import { useAppStore } from '@/app/store'
import { StatCard, ScoreBar } from '@/components/widgets'

type Phase = 'intro' | 'diagnosing' | 'route' | 'drill' | 'drill-done' | 'final'

const DIAGNOSTIC_PAPER_ID = 'ro-sb26'

export function Rescue() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const providerConfig = useAppStore((s) => s.providerConfig)
  const apiKey = useAppStore((s) => s.apiKey)

  const paper = getExamPaper(DIAGNOSTIC_PAPER_ID)
  const lang = profile?.interfaceLanguage ?? 'ru'

  const [phase, setPhase] = useState<Phase>('intro')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [officialScore, setOfficialScore] = useState(0)
  const [evidence, setEvidence] = useState<RescueSkillEvidence[]>([])
  const [route, setRoute] = useState<RescueSkillTag[]>([])
  const [activeSkillIndex, setActiveSkillIndex] = useState(0)
  const [drillAnswers, setDrillAnswers] = useState<Record<string, string>>({})
  const [drillResultsBySkill, setDrillResultsBySkill] = useState<{ skillTag: RescueSkillTag; results: import('@/types').BaremResult[] }[]>([])
  const [forecast, setForecast] = useState<RescueForecast | null>(null)

  if (!profile) return <p>{t('common.loading')}</p>
  if (!paper) return <p>{t('exam.noPaper')}</p>

  async function startDiagnostic() {
    setPhase('diagnosing')
    const priorAttempts = await examAttemptRepo.listByPaper('ro-pr26')
    const result = await runDiagnostic(paper!, answers, {
      supportLanguage: lang, providerConfig, apiKey, subjectId: profile!.currentSubjectId,
    })
    await examAttemptRepo.add(result.attempt)
    setOfficialScore(result.attempt.totalAwarded)
    setEvidence(result.evidence)
    setRoute(result.route)
    setPhase(result.route.length > 0 ? 'route' : 'final')
    if (priorAttempts.length === 0) {
      // No corroborating pr26 attempt on this device — evidence already degrades gracefully
      // to likelyStrong instead of confirmedStrong in that case (see rescueEngine).
    }
    if (result.route.length === 0) {
      setForecast(buildForecast(result.attempt.totalAwarded, [], []))
    }
  }

  async function submitDrillsForCurrentSkill() {
    const skillTag = route[activeSkillIndex]!
    const results = await runDrillsForSkill(skillTag, drillAnswers, {
      supportLanguage: lang, providerConfig, apiKey, subjectId: profile!.currentSubjectId,
    })
    const updated = [...drillResultsBySkill, { skillTag, results }]
    setDrillResultsBySkill(updated)
    setDrillAnswers({})

    if (activeSkillIndex + 1 < route.length) {
      setActiveSkillIndex((i) => i + 1)
      setPhase('drill')
    } else {
      const perSkillLostPoints = route.map((tag) => {
        const ev = evidence.find((e) => e.skillTag === tag)!
        return { skillTag: tag, lostPoints: ev.maxPoints - ev.earnedPoints }
      })
      setForecast(buildForecast(officialScore, perSkillLostPoints, updated))
      setPhase('final')
    }
  }

  const safe = evidence.filter((e) => e.state === 'likelyStrong' || e.state === 'confirmedStrong')
  const recoverable = evidence.filter((e) => e.state === 'recoverable')
  const expensive = evidence.filter((e) => e.state === 'expensive')

  return (
    <div>
      <h1>{t('rescue.title')}</h1>

      {phase === 'intro' && (
        <section className="card">
          <p>{t('rescue.intro')}</p>
          <button type="button" className="primary" onClick={() => void startDiagnostic()}>
            {t('rescue.startDiagnostic')}
          </button>
          {paper.items.map((item) => (
            <div key={item.id} style={{ marginTop: '0.6rem' }}>
              <label htmlFor={`rescue-ans-${item.id}`}>{item.order}. {item.prompt}</label>
              <textarea
                id={`rescue-ans-${item.id}`}
                value={answers[item.id] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [item.id]: e.target.value }))}
              />
            </div>
          ))}
        </section>
      )}

      {phase === 'diagnosing' && <p role="status">{t('rescue.grading')}</p>}

      {(phase === 'route' || phase === 'final') && (
        <section className="card">
          <StatCard label={t('rescue.currentResult')} value={`${officialScore} / ${paper.totalPoints}`} />
          <ScoreBar value={officialScore / paper.totalPoints} />
          <p>{t('rescue.passThreshold')}: {forecast?.passThreshold ?? officialScore}</p>
          <p>{t('rescue.safetyTarget')}: {forecast?.safetyTarget}</p>

          <h2>🟢 {t('rescue.safeZoneTitle')}</h2>
          <ul>{safe.map((e) => <li key={e.skillTag}>{t(`rescue.skillTag.${e.skillTag}`)}</li>)}</ul>

          <h2>🟡 {t('rescue.recoverableZoneTitle')}</h2>
          <ul>
            {recoverable.map((e) => (
              <li key={e.skillTag}>
                {t(`rescue.skillTag.${e.skillTag}`)} +{e.estimatedRecoverablePoints.toFixed(1)}
              </li>
            ))}
          </ul>

          {expensive.length > 0 && (
            <>
              <h2>🔴 {t('rescue.expensiveZoneTitle')}</h2>
              <ul>{expensive.map((e) => <li key={e.skillTag}>{t(`rescue.skillTag.${e.skillTag}`)}</li>)}</ul>
            </>
          )}

          {phase === 'route' && route.length > 0 && (
            <button type="button" className="primary" onClick={() => setPhase('drill')}>
              {t('rescue.startRoute', { points: route.reduce((s, tag) => s + (evidence.find((e) => e.skillTag === tag)?.estimatedRecoverablePoints ?? 0), 0).toFixed(1) })}
            </button>
          )}
        </section>
      )}

      {phase === 'drill' && route[activeSkillIndex] && (
        <section className="card">
          <h2>{t(`rescue.skillTag.${route[activeSkillIndex]}`)}</h2>
          {microdrillsForSkill(route[activeSkillIndex]!).map((drill, i) => (
            <div key={drill.id} style={{ marginBottom: '0.6rem' }}>
              <p>{t('rescue.drillProgress', { current: i + 1, total: microdrillsForSkill(route[activeSkillIndex]!).length })}</p>
              <p>{drill.prompt}</p>
              <textarea
                value={drillAnswers[drill.id] ?? ''}
                onChange={(e) => setDrillAnswers((a) => ({ ...a, [drill.id]: e.target.value }))}
              />
            </div>
          ))}
          <button type="button" className="primary" onClick={() => void submitDrillsForCurrentSkill()}>
            {t('rescue.drillDone')}
          </button>
        </section>
      )}

      {phase === 'final' && forecast && (
        <section className="card">
          <p>{t('rescue.before')}: {forecast.officialScore}</p>
          <p>{t('rescue.confirmedGain')}: +{forecast.confirmedGain.toFixed(1)}</p>
          <p>{t('rescue.potentialGain')}: +{forecast.potentialGain.toFixed(1)}</p>
          <p><strong>{t('rescue.conservativeForecast')}: {Math.round(forecast.conservativeForecast)}</strong></p>
          <p>{t('rescue.expectedForecast')}: {Math.round(forecast.expectedForecast)}</p>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Register the screen in the barrel, router, and nav**

Edit `src/screens/index.ts`, add:

```ts
export { Rescue } from './Rescue'
```

Edit `src/app/App.tsx` — add the import and the route (do not reorder/remove any existing
entries):

```ts
import { /* ...existing..., */ Rescue } from '@/screens'
// ...
{ path: 'rescue', element: <Rescue /> },
```

Edit `src/app/Layout.tsx` — add to `NAV_ITEMS` (after `'exam'`, before `'review'`, matching
existing array-literal style):

```ts
{ to: '/rescue', key: 'rescue' },
```

Add the nav label key to all three locale files' `"nav"` block (not the `rescue.*` block —
this is the short nav-bar label): `"rescue": "Rescue"` (en), `"rescue": "Recuperare"` (ro),
`"rescue": "Добор баллов"` (ru).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all suites including the new ones from Tasks 1-10.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`, open the app, complete onboarding if needed, click the new "Добор баллов"
nav link, submit the diagnostic (blank or filled answers are both fine for a smoke test),
confirm the route/drill/final phases render without console errors. This is the UI
verification step referenced in `AGENTS.md`-style guidance for frontend changes — do it
before marking this task done.

- [ ] **Step 7: Commit**

```bash
git add src/screens/Rescue.tsx src/screens/index.ts src/app/App.tsx src/app/Layout.tsx src/i18n/locales/en.json src/i18n/locales/ro.json src/i18n/locales/ru.json
git commit -m "feat(rescue): add /rescue screen with diagnostic -> route -> drill -> forecast flow"
```

---

### Task 12: Final regression pass

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS — every pre-existing suite (`examGraderService`, `baremGrader`,
`romanian-pr26`, `examAttemptRepo`, `export`, `rag/*`, `stats/*`, `llm/*`, etc.) plus every
new Rescue suite from Tasks 1-11, all green.

- [ ] **Step 2: Confirm `/exam` is untouched**

Run: `npx vitest run src/screens 2>/dev/null; npx vitest run src/data/exams/romanian-pr26.test.ts src/services/examGraderService.test.ts`
Expected: PASS. Manually reload `/exam` in the dev server (Step 6 of Task 11 already covers
`npm run dev`) and confirm it still shows `pr26` ("Fapte, nu vorbe") by default, unaffected by
the new `ro-sb26` registration.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors in any new file.

- [ ] **Step 4: Commit (only if any fixups were needed in Steps 1-3)**

```bash
git add -A
git commit -m "fix(rescue): address regression/lint findings from final pass"
```

(Skip this step entirely if nothing needed fixing.)

---

## Self-Review

**Spec coverage:** Task 1↔types (§H/§J/§V/§Y of the architecture plan); Task 2↔§C/§M
config; Task 3/4↔§B1/Appendix AK data + skillTag; Task 5↔§V exposure plumbing; Task
6a↔§E/§G/§J atoms/errorType/reviewStatus; Task 6b↔§H/§I evidence+strength; Task 6c↔§N route;
Task 6d↔§P/§Q/§R forecast; Task 7↔§Y/§Z persistence; Task 8↔§U microdrills; Task 9↔service
wiring all engine pieces to the existing grader; Task 10/11↔§AA/§AB UI; Task 12↔§AE
regression tests (44-48) and the student-case worked examples (§O, embedded as Task 6b/6c/6d
test assertions). Deferred by design (§AF P1/P2, §AG): sb25/ss25/exercise-test ingestion,
seenPaperIds/teacher-override UI, Test B flow end-to-end, teacher export extension,
multi-student dashboard — flagged below as explicitly out of scope for this plan.

**Not covered by this plan (intentionally, per P0 scope in the architecture plan's §AF) —
call this out to the user before execution:**
- `seenPaperIds` / teacher override UI and the Test B screen (§V/§W) — this plan builds the
  diagnostic→route→drill→forecast loop only; Test B needs its own follow-up plan once P0 is
  proven, per the architecture plan's explicit "one reliable Diagnostic + one fresh Test B"
  P0 framing. Flagging so it isn't mistaken for silently dropped scope.
- sb25/ss25 ingestion and the two ANCE *Teste pentru exersare* — P1, not in this plan.
- Teacher export extension (§AC) — P1, not in this plan.
- 1-4 grade bands — explicitly not fabricated; `RO_GIMNAZIU_GRADING_SCALE` only has 5-10.

**Placeholder scan:** no TBD/TODO in any task; every code block is complete, runnable
TypeScript with real values (weights, drill content, i18n strings) — no "similar to Task N"
references, no "add appropriate error handling" prose without code.

**Type consistency check:** `RescueSkillTag`, `ScoringAtom`, `RescueSkillEvidence`,
`RescueForecast`, `DrillItem`, `RescueSession` are defined once in Task 1 and used with
identical field names in every later task (`estimatedRecoverablePoints`, `confirmedGain`,
`potentialGain`, `conservativeForecast`, `expectedForecast`, `skillTag`, `lostPoints`
computed inline as `maxPoints - earnedPoints` consistently in Tasks 6b/9/11). `gradeItem`/
`gradeAttempt`/`criteriaSlots`/`GradeDeps` signatures match their actual current definitions
in `src/services/examGraderService.ts` and `src/learning/baremGrader.ts` (verified against
the source during Phase 0).

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-11-exam-rescue-mode-tasks.md`.**
