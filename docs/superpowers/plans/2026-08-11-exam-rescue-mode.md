# Exam Rescue Mode — Revised Implementation Plan

**Status:** PLAN ONLY — not implemented yet.
**Priority:** production-critical MVP for 6 students before 14 August 2026.
**Primary objective:** maximize the probability of gaining enough additional official
exam points with the smallest amount of targeted training.

**Origin:** this plan supersedes the corrected sections of
[`docs/superpowers/specs/2026-08-11-exam-rescue-mode-design.md`](../specs/2026-08-11-exam-rescue-mode-design.md)
(§B Test-B selection logic, §D skill-taxonomy-by-position, §E formula rounding, §F forecast
model, §H reviewStatus states, §I storage shape). That spec's §A (current-implementation
diagnosis), §B papers/PDF sourcing, and §C official grading table remain accurate and are
the evidence base for Phase 0 below.

---

## 1. Core objective

Exam Rescue Mode is not a Romanian-language course and is not a general remediation system.

The workflow is:

**Diagnostic → scoring atoms → skill evidence → likely/confirmed strengths → recoverable-point ranking → 1–4 targeted skills → microdrills → confirmation → conservative forecast → fresh Test B**

The system must answer:

1. How many points does the student currently obtain?
2. Which points appear reliable?
3. How many points are missing to pass?
4. Which lost points are cheapest and most reliable to recover?
5. What should the student train now?
6. Did the training produce evidence of improvement?
7. What is the conservative forecast?
8. Does the improvement transfer to a fresh official-style test?

The optimization target is not:

> fix the weakest skill

but:

> maximize expected reliable exam-point gain per unit of training time.

---

# A. PHASE 0 — Repository verification (RESOLVED)

## A1. Git state

```text
branch:            main
HEAD commit:       db22f7c0fc48dc380cf7f46c46505e0d840294d5
                    "docs: design spec for Exam Rescue Mode" (2026-08-11 17:30:45 +0300)
previous commit:    70fde62 "docs: refresh guide — tech stack, OpenVINO, voice, testing"
dirty working tree: yes — but only pre-existing, unrelated changes:
                     M src/i18n/locales/{en,ro,ru}.json (tabWarning copy, from an earlier
                       session, not part of this work)
                     ?? exam-results-smoke.png (untracked screenshot, unrelated)
                    No Rescue-Mode files exist yet; nothing has been implemented.
```

## A2. Exact current exam registration

```text
CURRENT_REPOSITORY_PAPERS:
  Exactly one: romanianPr26 (id "ro-pr26"), defined in src/data/exams/romanian-pr26.ts.
  git log --all --diff-filter=A --name-only -- '*sb25*' '*sb26*' returns nothing — no file
  named sb25/sb26 has EVER been added in this repository's history, on any branch. Only two
  commits ever touched src/data/exams/: 9921450 ("feat: pr26 Romanian mock exam data +
  registry") and d54e048 ("refactor: clearer getExamPaper filter, order assertion, pr26-2
  note"). All other remote branches (exam-disable-paste/copy/contextmenu, exam-tab-switch-
  guard, exam-autosubmit-*) are anti-cheat UX branches; none touch exam content.

CURRENT_DEFAULT_ROMANIAN_PAPER:
  romanianPr26 — "Pretestare — Fapte, nu vorbe (gimnaziu, alolingvi)", 26.02.2026, 50 pts.
  NOT sb25 ("Blând și talentat", sesiunea de bază 12.06.2025) — that paper's content has
  never existed in this codebase in any form.

HOW /exam SELECTS IT:
  src/data/exams/index.ts:
    export const examPapersBySubject = { romanian: [romanianPr26] }
    export function examPapersForSubject(subjectId) { return examPapersBySubject[subjectId] ?? [] }
  src/screens/Exam.tsx:21:
    const paper = profile ? examPapersForSubject(profile.currentSubjectId)[0] : undefined
  → first (and only) element of the array. No paperId selection UI exists.

EVIDENCE:
  src/data/exams/index.ts:1-11 (registry, shown above)
  src/data/exams/romanian-pr26.ts:1-15 (header/id/title)
  src/screens/Exam.tsx:21 (selection line)
  `git log --all --diff-filter=A --name-only -- '*sb25*' '*sb26*'` → empty output
```

**Conclusion on the discrepancy:** the *repository* (all branches, full history) has only
ever contained `pr26`. I could not directly verify the *live* `pws-rag-edu.pages.dev/exam`
deployment content — a fetch of that URL was declined this session. High-confidence reading:
"sb25" in the original brief was very likely a mix-up with the June design doc's *planned but
never-built* second variant (see [[2026-06-10-mock-exam-barem-grading-design]] §"Второй тест
sb25... вне скоупа"), not an actual divergent deployment. To close the last gap with
certainty: either open the live URL and check whether the reading passage is "Fapte, nu
vorbe" (= pr26, expected) or something else, or grant permission to fetch it. **Proceeding
on the repo's ground truth (pr26 is what's registered and deployed-from) unless you tell me
otherwise.**

## A3. Current grading pipeline (verified)

- **Deterministic:** `gradeShortDeterministic()` (`src/learning/baremGrader.ts`) — for
  `type: 'short'` items only. Normalizes case/diacritics/punctuation, splits the answer into
  candidate tokens, matches against `item.acceptedAnswers`, one point per distinct match,
  capped at `maxPoints`. Not single-string equality.
- **LLM:** `gradeItem()` (`src/services/examGraderService.ts`) — for `open`/`correctness`.
  Best-effort RAG retrieval (failure swallowed), `buildBaremGradePrompt()`
  (`src/llm/promptTemplates/barem.ts`) sends the per-subCriterion (or whole-item) rule list +
  accepted answers as guidance + student answer, `jsonMode` chat call, strict
  `parseBaremResponse()` clamps each slot to `[0,max]` and the item total to `maxPoints`.
- **Self fallback:** blank answer → immediate `selfResult()`; LLM failure / invalid JSON / no
  `perCriterion` → caught → `selfResult()`. Both set `mode: 'self'`, `lowConfidence: true`.
- **lowConfidence:** always `true` for `self`; for `llm` mode, `parseBaremResponse` sets it to
  `true` unconditionally for `type: 'correctness'` items (regardless of parse success), and
  leaves it unset for `open` items that parsed successfully.
- **Sub-criteria:** `criteriaSlots(item)` — returns `item.subCriteria` slots if present, else a
  single `[{id:item.id, max:item.maxPoints}]`. Used uniformly by `parseBaremResponse` and
  `selfResult`, so this repo already has exactly the "one atom per subcriterion, else one atom
  for the whole item" invariant Section E below needs — it should be **reused**, not
  reinvented.
- **Total:** `totalsOf(results)` sums `awarded`/`max` across item results.
  `gradeAttempt(paper, answersByItemId, deps)` grades every item sequentially.
- **Persistence:** `Exam.tsx submit()` builds `ExamAttempt` and calls
  `examAttemptRepo.add()` → `db.examAttempts.put()` (upsert by id — confirmed by the
  feedback-save path reusing `.add()`).

## A4. Current persistence (verified)

- Dexie `PwsDatabase` is at **version 2**. v1: `profiles, chunks, topics, learningEvents,
  topicMastery, modelRunMetrics, downloadedPacks, settings`. v2 adds `examAttempts: 'id,
  subjectId, paperId, submittedAt'`.
- `examAttemptRepo` exposes `add()`, `all()`, `listBySubject(subjectId)`. **No
  `listByPaper(paperId)` or `hasAttempt(paperId)` helper exists yet** — needed for exposure
  tracking (§V/§W below) and will have to be added (additive, no migration needed, `paperId`
  is already an indexed field).
- `profile.localId` — single anonymous per-device profile, no accounts, no multi-profile.
- `buildProgressExport()` already includes `examAttempts` verbatim in the export JSON;
  `validateProgressExport()` forbids personal-name fields.
- `resetAllData()` clears all 9 current tables; will need one more line for any new Rescue
  table.

### Gate

Repository state is verified and consistent with this plan's assumptions. **Proceeding.**

---

# B. Official exam data

## B1. Never infer skill from question number

Explicitly reject:

```ts
skill = item.order
```

or:

```ts
if (item.order === 5) skill = "concluzii"
```

because ANCE task ordering changes.

Known examples (**verified against the actual transcribed PDF text**, not assumed):

```text
SB25:
item 5 → concluzii, 2p
item 6 → caracterizare, 3p

SS25:
item 5 → concluzii, 2p
item 6 → caracterizare, 3p

SB26 / SS26 / PR26 (already in repo):
item 5 → portret/caracterizare, 3p
item 6 → concluzii, 2p
```

Full verified per-paper mapping is in **Appendix AK**.

2026 exercise papers (Teste pentru exersare, not yet sourced) may also use different
ordering — same rule applies once ingested.

Therefore every relevant scoring unit must explicitly contain its own semantic `skillTag`.

**Second, related finding not in the original correction (see Appendix AK for detail):** the
*sub-criterion breakdown itself* is not stable either. `felicitare` (item 9) has an explicit
4-part `subCriteria` list (`adresare`/`ocazie`/`urare`/`asezare`) in the barems for
pr26/sb26/ss26, but the sb25/ss25 barems describe it as prose ("1 punct pentru respectarea
convențiilor felicitării (formule de adresare/încheiere, urările, semnătura); 1 p. pentru
așezare") that does not cleanly decompose into the same 4 named atoms. Ingesting sb25/ss25's
`felicitare` item requires a judgment call verified against that paper's own barem text, not
copy-pasting pr26's `subCriteria` shape. Flagging this now so it isn't a silent bug during
Stage 1 (see §AK for the exact text of each version). `dialog` and the essay (`eseu-*`)
sub-criteria, by contrast, **are** structurally identical across all 5 papers (lexic 2p +
replici 4p/3p; repere 3p + coerență 2p + volum 4p) — safe to reuse that shape.

---

# C. Official score configuration

Create one exam-level configuration source.

Conceptually:

```ts
interface ExamScoringConfig {
  maxScore: number
  passThreshold: number
  safetyTarget: number
  gradeScale: GradeBand[]
}
```

For Rescue Mode:

```text
maxScore = 50

passThreshold = 13       OFFICIAL
safetyTarget = 18        PEDAGOGICAL HEURISTIC
```

Known official bands (confirmed by the user, from the official ANCE conversion table):

```text
13–20 → 5
21–28 → 6
29–36 → 7
37–44 → 8
45–47 → 9
48–50 → 10
```

### Important

The implementation must contain the complete official 2026 scale **1–10**, but ranges for
grades 1–4 must be taken from the verified official ANCE 2026 conversion document during
implementation. **Not yet sourced — do not infer or invent them.** Functionally, Rescue Mode
only needs `passThreshold` (13) and the bands ≥5 to operate (all six students are currently
below 13); the 1–4 bands are needed only for completeness of the grade-scale display and can
be added the moment the document is available, without touching any Rescue-engine logic.

Clearly label in code:

```text
OFFICIAL:
grade scale
passThreshold

PEDAGOGICAL:
safetyTarget
heuristic weights
training costs
transfer probabilities
```

---

# D. Semantic skill model

Suggested skill taxonomy:

```ts
type RescueSkillTag =
  | 'completare-text'
  | 'sinonime-antonime'
  | 'enunt-reflexiv'
  | 'enunt-dezvoltat'
  | 'intrebari-directe'
  | 'concluzii'
  | 'portret-caracterizare'
  | 'transformare-gramaticala'
  | 'dialog'
  | 'felicitare'
  | 'eseu-repere'
  | 'eseu-coerenta'
  | 'eseu-volum'
```

Do not tie these tags to item numbers.

Exam data itself carries the mapping.

Example:

```ts
{
  id: "q5",
  order: 5,
  skillTag: "concluzii"
}
```

Another paper may legally contain:

```ts
{
  id: "q5",
  order: 5,
  skillTag: "portret-caracterizare"
}
```

and the Rescue Engine must require no special-case code.

`corectitudine` (item 11) is intentionally **not** in this list — see §F.

---

# E. Normalized scoring atoms

## E1. Why

Optimizer logic must not operate directly on raw `ExamItem[]`, because some tasks contain
independently scored subcriteria.

Introduce a normalized representation:

```ts
interface ScoringAtom {
  id: string

  paperId: string
  itemId: string
  subCriterionId?: string

  skillTag: RescueSkillTag

  earnedPoints: number
  maxPoints: number

  gradingConfidence: number

  errorType: RescueErrorType

  source:
    | 'exam-parent'
    | 'exam-subcriterion'
}
```

## E2. Normalization rule

For each task:

### No subcriteria

Use parent item:

```text
ExamItem
→ one ScoringAtom
```

### Has scored subcriteria

Use:

```text
ExamSubCriterion[]
→ several ScoringAtoms
```

and DO NOT create an additional parent scoring atom.

**Implementation note:** `src/learning/baremGrader.ts`'s existing `criteriaSlots(item)` already
implements exactly this either/or rule (subCriteria slots if present, else one whole-item
slot) and is used consistently by both the LLM-parse and self-fallback paths (§A3). Building
`ScoringAtom` enumeration as a thin wrapper over `criteriaSlots()` + the matching
`BaremResult.perCriterion` entries reuses a proven invariant instead of re-deriving it.

Invariant:

```text
Σ ScoringAtom.maxPoints
=
official score represented by analyzed exam criteria
```

Never:

```text
parent 5p
+
subcriterion 2p
+
subcriterion 3p
```

if those subcriteria already constitute the same official 5 points.

Add an automated double-counting test.

---

# F. Corectitudine — cross-cutting metric

Do not include `corectitudine` in ordinary rescue-skill ranking.

Represent separately:

```ts
interface CrossCuttingMetric {
  type: 'corectitudine'
  earnedPoints: number
  maxPoints: number
  confidence: number
}
```

The 7 points remain part of the official score.

But optimizer must not say:

> Train corectitudine → easy +7

Improvement is indirect, for example through:

* shorter sentences;
* safer grammar;
* reusable correct constructions;
* fewer spelling mistakes;
* avoiding unnecessary linguistic complexity.

Initially:

```text
corectitudine:
included in officialScore
excluded from standard rescue-route ranking
```

A future version may model indirect improvement. Not MVP.

---

# G. Error model

```ts
type RescueErrorType =
  | 'blank'
  | 'skipped'
  | 'time-limited'
  | 'instruction-misunderstood'
  | 'content-error'
  | 'grammar-error'
  | 'partial-structure'
  | 'insufficient-volume'
  | 'weak-vocabulary'
  | 'off-topic'
  | 'grading-uncertain'
  | 'unknown'
```

Only classify automatically when evidence is adequate. Otherwise `unknown` is preferable to
false certainty.

**MVP-scoped classifier (deterministic, no new LLM dependency):** the diagnostic grading
pipeline already distinguishes blank answers (`answer.trim() === ''` → immediate
`selfResult()`, §A3) — that maps directly and reliably to `errorType: 'blank'` with zero new
code risk. Beyond blank vs. non-blank, automatic classification of the other error types
listed above needs either a small heuristic per scoring atom (e.g. `insufficient-volume` for
essay/dialog atoms where the answer's sentence/reply count is short of the barem's stated
count — countable deterministically from the answer text) or an LLM-derived tag folded into
the grading prompt's JSON response (higher value, higher implementation cost). Recommend:
implement the **countable heuristics** (`blank`, `insufficient-volume` for dialog/essay,
`skipped`) for P0; leave the rest as `unknown` until P1, per §AF.

### Why errorType matters

These results are not pedagogically equivalent:

```text
felicitare = 0/5, blank
```

versus:

```text
felicitare = 0/5, attempted but structurally incorrect
```

versus:

```text
felicitare = 3/5, one missing structural element
```

Therefore `errorType` influences trainability.

---

# H. Student skill evidence

```ts
type StrengthState =
  | 'uncertain'
  | 'likelyStrong'
  | 'confirmedStrong'
  | 'recoverable'
  | 'expensive'

interface RescueSkillEvidence {
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
```

---

# I. Strong-skill confirmation

**likelyStrong:** one diagnostic observation, ≈≥80% of official points, grading sufficiently
confident (not `self`/`lowConfidence`). Means "probably a strength," not "guaranteed exam
points."

**confirmedStrong:** requires additional evidence — another independent exam observation
**or** 1–2 short confirmation drills. Do not spend 6 exercises confirming an obvious
strength; the goal is only to reduce false confidence.

"Another independent exam observation" can come free of new work if the student already has
an `ExamAttempt` for a *different* paper (e.g. `pr26`, if they took it during the June pilot)
scoring similarly on the same `skillTag` — `examAttemptRepo.listBySubject()` already returns
everything needed to check this; no new query shape required, just aggregation logic in the
rescue engine.

---

# J. Review status

```ts
type ReviewStatus =
  | 'correct'
  | 'partial'
  | 'incorrect'
  | 'needs_review'
```

- **correct:** full (or effectively full) criterion satisfaction with adequate grading
  confidence.
- **partial:** some official criterion points received but not all (e.g. 3/5 felicitare).
- **incorrect:** reliable zero / failed criterion.
- **needs_review:** `mode === 'self'`, `lowConfidence === true`, invalid LLM response,
  ambiguous evaluation.

Never classify `1/5` as "likely correct" — this replaces the 3-state
`correct/likely_correct/needs_review` model from the original spec draft, which conflated
"how much credit" with "how confident is the grade."

---

# K. Rescue optimizer

Explicit deterministic heuristic. No ML, no hidden LLM prioritization.

## K1. Inputs

Per scoring atom: `lostPoints`, `performance`, `errorType`, `trainingCost`,
`transferReliability`, `evidenceConfidence`, `trainability`.

## K2. Internal values — floating point, no early rounding

```ts
estimatedRecoverablePoints =
  lostPoints * trainability * transferReliability * evidenceConfidence

priority = estimatedRecoverablePoints / trainingCost
```

This exact expression may be adjusted during implementation, but must stay deterministic,
explainable, monotonic, configurable, and testable. Do **not** `Math.round()` before ranking
— internal values like `0.43`, `1.18`, `2.36` stay floats; round only at the UI layer. This
replaces the original spec draft's `estimatedRecoverablePoints: number` (implied integer,
rounded inside the formula) — the type must be `number` (float) throughout the engine, with
rounding pushed to the presentation/view layer only.

---

# L. Trainability and error type

```text
base trainability by skill
× error-type modifier
× partial-performance evidence
```

**Highly recoverable:** `insufficient-volume`, `partial-structure`, `blank` on a strongly
template-based task.
**Medium:** `grammar-error`, `instruction-misunderstood`.
**Lower:** `weak-vocabulary`, `off-topic`, repeated content failure.

Exact coefficients are pedagogical heuristics and must be configurable in one place, with
each value commented (why this number).

---

# M. Initial per-skill heuristic review

Do not simply reuse the original spec draft's weights (which assigned e.g.
`sinonime-antonime` a flat low cost — rejected below).

**Very high rescue potential:** `felicitare`, `eseu-volum`, `transformare-gramaticala` —
structural, rule-based, high transfer, short practice cycle.

**High/medium:** `dialog`, `intrebari-directe`, `enunt-reflexiv`, `eseu-repere`.

**Medium:** `concluzii`, `completare-text`.

**Variable:** `sinonime-antonime` — do **not** assign `trainingCost = 1` automatically.
Unseen vocabulary may have poor transfer despite an apparently simple exercise format.

**Relatively expensive:** `portret-caracterizare`, `eseu-coerenta`.

All of these remain `PEDAGOGICAL HEURISTIC` and should be revisited after seeing the six
students' actual drill results.

---

# N. Route selection

```text
minimum = 1 when one skill is sufficient
usual = 2–4
maximum = 4 for MVP
```

Rank by `priority`. Greedily select while expected benefit is meaningful **and** the safety
target is not yet plausibly reached **and** route size < max. Stop when: (1) safety target is
plausibly reachable, (2) no worthwhile skills remain, or (3) max route size reached.

---

# O. Student cases (worked examples — must all pass as tests, §AE)

- **19/50** — already above `safetyTarget` (18). No automatic route. Show: "already above
  safety target, use consolidation / Test B instead."
- **15/50** — passed (`≥13`), below safety target. Needs ≈+3 buffer. Route: 1–2 skills, not 4.
- **12/50** — one point below passing. Still target 18. Prioritize high-transfer structural
  points (felicitare, transformare, dialog, eseu-volum).
- **10/50** — needs +3 to pass, +8 to safety target. The canonical Rescue Mode case: 2–4
  high-ROI targets.
- **5/50** — do not pretend 18 is easily reachable. Show an honest "+4 to +7 potential"
  range and frame the first goal as moving toward `passThreshold`, not `safetyTarget`. Do not
  fabricate success.

---

# P. Forecast redesign

Never compute `exam score + drill points` — drill results are evidence, not exam points.

```ts
interface RescueForecast {
  officialScore: number
  confirmedGain: number
  potentialGain: number
  conservativeForecast: number   // officialScore + confirmedGain
  expectedForecast: number       // officialScore + potentialGain
  passThreshold: number
  safetyTarget: number
  evidenceConfidence: number
}
```

---

# Q. Gain caps

Per scoring atom: `confirmedGain <= originalLostPoints` and `potentialGain <=
originalLostPoints`. `forecast <= 50`. No double counting across related subcriteria (ties
back to §E's atom invariant).

---

# R. How drill evidence becomes forecast evidence

Do not map `4/5 drill → +4 exam points`. Evaluate consistency across
`diagnostic evidence + guided drill + independent drill + confirmation drill`. Example:
diagnostic felicitare 1/5, scaffolded drill 3/5, two independent drills 4/5 each →
`confirmedGain: +2`, `potentialGain: +3` (not +4). Conversion stays deterministic and
conservative — exact thresholds are a P0 implementation detail, not decided here.

---

# S. Forecast display

```text
Текущий официальный результат: 10 / 50
Проходной порог: 13
Безопасная цель: 18

Надёжный прогноз: ~13
Потенциал: до ~16
```

Avoid false single-number precision when confidence is low. Never: "Вы получите 16."

---

# T. Microdrill engine

```text
explanation / pattern → guided task → independent task → confirmation
```

Usually 3–6 exercises, adaptive stopping: stop early on stable performance; on repeated
failure, simplify once, reassess expected gain, potentially abandon this skill and move to
the next higher-ROI target. Training time is scarce — do not run endless repetitions.

---

# U. MVP microdrills — P0 order

1. **felicitare** — structured, independently-scored criteria, strong transfer.
2. **transformare-gramaticala** — mechanical, easy immediate feedback, transferable.
3. **dialog** — predictable structural requirements, meaningful point potential.
4. **intrebari-directe** — reusable grammatical pattern, short practice.
5. **eseu-volum + eseu-repere** — length and anchor-usage are trainable independent of
   overall writing ability.

Then, only if necessary: `enunt-reflexiv`, `concluzii`, `completare-text`. Defer broad
vocabulary/coherence remediation unless a student's profile shows unusually strong ROI there.

---

# V. Paper exposure and Test B

```ts
type PaperExposureStatus = 'unknown' | 'seen' | 'completed' | 'fresh'

interface PaperExposure {
  paperId: string
  status: PaperExposureStatus
  source: 'local-history' | 'teacher' | 'student'
}
```

Dexie history is evidence, not truth: `No ExamAttempt != fresh paper` (a student may have sat
a paper on actual paper, never through the app). Teacher override is mandatory.

**Implementation note:** `examAttemptRepo` needs a new `listByPaper(paperId)` (or
`hasAttempt(paperId)`) method — does not exist yet (§A4), additive only, `paperId` is already
an indexed Dexie field so no migration is required for this specific addition.

---

# W. Test B selection

Test B must preferably be fresh, official or official-exercise-format, structurally
compatible, not used for microdrill examples. Automatic ranking may suggest candidates, but
**the teacher can always explicitly choose** "use this paper as Test B" or mark "student has
already seen this paper." Purpose: measure transfer, not memorization.

---

# X. Additional ANCE 2026 exercise papers

Add ANCE 2026 *Teste pentru exersare* Test 1 and Test 2 to the candidate data model **before**
treating previously-attempted 2026 papers as independent transfer tests. **Not yet sourced —
content and barem needed from you before ingestion; scaffold the data slot only until then
(same "don't fabricate" rule as the original brief).**

MVP does not require importing every historical paper before Rescue Mode works. Priority: one
reliable Diagnostic + one fresh Test B. Additional papers (sb25, ss25 — already transcribed
this session, see spec §B and Appendix AK — plus the two exercise tests once sourced) follow
in P1.

---

# Y. Persistence

```ts
interface RescueSession {
  id: string
  subjectId: SubjectId
  diagnosticAttemptId: string
  diagnosticPaperId: string
  seenPaperIds: string[]
  selectedSkills: RescueSkillTag[]
  skillEvidence: RescueSkillEvidence[]
  forecastHistory: RescueForecast[]
  testBPaperId?: string
  testBAttemptId?: string
  startedAt: string
  updatedAt: string
}
```

Do not duplicate full `ExamAttempt` data — reference existing attempts by id (the diagnostic
and Test B sittings are ordinary `ExamAttempt`s via the existing `examAttemptRepo`; only
Rescue-specific state needs a new table).

---

# Z. Dexie migration requirements

New table = version 3. Verify: existing attempts/profiles/progress preserved; reset clears
new Rescue state (extend `resetAllData()`); interrupted Rescue session resumes; no existing
table is destructively recreated (Dexie's additive `version(3).stores({ rescueSessions: ... })`
pattern, matching how v2 added `examAttempts` without touching v1 tables — same low-risk
pattern already proven in this codebase).

---

# AA. MVP UI

New route `/rescue`. States: diagnostic-result → rescue-analysis → route-preview → drill →
skill-confirmation → progress → final-forecast → Test-B → transfer-summary. No redesign of
`/exam`.

---

# AB. Student result view

```text
Текущий результат: 10 / 50
До проходного результата: +3
До безопасной цели: +8

🟢 Вероятно надёжные баллы …

🟡 Самые доступные дополнительные баллы
Felicitare          +2–3
Dialog              +1–2
Transformare        +1–2

[НАЧАТЬ ДОБОР БАЛЛОВ]
```

Never display "FAIL" / "ПРОВАЛ".

---

# AC. Teacher MVP

No multi-student dashboard yet. Extend the existing JSON export (already includes
`examAttempts`, §A4) with: diagnostic score/paper, likelyStrong/confirmedStrong skills,
selected route, microdrill results, confirmedGain/potentialGain,
conservativeForecast/expectedForecast, Test B paper/score, transfer verdict per skill.

---

# AD. Test B transfer analysis

```text
felicitare: Diagnostic 1/5 → drills confirm strong → Test B 4/5 → Transfer: confirmed
dialog:     Diagnostic 2/6 → drills 5/6 → Test B 2/6 → Transfer: not confirmed
```

More valuable than only comparing `10/50 → 16/50`, because it validates the Rescue strategy
itself, not just the score.

---

# AE. Required tests

**Exam data:** (1) every official paper totals exactly 50; (2) item ids unique; (3) skillTags
explicit; (4) skill is never inferred from `order`; (5) sb25 item 5 and ss26 item 5 may have
different tags safely (regression-proof of the swap found in §B1).

**Scoring atoms:** (6) parent without subcriteria → one atom; (7) item with scored
subcriteria → child atoms only; (8) parent+children cannot double count; (9) atom max-total
is correct.

**Score configuration:** (10) `passThreshold = 13`; (11) `safetyTarget = 18`; (12) complete
verified official grade scale exists (once 1–4 bands are sourced); (13) official vs.
heuristic values stored separately.

**Review state:** (14) 5/5 → correct; (15) 3/5 → partial; (16) reliable 0/5 → incorrect;
(17) self/lowConfidence → needs_review.

**Strength:** (18) one 80% observation → likelyStrong, not confirmedStrong; (19)
confirmation evidence promotes to confirmedStrong; (20) low-confidence grading cannot confirm
strength.

**Optimizer:** (21) floats preserved internally; (22) training cost influences priority; (23)
transfer reliability influences priority; (24) errorType influences trainability; (25) large
lostPoints alone does not guarantee first priority; (26) high-ROI structural task can beat
large essay deficit (the felicitare-vs-eseu-coerenta worked example); (27) route may contain
1 skill; (28) route usually ≤4 skills; (29) route stops when further training has poor ROI;
(30) route does not claim safety target reachable when it is not.

**Forecast:** (31) drill points never directly added to official score; (32) `confirmedGain
<= lostPoints`; (33) `potentialGain <= lostPoints`; (34) `forecast <= 50`; (35) related
subcriteria cannot double count gain; (36) weak evidence produces a wider/lower-confidence
forecast.

**Corectitudine:** (37) included in official score; (38) not selected as a normal easy rescue
skill; (39) cannot produce an automatic "+7 rescue opportunity".

**Paper exposure:** (40) missing Dexie attempt does not imply fresh; (41) `seenPaperIds`
works; (42) teacher override works; (43) fresh Test B recommendation excludes known-seen
papers.

**Regression:** (44) existing `/exam` continues functioning; (45) existing grading behaviour
remains valid; (46) existing stored attempts remain readable; (47) existing export remains
compatible; (48) existing reset still works.

---

# AF. MVP priority

**P0 (must work before 14 August):** repository verification (done, §A); correct official
paper data (`ro-sb26` at minimum — the paper these students actually need to recover points
on); explicit skillTags verified per-paper (Appendix AK); scoring atoms; Rescue analyzer;
error-aware trainability (blank/insufficient-volume heuristics only, §G); likely/confirmed
strength; 1–4 skill route; high-value microdrills (§U's P0 list); conservative forecast;
seen-paper handling (`seenPaperIds` + teacher override, no auto-pool-pick); one fresh Test B
(single explicit teacher-picked paper, not the full 5-paper pool logic); persistence;
regression tests.

**P1 (after P0 is stable):** remaining historical papers (sb25, ss25 — already transcribed,
low-cost to ingest once P0 proves the data shape); the two Teste pentru exersare (once
sourced); more microdrill skill types; better heuristic calibration; enhanced teacher export.

**P2 (after the exam period):** multi-student dashboard, automatic heuristic calibration,
longitudinal analytics, visual redesign, larger training library.

---

# AG. Explicitly deferred

New account system; server-side student tracking; cloud analytics; ML prediction; automatic
"AI predicts final grade"; large teacher dashboard; all historical exam variants at once;
general Romanian remediation system.

---

# AH. Main risks

**CRITICAL** — wrong score/skill association (mitigation: explicit skillTag + scoring atoms +
cross-paper order-swap tests); forecast presented as fact (mitigation: officialScore /
confirmedGain / potentialGain kept separate, conservative language only); familiar paper
treated as independent (mitigation: seenPaperIds + teacher override + Test B freshness
state); double-counting subcriteria (mitigation: normalization invariant + automated tests,
reusing the existing `criteriaSlots()` proven pattern).

**HIGH** — LLM grading uncertainty (mitigation: `needs_review`, confidence propagation, never
use a low-confidence result to confirm mastery); overoptimistic heuristic coefficients
(mitigation: conservative defaults, configurable, calibrate after first students); too much
work before 14 August (mitigation: strict P0/P1/P2 separation, §AF).

**MEDIUM** — different devices lose exposure history (mitigation: teacher override +
lightweight exposure metadata); student succeeds on drill but fails transfer (mitigation:
Test B skill-level transfer analysis, §AD); vocabulary exercises appear deceptively easy
(mitigation: lower transfer assumption than procedural tasks, §M).

**LOW** — UI polish (defer); multi-student aggregation (use export temporarily, §AC).

---

# AI. Revised implementation sequence

Stage 0 (done, §A) → Stage 1: correct/normalize official exam data + explicit skillTags
(start with `ro-sb26` only for P0, per §AF) → Stage 2: `ScoringAtom` normalization (wrapping
`criteriaSlots()`) → Stage 3: review states + error evidence → Stage 4: Rescue analysis +
likely/confirmed strengths → Stage 5: deterministic rescue optimizer → Stage 6: forecast
model → Stage 7: first high-ROI microdrills (§U P0 list) → Stage 8: `/rescue` minimal UI →
Stage 9: paper exposure + one Test B → Stage 10: regression/migration tests → Stage 11:
manual end-to-end test using the five profiles in §O (5/50, 10/50, 12/50, 15/50, 19/50).

Only after all P0 tests are green should P1 work begin.

---

# AJ. Acceptance criteria

The MVP is ready only if, for an individual student, it can reliably answer all 14 questions
listed in the original brief (current official score; which points are reliable; which
skills have independent confirmation; points missing to passThreshold/safetyTarget; which
1–4 skills give the best realistic ROI and why; what to drill next; whether performance
improved consistently; confirmed vs. potential gain; conservative vs. expected forecast;
whether Test B was genuinely fresh or teacher-approved; whether trained skills transferred).
If the system cannot answer those without pretending to know more than the evidence
supports, it is not ready.

---

# Final design principle

Exam Rescue Mode is a **decision-support system**, not a scientific prediction model. Its
purpose: given this student's current evidence and very limited preparation time, where
should the next 30–90 minutes be spent to maximize the probability of gaining enough
additional official exam points? Every P0 decision must directly support that.

---

# Appendix AK — Verified per-paper skillTag mapping

Source: PDFs you provided this session (transcribed in full, not summarized), cross-checked
item-by-item against each paper's own prompt text and barem — not inferred from any other
paper's ordering.

| Item | pr26 | sb26 | sb25 | ss25 | ss26 |
|---|---|---|---|---|---|
| 1 (3p) | completare-text | completare-text | completare-text | completare-text | completare-text |
| 2 (4p) | sinonime-antonime | sinonime-antonime | sinonime-antonime | sinonime-antonime | sinonime-antonime |
| 3 (2p) | enunt-reflexiv (a juca/a se juca) | enunt-reflexiv (a vedea/a se vedea) | enunt-reflexiv (a cunoaște/a se cunoaște) | enunt-reflexiv (a plânge/a se plânge) | enunt-reflexiv (a duce/a se duce) |
| 4 (4p) | intrebari-directe | intrebari-directe | intrebari-directe | intrebari-directe | intrebari-directe |
| **5** | **portret-caracterizare (3p)** | **portret-caracterizare (3p)** | **concluzii (2p)** | **concluzii (2p)** | **portret-caracterizare (3p)** |
| **6** | **concluzii (2p)** | **concluzii (2p)** | **portret-caracterizare (3p)** | **portret-caracterizare (3p)** | **concluzii (2p)** |
| 7 (5p) | transformare-gramaticala (plural→singular) | transformare-gramaticala (plural→singular) | transformare-gramaticala (plural→singular) | transformare-gramaticala (plural→singular) | transformare-gramaticala (**singular→plural** — reversed direction, same skill) |
| 8 (6p) | dialog (lexic 2 + replici 4) | dialog (lexic 2 + replici 4) | dialog (lexic 2 + replici 4) | dialog (lexic 2 + replici 4) | dialog (lexic 2 + replici 4) |
| 9 (5p) | felicitare (4 subcriteria: adresare 1/ocazie 1/urare 2/asezare 1) | felicitare (same 4 subcriteria) | felicitare (**barem prose only** — "convenții" 4×1p bundled + asezare 1p, not itemized the same way — needs a judgment call at ingestion, see §B1) | felicitare (same prose-bundled shape as sb25) | felicitare (same 4 explicit subcriteria as pr26/sb26) |
| 10 (9p) | eseu (repere 3/coerenta 2/volum 4) | same | same | same | same |
| 11 (7p) | corectitudine (cross-cutting) | same | same | same | same |

Bold rows = the exact swap the correction flagged, now confirmed character-for-character
against the source text. This table is authoritative for Stage 1 ingestion — no further
re-verification against the PDFs should be needed, only transcription into `ExamItem`/
`ExamSubCriterion.skillTag` fields.
