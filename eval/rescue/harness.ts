/**
 * P1-2 Rescue route sensitivity — measurement core.
 *
 * For each synthetic profile: run the real engine at baseline, then under each
 * frozen perturbation, and compare the resulting *minimum sufficient Rescue
 * route* (not "a 2-4 skill route") to the baseline. Six route-comparison metrics
 * + structural invariants, reported separately for clearly-separated vs near-tie
 * profiles and for +/-10% (primary) vs +/-20% (stress).
 *
 * Pure and deterministic: no LLM, no network, no embeddings, no RNG, no clock in
 * the measured payload. Report only — no CI gate, no thresholds.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { RescueSkillTag } from '@/types'
import { RESCUE_CONFIG, type RescueConfig } from '@/learning/rescueConfig'
import type {
  RescueProfileSpec,
  RescuePerturbationSpec,
  RescuePerturbationGrid,
} from '../types'
import { expandProfile, runProfile, type ExpandedProfile } from './expandProfile'
import { applyPerturbation } from './applyPerturbation'

const HERE = dirname(fileURLToPath(import.meta.url))

// --- loading -------------------------------------------------------------

export async function loadProfiles(dir = HERE): Promise<RescueProfileSpec[]> {
  return JSON.parse(await readFile(join(dir, 'profiles.json'), 'utf8')) as RescueProfileSpec[]
}
export async function loadGrid(dir = HERE): Promise<RescuePerturbationGrid> {
  return JSON.parse(await readFile(join(dir, 'perturbations.json'), 'utf8')) as RescuePerturbationGrid
}

// --- per-profile baseline ---------------------------------------------

export interface Baseline {
  spec: RescueProfileSpec
  expanded: ExpandedProfile
  route: RescueSkillTag[]
  candidateOrder: RescueSkillTag[]
  priority: Map<RescueSkillTag, number>
  /** baseline-weight ERP per candidate skill — used for the route-choice drift metric. */
  erp: Map<RescueSkillTag, number>
}

export function baselineFor(spec: RescueProfileSpec): Baseline {
  const expanded = expandProfile(spec)
  const run = runProfile(expanded, RESCUE_CONFIG)
  return {
    spec,
    expanded,
    route: run.route,
    candidateOrder: run.candidates.map((c) => c.skillTag),
    priority: new Map(run.candidates.map((c) => [c.skillTag, c.priority])),
    erp: new Map(run.candidates.map((c) => [c.skillTag, c.estimatedRecoverablePoints])),
  }
}

// --- metrics --------------------------------------------------------

function jaccard(a: RescueSkillTag[], b: RescueSkillTag[]): number {
  const A = new Set(a)
  const B = new Set(b)
  if (A.size === 0 && B.size === 0) return 1
  const union = new Set([...A, ...B]).size
  return union === 0 ? 1 : [...A].filter((x) => B.has(x)).length / union
}

function topKOverlap(baseRoute: RescueSkillTag[], pertRoute: RescueSkillTag[]): number | null {
  const k = baseRoute.length
  if (k === 0) return null
  const baseSet = new Set(baseRoute)
  return [...new Set(pertRoute.slice(0, k))].filter((x) => baseSet.has(x)).length / k
}

export interface KendallResult {
  tau: number | null
  nCommon: number
  discordantGenuine: number
  discordantTieBreak: number
}

/** Kendall tau over the common items of two priority-ranked candidate lists,
 * splitting discordant pairs into genuine (baseline priorities differ) and
 * tie-break-only (baseline priorities equal). */
export function kendallTau(
  baseOrder: RescueSkillTag[],
  pertOrder: RescueSkillTag[],
  basePriority: Map<RescueSkillTag, number>,
): KendallResult {
  const common = baseOrder.filter((x) => pertOrder.includes(x))
  const n = common.length
  if (n < 2) return { tau: null, nCommon: n, discordantGenuine: 0, discordantTieBreak: 0 }
  const baseRank = new Map(common.map((x, i) => [x, i]))
  const pertRank = new Map(pertOrder.map((x, i) => [x, i]))
  let concordant = 0
  let genuine = 0
  let tieBreak = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = common[i]!
      const b = common[j]!
      const sBase = Math.sign(baseRank.get(a)! - baseRank.get(b)!)
      const sPert = Math.sign(pertRank.get(a)! - pertRank.get(b)!)
      if (sBase === sPert) concordant++
      else if (Math.abs((basePriority.get(a) ?? 0) - (basePriority.get(b) ?? 0)) < 1e-9) tieBreak++
      else genuine++
    }
  }
  const pairs = (n * (n - 1)) / 2
  return { tau: (concordant - (genuine + tieBreak)) / pairs, nCommon: n, discordantGenuine: genuine, discordantTieBreak: tieBreak }
}

export interface CellResult {
  profileId: string
  band: RescueProfileSpec['band']
  perturbationId: string
  group: 'baseline' | 'primary' | 'boundary'
  magnitude: 0 | 10 | 20 | null
  baseRoute: RescueSkillTag[]
  pertRoute: RescueSkillTag[]
  top1Stable: boolean
  jaccard: number
  topKOverlap: number | null
  routeLenDelta: number
  routeGrewBy: number
  kendall: KendallResult
  erpDriftAbs: number
  erpDriftNormalized: number | null
  zeroEvidenceLeak: boolean
  routeCapExceeded: boolean
}

function classify(p: RescuePerturbationSpec): { group: CellResult['group']; magnitude: CellResult['magnitude'] } {
  if (p.kind === 'baseline') return { group: 'baseline', magnitude: 0 }
  if (p.kind === 'skill-param-delta' && p.group === 'primary') return { group: 'primary', magnitude: Math.abs(p.deltaPct) as 10 | 20 }
  return { group: 'boundary', magnitude: null }
}

const sumBaselineErp = (route: RescueSkillTag[], erp: Map<RescueSkillTag, number>) =>
  route.reduce((s, tag) => s + (erp.get(tag) ?? 0), 0)

export function compareCell(base: Baseline, perturbation: RescuePerturbationSpec, config: RescueConfig): CellResult {
  const run = runProfile(base.expanded, config)
  const { group, magnitude } = classify(perturbation)
  const denom = RESCUE_CONFIG.safetyTarget - base.expanded.officialScore
  const driftAbs = Math.abs(sumBaselineErp(run.route, base.erp) - sumBaselineErp(base.route, base.erp))
  const delta = run.route.length - base.route.length
  const demonstratedInCell = new Set(run.candidates.filter((c) => c.earnedPoints > 0).map((c) => c.skillTag))

  return {
    profileId: base.spec.id,
    band: base.spec.band,
    perturbationId: perturbation.id,
    group,
    magnitude,
    baseRoute: base.route,
    pertRoute: run.route,
    top1Stable: (base.route[0] ?? null) === (run.route[0] ?? null),
    jaccard: jaccard(base.route, run.route),
    topKOverlap: topKOverlap(base.route, run.route),
    routeLenDelta: delta,
    routeGrewBy: Math.max(0, delta),
    kendall: kendallTau(base.candidateOrder, run.candidates.map((c) => c.skillTag), base.priority),
    erpDriftAbs: driftAbs,
    erpDriftNormalized: denom > 0 ? driftAbs / denom : null,
    zeroEvidenceLeak: run.route.some((tag) => !demonstratedInCell.has(tag)),
    routeCapExceeded: run.route.length > RESCUE_CONFIG.maxRescueSkills,
  }
}

// --- aggregation ------------------------------------------------------

export interface MetricSummary {
  n: number
  top1StableRate: number
  jaccardMean: number
  jaccardMedian: number
  topKOverlapMean: number | null
  routeLen: { unchangedRate: number; deltaAbs1Rate: number; deltaAbs2plusRate: number; grewRate: number; shrankRate: number }
  routeMinimality: { unchangedRate: number; grewBy1Rate: number; grewBy2plusRate: number }
  kendall: { meanTau: number | null; anyGenuineReorderRate: number; anyTieBreakOnlyReorderRate: number }
  erpDrift: { absMean: number; absMax: number; normalizedMean: number | null; normalizedMax: number | null }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const rate = (cells: CellResult[], pred: (c: CellResult) => boolean) => (cells.length ? cells.filter(pred).length / cells.length : 0)

function summarize(cells: CellResult[]): MetricSummary {
  const tk = cells.map((c) => c.topKOverlap).filter((x): x is number => x !== null)
  const taus = cells.map((c) => c.kendall.tau).filter((x): x is number => x !== null)
  const nd = cells.map((c) => c.erpDriftNormalized).filter((x): x is number => x !== null)
  return {
    n: cells.length,
    top1StableRate: rate(cells, (c) => c.top1Stable),
    jaccardMean: mean(cells.map((c) => c.jaccard)),
    jaccardMedian: median(cells.map((c) => c.jaccard)),
    topKOverlapMean: tk.length ? mean(tk) : null,
    routeLen: {
      unchangedRate: rate(cells, (c) => c.routeLenDelta === 0),
      deltaAbs1Rate: rate(cells, (c) => Math.abs(c.routeLenDelta) === 1),
      deltaAbs2plusRate: rate(cells, (c) => Math.abs(c.routeLenDelta) >= 2),
      grewRate: rate(cells, (c) => c.routeLenDelta > 0),
      shrankRate: rate(cells, (c) => c.routeLenDelta < 0),
    },
    routeMinimality: {
      unchangedRate: rate(cells, (c) => c.routeGrewBy === 0),
      grewBy1Rate: rate(cells, (c) => c.routeGrewBy === 1),
      grewBy2plusRate: rate(cells, (c) => c.routeGrewBy >= 2),
    },
    kendall: {
      meanTau: taus.length ? mean(taus) : null,
      anyGenuineReorderRate: rate(cells, (c) => c.kendall.discordantGenuine > 0),
      anyTieBreakOnlyReorderRate: rate(cells, (c) => c.kendall.discordantTieBreak > 0 && c.kendall.discordantGenuine === 0),
    },
    erpDrift: {
      absMean: mean(cells.map((c) => c.erpDriftAbs)),
      absMax: cells.length ? Math.max(...cells.map((c) => c.erpDriftAbs)) : 0,
      normalizedMean: nd.length ? mean(nd) : null,
      normalizedMax: nd.length ? Math.max(...nd) : null,
    },
  }
}

export interface SensitivityReport {
  profileCount: { total: number; clearlySeparated: number; nearTie: number }
  configCount: { baseline: number; primary: number; boundary: number }
  invariants: {
    zeroEvidenceLeakage: number
    routeCapViolations: number
    allProfilesBelowSafetyTarget: boolean
    productionConfigUnchanged: boolean
  }
  primary: {
    delta10: { clearlySeparated: MetricSummary; nearTie: MetricSummary }
    delta20: { clearlySeparated: MetricSummary; nearTie: MetricSummary }
  }
  mostSensitivePrimary: {
    perturbationId: string
    profilesRouteChanged: number
    profilesTop1Flipped: number
    profilesRouteGrew: number
  }[]
  boundaryAppendix: {
    sinonimeDeltas: MetricSummary & { cells: CellResult[] }
    safetyTarget17: CellResult[]
    safetyTarget19: CellResult[]
    eligibilityBoundaries: CellResult[]
  }
  baselineRoutes: { profileId: string; band: string; officialScore: number; route: RescueSkillTag[]; routeLen: number; candidateCount: number }[]
  cells: CellResult[]
}

export async function runSensitivity(dir = HERE): Promise<SensitivityReport> {
  const specs = await loadProfiles(dir)
  const grid = await loadGrid(dir)
  const configSnapshot = JSON.stringify(RESCUE_CONFIG)

  const baselines = specs.map(baselineFor)
  const cells: CellResult[] = []
  for (const base of baselines) {
    for (const p of grid.perturbations) {
      cells.push(compareCell(base, p, applyPerturbation(RESCUE_CONFIG, p)))
    }
  }

  const primary = cells.filter((c) => c.group === 'primary')
  const slice = (m: 10 | 20, band: RescueProfileSpec['band']) =>
    summarize(primary.filter((c) => c.magnitude === m && c.band === band))

  const primaryIds = [...new Set(primary.map((c) => c.perturbationId))]
  const mostSensitivePrimary = primaryIds
    .map((id) => {
      const g = primary.filter((c) => c.perturbationId === id)
      return {
        perturbationId: id,
        profilesRouteChanged: g.filter((c) => c.jaccard < 1 || c.routeLenDelta !== 0).length,
        profilesTop1Flipped: g.filter((c) => !c.top1Stable).length,
        profilesRouteGrew: g.filter((c) => c.routeGrewBy > 0).length,
      }
    })
    .filter((x) => x.profilesRouteChanged > 0 || x.profilesTop1Flipped > 0)
    .sort((a, b) => b.profilesRouteChanged - a.profilesRouteChanged || b.profilesTop1Flipped - a.profilesTop1Flipped)

  const sinonimeDeltaIds = new Set(
    grid.perturbations
      .filter((p) => p.kind === 'skill-param-delta' && p.skill === 'sinonime-antonime')
      .map((p) => p.id),
  )
  const st17 = new Set(grid.perturbations.filter((p) => p.kind === 'safety-target' && p.value === 17).map((p) => p.id))
  const st19 = new Set(grid.perturbations.filter((p) => p.kind === 'safety-target' && p.value === 19).map((p) => p.id))
  const absIds = new Set(grid.perturbations.filter((p) => p.kind === 'skill-param-absolute').map((p) => p.id))
  const boundary = cells.filter((c) => c.group === 'boundary')
  const sinonimeDeltaCells = boundary.filter((c) => sinonimeDeltaIds.has(c.perturbationId))

  return {
    profileCount: {
      total: specs.length,
      clearlySeparated: specs.filter((s) => s.band === 'clearly-separated').length,
      nearTie: specs.filter((s) => s.band === 'near-tie').length,
    },
    configCount: {
      baseline: grid.perturbations.filter((p) => p.kind === 'baseline').length,
      primary: grid.perturbations.filter((p) => p.kind === 'skill-param-delta' && p.group === 'primary').length,
      boundary: grid.perturbations.filter((p) => p.kind !== 'baseline' && !(p.kind === 'skill-param-delta' && p.group === 'primary')).length,
    },
    invariants: {
      zeroEvidenceLeakage: cells.filter((c) => c.zeroEvidenceLeak).length,
      routeCapViolations: cells.filter((c) => c.routeCapExceeded).length,
      allProfilesBelowSafetyTarget: baselines.every((b) => b.expanded.officialScore < RESCUE_CONFIG.safetyTarget),
      productionConfigUnchanged: JSON.stringify(RESCUE_CONFIG) === configSnapshot,
    },
    primary: {
      delta10: { clearlySeparated: slice(10, 'clearly-separated'), nearTie: slice(10, 'near-tie') },
      delta20: { clearlySeparated: slice(20, 'clearly-separated'), nearTie: slice(20, 'near-tie') },
    },
    mostSensitivePrimary,
    boundaryAppendix: {
      sinonimeDeltas: { ...summarize(sinonimeDeltaCells), cells: sinonimeDeltaCells },
      safetyTarget17: boundary.filter((c) => st17.has(c.perturbationId)),
      safetyTarget19: boundary.filter((c) => st19.has(c.perturbationId)),
      eligibilityBoundaries: boundary.filter((c) => absIds.has(c.perturbationId)),
    },
    baselineRoutes: baselines.map((b) => ({
      profileId: b.spec.id,
      band: b.spec.band,
      officialScore: b.expanded.officialScore,
      route: b.route,
      routeLen: b.route.length,
      candidateCount: b.candidateOrder.length,
    })),
    cells,
  }
}
