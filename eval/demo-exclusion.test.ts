import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D4a tripwire: demonstration data is excluded from every eval path through the
 * ONE structured flag (`demo === true`, via `src/learning/demoProvenance.ts`) —
 * never by string-matching a presentation-only text prefix, which can
 * legitimately appear in real content. If a future eval harness reaches for that
 * prefix, this fails.
 */
const MARKER = ['[', 'DEMO', ']'].join('') // avoid tripping on ourselves

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return tsFiles(p)
    return name.endsWith('.ts') && p !== __filenameSafe() ? [p] : []
  })
}
function __filenameSafe(): string {
  return join(process.cwd(), 'eval', 'demo-exclusion.test.ts')
}

describe('eval/ demo exclusion discipline', () => {
  it('no eval file string-matches the demonstration text prefix', () => {
    const offenders = tsFiles(join(process.cwd(), 'eval')).filter((f) =>
      readFileSync(f, 'utf8').includes(MARKER),
    )
    expect(offenders).toEqual([])
  })
})
