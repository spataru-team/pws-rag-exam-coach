import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { InterfaceLanguage, VisualAsset } from '@/types'
import { localize } from '@/i18n/localize'

/**
 * Shows one visual asset (exam-paper drawing/diagram/formula/table) inline,
 * with a click-to-zoom into a native <dialog> — no charting/lightbox library.
 * Used wherever an ExamItem/DrillItem/ExamPaper/Chunk carries `assets`/`figures`
 * (see src/types/asset.ts): Exam.tsx, Rescue.tsx, Practice.tsx.
 */
export function FigureView({ asset, lang }: { asset: VisualAsset; lang: InterfaceLanguage }) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const alt = localize(asset.alt, lang) || t('exam.figure')
  const caption = localize(asset.caption, lang)

  return (
    <figure className="figure">
      <img
        src={asset.src}
        alt={alt}
        width={asset.width}
        height={asset.height}
        loading="lazy"
        draggable={false}
        role="button"
        tabIndex={0}
        title={t('exam.figureZoom')}
        onClick={() => dialogRef.current?.showModal()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            dialogRef.current?.showModal()
          }
        }}
        // Anti-cheat: keep exam figures from being dragged out of the page.
        onDragStart={(e) => e.preventDefault()}
      />
      {caption && <figcaption className="muted">{caption}</figcaption>}

      <dialog ref={dialogRef} className="figure-zoom" onClick={() => dialogRef.current?.close()}>
        <img src={asset.src} alt={alt} draggable={false} />
        <button
          type="button"
          className="figure-zoom-close"
          onClick={() => dialogRef.current?.close()}
          aria-label={t('common.close')}
        >
          ✕
        </button>
      </dialog>
    </figure>
  )
}

/** Renders a list of assets, or nothing if empty/undefined — convenience for optional fields. */
export function FigureList({ assets, lang }: { assets?: VisualAsset[]; lang: InterfaceLanguage }) {
  if (!assets || assets.length === 0) return null
  return (
    <div className="figure-list">
      {assets.map((a) => (
        <FigureView key={a.id} asset={a} lang={lang} />
      ))}
    </div>
  )
}
