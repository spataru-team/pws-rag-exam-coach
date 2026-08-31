import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import workload from './workload.json'
import answersManifest from '../fixtures/ro-synthetic-answers/manifest.json'

describe('P1-5 Xeon E2E — frozen protocol + workload', () => {
  it('workload is pinned to protocol v1', () => {
    expect(workload.protocolVersion).toBe(1)
    expect(workload.protocol).toMatch(/protocol\.md \(v1\)/)
  })

  it('workload points at the frozen synthetic set by its real contentHash', () => {
    expect(workload.input.path).toBe('eval/fixtures/ro-synthetic-answers/answers.json')
    expect(workload.input.contentHash).toBe(answersManifest.contentHash)
  })

  it('refuses stub-seeded packs — the E2E run must use real bge-m3', () => {
    expect(workload.packs.requiredEmbeddingModel).toBe('bge-m3')
    expect(workload.packs.refuseIf).toBe('deterministic-stub')
  })

  it('defines the concurrency sweep, classroom segment, timeouts and failure preservation up front', () => {
    expect(workload.concurrencySweep.levels).toEqual([1, 5, 10, 20])
    expect(workload.classroomSegment.students).toBe(20)
    expect(workload.timeoutsSeconds.endToEndAttempt).toBeGreaterThan(0)
    expect(workload.rawOutput.preserveFailuresAndTimeouts).toBe(true)
    expect(workload.retryPolicy).toMatch(/none/)
  })

  it('protocol.md commits to the production path (no OVMS /rerank) and to versioning any post-result change', () => {
    const md = readFileSync(join(__dirname, 'protocol.md'), 'utf8')
    expect(md).toMatch(/no OVMS `\/rerank` call/i)
    expect(md.replace(/\s+/g, ' ')).toMatch(/never edit v1 after results exist/i)
    expect(md.replace(/\s+/g, ' ')).toMatch(/labels are \*\*never\*\* read|does not gate or depend on this one/i)
  })
})
