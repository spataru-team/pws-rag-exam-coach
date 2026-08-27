# Subject Registry

The platform is multi-subject by design. A subject is data + configuration, not
code. The registry (`src/data/subjectRegistry.ts`) maps `subjectId → Subject`.

## Current subjects

| Subject   | id          | enabled | grades | MVP content |
|-----------|-------------|---------|--------|-------------|
| Romanian (alolingvi) | `romanian` | ✅ yes | 9 | Full topic tree, exercise types, rubric, 17 hand-authored chunks, exam papers (pr26, sb26), Rescue Mode |
| English   | `english`   | ✅ yes  | — | 4 topics, written rubric, 9 hand-authored chunks, golden set |
| Biology   | `biology`   | ✅ yes  | 7 | 3 topics, answer rubric, 8 hand-authored chunks, golden set |
| History   | `history`   | ✅ yes  | — | 3 topics, answer rubric, 7 hand-authored chunks, golden set |
| Chemistry | `chemistry` | ✅ yes  | 9, 12 | 11 topics, answer rubric, 600 chunks auto-ingested from real textbooks (`scripts/ingest-pdf.ts`), golden set |
| Mathematics | `math`    | ✅ yes  | 9, 12 | 9 topics, answer rubric, 600 chunks auto-ingested, golden set |
| Russian language & literature | `russian` | ✅ yes | 12 (9 topics authored, no source PDF at 9 — see `src/data/subjects/russian.ts`) | 7 topics, written rubric, 400 chunks auto-ingested, golden set |

All seven subjects are active end-to-end flows (Practice/coach). Chemistry and
math pack a mix of grades 9 and 12 in one pack — retrieval filters by the
active topic's `gradeLevel` so a grade-9 question doesn't surface grade-12
organic-chemistry material (see `ChunkSource.getChunks` in `src/rag/retrieve.ts`).
Exam Rescue Mode (diagnostic → route → drill → forecast) is still Romanian-only;
see `docs/superpowers/plans/2026-08-11-exam-rescue-mode.md`. New subjects can
still be added purely as data + config (see below); the "coming soon" UI state
remains for any future subject shipped with `enabled: false`.

## Auto-ingested subjects (chemistry, math, russian)

Unlike the hand-authored subjects above, these three pull real chunk content
from Ministry-of-Education textbook PDFs:

1. `npm run corpus:fetch` (`scripts/fetch-textbooks.ts`) scrapes ctice.gov.md's
   textbook archive into `corpus/manifest.json` (id → grade/subject/language),
   optionally downloading matching PDFs into `corpus/raw/<subject>/<grade>/`
   (gitignored — large, third-party copyrighted) via
   `--download=chemistry,math --grades=9,12`.
2. `npm run corpus:ingest -- --input ... --subject ... --grade ... --lang ru --source "..." --out corpus/out/<subject>-<grade>-<lang>.chunks.json`
   extracts text (position-aware line reconstruction), cleans known PDF
   artifacts (running headers, decorative-font glyph noise, a verified CP1251↔
   Latin-1 encoding bug), chunks on detected section headings, and writes
   `ChunkDraft[]` JSON (`--max-chunks N` caps pack size via even sampling).
   `corpus/out/*.chunks.json` is the actual retrieval content, not a build
   artifact. **It is not included in this public repository** (derived from
   third-party copyrighted textbooks) — regenerate it locally with the step
   above; `corpus/manifest.json` (the catalogue) is included.
3. `npm run seed` picks up `corpus/out/<subjectId>-*.chunks.json` automatically
   alongside any hand-authored `src/data/chunks/<id>.chunks.ts` drafts for that
   subject (see `loadGeneratedChunks` in `scripts/seed-packs.ts`).

## The `Subject` shape

Defined in `src/types/subject.ts`. Key fields:

- `id`, `title`, `interfaceTitleByLanguage` (EN/RU/RO labels)
- `learningLanguages`, `enabled`, `examModeAvailable`, `defaultGradeLevel`
- `topicTree: Topic[]` — hierarchical topics with `skillArea`, `prerequisites`,
  `difficulty`, `gradeLevel`, `examRelevance`
- `exerciseTypes: ExerciseType[]` — `inputMode` is one of `written |
  multiple_choice | short_answer | classification | matching | explanation`
- `assessmentRubrics: AssessmentRubric[]` — criteria + scoring scale
- `recommendedSessionLengthMin`, `metadata`

## Subject data pack

`public/packs/<id>.pack.json` (see `src/packs/types.ts`):

```jsonc
{
  "schemaVersion": 2,
  "subjectId": "romanian",
  "embeddingModel": "bge-m3" | "deterministic-stub",
  "embeddingDim": 1024,
  "generatedAt": "...",
  "chunks": [ /* Chunk, embedding.length === embeddingDim */ ]
}
```

Chunk metadata mirrors the existing `rag_chunks` columns (`bookId`, `chunkId`,
`pageFrom/To`, `contentHash`, `grade`) so a real corpus export can populate packs
without type changes.

## Adding a new subject

1. **Config**: create `src/data/subjects/<id>.ts` exporting a `Subject`
   (topic tree, exercise types, rubrics). Add EN/RU/RO titles.
2. **Chunks**: create `src/data/chunks/<id>.chunks.ts` with `ChunkDraft[]`
   (authored text, no embeddings). Register it in `src/data/chunks/index.ts`.
3. **Register**: add the subject to the `SUBJECTS` array in
   `src/data/subjectRegistry.ts`.
4. **Prompt rules** (optional): add a subject entry in
   `src/llm/promptTemplates/subjects.ts`.
5. **Seed**: run `npm run seed` to embed the chunks and emit the pack.
6. Set `enabled: true` when the content is ready.

No retrieval, LLM, learning, storage, or UI code needs to change.
