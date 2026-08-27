/**
 * Extracts text from a source textbook PDF (see scripts/fetch-textbooks.ts) and
 * chunks it into ChunkDraft[] JSON, ready for `npm run seed` alongside the
 * hand-authored TS chunk drafts (see src/data/chunks/index.ts).
 *
 * Position-aware text reconstruction (pdfjs-dist gives glyphs, not lines) plus
 * three cleaning passes, because these are real government-scanned textbook
 * PDFs with real artifacts:
 *   1. Repeated running headers/footers (book title, page numbers) — stripped
 *      by frequency across pages, not by content, so it works for any book.
 *   2. Decorative-font glyph corruption: some textbooks render "problem number"
 *      icons via a custom font whose glyph IDs collide with Romanian-diacritic
 *      Unicode codepoints in PDF text extraction, e.g. "ăţșțȚĂț" noise
 *      interleaved with real Cyrillic text. Stripped by pattern (runs of 2+
 *      diacritics with no vowel between them — real Romanian words don't do
 *      this) — see verified example in corpus/raw/chemistry/9/ru-488.pdf p5.
 *   3. Encoding-corruption guard: aborts loudly if the extracted text shows the
 *      `?`-flood signature that destroyed the legacy edu-rag-mvp corpus (see
 *      memory: diacritics silently replaced with literal '?' at ingestion) —
 *      better to fail the run than emit poisoned chunks.
 *
 * Chunking splits on recognized heading patterns (§ N, Глава N, Capitolul N,
 * numbered sections) with a sliding-window fallback (~800 chars, ~15% overlap)
 * for long or headingless spans, capped under bge-m3's ~512-token input limit.
 *
 * Run:
 *   npx tsx scripts/ingest-pdf.ts \
 *     --input corpus/raw/chemistry/9/ru-488.pdf \
 *     --subject chemistry --grade 9 --lang ru \
 *     --source "Химия. Учебник для 9 класса (Драгалина, Велишко), Editura ARC" \
 *     --out corpus/out/chemistry-9-ru.chunks.json
 *
 * Optional: --skip-pages 4 (skip cover/TOC), --topic-prefix chem (default:
 * derived from --subject), --min-chars 150, --max-chars 900.
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ChunkDraft } from '@/data/chunks/types'
import type { LearningLanguage } from '@/types'

interface Args {
  input: string
  subject: string
  grade: number
  lang: LearningLanguage
  source: string
  out: string
  skipPages: number
  topicPrefix: string
  minChars: number
  maxChars: number
  maxChunks?: number
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  const get = (flag: string) => {
    const i = a.indexOf(flag)
    return i === -1 ? undefined : a[i + 1]
  }
  const input = get('--input')
  const subject = get('--subject')
  const gradeRaw = get('--grade')
  const lang = get('--lang')
  const source = get('--source')
  const out = get('--out')
  if (!input || !subject || !gradeRaw || !lang || !source || !out) {
    throw new Error(
      'Required: --input <pdf> --subject <id> --grade <n> --lang <ro|ru|en> --source "<citation>" --out <chunks.json>',
    )
  }
  return {
    input,
    subject,
    grade: Number(gradeRaw),
    lang: lang as LearningLanguage,
    source,
    out,
    skipPages: Number(get('--skip-pages') ?? 0),
    topicPrefix: get('--topic-prefix') ?? subject,
    minChars: Number(get('--min-chars') ?? 150),
    maxChars: Number(get('--max-chars') ?? 900),
    maxChunks: get('--max-chunks') ? Number(get('--max-chunks')) : undefined,
  }
}

interface PageLines {
  page: number
  lines: string[]
}

/** Groups glyph items into visual lines (by y) then reading order (by x) — raw
 * pdfjs text items arrive roughly in content-stream order, not visual order. */
function reconstructLines(items: TextItem[]): string[] {
  const rows = new Map<number, { x: number; str: string }[]>()
  for (const it of items) {
    if (!it.str.trim()) continue
    const y = Math.round((it.transform[5] as number) / 2) * 2 // bucket to tolerate sub-pixel jitter
    const row = rows.get(y) ?? []
    row.push({ x: it.transform[4] as number, str: it.str })
    rows.set(y, row)
  }
  const ys = [...rows.keys()].sort((a, b) => b - a) // top of page first (PDF y grows upward)
  return ys.map((y) =>
    rows
      .get(y)!
      .sort((a, b) => a.x - b.x)
      .map((s) => s.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

async function extractPages(path: string, skipPages: number): Promise<PageLines[]> {
  const data = new Uint8Array(await readFile(path))
  const doc = await getDocument({ data, useSystemFonts: true }).promise
  const pages: PageLines[] = []
  for (let p = skipPages + 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const lines = reconstructLines(content.items as TextItem[]).filter(Boolean)
    pages.push({ page: p, lines })
  }
  return pages
}

/** Strips lines that repeat verbatim across many pages (running headers/footers). */
function stripRunningHeaders(pages: PageLines[]): PageLines[] {
  const freq = new Map<string, number>()
  for (const p of pages) {
    for (const line of p.lines) {
      if (line.length === 0 || line.length > 100) continue // long lines are real content, never headers
      freq.set(line, (freq.get(line) ?? 0) + 1)
    }
  }
  const threshold = Math.max(3, Math.floor(pages.length * 0.15))
  const headerLines = new Set([...freq.entries()].filter(([, n]) => n >= threshold).map(([l]) => l))
  return pages.map((p) => ({ ...p, lines: p.lines.filter((l) => !headerLines.has(l)) }))
}

// Runs of 2+ Romanian-diacritic characters with no vowel between them are never
// real Romanian words (every real word alternates consonants/diacritics with
// vowels) — this is decorative-font glyph noise, see file header.
const GLYPH_NOISE_RE = /[ăâîșțĂÂÎȘȚ]{2,}/g
// Bare page-number / stray-digit lines left over after header stripping.
const PAGE_NUMBER_LINE_RE = /^\d{1,4}$/
// Table-of-contents dot-leader entries ("...название темы . . . . . . 54").
const TOC_LINE_RE = /(\.\s*){4,}\d+\s*$/

/**
 * Repairs a specific, verified font-encoding bug seen in at least one source
 * PDF (corpus/raw/math/9/ru-654.pdf): some glyphs' ToUnicode CMap maps
 * Cyrillic bytes through Windows-1251 as if they were Latin-1, so "Глава"
 * (Chapter) extracts as "Ãëàâà". This is a clean, reversible byte confusion —
 * Windows-1251's 0xC0–0xFF range maps linearly onto U+0410–U+044F (А–я), and
 * that's exactly the U+00C0–U+00FF Latin-1-supplement range these glyphs
 * decode to. Only characters in that narrow range are touched; ASCII (digits,
 * Latin formula variables) and already-correct Cyrillic (U+0400+, most of the
 * body text in the same book decodes fine) pass through untouched.
 *
 * ONLY SAFE for lang='ru' text: â/î (U+00E2/U+00EE) are real Romanian letters,
 * and this repair would silently mangle them — see the ru-only call site.
 */
function repairCp1251Latin1Confusion(line: string): string {
  let latin1SupCount = 0
  for (const ch of line) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp >= 0xc0 && cp <= 0xff) latin1SupCount++
  }
  if (latin1SupCount < 3) return line // not enough signal to risk a rewrite
  return Array.from(line)
    .map((ch) => {
      const cp = ch.codePointAt(0) ?? 0
      if (cp === 0xa8) return 'Ё'
      if (cp === 0xb8) return 'ё'
      if (cp >= 0xc0 && cp <= 0xff) return String.fromCodePoint(0x410 + (cp - 0xc0))
      return ch
    })
    .join('')
}

function cleanLine(line: string, lang: LearningLanguage): string | undefined {
  if (TOC_LINE_RE.test(line)) return undefined
  const repaired = lang === 'ru' ? repairCp1251Latin1Confusion(line) : line
  const cleaned = repaired.replace(GLYPH_NOISE_RE, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || undefined
}

/** True if a chunk is mostly numbers/symbols — reference tables (periodic
 * table appendix, formula sheets) rather than explanatory prose. These are
 * real pages in the source PDF but make poor retrievable text chunks: high
 * token density, near-zero semantic content a query would actually match. */
function isReferenceTableNoise(text: string): boolean {
  const nonSpace = text.replace(/\s/g, '')
  if (nonSpace.length === 0) return true
  const digits = (text.match(/\d/g) ?? []).length
  return digits / nonSpace.length > 0.25
}

/** Aborts if the text shows the '?'-flood signature that destroyed the legacy
 * edu-rag-mvp corpus (diacritics silently replaced with literal '?' on ingest). */
function assertNotCorrupted(text: string, lang: LearningLanguage): void {
  if (lang !== 'ro') return
  const qMarks = (text.match(/\?/g) ?? []).length
  const words = text.split(/\s+/).length || 1
  const ratio = qMarks / words
  if (ratio > 0.02) {
    throw new Error(
      `Suspiciously high '?' density (${qMarks} in ${words} words, ratio ${ratio.toFixed(3)}) — ` +
        `this looks like the same diacritic-corruption signature that destroyed the legacy edu-rag-mvp ` +
        `corpus (ă/â/î/ș/ț replaced with literal '?' at ingestion). Refusing to emit chunks. Inspect the ` +
        `source PDF/encoding before retrying.`,
    )
  }
}

interface Section {
  heading?: string
  pageFrom: number
  pageTo: number
  text: string
}

const HEADING_RE = /^(§\s*\d+\.?|Глава\s+\d+\.?|Capitolul\s+\d+\.?|Тема\s+\d+\.?|\d+\.\d+\.\s+\S)/

/** Splits cleaned pages into sections at recognized heading lines. Content
 * before the first heading becomes an untitled leading section (often front
 * matter — dropped later if too short). */
function splitIntoSections(pages: PageLines[], lang: LearningLanguage): Section[] {
  const sections: Section[] = []
  let current: Section = { pageFrom: pages[0]?.page ?? 1, pageTo: pages[0]?.page ?? 1, text: '' }

  for (const p of pages) {
    for (const rawLine of p.lines) {
      const line = cleanLine(rawLine, lang)
      if (!line || PAGE_NUMBER_LINE_RE.test(line)) continue
      // (line is defined and non-empty past this point — cleanLine returns
      // undefined for empty/TOC-only lines)

      if (HEADING_RE.test(line) && current.text.trim().length > 0) {
        sections.push(current)
        current = { heading: line, pageFrom: p.page, pageTo: p.page, text: '' }
      } else if (HEADING_RE.test(line) && !current.heading) {
        current.heading = line
      }
      current.text += (current.text ? '\n' : '') + line
      current.pageTo = p.page
    }
  }
  if (current.text.trim()) sections.push(current)
  return sections
}

/** Sliding-window split for one section's text, respecting sentence ends where
 * possible so a chunk doesn't cut off mid-formula-explanation. */
function windowSection(text: string, minChars: number, maxChars: number): string[] {
  if (text.length <= maxChars) return text.length >= minChars ? [text] : []
  const overlap = Math.floor(maxChars * 0.15)
  const out: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length)
    if (end < text.length) {
      const lastBreak = text.lastIndexOf('\n', end)
      const lastSentence = text.lastIndexOf('. ', end)
      const boundary = Math.max(lastBreak, lastSentence)
      if (boundary > start + minChars) end = boundary + 1
    }
    const piece = text.slice(start, end).trim()
    if (piece.length >= minChars) out.push(piece)
    if (end >= text.length) break
    start = end - overlap
  }
  return out
}

/** Evenly-spaced sample across the whole array (not just the first N) — keeps
 * topic coverage spread across the whole book rather than truncating to
 * chapter 1. Used to cap pack size: a full textbook's sliding-window chunking
 * easily produces 500-1200+ chunks, which is real coverage but a multi-MB
 * pack; --max-chunks keeps demo packs a reasonable download size. */
function strideSample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr
  const step = arr.length / n
  const out: T[] = []
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]!)
  return out
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

async function main(): Promise<void> {
  const args = parseArgs()
  console.log(`[ingest-pdf] reading ${args.input}`)
  const rawPages = await extractPages(args.input, args.skipPages)
  console.log(`[ingest-pdf] extracted ${rawPages.length} pages`)

  const pages = stripRunningHeaders(rawPages)
  const fullTextForGuard = pages.flatMap((p) => p.lines).join(' ')
  assertNotCorrupted(fullTextForGuard, args.lang)

  const sections = splitIntoSections(pages, args.lang)
  console.log(`[ingest-pdf] found ${sections.length} sections`)

  const drafts: ChunkDraft[] = []
  let n = 0
  for (const section of sections) {
    const pieces = windowSection(section.text, args.minChars, args.maxChars)
    const topicSlug = section.heading ? slugify(section.heading) : 'general'
    for (const piece of pieces) {
      if (isReferenceTableNoise(piece)) continue
      n++
      const header = `[${args.subject} · класс ${args.grade}${section.heading ? ' · ' + section.heading : ''}]\n`
      drafts.push({
        id: `${args.subject}-${args.grade}-${args.lang}-${String(n).padStart(3, '0')}`,
        subjectId: args.subject,
        topicId: `${args.topicPrefix}-${topicSlug}`,
        language: args.lang,
        text: header + piece,
        source: args.source,
        gradeLevel: args.grade,
        metadata: {
          pageFrom: section.pageFrom,
          pageTo: section.pageTo,
        },
      })
    }
  }

  const sampled = args.maxChunks ? strideSample(drafts, args.maxChunks) : drafts
  if (sampled.length < drafts.length) {
    console.log(`[ingest-pdf] sampled ${sampled.length}/${drafts.length} chunks (--max-chunks ${args.maxChunks}, evenly spread)`)
  }
  console.log(`[ingest-pdf] emitting ${sampled.length} chunks (min=${args.minChars} max=${args.maxChars} chars)`)
  await mkdir(dirname(args.out), { recursive: true })
  await writeFile(args.out, JSON.stringify(sampled, null, 2), 'utf8')
  console.log(`[ingest-pdf] wrote ${args.out}`)
}

main().catch((err) => {
  console.error('[ingest-pdf] failed:', err)
  process.exit(1)
})
