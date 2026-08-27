# Romanian g9 corpus import — design

**Date:** 2026-06-13 (retargeted g12 → g9 on 2026-06-13)
**Status:** DEFERRED — tooling built, but the dump source text is corrupted (see banner).
**Scope:** Import the Romanian grade‑9 textbook corpus (535 chunks) from the legacy
`edu-rag-mvp` Postgres dump into the current `romanian.pack.json`, to ground the
mock‑exam pilot (Evaluarea Națională, gimnaziu, alolingvi; exam 15 Jun 2026).

> **⚠️ STATUS — blocked on source corruption.** Byte-level inspection of the live
> `ragdb` showed the Romanian text is destroyed at the source: every diacritic
> (ă â î ș ț) was replaced with a literal `?` at ingestion time (e.g. "Educației" is
> stored as `Educa??iei`, hex `…61 3f 3f 69…`). The loss is irreversible. The `.sql`
> dumps inherit this corruption (and add UTF‑16LE). Embeddings (numbers) survive but
> were computed on the already-corrupted text, so they are low value.
> **A dump-based import therefore cannot produce clean text.** The import tooling below
> is correct and committed, but is DEFERRED until the corpus is re-ingested cleanly from
> the source PDF (`D:\edu-rag-mvp\data\romanian\grade9\IX_Limba si literatura romana.pdf`)
> via the docling pipeline + Ollama re-embedding. The pilot currently runs on the 17
> curated grade‑9 chunks already in `romanian.pack.json`.

## Problem

The current `romanian.pack.json` holds only ~17 hand‑authored bilingual study
chunks. The legacy stack (`D:\edu-rag-mvp`) accumulated **11 520 real textbook
chunks** across 4 subjects, all already embedded with `nomic-embed-text` (768‑dim,
cosine) — the **same model and space** the current app uses. The mock‑exam grader
(`examGraderService.ts`) retrieves **subject‑wide** (`topicId = undefined`, top‑4),
so a larger Romanian corpus directly improves grading grounding without any topic
mapping.

We migrate the **Romanian grade‑9 slice only** (535 chunks) — grade 9 is the pilot's
target cohort (the exam is for 9th-grade allophone gimnaziu students). Grade 12 is NOT
needed.

## Chosen approach: A — merge into the existing pack

Write a reproducible one‑off extractor that pulls romanian+g9 rows from the dump,
maps them to `Chunk768`, appends them to the 17 curated chunks, and rewrites
`public/packs/romanian.pack.json`. Sentinel `topicId = 'ro-corpus'`.

Rejected alternatives:
- **B (separate corpus pack + multi‑pack loader):** cleaner separation but requires
  changes to `SubjectDataManager`, pack registration and tests. YAGNI for the pilot.
- **C (full topic‑tree mapping of all chunks):** best for topic‑scoped Practice, but
  heavy heuristic/manual work and unnecessary for a subject‑wide mock‑exam grader.
  Deferred.

Approach A needs **no type or loader changes**: `Chunk768` and `ChunkSourceMetadata`
were explicitly designed to mirror the `rag_chunks` columns, and `validatePack`
already enforces `schemaVersion`, `subjectId` and the 768‑dim invariant.

## Source data

- File: `D:\edu-rag-mvp\backups\ragdb_2026-02-09.sql` (CORRUPT text — see status banner;
  a clean re-ingested dump must replace it before this runs for real).
- Encoding: **UTF‑16LE with BOM** (plain‑text `pg_dump`). Must be decoded to UTF‑8
  before parsing.
- Relevant block: `COPY public.rag_chunks (...) FROM stdin;` … `\.` (tab‑separated).
- Confirmed column order:
  `id, subject, grade, book_id, chunk_id, page_from, page_to, title, content,
  content_hash, embedding, created_at`
- Filter: `subject = 'romanian' AND grade = 9` → **535 rows** (book_id
  `IX_Limba si literatura romana`), all with non‑NULL embeddings.

## Pipeline (`scripts/import-corpus.ts`)

1. Read the dump file, decode UTF‑16LE → UTF‑8.
2. Locate the `COPY public.rag_chunks (...)` header; parse the column list from the
   header itself (do not hardcode positions). Read data rows until the `\.`
   terminator. pg COPY text format keeps one row per physical line.
3. Filter rows to `subject = 'romanian'` and `grade = 9`.
4. Map each row → `Chunk768`:
   | Chunk768 field | Source |
   |---|---|
   | `id` | `ro-corpus-<id>` (prefix avoids collision with curated `ro-*` ids) |
   | `subjectId` | `'romanian'` |
   | `topicId` | `'ro-corpus'` (sentinel) |
   | `language` | `'ro'` |
   | `text` | `content`, with COPY unescaping (`\n`→newline, `\t`→tab, `\\`→`\`) |
   | `source` | composed from `book_id` + page range + `title` |
   | `gradeLevel` | `9` |
   | `embedding` | parse pgvector text `[f,f,…]` → `number[]`; assert length 768 |
   | `metadata` | `{ bookId, chunkId, pageFrom, pageTo, contentHash, grade }` |
5. Load the existing `public/packs/romanian.pack.json`; keep its 17 curated chunks.
6. Append the imported chunks. Set `embeddingModel: 'nomic-embed-text'`, fresh
   `generatedAt`, `schemaVersion: PACK_SCHEMA_VERSION`. Write the file.

The script takes the dump path and is re‑runnable; both the script and the
regenerated pack are committed.

## Risks & mitigations

- **Text integrity (encoding) — CONFIRMED BLOCKER:** the legacy dump's Romanian text
  is corrupted at the byte level (diacritics → `?`, irreversible). This is no longer a
  hypothetical risk; it is why the import is deferred. The decode step (UTF‑16LE → UTF‑8)
  is correct — the corruption predates it, in the live DB. Resolution is **re-ingest from
  the source PDF**, not a decoding fix. Before accepting any regenerated pack, **verify
  Romanian diacritics (ă, â, î, ș, ț) survive** on a sample of g9 chunks.
- **Embedding dim drift:** `validatePack` rejects any chunk ≠ 768 dims; the script
  asserts the same and fails fast.
- **ID collision:** `ro-corpus-` prefix keeps imported ids disjoint from curated ids.
- **Pack size:** ~4 MB JSON for 535 chunks. Imported embedding floats are **rounded to
  6 decimals** (~half size); 6 decimals preserves cosine ranking against the query vector.
  Curated chunks are left untouched.
- **COPY escaping edge cases:** content may contain escaped tabs/newlines/backslashes;
  unescape explicitly rather than splitting naively.

## Verification

- `chunks.length === 17 + 535` (= 552) in the regenerated pack.
- Every imported `embedding.length === 768`.
- Spot‑check 2–3 imported `text` values for fidelity and **clean diacritics** (this is
  the gate that currently fails against the corrupt dump).
- Existing RAG tests pass (`src/rag/*.test.ts`).
- Smoke: a Romanian mock‑exam grade run retrieves from imported chunks
  (subject‑wide retrieval returns `ro-corpus-*` ids).

## Out of scope

- Other subjects/grades (history, biology, english; other Romanian grades incl. g12).
- Topic‑tree mapping for topic‑scoped Practice.
- Loader/type changes or a separate corpus pack.
