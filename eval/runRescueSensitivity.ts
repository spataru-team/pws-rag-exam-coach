/**
 * P1-2 Rescue route sensitivity CLI.
 *
 *   npm run eval:rescue
 *
 * Deterministic, offline, report only — no LLM, no network, no embeddings, no
 * RNG, no CI gate, no thresholds. Writes a JSON report to eval/results/
 * (gitignored). `contentHash` covers the deterministic payload only:
 * timestamp / filename / duration / absolute paths are excluded.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runSensitivity, type MetricSummary } from './rescue/harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = join(__dirname, 'results')

const f3 = (x: number | null) => (x === null ? 'n/a' : x.toFixed(3))
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

function printSummary(tag: string, s: MetricSummary): void {
  console.log(
    `[rescue] ${tag.padEnd(26)} n=${String(s.n).padStart(3)}  ` +
      `top1=${pct(s.top1StableRate)}  Jaccard(mean/med)=${f3(s.jaccardMean)}/${f3(s.jaccardMedian)}  ` +
      `topK=${f3(s.topKOverlapMean)}  tau=${f3(s.kendall.meanTau)}`,
  )
  console.log(
    `[rescue] ${' '.repeat(26)}      routeLen unchanged=${pct(s.routeLen.unchangedRate)} ` +
      `|d|=1 ${pct(s.routeLen.deltaAbs1Rate)} |d|>=2 ${pct(s.routeLen.deltaAbs2plusRate)}  ` +
      `grew=${pct(s.routeLen.grewRate)} shrank=${pct(s.routeLen.shrankRate)}`,
  )
  console.log(
    `[rescue] ${' '.repeat(26)}      minimality: unchanged=${pct(s.routeMinimality.unchangedRate)} ` +
      `grewBy1=${pct(s.routeMinimality.grewBy1Rate)} grewBy>=2=${pct(s.routeMinimality.grewBy2plusRate)}  ` +
      `reorder genuine=${pct(s.kendall.anyGenuineReorderRate)} tie-break-only=${pct(s.kendall.anyTieBreakOnlyReorderRate)}`,
  )
  console.log(
    `[rescue] ${' '.repeat(26)}      ERP drift (baseline-valued) abs mean/max=${f3(s.erpDrift.absMean)}/${f3(s.erpDrift.absMax)} ` +
      `norm mean/max=${f3(s.erpDrift.normalizedMean)}/${f3(s.erpDrift.normalizedMax)}`,
  )
}

async function main(): Promise<void> {
  const report = await runSensitivity()

  // contentHash over the deterministic payload only.
  const payload = {
    benchmark: 'p1-2-rescue-route-sensitivity',
    deterministic: true,
    scope: 'currentScore < safetyTarget; minimum sufficient route built from demonstrated partial competence',
    profileCount: report.profileCount,
    configCount: report.configCount,
    invariants: report.invariants,
    primary: report.primary,
    mostSensitivePrimary: report.mostSensitivePrimary,
    boundaryAppendix: report.boundaryAppendix,
    baselineRoutes: report.baselineRoutes,
    cells: report.cells,
  }
  const contentHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')

  await mkdir(RESULTS_DIR, { recursive: true })
  const out = join(RESULTS_DIR, `rescue-sensitivity-${Date.now()}.json`)
  await writeFile(out, JSON.stringify({ ...payload, contentHash, generatedAt: new Date().toISOString() }, null, 2), 'utf8')

  const inv = report.invariants
  console.log('[rescue] P1-2 Rescue route sensitivity — REPORT ONLY (no gate)')
  console.log(
    `[rescue] profiles: ${report.profileCount.total} (${report.profileCount.clearlySeparated} clearly-separated, ` +
      `${report.profileCount.nearTie} near-tie)   configs: baseline ${report.configCount.baseline} + ` +
      `primary ${report.configCount.primary} + boundary ${report.configCount.boundary}`,
  )
  console.log(
    `[rescue] INVARIANTS: zero-evidence-leakage=${inv.zeroEvidenceLeakage}  route-cap-violations=${inv.routeCapViolations}  ` +
      `all-profiles-below-safetyTarget=${inv.allProfilesBelowSafetyTarget}  production-config-unchanged=${inv.productionConfigUnchanged}`,
  )
  if (inv.zeroEvidenceLeakage > 0 || inv.routeCapViolations > 0 || !inv.allProfilesBelowSafetyTarget || !inv.productionConfigUnchanged) {
    console.error('[rescue] STRUCTURAL INVARIANT VIOLATION — benchmark/implementation blocker. Stopping.')
    console.log(`[rescue] wrote ${out}`)
    process.exit(1)
  }

  console.log('[rescue] --- PRIMARY +/-10% (headline) ---')
  printSummary('clearly-separated ±10%', report.primary.delta10.clearlySeparated)
  printSummary('near-tie ±10%', report.primary.delta10.nearTie)
  console.log('[rescue] --- PRIMARY +/-20% (stress) ---')
  printSummary('clearly-separated ±20%', report.primary.delta20.clearlySeparated)
  printSummary('near-tie ±20%', report.primary.delta20.nearTie)

  console.log('[rescue] --- most sensitive primary perturbations ---')
  for (const p of report.mostSensitivePrimary.slice(0, 10)) {
    console.log(
      `[rescue]   ${p.perturbationId.padEnd(40)} routeChanged=${p.profilesRouteChanged}  top1Flipped=${p.profilesTop1Flipped}  routeGrew=${p.profilesRouteGrew}`,
    )
  }

  console.log('[rescue] --- boundary / policy appendix (NOT in headline figures) ---')
  printSummary('sinonime-antonime deltas', report.boundaryAppendix.sinonimeDeltas)
  const sameRoute = (cs: typeof report.boundaryAppendix.safetyTarget17) =>
    `${cs.filter((c) => c.jaccard === 1 && c.routeLenDelta === 0).length}/${cs.length} route-identical`
  console.log(`[rescue]   safetyTarget=17: ${sameRoute(report.boundaryAppendix.safetyTarget17)}`)
  console.log(`[rescue]   safetyTarget=19: ${sameRoute(report.boundaryAppendix.safetyTarget19)}`)
  console.log(`[rescue]   eligibility-boundary (sinonime transfer=0.4 / cost=4.0): ${sameRoute(report.boundaryAppendix.eligibilityBoundaries)}`)

  console.log(`[rescue] contentHash=${contentHash}`)
  console.log(`[rescue] wrote ${out}`)
}

main().catch((err) => {
  console.error('[rescue] failed:', err)
  process.exit(1)
})
