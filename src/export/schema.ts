import { EXPORT_SCHEMA_VERSION, type ProgressExportJson } from '@/types'

export interface SchemaValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Lightweight runtime validator for ProgressExportJson — guards the export
 * contract without pulling in a schema library. Also used by tests.
 */
export function validateProgressExport(value: unknown): SchemaValidationResult {
  const errors: string[] = []
  const o = value as Partial<ProgressExportJson>

  if (typeof o !== 'object' || o === null) {
    return { valid: false, errors: ['Export must be an object.'] }
  }
  if (o.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${EXPORT_SCHEMA_VERSION}.`)
  }
  requireString(o.exportedAt, 'exportedAt', errors)
  requireString(o.anonymousStudentId, 'anonymousStudentId', errors)
  if (!o.dateRange || !o.dateRange.from || !o.dateRange.to) {
    errors.push('dateRange.from and dateRange.to are required.')
  }
  requireArray(o.activeSubjects, 'activeSubjects', errors)
  requireArray(o.subjectProgress, 'subjectProgress', errors)
  requireArray(o.topicMastery, 'topicMastery', errors)
  requireArray(o.weakTopics, 'weakTopics', errors)
  requireArray(o.modelRunMetrics, 'modelRunMetrics', errors)
  requireArray(o.examAttempts, 'examAttempts', errors)
  if (!o.activitySummary || typeof o.activitySummary.totalEvents !== 'number') {
    errors.push('activitySummary.totalEvents is required.')
  }

  // Privacy guard: the export must not carry obvious personal-name fields.
  for (const forbidden of ['name', 'firstName', 'lastName', 'email']) {
    if (forbidden in o) errors.push(`Forbidden personal field present: ${forbidden}`)
  }

  return { valid: errors.length === 0, errors }
}

function requireString(v: unknown, field: string, errors: string[]): void {
  if (typeof v !== 'string' || v.length === 0) errors.push(`${field} is required.`)
}

function requireArray(v: unknown, field: string, errors: string[]): void {
  if (!Array.isArray(v)) errors.push(`${field} must be an array.`)
}
