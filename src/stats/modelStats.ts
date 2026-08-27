import type { ModelRunMetrics, SubjectId } from '@/types'
import { mean, percentile } from './metrics'

/** Aggregated performance for one provider/model pair. */
export interface ProviderModelStats {
  key: string
  provider: string
  model: string
  runs: number
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  totalTokensIn: number
  totalTokensOut: number
  totalEstimatedCost: number
  avgGroundedness: number
  avgFormatCompliance: number
  /** Average user rating in [0,1], or null when no run was rated. */
  avgUserRating: number | null
}

export interface SubjectStats {
  subjectId: SubjectId
  runs: number
  avgGroundedness: number
}

export interface MetricsOverview {
  totalRuns: number
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  totalTokensIn: number
  totalTokensOut: number
  totalEstimatedCost: number
  avgGroundedness: number
  avgFormatCompliance: number
  byProviderModel: ProviderModelStats[]
  bySubject: SubjectStats[]
}

/** Pure aggregation of model-run metrics for the stats screen. */
export function summarizeModelRuns(metrics: ModelRunMetrics[]): MetricsOverview {
  const byPmKey = new Map<string, ModelRunMetrics[]>()
  const bySubjectKey = new Map<SubjectId, ModelRunMetrics[]>()

  for (const m of metrics) {
    const pmKey = `${m.provider} / ${m.model}`
    const pm = byPmKey.get(pmKey) ?? []
    pm.push(m)
    byPmKey.set(pmKey, pm)

    const sub = bySubjectKey.get(m.subjectId) ?? []
    sub.push(m)
    bySubjectKey.set(m.subjectId, sub)
  }

  const byProviderModel: ProviderModelStats[] = [...byPmKey.entries()]
    .map(([key, runs]) => {
      const rated = runs
        .map((r) => r.userRating)
        .filter((r): r is number => typeof r === 'number')
      const latencies = runs.map((r) => r.latencyMs)
      return {
        key,
        provider: runs[0]!.provider,
        model: runs[0]!.model,
        runs: runs.length,
        avgLatencyMs: mean(latencies),
        p50LatencyMs: percentile(latencies, 50),
        p95LatencyMs: percentile(latencies, 95),
        totalTokensIn: runs.reduce((s, r) => s + r.tokensIn, 0),
        totalTokensOut: runs.reduce((s, r) => s + r.tokensOut, 0),
        totalEstimatedCost: runs.reduce((s, r) => s + r.estimatedCost, 0),
        avgGroundedness: mean(runs.map((r) => r.groundednessScore)),
        avgFormatCompliance: mean(runs.map((r) => r.formatCompliance)),
        avgUserRating: rated.length > 0 ? mean(rated) : null,
      }
    })
    .sort((a, b) => b.runs - a.runs)

  const bySubject: SubjectStats[] = [...bySubjectKey.entries()]
    .map(([subjectId, runs]) => ({
      subjectId,
      runs: runs.length,
      avgGroundedness: mean(runs.map((r) => r.groundednessScore)),
    }))
    .sort((a, b) => b.runs - a.runs)

  const allLatencies = metrics.map((m) => m.latencyMs)
  return {
    totalRuns: metrics.length,
    avgLatencyMs: mean(allLatencies),
    p50LatencyMs: percentile(allLatencies, 50),
    p95LatencyMs: percentile(allLatencies, 95),
    totalTokensIn: metrics.reduce((s, m) => s + m.tokensIn, 0),
    totalTokensOut: metrics.reduce((s, m) => s + m.tokensOut, 0),
    totalEstimatedCost: metrics.reduce((s, m) => s + m.estimatedCost, 0),
    avgGroundedness: mean(metrics.map((m) => m.groundednessScore)),
    avgFormatCompliance: mean(metrics.map((m) => m.formatCompliance)),
    byProviderModel,
    bySubject,
  }
}
