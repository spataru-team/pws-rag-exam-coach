/**
 * Evaluation harness CLI. Computes recall@1/3/5, MRR, avg top similarity and
 * refusal accuracy over the golden sets, writes a JSON report, and optionally
 * gates (exit 1) against eval/thresholds.json.
 *
 * Run: npm run eval                  # auto mode (Ollama if pack uses it), report only
 *      EVAL_MODE=deterministic ...   # reproducible offline (re-embeds with stub)
 *      npm run eval:ci               # deterministic + --gate (used in CI)
 *
 * Subjects whose pack is missing, empty (clean public clone without a local
 * corpus) or synthetic (`npm run seed:demo`) are SKIPPED, not failed — but the
 * report and this CLI mark the run as PARTIAL SUBJECT COVERAGE and never present
 * it as the full seven-subject production benchmark. In `--gate` mode the run
 * still fails if any expected public-fallback subject (romanian / english /
 * biology / history) was not actually evaluated. See docs/JUDGE_REPRODUCIBILITY.md.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DEFAULT_TOP_K, DEFAULT_MIN_SIMILARITY } from '@/rag'
import {
  runEvalHarness,
  EXPECTED_PUBLIC_FALLBACK_SUBJECTS,
  PARTIAL_COVERAGE_LABEL,
  type EvalConfig,
  type EvalMode,
} from './harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = join(__dirname, 'results')
const THRESHOLDS_FILE = join(__dirname, 'thresholds.json')

interface Thresholds {
  [mode: string]: { recallAt5: number; mrr: number; refusalAccuracy?: number }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const gate = args.includes('--gate')
  const modeArg =
    args.find((a) => a.startsWith('--mode='))?.split('=')[1] ??
    (args.includes('--deterministic') ? 'deterministic' : undefined)
  const mode = (modeArg ?? process.env.EVAL_MODE ?? 'auto') as EvalMode
  const config: EvalConfig = {
    mode,
    topK: DEFAULT_TOP_K,
    minSimilarity: DEFAULT_MIN_SIMILARITY,
    hybrid: true,
    rerank: true,
  }

  const report = await runEvalHarness(config)

  await mkdir(RESULTS_DIR, { recursive: true })
  const out = join(RESULTS_DIR, `eval-${Date.now()}.json`)
  await writeFile(out, JSON.stringify(report, null, 2), 'utf8')

  if (report.partialCoverage) {
    console.log(`[eval] *** ${PARTIAL_COVERAGE_LABEL} ***`)
    if (mode === 'deterministic') {
      console.log(
        '[eval] deterministic mode is an offline reproducibility / smoke check ' +
          '(bag-of-words stub embeddings) — NOT the production bge-m3 retrieval benchmark ' +
          'reported in docs/EVALUATION.md.',
      )
    }
    for (const s of report.skippedSubjects) {
      console.log(`[eval]   skipped ${s.subjectId}: ${s.reason} (${s.itemCount} items)`)
    }
  }
  console.log(
    `[eval] evaluatedSubjects=[${report.evaluatedSubjects.join(', ')}] ` +
      `skippedSubjects=[${report.skippedSubjects.map((s) => s.subjectId).join(', ') || '—'}] ` +
      `evaluatedItems=${report.evaluatedItemCount} skippedItems=${report.skippedItemCount}`,
  )

  console.log(
    `[eval] mode=${mode} items=${report.itemCount} ` +
      `recall@1=${report.recallAt1.toFixed(3)} recall@3=${report.recallAt3.toFixed(3)} ` +
      `recall@5=${report.recallAt5.toFixed(3)} MRR=${report.mrr.toFixed(3)} ` +
      `refusalAcc=${report.refusalAccuracy === null ? 'n/a' : report.refusalAccuracy.toFixed(3)}`,
  )
  for (const [lang, b] of Object.entries(report.byLang)) {
    console.log(
      `[eval]   lang=${lang} n=${b.itemCount} recall@5=${b.recallAt5.toFixed(3)} ` +
        `MRR=${b.mrr.toFixed(3)} avgTopSim=${b.avgTopSimilarity.toFixed(3)}`,
    )
  }
  console.log(`[eval] wrote ${out}`)

  if (gate) {
    // Coverage gate: a clean clone must still actually evaluate every subject
    // whose corpus ships in the public repo. "Pass by skipping everything" is a
    // failure, not a pass.
    const missing = EXPECTED_PUBLIC_FALLBACK_SUBJECTS.filter(
      (s) => !report.evaluatedSubjects.includes(s),
    )
    if (missing.length > 0) {
      console.error(
        `[eval] GATE FAILED: expected public-fallback subject(s) not evaluated: ${missing.join(', ')}. ` +
          `evaluatedSubjects=[${report.evaluatedSubjects.join(', ')}]. ` +
          `Run \`npm run seed\` (or EMBED_MODE=deterministic npm run seed) before the eval gate.`,
      )
      process.exit(1)
    }

    const thresholds = JSON.parse(await readFile(THRESHOLDS_FILE, 'utf8')) as Thresholds
    const t = thresholds[mode]
    if (!t) throw new Error(`No thresholds for mode "${mode}"`)
    const failures: string[] = []
    if (report.recallAt5 < t.recallAt5)
      failures.push(`recall@5 ${report.recallAt5.toFixed(3)} < ${t.recallAt5}`)
    if (report.mrr < t.mrr) failures.push(`MRR ${report.mrr.toFixed(3)} < ${t.mrr}`)
    if (
      t.refusalAccuracy !== undefined &&
      report.refusalAccuracy !== null &&
      report.refusalAccuracy < t.refusalAccuracy
    )
      failures.push(
        `refusalAccuracy ${report.refusalAccuracy.toFixed(3)} < ${t.refusalAccuracy}`,
      )

    if (failures.length > 0) {
      console.error(`[eval] GATE FAILED: ${failures.join('; ')}`)
      process.exit(1)
    }
    console.log(
      report.partialCoverage
        ? '[eval] gate passed (partial coverage — public-fallback subjects only).'
        : '[eval] gate passed.',
    )
  }
}

main().catch((err) => {
  console.error('[eval] failed:', err)
  process.exit(1)
})
