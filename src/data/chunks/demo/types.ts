/**
 * Shared marker for synthetic demo chunk content.
 *
 * Every draft in `src/data/chunks/demo/` is self-authored generic educational
 * text — NOT a reconstruction of any textbook or exam paper. It exists only so
 * a clean public clone can exercise the full retrieval pipeline for the three
 * subjects whose real corpora are copyrighted and therefore not redistributed
 * (chemistry, mathematics, Russian). See `docs/JUDGE_REPRODUCIBILITY.md`.
 *
 * These drafts are consumed ONLY by `npm run seed:demo`. `npm run seed` never
 * touches them, and packs built from them are tagged `synthetic: true` so they
 * are excluded from every benchmark and field-deployment claim.
 */
export const DEMO_SOURCE = 'SYNTHETIC DEMO — self-authored, not exam or textbook material'

/** Prefix every synthetic passage so it is unmistakable in the UI "Sources" list. */
export const DEMO_TEXT_PREFIX = '[DEMO]'
