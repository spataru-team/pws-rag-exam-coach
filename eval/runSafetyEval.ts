/**
 * P1-1a safety-characterization benchmark CLI.
 *
 *   npm run eval:safety
 *
 * Runs two deterministic, offline subsets and one integration signal, writes a
 * JSON report to eval/results/, and prints a summary. REPORT ONLY — there is no
 * `--gate`, no thresholds file, and no CI wiring. A refusal mismatch is a
 * documented finding (under-/over-refusal), never a failure; the process exits 0
 * unless the harness itself errors.
 *
 * The deterministic payload (everything except `generatedAt`) is hashed into
 * `contentHash`; re-running must reproduce the same hash.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DEFAULT_TOP_K, DEFAULT_MIN_SIMILARITY } from '@/rag'
import {
  runRefusalBenchmark,
  runGoldenOverRefusalSignal,
  citationAggregate,
  loadCitationFixtures,
} from './safety/harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = join(__dirname, 'results')

function pct(x: number | null): string {
  return x === null ? 'n/a' : x.toFixed(3)
}

async function main(): Promise<void> {
  const refusal = await runRefusalBenchmark()
  const citation = citationAggregate(await loadCitationFixtures())
  const goldenSignal = await runGoldenOverRefusalSignal()

  const payload = {
    benchmark: 'p1-1a-safety-characterization',
    deterministic: true,
    mode: 'deterministic' as const,
    note:
      'Characterization only. Subset A refusal cases carry human-authored shouldRefuse labels; ' +
      'mismatches are findings, not failures. The deterministic stub has no semantic discrimination ' +
      'and DEFAULT_MIN_SIMILARITY is bge-m3-calibrated — see docs/EVALUATION.md. No pass/fail gate.',
    config: {
      topK: DEFAULT_TOP_K,
      minSimilarity: DEFAULT_MIN_SIMILARITY,
      hybrid: true,
      rerank: true,
    },
    refusal: {
      coverage: {
        evaluatedSubjects: refusal.evaluatedSubjects,
        skippedSubjects: refusal.skippedSubjects,
        partialCoverage: refusal.partialCoverage,
      },
      metrics: refusal.metrics,
      findings: {
        underRefusals: refusal.results.filter((r) => r.verdict === 'under-refusal'),
        overRefusals: refusal.results.filter((r) => r.verdict === 'over-refusal'),
      },
      results: refusal.results,
    },
    citation: {
      fixtureCount: citation.fixtureCount,
      exactMatchCount: citation.passCount,
      rawCitationValidityMean: citation.rawCitationValidityMean,
      fabricatedCitationCatchRateMean: citation.fabricatedCitationCatchRateMean,
      postSanitizationCitationValidityMean: citation.postSanitizationCitationValidityMean,
      foldBoundaryFixtures: citation.foldBoundaryFixtures,
      markerConformanceFixtures: citation.markerConformanceFixtures,
      results: citation.results,
    },
    goldenOverRefusalSignal: goldenSignal,
  }

  const contentHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  const report = { ...payload, contentHash, generatedAt: new Date().toISOString() }

  await mkdir(RESULTS_DIR, { recursive: true })
  const out = join(RESULTS_DIR, `safety-${Date.now()}.json`)
  await writeFile(out, JSON.stringify(report, null, 2), 'utf8')

  const m = refusal.metrics
  console.log('[safety] P1-1a characterization benchmark — REPORT ONLY (no gate)')
  console.log(
    `[safety] refusal: evaluated=[${refusal.evaluatedSubjects.join(', ')}] ` +
      `skipped=[${refusal.skippedSubjects.map((s) => `${s.subjectId}:${s.reason}`).join(', ') || '—'}]`,
  )
  console.log(
    `[safety] refusal: cases=${m.caseCount} shouldRefuse=${m.shouldRefuseN} ` +
      `(correct ${m.correctlyRefused}, under-refusal ${m.underRefusals}) ` +
      `shouldAnswer=${m.shouldAnswerN} (correct ${m.correctlyAnswered}, over-refusal ${m.overRefusals})`,
  )
  console.log(
    `[safety] refusal: recall=${pct(m.refusalRecall)} precision=${pct(m.refusalPrecision)} ` +
      `F1=${pct(m.refusalF1)} overRefusalRate=${pct(m.overRefusalRate)}`,
  )
  for (const r of payload.refusal.findings.underRefusals)
    console.log(`[safety]   UNDER-REFUSAL  ${r.id} (${r.category}) topSim=${r.topSimilarity.toFixed(3)}`)
  for (const r of payload.refusal.findings.overRefusals)
    console.log(`[safety]   OVER-REFUSAL   ${r.id} (${r.category}) topSim=${r.topSimilarity.toFixed(3)}`)
  console.log(
    `[safety] citation: fixtures=${citation.fixtureCount} exactMatch=${citation.passCount} ` +
      `rawValidity=${citation.rawCitationValidityMean.toFixed(3)} ` +
      `fabricatedCatchRate=${citation.fabricatedCitationCatchRateMean.toFixed(3)} ` +
      `postSanitizationValidity=${citation.postSanitizationCitationValidityMean.toFixed(3)}`,
  )
  for (const r of citation.results.filter((x) => !x.pass))
    console.log(`[safety]   FIXTURE MISMATCH ${r.id}: ${r.mismatches.join(' | ')}`)
  console.log(
    `[safety] golden over-refusal signal: evaluated=[${goldenSignal.evaluatedSubjects.join(', ')}] ` +
      `onTopic=${goldenSignal.onTopicItemCount} wronglyRefused=${goldenSignal.wronglyRefused} ` +
      `rate=${goldenSignal.overRefusalRate.toFixed(3)}` +
      (goldenSignal.wronglyRefusedIds.length ? ` [${goldenSignal.wronglyRefusedIds.join(', ')}]` : ''),
  )
  console.log(`[safety] contentHash=${contentHash}`)
  console.log(`[safety] wrote ${out}`)
}

main().catch((err) => {
  console.error('[safety] failed:', err)
  process.exit(1)
})
