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
 * ALSO STALE since the 2026-08 embedding migration: `rowToChunk768` produces
 * 768-dim nomic-embed-text vectors, but `curated` (the existing pack's own
 * chunks) is now bge-m3 @ 1024-dim. Merging the two into one pack would violate
 * SubjectDataManager's single-dimension-per-pack invariant. Before re-enabling
 * this script, re-embed the imported rows' text at the pack's current
 * `embeddingDim` instead of reusing their legacy vectors.
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
    embeddingDim: 768,
    generatedAt: new Date().toISOString(),
    chunks: [...curated, ...imported],
  }

  writeFileSync(PACK, JSON.stringify(merged), 'utf8')
  console.log(
    `[import] curated=${curated.length} imported=${imported.length} total=${merged.chunks.length} -> ${PACK}`,
  )
}

main()
