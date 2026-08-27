import type { SubjectId } from '@/types'
import { db, type DownloadedPack } from '../db'

export const packRepo = {
  async list(): Promise<DownloadedPack[]> {
    return db.downloadedPacks.toArray()
  },

  async isDownloaded(subjectId: SubjectId): Promise<boolean> {
    return (await db.downloadedPacks.get(subjectId)) !== undefined
  },

  async record(pack: DownloadedPack): Promise<void> {
    await db.downloadedPacks.put(pack)
  },

  async remove(subjectId: SubjectId): Promise<void> {
    await db.downloadedPacks.delete(subjectId)
  },
}
