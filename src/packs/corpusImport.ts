import type { Chunk, SubjectId } from '@/types'

/**
 * Dimensionality of the legacy `edu-rag-mvp` `rag_chunks` corpus (nomic-embed-text).
 * Fixed to this historical value, independent of the app's current default
 * embedding dimension — this importer is for the old 768-dim dump only (and is
 * currently deferred; see docs memory on the corrupted legacy corpus).
 */
const LEGACY_EMBEDDING_DIM = 768

export interface CopyBlock {
  columns: string[]
  rows: string[][]
}

/** Round a float to 6 decimal places (pack-size reduction; preserves cosine ranking). */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/** Decode one pg COPY text-format field. `\N` (whole-field NULL) is handled by the caller. */
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
 * Returns the column list and the raw, tab-split data rows (not yet unescaped),
 * reading until the `\.` terminator line.
 */
export function parseCopyBlock(dump: string, table: string): CopyBlock {
  const lines = dump.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
  const headerIdx = lines.findIndex((l) => l.startsWith(`COPY ${table} (`))
  if (headerIdx === -1) throw new Error(`COPY block for ${table} not found`)
  const header = lines[headerIdx] ?? ''
  const columns = header
    .slice(header.indexOf('(') + 1, header.indexOf(')'))
    .split(',')
    .map((c) => c.trim())
  const rows: string[][] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line === '\\.') break
    if (line === '') continue
    rows.push(line.split('\t'))
  }
  return { columns, rows }
}

/** Map a tab-split row to a column→value record. `\N` becomes null; other fields are unescaped. */
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

/** Map one `rag_chunks` record to a Chunk (id-prefixed, embeddings rounded to 6dp). */
export function rowToChunk768(rec: Record<string, string | null>): Chunk {
  const embeddingRaw = rec['embedding'] ?? null
  const embedding = (JSON.parse(embeddingRaw ?? '[]') as number[]).map(round6)
  if (embedding.length !== LEGACY_EMBEDDING_DIM) {
    throw new Error(
      `rag_chunks id=${rec['id']} has ${embedding.length} dims, expected ${LEGACY_EMBEDDING_DIM}`,
    )
  }
  const pageFrom = numOrUndef(rec['page_from'] ?? null)
  const pageTo = numOrUndef(rec['page_to'] ?? null)
  const pages =
    pageFrom !== undefined
      ? pageTo !== undefined && pageTo !== pageFrom
        ? ` pp.${pageFrom}-${pageTo}`
        : ` p.${pageFrom}`
      : ''
  return {
    id: `ro-corpus-${rec['id']}`,
    subjectId: 'romanian' as SubjectId,
    topicId: 'ro-corpus',
    language: 'ro',
    text: rec['content'] ?? '',
    source: `${rec['book_id'] ?? ''}${pages}`.trim(),
    gradeLevel: Number(rec['grade']),
    embedding,
    metadata: {
      bookId: rec['book_id'] ?? undefined,
      chunkId: rec['chunk_id'] ?? undefined,
      pageFrom,
      pageTo,
      contentHash: rec['content_hash'] ?? undefined,
      grade: Number(rec['grade']),
    },
  }
}
