import type { ProgressExportJson, StudentProfile, SubjectId, Topic } from '@/types'
import { eventRepo, masteryRepo, metricsRepo, examAttemptRepo } from '@/storage'
import { buildProgressExport } from '@/export'
import { getTopics } from '@/data/subjectRegistry'

/** Gathers all local data and builds the teacher-facing export object. */
export async function buildExportFromStorage(
  profile: StudentProfile,
  teacherNotes?: string,
): Promise<ProgressExportJson> {
  const events = await eventRepo.all()
  const masteries = await masteryRepo.all()
  const metrics = await metricsRepo.all()
  const examAttempts = await examAttemptRepo.all()

  const topicsBySubject: Record<SubjectId, Topic[]> = {}
  for (const subjectId of profile.activeSubjects) {
    topicsBySubject[subjectId] = getTopics(subjectId)
  }

  const timestamps = events.map((e) => e.timestamp).sort()
  const from = timestamps[0] ?? new Date().toISOString()
  const to = timestamps[timestamps.length - 1] ?? new Date().toISOString()

  return buildProgressExport({
    profile: { localId: profile.localId, activeSubjects: profile.activeSubjects },
    events,
    masteries,
    metrics,
    topicsBySubject,
    dateRange: { from, to },
    examAttempts,
    ...(teacherNotes ? { teacherNotes } : {}),
  })
}
