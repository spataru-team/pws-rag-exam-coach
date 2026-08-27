/**
 * Scrapes the ctice.gov.md textbook archive (grade I-XII, PDF format) into a
 * committed manifest, and optionally downloads a filtered subset of the actual
 * PDFs. The site's `download.php?id=N` links are opaque (no subject/grade in
 * the URL), but each grade's books sit under a `Clasa a <roman>-a` folder
 * marker in the page HTML — this parses that structure once so the manifest
 * captures (grade, subject, language, year) without re-scraping every run.
 *
 * If ctice.gov.md's markup changes and this breaks, the last-known-good
 * manifest stays committed at corpus/manifest.json — fall back to downloading
 * by hand from https://ctice.gov.md/?page_id=447 and adding rows manually.
 *
 * Run:
 *   npx tsx scripts/fetch-textbooks.ts                    # refresh corpus/manifest.json only
 *   npx tsx scripts/fetch-textbooks.ts --download chemistry,math,russian --grades 9,12
 *     # also downloads matching PDFs into corpus/raw/<subject>/<grade>/<lang>.pdf
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CORPUS_DIR = join(__dirname, '..', 'corpus')
const MANIFEST_FILE = join(CORPUS_DIR, 'manifest.json')
const RAW_DIR = join(CORPUS_DIR, 'raw')

const SOURCE_URL = 'https://ctice.gov.md/?page_id=447'

// Roman numeral grade folders, in the order they appear on the page.
const GRADE_LABEL_RE = /Clasa a ([IVX]+)-a/

export type TextLanguage = 'ro' | 'ru' | 'unknown'

export interface ManifestEntry {
  id: string
  grade: number
  /** Normalized subject slug (see SUBJECT_ALIASES) — 'other' if unrecognized. */
  subject: string
  /** Verbatim subject text as it appeared before normalization, for auditing. */
  subjectRaw: string
  language: TextLanguage
  year?: number
  filename: string
  url: string
}

const SUBJECT_ALIASES: [RegExp, string][] = [
  [/chimie/i, 'chemistry'],
  [/matematic/i, 'math'],
  // "Limba si literatura rusa/ă" = native Russian language & literature (the
  // subject Russian-medium students sit for EN/BAC). Deliberately does NOT
  // match bare "Limba rusa" — that series is Russian taught as a FOREIGN
  // language to Romanian-speaking students, a different course entirely (the
  // mirror image of "Limba română pentru alolingvi"); it's tagged
  // 'russian-as-foreign-language' below so the two are never conflated.
  [/literatura rus[aă]|русск/i, 'russian'],
  [/^limba rusa\b(?!.*literatura)/i, 'russian-as-foreign-language'],
  [/limba si literatura roman|limba și literatura rom[aâ]n/i, 'romanian'],
  [/biologi/i, 'biology'],
  [/fizic/i, 'physics'],
  [/istoria/i, 'history'],
  [/geografi/i, 'geography'],
  [/informatic/i, 'informatics'],
]

function romanToInt(roman: string): number {
  const map: Record<string, number> = { I: 1, V: 5, X: 10 }
  let total = 0
  for (let i = 0; i < roman.length; i++) {
    const cur = map[roman[i] as string] ?? 0
    const next = map[roman[i + 1] as string] ?? 0
    total += cur < next ? -cur : cur
  }
  return total
}

function detectLanguage(name: string): TextLanguage {
  if (/limba rus[aă]|în limba rus[aă]|in limba rus[aă]/i.test(name)) return 'ru'
  if (/limba roman[aă]|in limba roman[aă]|în limba roman[aă]/i.test(name)) return 'ro'
  // Undated/neutral filenames (e.g. "Geografie (a. 2024).pdf") are the
  // Romanian-medium default on this site unless marked otherwise.
  return 'unknown'
}

function detectYear(name: string): number | undefined {
  const m = name.match(/20\d{2}/)
  return m ? Number(m[0]) : undefined
}

function normalizeSubject(rawWithGradePrefix: string): { subject: string; subjectRaw: string } {
  // Strip a leading "VII_" style grade prefix some older filenames carry.
  const withoutGradePrefix = rawWithGradePrefix.replace(/^[IVX]+_/, '')
  // Strip the trailing "(a. 2024, in limba romana).pdf" / ".pdf" parts.
  const subjectRaw = withoutGradePrefix
    .replace(/\.pdf$|\.zip$/i, '')
    .replace(/\(.*?\)\s*$/, '')
    .trim()
  for (const [re, slug] of SUBJECT_ALIASES) {
    if (re.test(subjectRaw)) return { subject: slug, subjectRaw }
  }
  return { subject: 'other', subjectRaw }
}

/** Pure parser — split into per-grade chunks, then extract (id, filename) pairs within each. */
export function parseManifest(html: string): ManifestEntry[] {
  const folderRe = /<div><i class="fa fa-folder"><\/i>\s*([^<]+)<\/div>/g
  const linkRe = /download\.php\?id=(\d+)"><span>([^<]+)<\/span>/g

  const markers: { label: string; index: number }[] = []
  let fm: RegExpExecArray | null
  while ((fm = folderRe.exec(html))) markers.push({ label: fm[1]!.trim(), index: fm.index })

  const entries: ManifestEntry[] = []
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]!
    const gradeMatch = marker.label.match(GRADE_LABEL_RE)
    if (!gradeMatch) continue // "Limba Engleza" / "Limba Franceza" / "Manuale vechi" sections — skip, not grade-scoped
    const grade = romanToInt(gradeMatch[1]!)

    const sectionEnd = markers[i + 1]?.index ?? html.length
    const section = html.slice(marker.index, sectionEnd)

    linkRe.lastIndex = 0
    let lm: RegExpExecArray | null
    while ((lm = linkRe.exec(section))) {
      const id = lm[1]!
      const filename = lm[2]!
      const { subject, subjectRaw } = normalizeSubject(filename)
      entries.push({
        id,
        grade,
        subject,
        subjectRaw,
        language: detectLanguage(filename),
        year: detectYear(filename),
        filename,
        url: `https://ctice.md:1443/public/download.php?id=${id}`,
      })
    }
  }
  return entries
}

function parseArgs(): { download: Set<string>; grades: Set<number> } {
  const args = process.argv.slice(2)
  const downloadArg = args.find((a) => a.startsWith('--download='))?.split('=')[1]
  const gradesArg = args.find((a) => a.startsWith('--grades='))?.split('=')[1]
  return {
    download: new Set((downloadArg ?? '').split(',').filter(Boolean)),
    grades: new Set((gradesArg ?? '').split(',').filter(Boolean).map(Number)),
  }
}

async function main(): Promise<void> {
  const { download, grades } = parseArgs()

  console.log(`[fetch-textbooks] GET ${SOURCE_URL}`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`Failed to fetch ${SOURCE_URL}: HTTP ${res.status}`)
  const html = await res.text()

  const entries = parseManifest(html)
  console.log(`[fetch-textbooks] parsed ${entries.length} entries across grades I-XII`)

  await mkdir(CORPUS_DIR, { recursive: true })
  await writeFile(MANIFEST_FILE, JSON.stringify({ sourceUrl: SOURCE_URL, fetchedAt: new Date().toISOString(), entries }, null, 2), 'utf8')
  console.log(`[fetch-textbooks] wrote ${MANIFEST_FILE}`)

  if (download.size === 0) return

  const targets = entries.filter(
    (e) =>
      download.has(e.subject) &&
      (grades.size === 0 || grades.has(e.grade)) &&
      e.language !== 'unknown', // ambiguous-language files need a human to confirm before use
  )
  console.log(`[fetch-textbooks] downloading ${targets.length} matching PDFs...`)
  for (const t of targets) {
    const dir = join(RAW_DIR, t.subject, String(t.grade))
    await mkdir(dir, { recursive: true })
    const file = join(dir, `${t.language}-${t.id}.pdf`)
    const r = await fetch(t.url)
    if (!r.ok) {
      console.error(`[fetch-textbooks] FAILED id=${t.id} (${t.filename}): HTTP ${r.status}`)
      continue
    }
    const buf = Buffer.from(await r.arrayBuffer())
    await writeFile(file, buf)
    console.log(`[fetch-textbooks] wrote ${file} (${(buf.length / 1024).toFixed(0)} KB) <- ${t.filename}`)
  }
}

main().catch((err) => {
  console.error('[fetch-textbooks] failed:', err)
  process.exit(1)
})
