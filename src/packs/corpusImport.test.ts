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
    expect(block.rows[0]![1]).toBe('romanian')
  })
})

describe('recordFromRow', () => {
  it('maps columns to values, unescapes, and converts \\N to null', () => {
    const block = parseCopyBlock(DUMP, 'public.rag_chunks')
    const rec = recordFromRow(block.columns, block.rows[1]!)
    expect(rec['subject']).toBe('biology')
    expect(rec['page_from']).toBeNull()
    expect(rec['title']).toBe('Bio')
  })
})

describe('rowToChunk768', () => {
  it('maps a rag_chunks record to a Chunk768', () => {
    const block = parseCopyBlock(DUMP, 'public.rag_chunks')
    const rec = recordFromRow(block.columns, block.rows[0]!)
    const chunk = rowToChunk768(rec)
    expect(chunk.id).toBe('ro-corpus-1')
    expect(chunk.subjectId).toBe('romanian')
    expect(chunk.gradeLevel).toBe(12)
    expect(chunk.language).toBe('ro')
    expect(chunk.topicId).toBe('ro-corpus')
    expect(chunk.text).toBe('Conținut cu diacritice ăâîșț\nlinia 2')
    expect(chunk.source).toContain('XII_Limba')
    expect(chunk.embedding).toHaveLength(768)
    expect(chunk.embedding[0]).toBe(0.123457)
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
