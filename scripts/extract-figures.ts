/**
 * Crops drawings/diagrams/formulas/tables out of a source PDF (exam paper or
 * textbook) into standalone PNGs + a `figures.json` manifest of VisualAsset-
 * shaped entries (src/types/asset.ts), so ExamItem/DrillItem/Chunk can carry
 * `assets`/`figures` and FigureView (src/components/FigureView.tsx) can show
 * them to the student.
 *
 * Two ways to get a crop, freely mixed on the same run:
 *
 *  1. --crop "<page>:<x>,<y>,<w>,<h>" (repeatable) — a MANUAL rectangle in
 *     PIXEL coordinates on the rendered page image (top-left origin, y down,
 *     at --scale), i.e. exactly what you'd read off by eyeballing the PNG
 *     from --full-pages in an image viewer. Always available, always correct
 *     — use this whenever auto-detection misses or over/under-crops.
 *
 *  2. Auto-detection (on by default; disable with --no-auto): renders the
 *     page, collects "ink" boxes from the vector-drawing ops (constructPath
 *     bboxes — these are the strokes of geometric figures) and from placed
 *     raster images, drops page borders/ruling lines and text-dominated
 *     regions (src/media/figureLayout.ts), clusters what's left into figure
 *     candidates, and looks for a "Рис./Fig./Схема/..." caption line just
 *     below each one.
 *
 * Coordinate spaces: PDF pages are authored in *points* with the origin at
 * the bottom-left, y growing upward — that's what pdfjs-dist's operator list
 * and text content report positions in, and what `origin.bbox` on the
 * emitted VisualAsset records. Rendering happens in *pixels* with the origin
 * at the top-left, y growing downward, at whatever --scale is chosen — that's
 * what --crop takes, converted via PageViewport#convertToPdfPoint so the
 * caller never has to do the flip/scale math by hand.
 *
 * Run:
 *   npx tsx scripts/extract-figures.ts --input corpus/raw/exams/math-2026-ru.pdf \
 *     --id math-sb26 --out-dir public/assets/exams/math-sb26 \
 *     --pages 3,4 --full-pages
 *
 *   # after eyeballing public/assets/exams/math-sb26/math-sb26-p3-full.png:
 *   npx tsx scripts/extract-figures.ts --input corpus/raw/exams/math-2026-ru.pdf \
 *     --id math-sb26 --out-dir public/assets/exams/math-sb26 \
 *     --no-auto --crop "3:850,140,470,330"
 */
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { createCanvas } from '@napi-rs/canvas'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  clusterBoxes,
  filterMaxSize,
  filterMinSize,
  intersects,
  isPageFrame,
  looksLikeBodyText,
  type Box,
} from '@/media/figureLayout'
import type { AssetKind, InterfaceLanguage, VisualAsset } from '@/types'

interface ManualCrop {
  page: number
  /** Pixel rect at --scale, top-left origin. */
  x: number
  y: number
  w: number
  h: number
}

interface Args {
  input: string
  outDir: string
  id: string
  pages?: Set<number>
  scale: number
  minW: number
  minH: number
  maxW: number
  maxH: number
  gap: number
  auto: boolean
  fullPages: boolean
  lang: InterfaceLanguage
  kind: AssetKind
  crops: ManualCrop[]
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  const get = (flag: string) => {
    const i = a.indexOf(flag)
    return i === -1 ? undefined : a[i + 1]
  }
  const getAll = (flag: string) => {
    const out: string[] = []
    for (let i = 0; i < a.length; i++) if (a[i] === flag) out.push(a[i + 1]!)
    return out
  }
  const input = get('--input')
  const outDir = get('--out-dir')
  const id = get('--id')
  if (!input || !outDir || !id) {
    throw new Error('Required: --input <pdf> --out-dir <dir> --id <asset-id-prefix>')
  }

  const pagesArg = get('--pages')
  const pages = pagesArg ? parsePageRanges(pagesArg) : undefined

  const [minW, minH] = (get('--min-size') ?? '40,40').split(',').map(Number)
  // Default max ~= a generous margin over the largest figure measured on a real
  // ANCE BAC page (146x89pt) — see filterMaxSize's doc comment for why this
  // exists at all (excluding whole answer-cell rectangles, not real figures).
  const [maxW, maxH] = (get('--max-size') ?? '220,220').split(',').map(Number)

  const crops = getAll('--crop').map(parseCrop)

  return {
    input,
    outDir,
    id,
    pages,
    scale: Number(get('--scale') ?? 3),
    minW: minW ?? 40,
    minH: minH ?? 40,
    maxW: maxW ?? 220,
    maxH: maxH ?? 220,
    gap: Number(get('--gap') ?? 10),
    auto: !a.includes('--no-auto'),
    fullPages: a.includes('--full-pages'),
    lang: (get('--lang') ?? 'ru') as InterfaceLanguage,
    kind: (get('--kind') ?? 'figure') as AssetKind,
    crops,
  }
}

function parsePageRanges(spec: string): Set<number> {
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) throw new Error(`Invalid --pages entry: "${part}"`)
    const from = Number(m[1])
    const to = m[2] ? Number(m[2]) : from
    for (let p = from; p <= to; p++) out.add(p)
  }
  return out
}

function parseCrop(spec: string): ManualCrop {
  const m = spec.match(/^(\d+):([\d.]+),([\d.]+),([\d.]+),([\d.]+)$/)
  if (!m) throw new Error(`Invalid --crop "${spec}" — expected "<page>:<x>,<y>,<w>,<h>" in rendered pixels`)
  return { page: Number(m[1]), x: Number(m[2]), y: Number(m[3]), w: Number(m[4]), h: Number(m[5]) }
}

// --- 3x3 affine matrix helpers (row-vector convention: p' = p * M), used only
// to place raster images (paintImageXObject) in page space. constructPath
// bboxes are NOT run through this — verified empirically (see figureLayout.ts
// header) to already be page-absolute in pdfjs-dist v6's operator list, so
// re-applying a tracked CTM to them would double-transform.
type Mat = [number, number, number, number, number, number]
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

function toMat(a: ArrayLike<number>): Mat {
  return [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!]
}

/** Combines two matrices: apply `m1` first, then `m2` (matches the PDF `cm` operator). */
function combine(m1: Mat, m2: Mat): Mat {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ]
}

function applyPoint(m: Mat, x: number, y: number): [number, number] {
  return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]]
}

/** Bbox of the unit square [0,1]x[0,1] (an image's placement space) under `m`. */
function unitSquareBox(m: Mat): Box {
  const pts = [applyPoint(m, 0, 0), applyPoint(m, 1, 0), applyPoint(m, 1, 1), applyPoint(m, 0, 1)]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

interface TextLine {
  y: number
  xMin: number
  xMax: number
  text: string
}

/** Groups raw text items into visual lines (by y-bucket), same tolerance as
 * scripts/ingest-pdf.ts's reconstructLines — used only for caption matching. */
function reconstructTextLines(items: TextItem[]): TextLine[] {
  const rows = new Map<number, { x: number; str: string; width: number }[]>()
  for (const it of items) {
    if (!it.str.trim()) continue
    const y = Math.round((it.transform[5] as number) / 2) * 2
    const row = rows.get(y) ?? []
    row.push({ x: it.transform[4] as number, str: it.str, width: it.width })
    rows.set(y, row)
  }
  const lines: TextLine[] = []
  for (const [y, row] of rows) {
    row.sort((a, b) => a.x - b.x)
    const text = row.map((r) => r.str).join(' ').replace(/\s+/g, ' ').trim()
    if (!text) continue
    lines.push({
      y,
      xMin: Math.min(...row.map((r) => r.x)),
      xMax: Math.max(...row.map((r) => r.x + r.width)),
      text,
    })
  }
  return lines
}

/** Per-item boxes for text-coverage checks (fine-grained, unlike the line-level boxes above). */
function textItemBoxes(items: TextItem[]): Box[] {
  return items
    .filter((it) => it.str.trim())
    .map((it): Box => {
      const x = it.transform[4] as number
      const y = it.transform[5] as number
      const h = it.height || Math.abs(it.transform[3] as number) || 10
      return [x, y, x + it.width, y + h]
    })
}

const CAPTION_RE = /^(Рис\.?|Рисунок|Figura?|Fig\.?|Схема|Diagrama|Tabelul|Таблица)\s*\.?\s*\d*[.:)]?/i

/** Nearest caption-looking line just below `box` (smaller y = lower on the page, PDF convention). */
function findCaption(box: Box, lines: TextLine[], maxGap = 40): TextLine | undefined {
  let best: TextLine | undefined
  let bestGap = Infinity
  for (const line of lines) {
    if (!CAPTION_RE.test(line.text)) continue
    const gap = box[1] - line.y
    if (gap < -4 || gap > maxGap) continue
    if (line.xMax < box[0] - 30 || line.xMin > box[2] + 30) continue
    if (gap < bestGap) {
      bestGap = gap
      best = line
    }
  }
  return best
}

/** public/assets/exams/foo -> /assets/exams/foo (how Vite serves `public/` at the app root). */
function toAppSrc(outDir: string, filename: string): string {
  const normalized = outDir.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/public/')
  const afterPublic = idx === -1 ? '/' + normalized.replace(/^public\//, '') : normalized.slice(idx + '/public'.length)
  return `${afterPublic.replace(/\/+$/, '')}/${filename}`
}

async function main(): Promise<void> {
  const args = parseArgs()
  console.log(`[extract-figures] reading ${args.input}`)
  const data = new Uint8Array(await readFile(args.input))
  const doc = await getDocument({ data, useSystemFonts: true }).promise
  await mkdir(args.outDir, { recursive: true })

  const pageNumbers = args.pages ?? new Set(Array.from({ length: doc.numPages }, (_, i) => i + 1))
  const manifest: (Omit<VisualAsset, 'alt' | 'caption'> & {
    alt: Partial<Record<InterfaceLanguage, string>>
    caption?: Partial<Record<InterfaceLanguage, string>>
  })[] = []

  for (const pageNo of Array.from(pageNumbers).sort((a, b) => a - b)) {
    const page = await doc.getPage(pageNo)
    const viewport = page.getViewport({ scale: args.scale })
    const pageBoxPdf: Box = [0, 0, page.view[2] - page.view[0], page.view[3] - page.view[1]]

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff' // opaque white backing — diagrams are ink-on-transparent
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise

    if (args.fullPages) {
      const fullPath = join(args.outDir, `${args.id}-p${pageNo}-full.png`)
      await writeFile(fullPath, canvas.toBuffer('image/png'))
      console.log(`[extract-figures] wrote ${fullPath} (${canvas.width}x${canvas.height}, reference only)`)
    }

    const textContent = await page.getTextContent()
    const items = textContent.items as TextItem[]
    const lines = reconstructTextLines(items)
    const itemBoxes = textItemBoxes(items)

    let candidates: Box[] = []

    if (args.auto) {
      const ops = await page.getOperatorList()
      const inkBoxes: Box[] = []
      let ctm: Mat = IDENTITY
      const stack: Mat[] = []
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i]
        if (fn === OPS.save) {
          stack.push(ctm)
        } else if (fn === OPS.restore) {
          ctm = stack.pop() ?? IDENTITY
        } else if (fn === OPS.transform) {
          ctm = combine(toMat(ops.argsArray[i] as ArrayLike<number>), ctm)
        } else if (fn === OPS.paintFormXObjectBegin) {
          stack.push(ctm)
          const formMatrix = (ops.argsArray[i] as unknown[])[0] as ArrayLike<number> | undefined
          if (formMatrix) ctm = combine(toMat(formMatrix), ctm)
        } else if (fn === OPS.paintFormXObjectEnd) {
          ctm = stack.pop() ?? ctm
        } else if (fn === OPS.constructPath) {
          // Already page-absolute — see the module header comment.
          const bbox = (ops.argsArray[i] as unknown[])[2] as ArrayLike<number> | undefined
          if (bbox) inkBoxes.push([bbox[0]!, bbox[1]!, bbox[2]!, bbox[3]!])
        } else if (fn === OPS.paintImageXObject) {
          inkBoxes.push(unitSquareBox(ctm))
        }
      }

      const cleaned = inkBoxes.filter((b) => !isPageFrame(b, pageBoxPdf) && intersects(b, pageBoxPdf))
      // maxSize BEFORE clustering: an oversized box (e.g. an answer-cell
      // rectangle) must never enter the pool, or it chains everything near it
      // into one page-spanning blob (see filterMaxSize's doc comment).
      const capped = filterMaxSize(cleaned, args.maxW, args.maxH)
      const clustered = clusterBoxes(capped, args.gap)
      const sized = filterMinSize(clustered, args.minW, args.minH)
      candidates = sized.filter((b) => !looksLikeBodyText(b, itemBoxes))
    }

    // Manual crops for this page, converted from rendered pixels to PDF points.
    const manualBoxes: Box[] = args.crops
      .filter((c) => c.page === pageNo)
      .map((c) => {
        const p1 = viewport.convertToPdfPoint(c.x, c.y) as [number, number]
        const p2 = viewport.convertToPdfPoint(c.x + c.w, c.y + c.h) as [number, number]
        return [Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])]
      })

    const allBoxes = [...candidates, ...manualBoxes]
    if (allBoxes.length === 0) {
      console.log(`[extract-figures] p${pageNo}: no figures found`)
      continue
    }

    let n = 0
    for (const box of allBoxes) {
      n++
      const padded: Box = [box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4]
      const topLeft = viewport.convertToViewportPoint(padded[0], padded[3]) as [number, number]
      const bottomRight = viewport.convertToViewportPoint(padded[2], padded[1]) as [number, number]
      const px = Math.max(0, Math.floor(Math.min(topLeft[0], bottomRight[0])))
      const py = Math.max(0, Math.floor(Math.min(topLeft[1], bottomRight[1])))
      const pw = Math.min(canvas.width - px, Math.ceil(Math.abs(bottomRight[0] - topLeft[0])))
      const ph = Math.min(canvas.height - py, Math.ceil(Math.abs(bottomRight[1] - topLeft[1])))
      if (pw <= 0 || ph <= 0) continue

      const cropCanvas = createCanvas(pw, ph)
      const cropCtx = cropCanvas.getContext('2d')
      cropCtx.drawImage(canvas, px, py, pw, ph, 0, 0, pw, ph)

      const figId = `${args.id}-p${pageNo}-${n}`
      const filename = `${figId}.png`
      await writeFile(join(args.outDir, filename), cropCanvas.toBuffer('image/png'))

      const caption = findCaption(box, lines)
      manifest.push({
        id: figId,
        kind: args.kind,
        src: toAppSrc(args.outDir, filename),
        width: pw,
        height: ph,
        alt: caption ? { [args.lang]: caption.text } : {},
        caption: caption ? { [args.lang]: caption.text } : undefined,
        origin: { pdf: basename(args.input), page: pageNo, bbox: box },
      })
      console.log(
        `[extract-figures] p${pageNo} fig ${n}: ${pw}x${ph}px${caption ? ` — "${caption.text}"` : ''}`,
      )
    }
  }

  const manifestPath = join(args.outDir, 'figures.json')
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`[extract-figures] wrote ${manifest.length} figure(s) to ${manifestPath}`)
}

main().catch((err) => {
  console.error('[extract-figures] failed:', err)
  process.exit(1)
})
