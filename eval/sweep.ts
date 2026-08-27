/**
 * Parameter sweep to tune retrieval defaults. Runs the harness across a grid of
 * topK × minSimilarity × {hybrid} × {rerank}, prints a table sorted by
 * recall@5 then MRR, and writes the full grid to eval/results/.
 *
 * Run: npm run eval:sweep            (auto mode; EVAL_MODE=deterministic for offline)
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runEvalHarness, type EvalConfig, type EvalMode } from './harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = join(__dirname, 'results')

const TOP_KS = [3, 5, 8]
const MIN_SIMS = [0.1, 0.15, 0.2, 0.25]
const HYBRIDS = [true, false]
const RERANKS = [true, false]

async function main(): Promise<void> {
  const mode = (process.env.EVAL_MODE as EvalMode) || 'auto'
  const rows: Array<{
    config: EvalConfig
    recallAt3: number
    recallAt5: number
    mrr: number
    refusalAccuracy: number | null
  }> = []

  for (const topK of TOP_KS) {
    for (const minSimilarity of MIN_SIMS) {
      for (const hybrid of HYBRIDS) {
        for (const rerank of RERANKS) {
          const config: EvalConfig = { mode, topK, minSimilarity, hybrid, rerank }
          const r = await runEvalHarness(config)
          rows.push({
            config,
            recallAt3: r.recallAt3,
            recallAt5: r.recallAt5,
            mrr: r.mrr,
            refusalAccuracy: r.refusalAccuracy,
          })
        }
      }
    }
  }

  rows.sort((a, b) => b.recallAt5 - a.recallAt5 || b.mrr - a.mrr)

  console.log(`[sweep] mode=${mode} — top configs by recall@5 then MRR:`)
  console.log('topK  minSim  hybrid  rerank  recall@3  recall@5   MRR   refusalAcc')
  for (const row of rows.slice(0, 12)) {
    const c = row.config
    console.log(
      `${String(c.topK).padEnd(4)}  ${c.minSimilarity.toFixed(2)}    ` +
        `${c.hybrid ? 'Y' : 'n'}       ${c.rerank ? 'Y' : 'n'}       ` +
        `${row.recallAt3.toFixed(3)}     ${row.recallAt5.toFixed(3)}    ` +
        `${row.mrr.toFixed(3)}  ${row.refusalAccuracy === null ? 'n/a' : row.refusalAccuracy.toFixed(3)}`,
    )
  }

  await mkdir(RESULTS_DIR, { recursive: true })
  const out = join(RESULTS_DIR, `sweep-${Date.now()}.json`)
  await writeFile(out, JSON.stringify({ mode, rows }, null, 2), 'utf8')
  console.log(`[sweep] wrote ${out}`)
}

main().catch((err) => {
  console.error('[sweep] failed:', err)
  process.exit(1)
})
