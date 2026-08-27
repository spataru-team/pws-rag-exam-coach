# Romanian g9 Corpus Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⚠️ STATUS (2026-06-13):** Tasks 1 & 2 (parser + script) are DONE and committed. Task 3 (run import + commit pack) is **DEFERRED/BLOCKED**: the legacy dump's Romanian text is corrupted at the byte level (diacritics destroyed → `?` at ingestion, irreversible), so a dump-based import cannot produce clean text. The committed pack import was reverted; the pilot runs on the 17 curated grade‑9 chunks. Resume Task 3 only after re-ingesting the corpus cleanly from the source PDF (`data\romanian\grade9\IX_Limba si literatura romana.pdf`) via docling + Ollama. Retargeted from grade 12 → grade 9 (the pilot cohort) on 2026-06-13. See the spec's status banner.

**Goal:** Import the 535 pre‑embedded Romanian grade‑9 textbook chunks from the legacy `edu-rag-mvp` Postgres dump into `public/packs/romanian.pack.json`, merged beside the 17 curated chunks, to ground the mock‑exam pilot (grade‑9 gimnaziu, alolingvi).

**Architecture:** Pure, unit‑tested parsing/mapping logic lives in `src/packs/corpusImport.ts` (discoverable by vitest, `@` alias). A thin one‑off orchestration script `scripts/import-corpus.ts` (run via `tsx`) does file I/O: decode the UTF‑16LE dump, extract the `COPY public.rag_chunks` block, filter romanian+g9, map to `Chunk768` (embeddings rounded to 6 decimals), merge with curated chunks, rewrite the pack. No type or loader changes — `Chunk768`/`ChunkSourceMetadata` already mirror the `rag_chunks` columns.

**Tech Stack:** TypeScript, `tsx` (script runner), vitest (tests), Node `fs` (`Buffer.toString('utf16le')`).

**Spec:** `docs/superpowers/specs/2026-06-13-romanian-corpus-import-design.md`

---

## File Structure

- Create: `src/packs/corpusImport.ts` — pure functions: `unescapeCopyField`, `parseCopyBlock`, `recordFromRow`, `round6`, `rowToChunk768`.
- Create: `src/packs/corpusImport.test.ts` — vitest unit tests for the above.
- Create: `scripts/import-corpus.ts` — I/O orchestration (decode dump, filter, merge, write pack).
- Modify: `package.json` — add `"import:corpus"` script.
- Modify (generated output): `public/packs/romanian.pack.json` — regenerated with 552 chunks.

Confirmed COPY column order in the dump:
`id, subject, grade, book_id, chunk_id, page_from, page_to, title, content, content_hash, embedding, created_at`

---

## Task 1: Pure COPY parser + Chunk768 mapper

**Files:**
- Create: `src/packs/corpusImport.ts`
- Test: `src/packs/corpusImport.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/packs/corpusImport.test.ts`. The fixture is a synthetic dump containing one romanian g12 row (with diacritics and an escaped newline) and one biology g7 row to filter out. In the template literal, `\t` is a real tab (COPY delimiter), `\\n` is the two‑char COPY escape for a newline, `\\N` is the COPY NULL token, and `\\.` is the terminator.

```ts
import { describe, it, expect } from 'vitest'
import {
  unescapeCopyField,
  parseCopyBlock,
  recordFromRow,
  round6,
  rowToChunk768,
} from './corpusImport'

const vec = (v: number) => `[${Array(768).fill(v).join(',')}]`

const DUMP = `--
-- PostgreSQL database dump
--
COPY public.rag_chunks (id, subject, grade, book_id, chunk_id, page_from, page_to, title, content, content_hash, embedding, created_at) FROM stdin;
1\tromanian\t12\tXII_Limba\tchunk_0001\t10\t12\tTitlu\tConținut cu diacritice ăâîșț\\nlinia 2\thash1\t${vec(0.12345678)}\t2026-02-09 00:00:00
2\tbiology\t7\tVII_Bio\tchunk_0000\t\\N\t\\N\tBio\tText bio\thash2\t${vec(0.5)}\t2026-02-09 00:00:00
\\.
`

describe('round6', () => {
  it('rounds to 6 decimals', () => {
    expect(round6(0.12345678)).toBe(0.123457)
    expect(round6(-0.0000004)).toBe(-0)
  })
})

describe('unescapeCopyField', () => {
  it('decodes COPY escape sequences', () => {
    expect(unescapeCopyField('a\\nb\\tc\\\\d')).toBe('a\nb\tc\\d')
  })
})

describe('parseCopyBlock', () => {
  it('extracts header columns and data rows for the table', () => {
    const block = parseCopyBlock(DUMP, 'public.rag_chunks')
    expect(block.columns).toEqual([
      'id', 'subject', 'grade', 'book_id', 'chunk_id', 'page_from',
      'page_to', 'title', 'content', 'content_hash', 'embedding', 'created_at',
    ])
    expect(block.rows).toHaveLength(2)
    expect(block.rows[0][1]).toBe('romanian')
  })
})

describe('recordFromRow', () => {
  it('maps columns to values, unescapes, and converts \\N to null', () => {
    const block = parseCopyBlock(DUMP, 'public.rag_chunks')
    const rec = recordFromRow(block.columns, block.rows[1])
    expect(rec.subject).toBe('biology')
    expect(rec.page_from).toBeNull()
    expect(rec.title).toBe('Bio')
  })
})

describe('rowToChunk768', () => {
  it('maps a rag_chunks record to a Chunk768', () => {
    const block = parseCopyBlock(DUMP, 'public.rag_chunks')
    const rec = recordFromRow(block.columns, block.rows[0])
    const chunk = rowToChunk768(rec)
    expect(chunk.id).toBe('ro-corpus-1')
    expect(chunk.subjectId).toBe('romanian')
    expect(chunk.gradeLevel).toBe(12)
    expect(chunk.language).toBe('ro')
    expect(chunk.topicId).toBe('ro-corpus')
    expect(chunk.text).toBe('Conținut cu diacritice ăâîșț\nlinia 2') // diacritics + newline intact
    expect(chunk.source).toContain('XII_Limba')
    expect(chunk.embedding).toHaveLength(768)
    expect(chunk.embedding[0]).toBe(0.123457) // rounded to 6 decimals
    expect(chunk.metadata).toMatchObject({
      bookId: 'XII_Limba',
      chunkId: 'chunk_0001',
      pageFrom: 10,
      pageTo: 12,
      contentHash: 'hash1',
      grade: 12,
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/packs/corpusImport.test.ts`
Expected: FAIL — `Failed to resolve import "./corpusImport"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `src/packs/corpusImport.ts`:

```ts
import { EMBEDDING_DIM, type Chunk768, type SubjectId } from '@/types'

export interface CopyBlock {
  columns: string[]
  rows: string[][]
}

/** Round a float to 6 decimal places (pack‑size reduction; preserves cosine ranking). */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/** Decode one pg COPY text‑format field. `\N` (whole‑field NULL) is handled by the caller. */
export function unescapeCopyField(field: string): string {
  let out = ''
  for (let i = 0; i < field.length; i++) {
    const ch = field[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = field[++i]
    switch (next) {
      case 'n': out += '\n'; break
      case 't': out += '\t'; break
      case 'r': out += '\r'; break
      case 'b': out += '\b'; break
      case 'f': out += '\f'; break
      case 'v': out += '\v'; break
      case '\\': out += '\\'; break
      default: out += next ?? '\\'
    }
  }
  return out
}

/**
 * Extract the `COPY <table> (...) FROM stdin;` block from a decoded pg_dump.
 * Returns the column list and the raw, tab‑split data rows (not yet unescaped),
 * reading until the `\.` terminator line.
 */
export function parseCopyBlock(dump: string, table: string): CopyBlock {
  const lines = dump.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
  const headerIdx = lines.findIndex((l) => l.startsWith(`COPY ${table} (`))
  if (headerIdx === -1) throw new Error(`COPY block for ${table} not found`)
  const header = lines[headerIdx]
  const columns = header
    .slice(header.indexOf('(') + 1, header.indexOf(')'))
    .split(',')
    .map((c) => c.trim())
  const rows: string[][] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i] === '\\.') break
    if (lines[i] === '') continue
    rows.push(lines[i].split('\t'))
  }
  return { columns, rows }
}

/** Map a tab‑split row to a column→value record. `\N` becomes null; other fields are unescaped. */
export function recordFromRow(
  columns: string[],
  values: string[],
): Record<string, string | null> {
  const rec: Record<string, string | null> = {}
  columns.forEach((col, i) => {
    const raw = values[i]
    rec[col] = raw === '\\N' || raw === undefined ? null : unescapeCopyField(raw)
  })
  return rec
}

function numOrUndef(v: string | null): number | undefined {
  return v === null ? undefined : Number(v)
}

/** Map one `rag_chunks` record to a Chunk768 (id‑prefixed, embeddings rounded to 6dp). */
export function rowToChunk768(rec: Record<string, string | null>): Chunk768 {
  const embedding = (JSON.parse(rec.embedding ?? '[]') as number[]).map(round6)
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `rag_chunks id=${rec.id} has ${embedding.length} dims, expected ${EMBEDDING_DIM}`,
    )
  }
  const pageFrom = numOrUndef(rec.page_from)
  const pageTo = numOrUndef(rec.page_to)
  const pages =
    pageFrom !== undefined
      ? pageTo !== undefined && pageTo !== pageFrom
        ? ` pp.${pageFrom}-${pageTo}`
        : ` p.${pageFrom}`
      : ''
  return {
    id: `ro-corpus-${rec.id}`,
    subjectId: 'romanian' as SubjectId,
    topicId: 'ro-corpus',
    language: 'ro',
    text: rec.content ?? '',
    source: `${rec.book_id ?? ''}${pages}`.trim(),
    gradeLevel: Number(rec.grade),
    embedding,
    metadata: {
      bookId: rec.book_id ?? undefined,
      chunkId: rec.chunk_id ?? undefined,
      pageFrom,
      pageTo,
      contentHash: rec.content_hash ?? undefined,
      grade: Number(rec.grade),
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/packs/corpusImport.test.ts`
Expected: PASS (all 5 describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/packs/corpusImport.ts src/packs/corpusImport.test.ts
git commit -m "feat: pure rag_chunks COPY parser + Chunk768 mapper"
```

---

## Task 2: Import orchestration script

**Files:**
- Create: `scripts/import-corpus.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the npm script**

In `package.json`, under `"scripts"`, add after the `"seed"` line:

```json
    "import:corpus": "tsx scripts/import-corpus.ts",
```

- [ ] **Step 2: Write the orchestration script**

Create `scripts/import-corpus.ts`:

```ts
/**
 * One-off: import Romanian grade-9 chunks from the legacy edu-rag-mvp Postgres
 * dump into public/packs/romanian.pack.json (merged beside curated chunks).
 * Grade 9 = the pilot's target (Evaluarea Națională, gimnaziu, alolingvi).
 *
 * NOTE: the legacy dumps store Romanian text with diacritics destroyed (ț→'?'),
 * so this dump-based import is DEFERRED until the corpus is re-ingested cleanly
 * from the source PDF (data\romanian\grade9\IX_Limba si literatura romana.pdf).
 * Once a clean dump exists, this runs as-is.
 *
 * Run: npm run import:corpus -- "D:\edu-rag-mvp\backups\ragdb_2026-02-09.sql"
 * Re-runnable: strips any prior ro-corpus-* chunks before merging (idempotent).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseCopyBlock, recordFromRow, rowToChunk768 } from '@/packs/corpusImport'
import { PACK_SCHEMA_VERSION, type SubjectPack } from '@/packs/types'

const DUMP =
  process.argv[2] ?? 'D:\\edu-rag-mvp\\backups\\ragdb_2026-02-09.sql'
const PACK = 'public/packs/romanian.pack.json'

function main(): void {
  // pg_dump was written as UTF-16LE with a BOM; decode then strip the BOM.
  const decoded = readFileSync(DUMP).toString('utf16le')
  const dump = decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded

  const { columns, rows } = parseCopyBlock(dump, 'public.rag_chunks')
  const imported = rows
    .map((r) => recordFromRow(columns, r))
    .filter((rec) => rec.subject === 'romanian' && rec.grade === '9')
    .map(rowToChunk768)

  if (imported.length === 0) {
    throw new Error(
      `[import] No romanian/g9 rows matched in ${DUMP}. ` +
        `Check the dump path and that rag_chunks has subject='romanian', grade='9' rows. ` +
        `Refusing to overwrite ${PACK}.`,
    )
  }

  const pack = JSON.parse(readFileSync(PACK, 'utf8')) as SubjectPack
  const curated = pack.chunks.filter((c) => !c.id.startsWith('ro-corpus-'))

  const merged: SubjectPack = {
    schemaVersion: PACK_SCHEMA_VERSION,
    subjectId: 'romanian',
    embeddingModel: 'nomic-embed-text',
    generatedAt: new Date().toISOString(),
    chunks: [...curated, ...imported],
  }

  writeFileSync(PACK, JSON.stringify(merged), 'utf8')
  console.log(
    `[import] curated=${curated.length} imported=${imported.length} total=${merged.chunks.length} -> ${PACK}`,
  )
}

main()
```

- [ ] **Step 3: Commit the script (before running it)**

```bash
git add scripts/import-corpus.ts package.json
git commit -m "feat: import-corpus script for Romanian g9 dump -> pack"
```

---

## Task 3: Run the import and verify the pack

**Files:**
- Modify (generated): `public/packs/romanian.pack.json`

- [ ] **Step 1: Run the import**

Run: `npm run import:corpus -- "<clean re-ingested dump>.sql"`
Expected stdout: `[import] curated=17 imported=535 total=552 -> public/packs/romanian.pack.json`

If `imported` ≠ 535, stop and investigate the filter / column order before continuing.

- [ ] **Step 2: Verify counts, dimensions, and Romanian diacritics**

Run:

```bash
node -e "const p=require('./public/packs/romanian.pack.json');const corpus=p.chunks.filter(c=>c.id.startsWith('ro-corpus-'));const curated=p.chunks.filter(c=>!c.id.startsWith('ro-corpus-'));console.log('total',p.chunks.length,'curated',curated.length,'corpus',corpus.length);console.log('dims ok',corpus.every(c=>c.embedding.length===768));const bad=corpus.find(c=>c.embedding.length!==768);console.log('bad dims',bad?bad.id:'none');const withDia=corpus.filter(c=>/[ăâîșțĂÂÎȘȚ]/.test(c.text)).length;console.log('chunks with diacritics',withDia,'/',corpus.length);console.log('sample text:',JSON.stringify(corpus[0].text.slice(0,160)));console.log('sample source:',corpus[0].source,'| meta',JSON.stringify(corpus[0].metadata));"
```

Expected: `total 552 curated 17 corpus 535`; `dims ok true`; `bad dims none`; `chunks with diacritics` is a large majority of 535 (Romanian text); the sample text shows clean diacritics (e.g. `ă â î ș ț`), NOT `Educa??iei` or mojibake like `Educa ┼г iei`.

If the sample shows `??` / mojibake, the source text is corrupted (the current legacy dump fails here — diacritics destroyed at ingestion). STOP, do not commit; the corpus must be re-ingested cleanly from the source PDF first (see the spec's status banner).

- [ ] **Step 3: Verify the pack still loads under the existing validator**

Run: `npm test -- src/rag`
Expected: PASS — existing retrieval/rerank tests are unaffected (they use in‑memory fixtures, not the pack, but this confirms no regression in the RAG layer).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit the regenerated pack**

```bash
git add public/packs/romanian.pack.json
git commit -m "data: import 535 Romanian g9 textbook chunks into romanian pack"
```

---

## Self-Review Notes

- **Spec coverage:** UTF‑16 decode (Task 2 Step 2), COPY parse by header (Task 1 `parseCopyBlock`), romanian+g9 filter (Task 2), field mapping incl. `ro-corpus-` id / `ro-corpus` topicId / `ro` language / metadata (Task 1 `rowToChunk768`), 6‑decimal rounding (`round6`), merge keeping curated (Task 2), 768‑dim assert (`rowToChunk768` + Task 3 check), diacritic integrity (Task 3 Step 2), count = 552 (Task 3), RAG tests (Task 3 Step 3). All spec sections map to a task.
- **Idempotency:** re‑running strips prior `ro-corpus-*` before merge, so the pack never accumulates duplicates.
- **Type consistency:** `parseCopyBlock`/`recordFromRow`/`rowToChunk768`/`round6`/`unescapeCopyField` names and signatures match between Task 1 (definition + tests) and Task 2 (usage). `SubjectPack` fields match `src/packs/types.ts`.
```
