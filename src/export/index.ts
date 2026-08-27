export * from './buildExport'
export * from './schema'

import type { ProgressExportJson } from '@/types'

/** Triggers an explicit, user-initiated JSON download in the browser. */
export function downloadExport(data: ProgressExportJson, filename?: string): void {
  const name =
    filename ?? `pws-progress-${new Date().toISOString().slice(0, 10)}.json`
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
