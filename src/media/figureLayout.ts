/**
 * Pure geometry helpers for locating figures (drawings/diagrams/formulas) on a
 * rendered PDF page — used by scripts/extract-figures.ts. Kept side-effect-free
 * and framework-free so they're covered by vitest (figureLayout.test.ts); the
 * PDF/canvas/filesystem plumbing lives in the script, which isn't unit-testable
 * the same way.
 *
 * Coordinate convention: all boxes are [xMin, yMin, xMax, yMax] in PDF
 * user-space points (origin bottom-left, y grows upward) — the same space
 * pdfjs-dist's `getOperatorList()`/`getTextContent()` report positions in.
 *
 * Empirically verified (see docs/superpowers/plans, exam-figures plan) against
 * two real ANCE BAC exam PDFs (12_mat_test_r_ru_sb26.pdf, 12_chi_test_r_ru_sb26.pdf):
 * `constructPath` bboxes from pdfjs-dist v6's operator list are already in
 * absolute page space (any `cm`/save/restore active when the path was built is
 * baked in) — across 2310 sampled boxes on 2 real files, none exceeded the page
 * rect. The script still clamps/drops any box that doesn't, defensively.
 */

export type Box = [number, number, number, number]

export function boxWidth(b: Box): number {
  return Math.max(0, b[2] - b[0])
}

export function boxHeight(b: Box): number {
  return Math.max(0, b[3] - b[1])
}

export function boxArea(b: Box): number {
  return boxWidth(b) * boxHeight(b)
}

/** True if the two boxes share any area (touching edges do not count as overlap). */
export function intersects(a: Box, b: Box): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
}

export function intersection(a: Box, b: Box): Box | undefined {
  const xMin = Math.max(a[0], b[0])
  const yMin = Math.max(a[1], b[1])
  const xMax = Math.min(a[2], b[2])
  const yMax = Math.min(a[3], b[3])
  if (xMax <= xMin || yMax <= yMin) return undefined
  return [xMin, yMin, xMax, yMax]
}

export function union(a: Box, b: Box): Box {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
}

export function expand(b: Box, margin: number): Box {
  return [b[0] - margin, b[1] - margin, b[2] + margin, b[3] + margin]
}

/** Gap between two boxes' nearest edges; 0 if they overlap or touch on both axes. */
export function distance(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a[0] - b[2], b[0] - a[2]))
  const dy = Math.max(0, Math.max(a[1] - b[3], b[1] - a[3]))
  return Math.max(dx, dy)
}

/** Fraction of `a`'s area covered by `b` (asymmetric — not covered-by-`a`). */
export function overlapRatio(a: Box, b: Box): number {
  const areaA = boxArea(a)
  if (areaA === 0) return 0
  const inter = intersection(a, b)
  return inter ? boxArea(inter) / areaA : 0
}

export interface PageFrameOptions {
  /** A box covering at least this fraction of BOTH page dimensions is a whole-page border. Default 0.85. */
  frameFrac?: number
  /** A box spanning at least this fraction of one page dimension while thinner than `ruleThickness` on the other is a ruling line. Default 0.85. */
  ruleSpanFrac?: number
  /** Max thickness (pt) for a box to count as a ruling line on its short axis. Default 3. */
  ruleThickness?: number
}

/** True for page-spanning borders and horizontal/vertical ruling lines — decorative,
 * never the figure itself, and would otherwise swallow every other box once clustered. */
export function isPageFrame(b: Box, page: Box, opts: PageFrameOptions = {}): boolean {
  const frameFrac = opts.frameFrac ?? 0.85
  const ruleSpanFrac = opts.ruleSpanFrac ?? 0.85
  const ruleThickness = opts.ruleThickness ?? 3

  const pageW = boxWidth(page)
  const pageH = boxHeight(page)
  if (pageW === 0 || pageH === 0) return false
  const w = boxWidth(b)
  const h = boxHeight(b)

  if (w >= pageW * frameFrac && h >= pageH * frameFrac) return true
  if (w >= pageW * ruleSpanFrac && h <= ruleThickness) return true
  if (h >= pageH * ruleSpanFrac && w <= ruleThickness) return true
  return false
}

/** Merges boxes that overlap or sit within `gap` of each other, repeating until
 * stable (a merge can bring a third box into range). O(n^2) per pass — fine for
 * the few hundred ink boxes on one page. */
export function clusterBoxes(boxes: Box[], gap: number): Box[] {
  let clusters = boxes.slice()
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (distance(clusters[i]!, clusters[j]!) <= gap) {
          const combined = union(clusters[i]!, clusters[j]!)
          clusters = [combined, ...clusters.filter((_, k) => k !== i && k !== j)]
          merged = true
          break outer
        }
      }
    }
  }
  return clusters
}

export function filterMinSize(boxes: Box[], minW: number, minH: number): Box[] {
  return boxes.filter((b) => boxWidth(b) >= minW && boxHeight(b) >= minH)
}

/**
 * Drops boxes bigger than `maxW`x`maxH` on EITHER axis — before clustering,
 * not after. Exam-paper answer sheets draw a large empty writing-space
 * rectangle per task (verified: ~410x400pt on a 595x842pt ANCE BAC page,
 * well under isPageFrame's whole-page threshold but still most of the row);
 * left uncapped, that rectangle becomes a candidate itself and, once
 * clustered with the neighboring task's identically-sized rectangle (rows
 * touch/border each other), chains into one page-spanning blob that swallows
 * every real figure inside it. The actual drawings are a separate, much
 * smaller set of ink/image boxes nested inside these cells, so removing the
 * cell rectangle from the candidate pool before clustering leaves them intact.
 */
export function filterMaxSize(boxes: Box[], maxW: number, maxH: number): Box[] {
  return boxes.filter((b) => boxWidth(b) <= maxW && boxHeight(b) <= maxH)
}

/** Sum of `box`'s area covered by any `textBoxes`, capped at 1. Approximate —
 * overlapping textBoxes aren't deduplicated, so dense overlapping glyph boxes
 * can push this above the true covered fraction; fine for a threshold check. */
export function textCoverageRatio(box: Box, textBoxes: Box[]): number {
  const areaBox = boxArea(box)
  if (areaBox === 0) return 0
  let covered = 0
  for (const t of textBoxes) {
    const inter = intersection(box, t)
    if (inter) covered += boxArea(inter)
  }
  return Math.min(1, covered / areaBox)
}

export interface BodyTextOptions {
  /** Min fraction of the box covered by text to consider it text-dominated. Default 0.5. */
  minCoverage?: number
  /** Min number of distinct text boxes overlapping the box. Default 6. */
  minTextItems?: number
}

/** True when a candidate cluster looks like a paragraph of running text rather
 * than a drawing — dense text coverage plus many distinct glyph/word boxes.
 * A diagram with a couple of numeric labels ("6 cm") stays well under both
 * thresholds and is kept. */
export function looksLikeBodyText(box: Box, textBoxes: Box[], opts: BodyTextOptions = {}): boolean {
  const minCoverage = opts.minCoverage ?? 0.5
  const minTextItems = opts.minTextItems ?? 6
  const overlapping = textBoxes.filter((t) => intersects(box, t))
  if (overlapping.length < minTextItems) return false
  return textCoverageRatio(box, overlapping) >= minCoverage
}
