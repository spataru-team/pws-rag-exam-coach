import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProgressExportJson } from '@/types'
import { buildExportFromStorage } from '@/services'
import { downloadExport, validateProgressExport } from '@/export'
import { useAppStore } from '@/app/store'

export function ExportScreen() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState<ProgressExportJson | null>(null)

  if (!profile) return <p>{t('common.loading')}</p>

  async function makePreview() {
    if (!profile) return
    const data = await buildExportFromStorage(profile, notes || undefined)
    setPreview(data)
  }

  async function doExport() {
    if (!profile) return
    const data = await buildExportFromStorage(profile, notes || undefined)
    const check = validateProgressExport(data)
    if (!check.valid) {
      // Should not happen; guards the contract before writing a file.
      alert(`Export invalid: ${check.errors.join(', ')}`)
      return
    }
    downloadExport(data)
  }

  return (
    <div>
      <h1>{t('exportScreen.title')}</h1>
      <p className="muted">{t('exportScreen.intro')}</p>
      <p className="badge">🔒 {t('privacy.localOnly')}</p>

      <section className="card" style={{ margin: '1rem 0' }}>
        <label htmlFor="notes">{t('exportScreen.teacherNotes')}</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: '4rem' }} />
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <button type="button" onClick={() => void makePreview()}>{t('exportScreen.preview')}</button>
          <button type="button" className="primary" onClick={() => void doExport()}>⬇ {t('exportScreen.doExport')}</button>
        </div>
      </section>

      {preview && (
        <section className="card">
          <h2>{t('exportScreen.preview')}</h2>
          <pre style={{ overflowX: 'auto', maxHeight: '50vh', background: 'var(--color-surface-2)', padding: '0.8rem', borderRadius: 'var(--radius)' }}>
            {JSON.stringify(preview, null, 2)}
          </pre>
        </section>
      )}
    </div>
  )
}
