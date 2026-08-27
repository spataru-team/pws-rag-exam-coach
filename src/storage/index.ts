export { db, PwsDatabase, masteryKey } from './db'
export type { DownloadedPack, SettingRecord } from './db'
export * from './repositories'

import { db } from './db'

/** Wipes all local learner data (used by Settings → data reset). */
export async function resetAllData(): Promise<void> {
  await Promise.all([
    db.profiles.clear(),
    db.chunks.clear(),
    db.topics.clear(),
    db.learningEvents.clear(),
    db.topicMastery.clear(),
    db.modelRunMetrics.clear(),
    db.downloadedPacks.clear(),
    db.settings.clear(),
    db.examAttempts.clear(),
    db.rescueSessions.clear(),
  ])
}
