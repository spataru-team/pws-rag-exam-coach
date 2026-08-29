/**
 * Judge / reviewer reproducibility helper.
 *
 * `npm run seed:demo` runs the normal seed pipeline, then fills any subject that
 * has NO public corpus (chemistry, mathematics, Russian on a clean public
 * clone) with the self-authored synthetic drafts in `src/data/chunks/demo/`.
 * Those packs are tagged `synthetic: true` and labelled "DEMO / SYNTHETIC" in
 * the UI. It exercises the exact same `seedPacks()` / embedding / retrieval code
 * as production — only the input text differs.
 *
 * This never overwrites a real regenerated corpus, and `npm run seed` never
 * touches the synthetic drafts. See docs/JUDGE_REPRODUCIBILITY.md.
 *
 * Run: npm run seed:demo                 (all subjects; demo fills the empty ones)
 *      npm run seed:demo -- chemistry    (only the given subject ids)
 */
import { seedPacks } from './seed-packs'

async function main(): Promise<void> {
  console.log('[seed:demo] SYNTHETIC DEMO SEED — synthetic content is NOT part of any benchmark or field claim.')
  const seeded = await seedPacks({ only: process.argv.slice(2), includeDemo: true })

  const synthetic = seeded.filter((s) => s.synthetic).map((s) => s.subjectId)
  const stillEmpty = seeded.filter((s) => s.chunkCount === 0).map((s) => s.subjectId)

  if (synthetic.length > 0) {
    console.log(`[seed:demo] synthetic demo packs written for: ${synthetic.join(', ')}`)
  }
  if (stillEmpty.length > 0) {
    console.log(`[seed:demo] still empty (no real corpus, no demo drafts): ${stillEmpty.join(', ')}`)
  }
  console.log('[seed:demo] done.')
}

main().catch((err) => {
  console.error('[seed:demo] failed:', err)
  process.exit(1)
})
