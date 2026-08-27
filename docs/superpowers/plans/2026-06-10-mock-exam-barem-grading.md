# Mock Exam with Barem-Based Grading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a 9th-grade student take an authentic past-year Romanian (alolingvi) mock exam (pr26 «Fapte, nu vorbe») and get barem-based scoring per item, then export the attempt for the pilot.

**Architecture:** Read-only exam content lives as a static TS module (no IndexedDB migration for content). A pure `baremGrader` handles deterministic short items; an `examGraderService` wires retrieval + a provider-neutral LLM grader for open items, with graceful fallback to self-assessment. A new `Exam` screen drives the timed flow; attempts are stored in a new Dexie table and added to the JSON export.

**Tech Stack:** TypeScript · React · Vite · Dexie (IndexedDB) · i18next · Zustand · Vitest. Provider-neutral LLM layer (`src/llm`), existing RAG retrieve (`src/services/ragService.ts`).

**Spec:** `docs/superpowers/specs/2026-06-10-mock-exam-barem-grading-design.md`

**Conventions in this repo:**
- Path alias `@/` → `src/`.
- Tests are colocated `*.test.ts(x)`, run by Vitest (jsdom, `fake-indexeddb` is set up in `src/test/setup.ts`).
- Run a single test file: `npm test -- src/path/file.test.ts`. Typecheck: `npm run typecheck`.
- Commit messages: `feat:`/`docs:` etc., end with the `Co-Authored-By` trailer already used in repo history.

---

## File Structure

**Create:**
- `src/types/exam.ts` — exam domain types (`ExamPaper`, `ExamItem`, `BaremResult`, `ExamAttempt`, …).
- `src/data/exams/romanian-pr26.ts` — the pr26 paper data (reading text + 11 items + baremes).
- `src/data/exams/index.ts` — registry `examPapersBySubject` + `getExamPaper(id)`.
- `src/learning/baremGrader.ts` — pure grading helpers (normalize, deterministic short grader, parse LLM JSON, totals).
- `src/learning/baremGrader.test.ts` — unit tests for the pure helpers.
- `src/llm/promptTemplates/barem.ts` — `buildBaremGradePrompt`.
- `src/services/examGraderService.ts` — `gradeItem`, `gradeAttempt` (retrieval + LLM + fallback).
- `src/services/examGraderService.test.ts` — short-path + fallback tests (mock provider).
- `src/storage/repositories/examAttemptRepo.ts` — `add`, `all`, `listBySubject`.
- `src/storage/repositories/examAttemptRepo.test.ts` — round-trip test.
- `src/screens/Exam.tsx` — the timed mock-exam screen.

**Modify:**
- `src/types/index.ts` — re-export `./exam`.
- `src/llm/promptTemplates/index.ts` — re-export `barem`.
- `src/storage/db.ts` — add `examAttempts` table (version 2).
- `src/storage/repositories/index.ts` — export `examAttemptRepo`.
- `src/services/index.ts` — export grader service.
- `src/services/exportService.ts` + `src/types/export.ts` — include `examAttempts` in the export.
- `src/data/chunks/romanian.chunks.ts` — add chunks from the test text (RAG grounding).
- `src/screens/index.ts`, `src/app/App.tsx`, `src/app/Layout.tsx` — register the screen + route + nav.
- `src/i18n/locales/{en,ru,ro}.json` — `exam.*` strings + `nav.exam`.

---

## Task 1: Exam domain types

**Files:**
- Create: `src/types/exam.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create the types module**

Create `src/types/exam.ts`:

```ts
import type { InterfaceLanguage, SubjectId } from './common'

/** short = deterministic-first; open = LLM-graded; correctness = cross-cutting. */
export type ExamItemType = 'short' | 'open' | 'correctness'

/** A sub-criterion inside a structured barem (e.g. essay: repere/coherence/volume). */
export interface ExamSubCriterion {
  id: string
  title: Partial<Record<InterfaceLanguage, string>>
  maxPoints: number
  /** Human-readable scoring rule, fed to the LLM grader. */
  rule: string
}

/** One task in an exam paper, carrying its official barem. */
export interface ExamItem {
  id: string
  order: number
  type: ExamItemType
  /** Task prompt as printed in the test. */
  prompt: string
  maxPoints: number
  /** Scoring rule text from the official barem ("Specificări"). */
  baremRule: string
  /** Reference/accepted answers ("Răspuns corect/posibil"); also LLM guidance. */
  acceptedAnswers?: string[]
  /** Structured sub-barem when the item is scored by parts. */
  subCriteria?: ExamSubCriterion[]
}

/** A full past-year test = reading text + ordered items + total. */
export interface ExamPaper {
  id: string
  subjectId: SubjectId
  year: number
  title: string
  /** Shared reading passage, if the items refer to one. */
  sourceText?: string
  timeLimitMin: number
  totalPoints: number
  items: ExamItem[]
}

/** Per-criterion awarded points produced by the grader. */
export interface BaremCriterionScore {
  id: string
  awarded: number
  max: number
  comment: string
}

/** How a single item's score was produced. */
export type GradeMode = 'deterministic' | 'llm' | 'self'

/** Grading result for one item. */
export interface BaremResult {
  itemId: string
  perCriterion: BaremCriterionScore[]
  awarded: number
  max: number
  advice: string
  mode: GradeMode
  /** Low confidence (e.g. correctness item, or LLM fallback). */
  lowConfidence?: boolean
}

/** Mini end-of-mock feedback from the student. */
export interface ExamFeedback {
  clear: boolean
  useful: boolean
  comment?: string
}

/** A student's full attempt at an exam paper (stored & exported). */
export interface ExamAttempt {
  id: string
  subjectId: SubjectId
  paperId: string
  startedAt: string
  submittedAt: string
  timeSpentSec: number
  answersByItemId: Record<string, string>
  results: BaremResult[]
  totalAwarded: number
  totalMax: number
  feedback?: ExamFeedback
}
```

- [ ] **Step 2: Re-export from the types barrel**

In `src/types/index.ts`, add a line next to the other `export *` lines:

```ts
export * from './exam'
```

- [ ] **Step 3: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/types/exam.ts src/types/index.ts
git commit -m "feat: exam domain types (ExamPaper, ExamItem, BaremResult, ExamAttempt)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: pr26 exam data + registry

**Files:**
- Create: `src/data/exams/romanian-pr26.ts`
- Create: `src/data/exams/index.ts`
- Test: `src/data/exams/romanian-pr26.test.ts`

- [ ] **Step 1: Write the failing integrity test**

Create `src/data/exams/romanian-pr26.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { romanianPr26 } from './romanian-pr26'

describe('romanianPr26', () => {
  it('has 11 items in order with unique ids', () => {
    expect(romanianPr26.items).toHaveLength(11)
    const ids = romanianPr26.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(11)
    romanianPr26.items.forEach((it, idx) => expect(it.order).toBe(idx + 1))
  })

  it('item maxPoints sum to the declared total (50)', () => {
    const sum = romanianPr26.items.reduce((s, i) => s + i.maxPoints, 0)
    expect(sum).toBe(romanianPr26.totalPoints)
    expect(romanianPr26.totalPoints).toBe(50)
  })

  it('carries the reading text and a 120-minute limit', () => {
    expect(romanianPr26.sourceText).toContain('Fapte, nu vorbe')
    expect(romanianPr26.timeLimitMin).toBe(120)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/data/exams/romanian-pr26.test.ts`
Expected: FAIL — cannot find module `./romanian-pr26`.

- [ ] **Step 3: Create the data module**

Create `src/data/exams/romanian-pr26.ts`:

```ts
import type { ExamPaper } from '@/types'

/**
 * ANCE (Republica Moldova) — Limba și literatura română, alolingvi,
 * pretestare, ciclul gimnazial, 26.02.2026. 120 min, total 50 puncte.
 * Source PDFs: 09_llroal_test_pr26 / 09_llroal_barem_pr26.
 * `acceptedAnswers` ← "Răspuns corect/posibil"; `baremRule` ← "Specificări".
 */
export const romanianPr26: ExamPaper = {
  id: 'ro-pr26',
  subjectId: 'romanian',
  year: 2026,
  title: 'Pretestare — Fapte, nu vorbe (gimnaziu, alolingvi)',
  timeLimitMin: 120,
  totalPoints: 50,
  sourceText: `Fapte, nu vorbe

Părinții au un rol foarte important în educarea copiilor. Ei sunt primii care îi învață ce este bine și ce este rău, cum să se comporte frumos și să-i respecte pe ceilalți. Unii părinți cred că dragostea înseamnă să-și laude mereu copiii, chiar și atunci când aceștia greșesc. Aceasta se numește dragoste oarbă, pentru că nu vede adevărul și nu-l ajută pe copil să devină mai bun. Alți părinți își arată dragostea prin fapte, prin exemplul personal și prin sfaturile pe care le oferă. Un copil bun nu are nevoie de laude, ci de îndrumare și sprijin.

Se zice că, într-un sat, s-au întâlnit la o fântână trei femei. Două dintre ele, Ana și Maria, nu încetau să-și laude băieții. Victoria, cea de-a treia, însă, nu spunea nimic, cu toate că avea și ea un fiu de care nu putea să se plângă. Au luat cele trei femei câte o căldare cu apă și au plecat înapoi, spre casă. Pe drum, s-au întâlnit cu cei trei copii, care se jucau într-o livadă.
– Ia uite-l pe-al meu, a zis Ana. E atât de puternic!
– Dar al meu, a spus Maria, e talentat în toate!
Și de această dată, Victoria a tăcut. Însă copilul ei, văzându-și mama, s-a grăbit să vină și să-i ia căldarea. Cei doi băieți au rămas să se joace mai departe. Acum s-a văzut adevărul. Din modestie, cea de-a treia femeie nu s-a lăudat cu feciorul său, dar, în locul ei, vorbeau faptele fiului. Celelalte femei au rămas rușinate și au înțeles că laudele goale nu înlocuiesc buna creștere. De atunci, ele au început să-și învețe copiii să fie atenți, respectuoși și harnici, nu doar lăudați. În sat, lumea a discutat mult despre acel exemplu de modestie și bun-simț.

În viață, nu vorbele arată cât valorează persoana, ci faptele și comportamentul. Omul adevărat se cunoaște după ceea ce face, nu după ceea ce spune.`,
  items: [
    {
      id: 'pr26-1',
      order: 1,
      type: 'open',
      maxPoints: 3,
      prompt:
        'Completează enunțurile, folosind textul: a) Rolul…; b) Femeile…; c) Faptele…',
      baremRule:
        'Câte 1 punct pentru fiecare enunț completat corect (3 enunțuri). Se acceptă și alte variante adecvate.',
      acceptedAnswers: [
        'Rolul părinților în educația copiilor este foarte mare.',
        'Femeile și-au educat copiii diferit.',
        'Faptele în viață sunt mai importante decât vorbele.',
      ],
    },
    {
      id: 'pr26-2',
      order: 2,
      type: 'short',
      maxPoints: 4,
      prompt:
        'Scrie, la forma inițială, câte un sinonim pentru: harnic, a stima; și câte un antonim pentru: adevărat, puternic.',
      baremRule:
        'Câte 1 punct pentru fiecare cuvânt identificat corect, la forma inițială. Nu se admit corectări.',
      acceptedAnswers: [
        'muncitor', 'sârguincios', 'conștiincios', 'diligent', 'activ',
        'a aprecia', 'a respecta', 'a prețui', 'a onora',
        'fals', 'eronat', 'falsificat', 'închipuit', 'născocit', 'neadevărat',
        'slab', 'moale', 'molatic',
      ],
    },
    {
      id: 'pr26-3',
      order: 3,
      type: 'open',
      maxPoints: 2,
      prompt: 'Scrie câte un enunț dezvoltat cu fiecare cuvânt: a juca (1); a se juca (2).',
      baremRule:
        'Câte 1 punct pentru fiecare enunț dezvoltat (subiect + predicat + minimum încă o parte de propoziție).',
    },
    {
      id: 'pr26-4',
      order: 4,
      type: 'open',
      maxPoints: 4,
      prompt:
        'Adresează-le băieților (personaje din text) patru întrebări directe. Folosește: voi, voastră, vostru, voștri, voastre, dumneavoastră sau vă/v-.',
      baremRule:
        'Câte 1 punct pentru fiecare întrebare directă adecvată, adresată băieților.',
    },
    {
      id: 'pr26-5',
      order: 5,
      type: 'open',
      maxPoints: 3,
      prompt: 'Realizează portretul moral al Victoriei în trei enunțuri argumentate.',
      baremRule:
        'Câte 1 punct pentru fiecare enunț logic, argumentat, despre Victoria.',
    },
    {
      id: 'pr26-6',
      order: 6,
      type: 'open',
      maxPoints: 2,
      prompt: 'Formulează două concluzii în baza textului citit.',
      baremRule: 'Câte 1 punct pentru fiecare concluzie adecvată și logică.',
    },
    {
      id: 'pr26-7',
      order: 7,
      type: 'open',
      maxPoints: 5,
      prompt:
        'Pune cuvântul „femeile" la singular și rescrie enunțul, realizând modificările necesare: „Femeile acestea modeste și-au educat corect copiii și i-au învățat ce înseamnă o faptă bună."',
      baremRule:
        'Câte 1 punct pentru fiecare modificare realizată corect (5 modificări). Nu se admit corectări în cuvintele modificate.',
      acceptedAnswers: [
        'Femeia aceasta modestă și-a educat corect copiii și i-a învățat ce înseamnă o faptă bună.',
      ],
    },
    {
      id: 'pr26-8',
      order: 8,
      type: 'open',
      maxPoints: 6,
      prompt:
        'Continuă dialogul cu șase replici complete (fără „Bună ziua!/La revedere!"), respectând tema: „– Mihai, cum te pregătești pentru examenele de absolvire?"',
      baremRule:
        'Se evaluează dialogul ca produs. Nu se acceptă replici dintr-un singur cuvânt.',
      subCriteria: [
        { id: 'lexic', title: { ru: 'Лексика', ro: 'Lexic' }, maxPoints: 2, rule: 'Lexic variat care corespunde temei.' },
        { id: 'replici', title: { ru: 'Реплики', ro: 'Replici' }, maxPoints: 4, rule: '4 p. pentru 6 replici; 3 p. pentru 5 replici.' },
      ],
    },
    {
      id: 'pr26-9',
      order: 9,
      type: 'open',
      maxPoints: 5,
      prompt:
        'Scrie, în numele admiratorilor, o felicitare adresată lui Alexandrin Guțu cu ocazia obținerii medaliei de aur la Campionatul Mondial de lupte U23, 2025. Utilizează urări deosebite și respectă aranjarea textului în pagină.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'adresare', title: { ru: 'Обращение и концовка', ro: 'Adresare + încheiere' }, maxPoints: 1, rule: '1 p. pentru formula de adresare + cea de încheiere (dacă doar una → 0 p.).' },
        { id: 'ocazie', title: { ru: 'Повод', ro: 'Ocazia' }, maxPoints: 1, rule: '1 p. pentru indicarea ocaziei.' },
        { id: 'urare', title: { ru: 'Пожелание', ro: 'Urare' }, maxPoints: 2, rule: '2 p. pentru o urare deosebită; 1 p. pentru una simplă.' },
        { id: 'asezare', title: { ru: 'Оформление', ro: 'Așezare în pagină' }, maxPoints: 1, rule: '1 p. pentru așezarea corectă a textului în pagină.' },
      ],
    },
    {
      id: 'pr26-10',
      order: 10,
      type: 'open',
      maxPoints: 9,
      prompt:
        'Scrie, în opt enunțuri, un eseu la tema: „Patria e locul unde ne sunt rădăcinile". Explică ce înseamnă pentru tine patria; argumentează cu un exemplu din literatura română (D. Matcovschi, N. Dabija ș.a.); formulează o concluzie.',
      baremRule: 'Se punctează pe sub-criterii (vezi mai jos).',
      subCriteria: [
        { id: 'repere', title: { ru: 'Соблюдение опор', ro: 'Respectarea reperelor' }, maxPoints: 3, rule: 'Respectarea celor trei repere date.' },
        { id: 'coerenta', title: { ru: 'Связность', ro: 'Coerență' }, maxPoints: 2, rule: '2 p. coerență deplină; 1 p. parțială; 0 p. lipsă.' },
        { id: 'volum', title: { ru: 'Объём', ro: 'Volum' }, maxPoints: 4, rule: '4 p. pentru 8 enunțuri; 3 p. pentru 6–7 enunțuri.' },
      ],
    },
    {
      id: 'pr26-11',
      order: 11,
      type: 'correctness',
      maxPoints: 7,
      prompt: 'Corectitudinea exprimării în întreaga lucrare.',
      baremRule:
        '7 p. pentru 0–3 greșeli; 6 p. pentru 4–7; 5 p. pentru 8–11; 4 p. pentru 12–15; 3 p. pentru 16–19; 2 p. pentru 20–23; 1 p. pentru 24–27. Estimare cu încredere redusă.',
    },
  ],
}
```

- [ ] **Step 4: Create the registry**

Create `src/data/exams/index.ts`:

```ts
import type { ExamPaper, SubjectId } from '@/types'
import { romanianPr26 } from './romanian-pr26'

/** Read-only exam papers per subject (pilot: one Romanian paper). */
export const examPapersBySubject: Partial<Record<SubjectId, ExamPaper[]>> = {
  romanian: [romanianPr26],
}

export function examPapersForSubject(subjectId: SubjectId): ExamPaper[] {
  return examPapersBySubject[subjectId] ?? []
}

export function getExamPaper(paperId: string): ExamPaper | undefined {
  return Object.values(examPapersBySubject)
    .flat()
    .find((p) => p?.id === paperId)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/data/exams/romanian-pr26.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/data/exams/
git commit -m "feat: pr26 Romanian mock exam data + registry (50 pts, 11 items)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Pure barem grader (deterministic short + totals)

**Files:**
- Create: `src/learning/baremGrader.ts`
- Test: `src/learning/baremGrader.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/learning/baremGrader.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeForMatch, gradeShortDeterministic, totalsOf } from './baremGrader'
import type { ExamItem, BaremResult } from '@/types'

const shortItem: ExamItem = {
  id: 'pr26-2',
  order: 2,
  type: 'short',
  maxPoints: 4,
  prompt: 'sinonime/antonime',
  baremRule: '1 p. per cuvânt',
  acceptedAnswers: ['muncitor', 'a respecta', 'fals', 'slab'],
}

describe('normalizeForMatch', () => {
  it('lowercases, trims, strips diacritics and punctuation', () => {
    expect(normalizeForMatch('  Fáls. ')).toBe('fals')
    expect(normalizeForMatch('A Respecta')).toBe('a respecta')
  })
})

describe('gradeShortDeterministic', () => {
  it('awards one point per distinct accepted token, capped at maxPoints', () => {
    const r = gradeShortDeterministic(shortItem, 'muncitor\na respecta\nfals\nslab')
    expect(r.awarded).toBe(4)
    expect(r.mode).toBe('deterministic')
    expect(r.max).toBe(4)
  })

  it('ignores diacritics and duplicates, never exceeds maxPoints', () => {
    const r = gradeShortDeterministic(shortItem, 'muncitor, muncitor, fáls')
    expect(r.awarded).toBe(2)
  })

  it('gives zero with a comment when nothing matches', () => {
    const r = gradeShortDeterministic(shortItem, 'xyz')
    expect(r.awarded).toBe(0)
    expect(r.perCriterion[0].comment.length).toBeGreaterThan(0)
  })
})

describe('totalsOf', () => {
  it('sums awarded and max across results', () => {
    const results: BaremResult[] = [
      { itemId: 'a', perCriterion: [], awarded: 3, max: 4, advice: '', mode: 'llm' },
      { itemId: 'b', perCriterion: [], awarded: 2, max: 2, advice: '', mode: 'deterministic' },
    ]
    expect(totalsOf(results)).toEqual({ totalAwarded: 5, totalMax: 6 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/learning/baremGrader.test.ts`
Expected: FAIL — cannot find module `./baremGrader`.

- [ ] **Step 3: Implement the pure helpers**

Create `src/learning/baremGrader.ts`:

```ts
import type { BaremResult, ExamItem } from '@/types'

/** Lenient normalisation for short-answer matching: case, diacritics, punctuation. */
export function normalizeForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[.,;:!?„"”«»()\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Splits a student's short answer into distinct candidate tokens. */
function candidateTokens(answer: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of answer.split(/[\n,;]+/)) {
    const norm = normalizeForMatch(raw)
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      out.push(norm)
    }
  }
  return out
}

/**
 * Deterministic grading for `short` items: one point per distinct student token
 * that matches an accepted answer (diacritics-insensitive), capped at maxPoints.
 */
export function gradeShortDeterministic(item: ExamItem, answer: string): BaremResult {
  const accepted = new Set((item.acceptedAnswers ?? []).map(normalizeForMatch))
  const tokens = candidateTokens(answer)
  const matched = tokens.filter((t) => accepted.has(t)).length
  const awarded = Math.min(matched, item.maxPoints)
  const comment =
    awarded === item.maxPoints
      ? 'Toate cuvintele corecte.'
      : `Recunoscute automat: ${awarded}/${item.maxPoints}. Variantele neobișnuite pot fi corecte — verifică baremul.`
  return {
    itemId: item.id,
    perCriterion: [{ id: item.id, awarded, max: item.maxPoints, comment }],
    awarded,
    max: item.maxPoints,
    advice: '',
    mode: 'deterministic',
  }
}

/** Sums awarded/max across per-item results. */
export function totalsOf(results: BaremResult[]): {
  totalAwarded: number
  totalMax: number
} {
  return results.reduce(
    (acc, r) => ({
      totalAwarded: acc.totalAwarded + r.awarded,
      totalMax: acc.totalMax + r.max,
    }),
    { totalAwarded: 0, totalMax: 0 },
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/learning/baremGrader.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/learning/baremGrader.ts src/learning/baremGrader.test.ts
git commit -m "feat: pure barem grader — deterministic short scoring + totals

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: LLM barem prompt + response parser

**Files:**
- Create: `src/llm/promptTemplates/barem.ts`
- Modify: `src/llm/promptTemplates/index.ts`
- Modify: `src/learning/baremGrader.ts` (add `parseBaremResponse`)
- Modify: `src/learning/baremGrader.test.ts` (add parser tests)

- [ ] **Step 1: Write failing parser tests**

Append to `src/learning/baremGrader.test.ts`:

```ts
import { parseBaremResponse } from './baremGrader'

const openItem: ExamItem = {
  id: 'pr26-9',
  order: 9,
  type: 'open',
  maxPoints: 5,
  prompt: 'felicitare',
  baremRule: 'sub-criterii',
  subCriteria: [
    { id: 'adresare', title: { ro: 'Adresare' }, maxPoints: 1, rule: '' },
    { id: 'ocazie', title: { ro: 'Ocazia' }, maxPoints: 1, rule: '' },
    { id: 'urare', title: { ro: 'Urare' }, maxPoints: 2, rule: '' },
    { id: 'asezare', title: { ro: 'Așezare' }, maxPoints: 1, rule: '' },
  ],
}

describe('parseBaremResponse', () => {
  it('parses JSON, clamps awarded to each sub-criterion max, sums total', () => {
    const raw = JSON.stringify({
      perCriterion: [
        { id: 'adresare', awarded: 1, comment: 'ok' },
        { id: 'ocazie', awarded: 1, comment: 'ok' },
        { id: 'urare', awarded: 5, comment: 'peste max' }, // clamps to 2
        { id: 'asezare', awarded: 1, comment: 'ok' },
      ],
      advice: 'Bun lucru.',
    })
    const r = parseBaremResponse(raw, openItem)
    expect(r.mode).toBe('llm')
    expect(r.awarded).toBe(5)
    expect(r.max).toBe(5)
    expect(r.perCriterion.find((c) => c.id === 'urare')?.awarded).toBe(2)
    expect(r.advice).toBe('Bun lucru.')
  })

  it('tolerates ```json fences', () => {
    const raw = '```json\n{"perCriterion":[{"id":"adresare","awarded":1,"comment":"x"}],"advice":"a"}\n```'
    const r = parseBaremResponse(raw, openItem)
    expect(r.awarded).toBe(1)
  })

  it('throws on invalid JSON so the service can fall back', () => {
    expect(() => parseBaremResponse('not json', openItem)).toThrow()
  })

  it('grades a single-criterion open item against item.maxPoints', () => {
    const single: ExamItem = { ...openItem, subCriteria: undefined, maxPoints: 3, id: 'pr26-1' }
    const raw = JSON.stringify({ perCriterion: [{ id: 'pr26-1', awarded: 9, comment: 'x' }], advice: 'a' })
    const r = parseBaremResponse(raw, single)
    expect(r.awarded).toBe(3) // clamped to maxPoints
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/learning/baremGrader.test.ts`
Expected: FAIL — `parseBaremResponse` is not exported.

- [ ] **Step 3: Implement the parser in `baremGrader.ts`**

Append to `src/learning/baremGrader.ts`:

```ts
import type { BaremCriterionScore } from '@/types'

/** Expected scoring slots for an item: its sub-criteria, or a single whole-item slot. */
function criteriaSlots(item: ExamItem): { id: string; max: number }[] {
  if (item.subCriteria && item.subCriteria.length > 0) {
    return item.subCriteria.map((c) => ({ id: c.id, max: c.maxPoints }))
  }
  return [{ id: item.id, max: item.maxPoints }]
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

function stripFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').trim()
}

/**
 * Parses the grader LLM's JSON into a BaremResult. Awarded points per slot are
 * clamped to that slot's max; the item total is additionally clamped to
 * item.maxPoints. Throws on malformed JSON so the caller can fall back to self.
 */
export function parseBaremResponse(raw: string, item: ExamItem): BaremResult {
  const parsed = JSON.parse(stripFences(raw)) as {
    perCriterion?: { id?: string; awarded?: number; comment?: string }[]
    advice?: string
  }
  const slots = criteriaSlots(item)
  const byId = new Map(
    (parsed.perCriterion ?? []).map((c) => [String(c.id), c]),
  )
  const perCriterion: BaremCriterionScore[] = slots.map((slot) => {
    const got = byId.get(slot.id)
    return {
      id: slot.id,
      awarded: clamp(Math.round(Number(got?.awarded ?? 0)), 0, slot.max),
      max: slot.max,
      comment: String(got?.comment ?? ''),
    }
  })
  const awarded = clamp(
    perCriterion.reduce((s, c) => s + c.awarded, 0),
    0,
    item.maxPoints,
  )
  return {
    itemId: item.id,
    perCriterion,
    awarded,
    max: item.maxPoints,
    advice: String(parsed.advice ?? ''),
    mode: 'llm',
    lowConfidence: item.type === 'correctness',
  }
}
```

- [ ] **Step 4: Implement the prompt template**

Create `src/llm/promptTemplates/barem.ts`:

```ts
import type { ExamItem, InterfaceLanguage } from '@/types'
import type { ScoredChunk } from '@/rag'
import type { ChatMessage } from '../types'
import { renderContext } from './index'

export interface BaremGradeInput {
  item: ExamItem
  studentAnswer: string
  supportLanguage: InterfaceLanguage
  retrieved?: ScoredChunk[]
}

const SUPPORT_NAME: Record<InterfaceLanguage, string> = {
  ru: 'rusă',
  ro: 'română',
  en: 'engleză',
}

/** Builds chat messages that ask the model to grade an answer strictly by barem. */
export function buildBaremGradePrompt(input: BaremGradeInput): ChatMessage[] {
  const { item } = input
  const slots =
    item.subCriteria && item.subCriteria.length > 0
      ? item.subCriteria.map((c) => `- "${c.id}" (max ${c.maxPoints}): ${c.rule}`).join('\n')
      : `- "${item.id}" (max ${item.maxPoints}): ${item.baremRule}`

  const system = [
    'Ești un evaluator de examen riguros pentru limba română (gimnaziu, alolingvi).',
    'Notează STRICT după barem. Nu acorda puncte peste maximul fiecărui criteriu.',
    `Scrie comentariile și sfatul în limba ${SUPPORT_NAME[input.supportLanguage]}.`,
    'Răspunde DOAR cu JSON valid, fără text în plus, în forma:',
    '{"perCriterion":[{"id":"<id>","awarded":<număr>,"comment":"<scurt>"}],"advice":"<un sfat concret>"}',
  ].join('\n')

  const user = [
    `SARCINA:\n${item.prompt}`,
    `BAREM (criterii și maxim):\n${slots}`,
    item.acceptedAnswers && item.acceptedAnswers.length > 0
      ? `RĂSPUNS DE REFERINȚĂ (orientativ, se acceptă și alte variante adecvate):\n${item.acceptedAnswers.join('\n')}`
      : '',
    input.retrieved && input.retrieved.length > 0
      ? `CONTEXT (materiale locale):\n${renderContext(input.retrieved)}`
      : '',
    `RĂSPUNSUL ELEVULUI:\n${input.studentAnswer || '(gol)'}`,
    'Evaluează și returnează JSON-ul cerut.',
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
```

- [ ] **Step 5: Re-export the template**

In `src/llm/promptTemplates/index.ts`, add after the existing `export { … } from './subjects'` line:

```ts
export { buildBaremGradePrompt, type BaremGradeInput } from './barem'
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- src/learning/baremGrader.test.ts`
Expected: PASS (10 tests total).
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/llm/promptTemplates/barem.ts src/llm/promptTemplates/index.ts src/learning/baremGrader.ts src/learning/baremGrader.test.ts
git commit -m "feat: barem grading prompt + strict JSON response parser

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Exam grader service (retrieval + LLM + fallback)

**Files:**
- Create: `src/services/examGraderService.ts`
- Modify: `src/services/index.ts`
- Test: `src/services/examGraderService.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/services/examGraderService.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { gradeItem } from './examGraderService'
import type { ExamItem } from '@/types'

const shortItem: ExamItem = {
  id: 'pr26-2', order: 2, type: 'short', maxPoints: 4,
  prompt: 'x', baremRule: 'y',
  acceptedAnswers: ['fals', 'slab', 'muncitor', 'a respecta'],
}

const openItem: ExamItem = {
  id: 'pr26-3', order: 3, type: 'open', maxPoints: 2,
  prompt: 'Scrie două enunțuri', baremRule: '1 p. per enunț',
}

describe('gradeItem', () => {
  it('grades short items deterministically without an LLM', async () => {
    const r = await gradeItem(shortItem, 'fals\nslab', { supportLanguage: 'ru' })
    expect(r.mode).toBe('deterministic')
    expect(r.awarded).toBe(2)
  })

  it('returns a zero self result for a blank open answer', async () => {
    const r = await gradeItem(openItem, '   ', { supportLanguage: 'ru' })
    expect(r.awarded).toBe(0)
    expect(r.mode).toBe('self')
  })

  it('falls back to self-mode when the provider output is not gradeable JSON', async () => {
    // The mock provider returns non-JSON content, so the parser throws and we degrade.
    const r = await gradeItem(openItem, 'Copiii se joacă în curte. Eu joc fotbal.', {
      supportLanguage: 'ru',
      providerConfig: undefined, // defaults to mock preset inside the service
    })
    expect(r.mode).toBe('self')
    expect(r.max).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/services/examGraderService.test.ts`
Expected: FAIL — cannot find module `./examGraderService`.

- [ ] **Step 3: Implement the service**

Create `src/services/examGraderService.ts`:

```ts
import type {
  BaremResult,
  ExamItem,
  ExamPaper,
  InterfaceLanguage,
  SubjectId,
} from '@/types'
import {
  buildBaremGradePrompt,
  createAdapter,
  PROVIDER_PRESETS,
  type LLMProviderConfig,
} from '@/llm'
import { gradeShortDeterministic, parseBaremResponse, totalsOf } from '@/learning/baremGrader'
import { retrieve } from './ragService'

export interface GradeDeps {
  supportLanguage: InterfaceLanguage
  providerConfig?: LLMProviderConfig
  apiKey?: string
  /** Subject used for RAG grounding; defaults to 'romanian'. */
  subjectId?: SubjectId
}

/** Zeroed self-assessment result (blank answer or LLM unavailable/invalid). */
function selfResult(item: ExamItem, advice: string): BaremResult {
  const slots =
    item.subCriteria && item.subCriteria.length > 0
      ? item.subCriteria.map((c) => ({ id: c.id, max: c.maxPoints }))
      : [{ id: item.id, max: item.maxPoints }]
  return {
    itemId: item.id,
    perCriterion: slots.map((s) => ({ id: s.id, awarded: 0, max: s.max, comment: '' })),
    awarded: 0,
    max: item.maxPoints,
    advice,
    mode: 'self',
    lowConfidence: true,
  }
}

/**
 * Grades one item. `short` → deterministic, no LLM. `open`/`correctness` →
 * retrieve local context, ask the provider to grade by barem, parse strictly.
 * Any failure (blank answer, provider down, invalid JSON) degrades to self-mode
 * so the mock never blocks on the LLM.
 */
export async function gradeItem(
  item: ExamItem,
  answer: string,
  deps: GradeDeps,
): Promise<BaremResult> {
  if (item.type === 'short') {
    return gradeShortDeterministic(item, answer)
  }
  if (!answer.trim()) {
    return selfResult(item, 'Fără răspuns — verifică baremul și încearcă din nou.')
  }

  const config = deps.providerConfig ?? (PROVIDER_PRESETS.mock as LLMProviderConfig)

  // Best-effort grounding; ignore retrieval failures (grading must still run).
  let retrieved
  try {
    const r = await retrieve(`${item.prompt}\n${answer}`, deps.subjectId ?? 'romanian', undefined, 4)
    retrieved = r.unavailable ? undefined : r.results
  } catch {
    retrieved = undefined
  }

  try {
    const messages = buildBaremGradePrompt({
      item,
      studentAnswer: answer,
      supportLanguage: deps.supportLanguage,
      retrieved,
    })
    const adapter = createAdapter(config)
    const chat = await adapter.chat({ messages, temperature: 0.1, jsonMode: true }, deps.apiKey)
    return parseBaremResponse(chat.content, item)
  } catch {
    return selfResult(
      item,
      'Evaluarea automată nu este disponibilă acum — compară-ți răspunsul cu baremul.',
    )
  }
}

export interface AttemptGrade {
  results: BaremResult[]
  totalAwarded: number
  totalMax: number
}

/** Grades a whole paper sequentially (gentle on provider rate limits). */
export async function gradeAttempt(
  paper: ExamPaper,
  answersByItemId: Record<string, string>,
  deps: GradeDeps,
): Promise<AttemptGrade> {
  const itemDeps: GradeDeps = { ...deps, subjectId: deps.subjectId ?? paper.subjectId }
  const results: BaremResult[] = []
  for (const item of paper.items) {
    results.push(await gradeItem(item, answersByItemId[item.id] ?? '', itemDeps))
  }
  return { results, ...totalsOf(results) }
}
```

`gradeAttempt` passes the paper's subject into `deps.subjectId` so the grader retrieves from the right subject; `gradeItem` stays self-contained for unit testing (retrieval defaults to `'romanian'`).

- [ ] **Step 4: Export from the services barrel**

In `src/services/index.ts`, add:

```ts
export * from './examGraderService'
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- src/services/examGraderService.test.ts`
Expected: PASS (3 tests). (The mock provider returns non-JSON, exercising the fallback.)
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/examGraderService.ts src/services/examGraderService.test.ts src/services/index.ts
git commit -m "feat: exam grader service — deterministic + LLM-by-barem with self fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Exam attempt storage (Dexie table + repo)

**Files:**
- Modify: `src/storage/db.ts`
- Create: `src/storage/repositories/examAttemptRepo.ts`
- Modify: `src/storage/repositories/index.ts`
- Test: `src/storage/repositories/examAttemptRepo.test.ts`

- [ ] **Step 1: Write the failing round-trip test**

Create `src/storage/repositories/examAttemptRepo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { examAttemptRepo } from './examAttemptRepo'
import { db } from '../db'
import type { ExamAttempt } from '@/types'

function attempt(id: string): ExamAttempt {
  return {
    id,
    subjectId: 'romanian',
    paperId: 'ro-pr26',
    startedAt: '2026-06-12T09:00:00.000Z',
    submittedAt: '2026-06-12T10:30:00.000Z',
    timeSpentSec: 5400,
    answersByItemId: { 'pr26-2': 'fals' },
    results: [{ itemId: 'pr26-2', perCriterion: [], awarded: 1, max: 4, advice: '', mode: 'deterministic' }],
    totalAwarded: 1,
    totalMax: 50,
  }
}

describe('examAttemptRepo', () => {
  beforeEach(async () => {
    await db.examAttempts.clear()
  })

  it('stores and reads back an attempt', async () => {
    await examAttemptRepo.add(attempt('att-1'))
    const all = await examAttemptRepo.all()
    expect(all).toHaveLength(1)
    expect(all[0].paperId).toBe('ro-pr26')
  })

  it('lists attempts by subject', async () => {
    await examAttemptRepo.add(attempt('att-1'))
    const list = await examAttemptRepo.listBySubject('romanian')
    expect(list.map((a) => a.id)).toContain('att-1')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/storage/repositories/examAttemptRepo.test.ts`
Expected: FAIL — cannot find module `./examAttemptRepo` (and `db.examAttempts` undefined).

- [ ] **Step 3: Add the table to the database**

In `src/storage/db.ts`:

1. Add `ExamAttempt` to the type import:

```ts
import type {
  Chunk768,
  ExamAttempt,
  LearningEvent,
  ModelRunMetrics,
  StudentProfile,
  Topic,
  TopicMastery,
} from '@/types'
```

2. Add the field to the class (after `settings!: …`):

```ts
  examAttempts!: EntityTable<ExamAttempt, 'id'>
```

3. Add a version 2 migration after the existing `this.version(1).stores({...})` block:

```ts
    this.version(2).stores({
      examAttempts: 'id, subjectId, paperId, submittedAt',
    })
```

- [ ] **Step 4: Create the repository**

Create `src/storage/repositories/examAttemptRepo.ts`:

```ts
import type { ExamAttempt, SubjectId } from '@/types'
import { db } from '../db'

export const examAttemptRepo = {
  async add(attempt: ExamAttempt): Promise<void> {
    await db.examAttempts.put(attempt)
  },

  async all(): Promise<ExamAttempt[]> {
    return db.examAttempts.toArray()
  },

  async listBySubject(subjectId: SubjectId): Promise<ExamAttempt[]> {
    return db.examAttempts.where('subjectId').equals(subjectId).toArray()
  },
}
```

- [ ] **Step 5: Export from the repositories barrel**

In `src/storage/repositories/index.ts`, add (matching the existing export style):

```ts
export { examAttemptRepo } from './examAttemptRepo'
```

- [ ] **Step 6: Run the test + typecheck**

Run: `npm test -- src/storage/repositories/examAttemptRepo.test.ts`
Expected: PASS (2 tests).
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/storage/db.ts src/storage/repositories/examAttemptRepo.ts src/storage/repositories/index.ts src/storage/repositories/examAttemptRepo.test.ts
git commit -m "feat: examAttempts Dexie table (v2) + repository

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Include exam attempts in the export

**Files:**
- Modify: `src/types/export.ts`
- Modify: `src/services/exportService.ts`
- Test: `src/services/exportService.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/services/exportService.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { buildExportFromStorage } from './exportService'
import { examAttemptRepo } from '@/storage'
import { db } from '@/storage/db'
import type { ExamAttempt, StudentProfile } from '@/types'

const profile: StudentProfile = {
  localId: 'local-1',
  interfaceLanguage: 'ru',
  preferredLearningLanguage: 'ro',
  activeSubjects: ['romanian'],
  currentSubjectId: 'romanian',
  dyslexiaMode: false,
  theme: 'light',
  studyMode: 'sprint',
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
}

const attempt: ExamAttempt = {
  id: 'att-1', subjectId: 'romanian', paperId: 'ro-pr26',
  startedAt: '2026-06-12T09:00:00.000Z', submittedAt: '2026-06-12T10:00:00.000Z',
  timeSpentSec: 3600, answersByItemId: {}, results: [],
  totalAwarded: 33, totalMax: 50,
}

describe('buildExportFromStorage', () => {
  beforeEach(async () => {
    await db.examAttempts.clear()
  })

  it('includes stored exam attempts in the export', async () => {
    await examAttemptRepo.add(attempt)
    const out = await buildExportFromStorage(profile)
    expect(out.examAttempts).toHaveLength(1)
    expect(out.examAttempts?.[0].totalAwarded).toBe(33)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/services/exportService.test.ts`
Expected: FAIL — `examAttempts` is not on `ProgressExportJson` / not populated.

- [ ] **Step 3: Add the field to the export type**

In `src/types/export.ts`:

1. Add the import at top:

```ts
import type { ExamAttempt } from './exam'
```

2. Add the optional field to `ProgressExportJson` (after `modelRunMetrics`):

```ts
  examAttempts?: ExamAttempt[]
```

- [ ] **Step 4: Populate it in the service**

In `src/services/exportService.ts`:

1. Add `examAttemptRepo` to the storage import:

```ts
import { eventRepo, masteryRepo, metricsRepo, examAttemptRepo } from '@/storage'
```

2. Fetch attempts alongside the other reads:

```ts
  const examAttempts = await examAttemptRepo.all()
```

3. Spread them onto the returned object — change the final `return buildProgressExport({...})` to:

```ts
  const base = buildProgressExport({
    profile: { localId: profile.localId, activeSubjects: profile.activeSubjects },
    events,
    masteries,
    metrics,
    topicsBySubject,
    dateRange: { from, to },
    ...(teacherNotes ? { teacherNotes } : {}),
  })
  return { ...base, examAttempts }
```

- [ ] **Step 5: Run the test + typecheck**

Run: `npm test -- src/services/exportService.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/export.ts src/services/exportService.ts src/services/exportService.test.ts
git commit -m "feat: include exam attempts in the JSON export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Test-text chunks for RAG grounding

**Files:**
- Modify: `src/data/chunks/romanian.chunks.ts`

- [ ] **Step 1: Append chunks from the exam text**

Add these entries to the `romanianChunks` array in `src/data/chunks/romanian.chunks.ts` (before the closing `]`). They let the tutor/grader cite the reading text and key rules tested by pr26:

```ts
  {
    id: 'ro-pr26-text',
    subjectId: 'romanian',
    topicId: 'ro-reading',
    language: 'ro',
    text: 'Text „Fapte, nu vorbe": trei femei (Ana, Maria, Victoria) la o fântână. Ana și Maria își laudă băieții; Victoria tace din modestie, dar fiul ei o ajută cu căldarea — faptele vorbesc în locul ei. Idee: în viață nu vorbele, ci faptele și comportamentul arată valoarea omului. Tema: modestie, bun-simț, educație prin exemplu.',
    source: 'Pretestare gimnaziu 2026 — text-suport',
    gradeLevel: 9,
    metadata: { bookId: 'RO_pr26', chunkId: 'text', grade: 9 },
  },
  {
    id: 'ro-pr26-pron',
    subjectId: 'romanian',
    topicId: 'ro-grammar',
    language: 'ro',
    text: 'Adresare directă și pronume/adjective de politețe: voi, vostru, voastră, voștri, voastre, dumneavoastră, formele neaccentuate vă/v-. Întrebarea directă se adresează interlocutorului și se termină cu semnul întrebării: „Ce credeți voi despre…?", „Unde v-ați jucat?". Полезно для задания с прямыми вопросами.',
    source: 'Gramatica limbii române (rezumat didactic)',
    gradeLevel: 9,
    metadata: { bookId: 'RO_Gramatica', chunkId: 'pron_pol', grade: 9 },
  },
  {
    id: 'ro-pr26-sg-pl',
    subjectId: 'romanian',
    topicId: 'ro-agreement',
    language: 'ro',
    text: 'Trecerea de la plural la singular cere acordul întregului enunț: „femeile acestea modeste" → „femeia aceasta modestă"; „și-au educat" → „și-a educat"; „i-au învățat" → „i-a învățat". Substantiv, adjectiv demonstrativ, adjectiv calificativ și verbele își schimbă forma împreună.',
    source: 'Acordul în limba română (rezumat)',
    gradeLevel: 9,
    metadata: { bookId: 'RO_Gramatica', chunkId: 'sg_pl', grade: 9 },
  },
```

- [ ] **Step 2: Re-seed the Romanian pack**

Run: `npm run seed -- romanian`
Expected: console prints `[seed] wrote …/romanian.pack.json (N chunks)` with N increased by 3.

- [ ] **Step 3: Verify existing tests still pass**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 4: Commit**

```bash
git add src/data/chunks/romanian.chunks.ts public/packs/romanian.pack.json
git commit -m "feat: add pr26 text + tested-rule chunks for RAG grounding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: i18n strings for the exam screen

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ru.json`
- Modify: `src/i18n/locales/ro.json`

- [ ] **Step 1: Add an `exam` block and `nav.exam` to each locale**

In each file, add `"exam": "…"` inside the existing `"nav"` object, and add a top-level `"exam"` block. Use these values.

`en.json` — `nav.exam`: `"Mock exam"`; block:

```json
  "exam": {
    "title": "Mock exam",
    "start": "Start mock exam",
    "intro": "Authentic past-year paper. {{points}} points, {{minutes}} minutes.",
    "readingText": "Reading text",
    "timeLeft": "Time left",
    "submit": "Submit for grading",
    "grading": "Grading your answers…",
    "yourAnswer": "Your answer",
    "results": "Results",
    "total": "Total score",
    "advice": "Advice",
    "mode": { "deterministic": "auto-checked", "llm": "AI-graded", "self": "self-check" },
    "lowConfidence": "Approximate — verify against the barem.",
    "feedbackTitle": "Quick feedback",
    "clear": "Was it clear?",
    "useful": "Was it useful?",
    "comment": "Comment (optional)",
    "saveFeedback": "Save feedback",
    "saved": "Saved",
    "noPaper": "No mock exam is available for this subject yet."
  }
```

`ru.json` — `nav.exam`: `"Пробный экзамен"`; block:

```json
  "exam": {
    "title": "Пробный экзамен",
    "start": "Начать пробный экзамен",
    "intro": "Реальный прошлогодний вариант. {{points}} баллов, {{minutes}} минут.",
    "readingText": "Текст для чтения",
    "timeLeft": "Осталось времени",
    "submit": "Сдать на проверку",
    "grading": "Проверяю ваши ответы…",
    "yourAnswer": "Ваш ответ",
    "results": "Результаты",
    "total": "Итоговый балл",
    "advice": "Совет",
    "mode": { "deterministic": "автопроверка", "llm": "оценка ИИ", "self": "самопроверка" },
    "lowConfidence": "Приблизительно — сверьтесь с баремом.",
    "feedbackTitle": "Быстрый отзыв",
    "clear": "Было понятно?",
    "useful": "Было полезно?",
    "comment": "Комментарий (необязательно)",
    "saveFeedback": "Сохранить отзыв",
    "saved": "Сохранено",
    "noPaper": "Для этого предмета пробный экзамен пока недоступен."
  }
```

`ro.json` — `nav.exam`: `"Examen de probă"`; block:

```json
  "exam": {
    "title": "Examen de probă",
    "start": "Începe examenul de probă",
    "intro": "Variantă autentică din anii trecuți. {{points}} puncte, {{minutes}} minute.",
    "readingText": "Text pentru lectură",
    "timeLeft": "Timp rămas",
    "submit": "Trimite spre evaluare",
    "grading": "Se evaluează răspunsurile…",
    "yourAnswer": "Răspunsul tău",
    "results": "Rezultate",
    "total": "Punctaj total",
    "advice": "Sfat",
    "mode": { "deterministic": "verificat automat", "llm": "evaluat de AI", "self": "autoevaluare" },
    "lowConfidence": "Aproximativ — verifică cu baremul.",
    "feedbackTitle": "Feedback rapid",
    "clear": "A fost clar?",
    "useful": "A fost util?",
    "comment": "Comentariu (opțional)",
    "saveFeedback": "Salvează feedbackul",
    "saved": "Salvat",
    "noPaper": "Încă nu există un examen de probă pentru această disciplină."
  }
```

- [ ] **Step 2: Verify JSON is valid + tests pass**

Run: `npm test`
Expected: PASS (no JSON parse errors at import).

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/ru.json src/i18n/locales/ro.json
git commit -m "feat: i18n strings for the mock exam screen (EN/RU/RO)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Exam screen + route + nav

**Files:**
- Create: `src/screens/Exam.tsx`
- Modify: `src/screens/index.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/Layout.tsx`

- [ ] **Step 1: Create the screen**

Create `src/screens/Exam.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BaremResult, ExamAttempt, ExamFeedback } from '@/types'
import { examPapersForSubject } from '@/data/exams'
import { gradeAttempt } from '@/services'
import { examAttemptRepo } from '@/storage'
import { useAppStore } from '@/app/store'
import { newId, nowIso } from '@/app/ids'

type Phase = 'intro' | 'inprogress' | 'grading' | 'results'

export function Exam() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const providerConfig = useAppStore((s) => s.providerConfig)
  const apiKey = useAppStore((s) => s.apiKey)

  const paper = profile ? examPapersForSubject(profile.currentSubjectId)[0] : undefined
  const lang = profile?.interfaceLanguage ?? 'ru'

  const [phase, setPhase] = useState<Phase>('intro')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [results, setResults] = useState<BaremResult[]>([])
  const [totalAwarded, setTotalAwarded] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<ExamFeedback>({ clear: true, useful: true, comment: '' })
  const [feedbackSaved, setFeedbackSaved] = useState(false)
  const startRef = useRef<number>(0)

  useEffect(() => {
    if (phase !== 'inprogress') return
    startRef.current = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [phase])

  if (!profile) return <p>{t('common.loading')}</p>
  if (!paper) return <p>{t('exam.noPaper')}</p>

  const remaining = Math.max(0, paper.timeLimitMin * 60 - elapsed)
  const mmss = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`

  async function submit() {
    if (!profile || !paper) return
    setPhase('grading')
    const graded = await gradeAttempt(paper, answers, {
      supportLanguage: lang,
      providerConfig,
      apiKey,
      subjectId: profile.currentSubjectId,
    })
    const attempt: ExamAttempt = {
      id: newId('exam'),
      subjectId: profile.currentSubjectId,
      paperId: paper.id,
      startedAt: new Date(startRef.current).toISOString(),
      submittedAt: nowIso(),
      timeSpentSec: elapsed,
      answersByItemId: answers,
      results: graded.results,
      totalAwarded: graded.totalAwarded,
      totalMax: graded.totalMax,
    }
    await examAttemptRepo.add(attempt)
    setAttemptId(attempt.id)
    setResults(graded.results)
    setTotalAwarded(graded.totalAwarded)
    setPhase('results')
  }

  async function saveFeedback() {
    if (!attemptId || !paper || !profile) return
    const attempt: ExamAttempt = {
      id: attemptId,
      subjectId: profile.currentSubjectId,
      paperId: paper.id,
      startedAt: new Date(startRef.current).toISOString(),
      submittedAt: nowIso(),
      timeSpentSec: elapsed,
      answersByItemId: answers,
      results,
      totalAwarded,
      totalMax: paper.totalPoints,
      feedback,
    }
    await examAttemptRepo.add(attempt) // put = upsert by id
    setFeedbackSaved(true)
  }

  return (
    <div>
      <h1>{t('exam.title')}</h1>
      <p className="muted">{paper.title}</p>

      {phase === 'intro' && (
        <section className="card">
          <p>{t('exam.intro', { points: paper.totalPoints, minutes: paper.timeLimitMin })}</p>
          {paper.sourceText && (
            <details>
              <summary>{t('exam.readingText')}</summary>
              <p style={{ whiteSpace: 'pre-wrap' }} lang="ro">{paper.sourceText}</p>
            </details>
          )}
          <button type="button" className="primary" onClick={() => setPhase('inprogress')}>
            {t('exam.start')}
          </button>
        </section>
      )}

      {phase === 'inprogress' && (
        <>
          <p className="warning" role="status">⏱️ {t('exam.timeLeft')}: {mmss}</p>
          {paper.sourceText && (
            <details open>
              <summary>{t('exam.readingText')}</summary>
              <p style={{ whiteSpace: 'pre-wrap' }} lang="ro">{paper.sourceText}</p>
            </details>
          )}
          {paper.items.map((item) => (
            <section key={item.id} className="card" style={{ marginBottom: '1rem' }}>
              <p><strong>{item.order}.</strong> {item.prompt} <span className="muted">({item.maxPoints} p.)</span></p>
              <label htmlFor={`ans-${item.id}`} className="visually-hidden">{t('exam.yourAnswer')}</label>
              <textarea
                id={`ans-${item.id}`}
                lang="ro"
                spellCheck
                value={answers[item.id] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [item.id]: e.target.value }))}
              />
            </section>
          ))}
          <button type="button" className="primary" onClick={() => void submit()}>
            {t('exam.submit')}
          </button>
        </>
      )}

      {phase === 'grading' && <p role="status">{t('exam.grading')}</p>}

      {phase === 'results' && (
        <>
          <section className="card">
            <h2>{t('exam.total')}: {totalAwarded} / {paper.totalPoints}</h2>
          </section>
          {paper.items.map((item) => {
            const r = results.find((x) => x.itemId === item.id)
            if (!r) return null
            return (
              <section key={item.id} className="card" style={{ marginBottom: '1rem' }}>
                <p><strong>{item.order}.</strong> {r.awarded} / {r.max} <span className="muted">· {t(`exam.mode.${r.mode}`)}</span></p>
                {r.lowConfidence && <p className="muted">{t('exam.lowConfidence')}</p>}
                {r.perCriterion.filter((c) => c.comment).map((c) => (
                  <p key={c.id} style={{ margin: '0.2rem 0' }}>• {c.awarded}/{c.max} — {c.comment}</p>
                ))}
                {r.advice && <p><em>{t('exam.advice')}:</em> {r.advice}</p>}
              </section>
            )
          })}

          <section className="card">
            <h2>{t('exam.feedbackTitle')}</h2>
            <label className="row" style={{ gap: '0.5rem' }}>
              <input type="checkbox" checked={feedback.clear} onChange={(e) => setFeedback((f) => ({ ...f, clear: e.target.checked }))} />
              {t('exam.clear')}
            </label>
            <label className="row" style={{ gap: '0.5rem' }}>
              <input type="checkbox" checked={feedback.useful} onChange={(e) => setFeedback((f) => ({ ...f, useful: e.target.checked }))} />
              {t('exam.useful')}
            </label>
            <label>{t('exam.comment')}
              <input value={feedback.comment ?? ''} onChange={(e) => setFeedback((f) => ({ ...f, comment: e.target.value }))} />
            </label>
            <button type="button" className="primary" style={{ marginTop: '0.6rem' }} onClick={() => void saveFeedback()} disabled={feedbackSaved}>
              {feedbackSaved ? `✓ ${t('exam.saved')}` : t('exam.saveFeedback')}
            </button>
          </section>
        </>
      )}
    </div>
  )
}
```

Note on store fields: `Practice.tsx` already reads `useAppStore((s) => s.providerConfig)` and `s.apiKey`. If `newId`/`nowIso` signatures differ, match `Practice.tsx` usage (it calls `newId('ev')` and `nowIso()`); `newId('exam')` follows the same pattern.

- [ ] **Step 2: Export the screen**

In `src/screens/index.ts`, add:

```ts
export { Exam } from './Exam'
```

- [ ] **Step 3: Register the route**

In `src/app/App.tsx`:

1. Add `Exam` to the `@/screens` import list.
2. Add a child route after the `practice` route:

```tsx
      { path: 'exam', element: <Exam /> },
```

- [ ] **Step 4: Add the nav item**

In `src/app/Layout.tsx`, add to `NAV_ITEMS` after the `practice` entry:

```ts
  { to: '/exam', key: 'exam' },
```

- [ ] **Step 5: Typecheck + run the app**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run dev`, open `http://localhost:5173`, complete onboarding, switch to Romanian, click "Пробный экзамен / Mock exam", Start, answer a couple of items, Submit.
Expected: grading runs; results show per-item scores and a total `X / 50`; the feedback form saves.

- [ ] **Step 6: Commit**

```bash
git add src/screens/Exam.tsx src/screens/index.ts src/app/App.tsx src/app/Layout.tsx
git commit -m "feat: mock exam screen — timed flow, barem results, mini-feedback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Full verification + provider note

**Files:** none (verification + docs only)

- [ ] **Step 1: Run the whole suite + typecheck**

Run: `npm test`
Expected: PASS (all suites, including the new ones).
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Manual end-to-end with a real provider (pilot dry-run)**

In Settings, configure a provider that returns JSON (cloud OpenAI-compatible with a key, or your OVMS/Ollama endpoint). Take the mock exam answering all 11 items. Confirm:
- Open items show `AI-graded` mode with per-criterion points within max.
- Item 11 (correctness) shows the low-confidence note.
- Export (Export screen) JSON now contains an `examAttempts` array with your attempt.

- [ ] **Step 3: Decide & record the pilot provider**

Per the spec's provider section, pick the pilot provider (recommended default: cloud OpenAI-compatible). Note the choice in the spec or a short pilot README; no code change required (the layer is provider-neutral).

- [ ] **Step 4: Finish the branch**

Invoke `superpowers:finishing-a-development-branch` to decide merge/PR.

---

## Self-Review Notes (filled by author)

- **Spec coverage:** §1 model → Task 1/2; §2 ingestion → Task 2 (+ Task 8 chunks); §3 grader → Tasks 3–5; §4 UI → Task 10 (+ Task 9 i18n); §5 export/feedback → Tasks 6,7,10; provider note → Task 11. Correctness item (§ special case) → Tasks 2,4,5 (`lowConfidence`).
- **Refinement vs spec table:** item 7 is graded as `open` (LLM), not `short` — its barem scores per-modification, which exact-string matching can't do. Item 2 is the only `short` item. This narrows the deterministic path as the spec anticipated.
- **Type consistency:** `BaremResult`, `ExamItem.subCriteria`, `GradeDeps.subjectId`, `examAttemptRepo`, `examPapersForSubject` names are used identically across Tasks 1–10.
