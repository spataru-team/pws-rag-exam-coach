/**
 * Downloads ANCE (Republica Moldova) Bacalaureat exam test + barem (grading
 * scheme) PDFs by their verified filename pattern into corpus/raw/exams/
 * (gitignored, third-party copyrighted — see .gitignore's corpus/raw/ note).
 * These are the real past-session papers listed at
 * https://ru.diez.md/2026/06/26/bak-2026-testy-i-baremy-otsenivania-osnovnoy-sessii/,
 * hosted directly on ance.gov.md.
 *
 * URL pattern (verified against 12_mat_*_sb26.pdf / 12_chi_*_sb26.pdf, 2026-08):
 *   https://ance.gov.md/sites/default/files/<grade>_<subj>_<test|barem>_<profile>_<lang>_<session>.pdf
 *
 * `<subj>` short codes (non-exhaustive, extend as needed): mat (math),
 * chi (chemistry), bio (biology), fiz (physics), ist (history), geo
 * (geography), inf (informatics), lit (Romanian lit.), len (English).
 * `<profile>`: r = real (реальный/matematică), u = umanist. Some subjects (e.g.
 * ist) apparently also have `a` per an earlier note here — **this is
 * unconfirmed**: no `_a_` filename has actually been seen or downloaded, so
 * don't assume what it stands for. Grade 10+ liceu splits into real/umanist
 * tracks (see CurriculumProfile, src/types/common.ts) for biology, chemistry,
 * history, english, russian and math — one subject/session/grade can have BOTH
 * an `r` and a `u` paper; fetch both explicitly with `--profiles r,u` if you
 * want the pair. `<lang>`: ru | (omitted for Romanian-only pages).
 * `<grade>`: two digits, e.g. `12`. **Only grade 12 (Bacalaureat) is verified
 * against this exact URL** — `--grade 9` assumes the same `NN_` prefix
 * convention for Evaluarea Națională, which has NOT been confirmed to live at
 * this path; the two existing grade-9 romanian papers
 * (src/data/exams/romanian-{pr26,sb26}.ts) were transcribed by hand from PDFs
 * obtained outside this script. Verify one grade-9 URL manually before trusting
 * a `--grade 9` batch run.
 *
 * Multiple years/sessions in one run — `--sessions` accepts a comma-separated
 * list (fetches every subject × session pair); `--session` (singular) still
 * works as a one-item shorthand. Same for `--profiles` / `--profile`.
 *
 * Run:
 *   npx tsx scripts/fetch-exam-papers.ts --subjects mat,chi --profiles r,u \
 *     --lang ru --sessions sb25,sb26,ss25,ss26 --grade 12 --out corpus/raw/exams
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE_URL = 'https://ance.gov.md/sites/default/files'

interface Args {
  subjects: string[]
  profiles: string[]
  lang: string
  sessions: string[]
  grade: string
  out: string
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  const get = (flag: string) => {
    const i = a.indexOf(flag)
    return i === -1 ? undefined : a[i + 1]
  }
  const subjectsArg = get('--subjects')
  if (!subjectsArg) throw new Error('Required: --subjects mat,chi (see header comment for codes)')
  const sessionsArg = get('--sessions') ?? get('--session') ?? 'sb26'
  const profilesArg = get('--profiles') ?? get('--profile') ?? 'r'
  const gradeArg = get('--grade') ?? '12'
  return {
    subjects: subjectsArg.split(',').map((s) => s.trim()).filter(Boolean),
    profiles: profilesArg.split(',').map((s) => s.trim()).filter(Boolean),
    lang: get('--lang') ?? 'ru',
    sessions: sessionsArg.split(',').map((s) => s.trim()).filter(Boolean),
    grade: gradeArg.padStart(2, '0'),
    out: get('--out') ?? 'corpus/raw/exams',
  }
}

async function download(url: string, dest: string): Promise<boolean> {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) {
    console.error(`[fetch-exam-papers] FAILED ${url}: HTTP ${res.status}`)
    return false
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(dest, buf)
  console.log(`[fetch-exam-papers] wrote ${dest} (${(buf.length / 1024).toFixed(0)} KB)`)
  return true
}

async function main(): Promise<void> {
  const args = parseArgs()
  await mkdir(args.out, { recursive: true })

  for (const session of args.sessions) {
    for (const subj of args.subjects) {
      for (const profile of args.profiles) {
        for (const kind of ['test', 'barem'] as const) {
          const filename = `${args.grade}_${subj}_${kind}_${profile}_${args.lang}_${session}.pdf`
          const url = `${BASE_URL}/${filename}`
          const dest = join(args.out, filename)
          await download(url, dest)
        }
      }
    }
  }
}

main().catch((err) => {
  console.error('[fetch-exam-papers] failed:', err)
  process.exit(1)
})
