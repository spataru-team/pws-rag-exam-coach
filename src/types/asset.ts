import type { InterfaceLanguage } from './common'

/** What kind of visual content this is — drives how it's presented/described. */
export type AssetKind = 'figure' | 'formula' | 'table' | 'chart' | 'photo'

/**
 * A visual material (drawing, diagram, formula, table image, chart) extracted
 * from a source PDF (exam paper or textbook) and shown alongside the text it
 * belongs to. Rendered as a standalone PNG under `public/assets/...` — never
 * embedded as base64 in a SubjectPack, so it stays lazily-loadable and doesn't
 * bloat the IndexedDB pack payload. See scripts/extract-figures.ts.
 */
export interface VisualAsset {
  id: string
  kind: AssetKind
  /** App-relative path, e.g. "/assets/exams/math-sb26/fig-3-1.png". */
  src: string
  width: number
  height: number
  /** Screen-reader alt text, keyed by interface language. */
  alt: Partial<Record<InterfaceLanguage, string>>
  caption?: Partial<Record<InterfaceLanguage, string>>
  /** Longer text description, fed to the LLM prompt and to the chunk's retrievable text. */
  description?: string
  /** Provenance — which PDF page/region this was cropped from. */
  origin?: {
    pdf: string
    page: number
    /** [xMin, yMin, xMax, yMax] in PDF user-space points. */
    bbox: [number, number, number, number]
  }
}
