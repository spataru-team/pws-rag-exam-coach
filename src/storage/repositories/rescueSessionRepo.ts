import type { RescueSession } from '@/types'
import { db } from '../db'

export const rescueSessionRepo = {
  async add(session: RescueSession): Promise<void> {
    await db.rescueSessions.put(session)
  },
  async update(session: RescueSession): Promise<void> {
    await db.rescueSessions.put(session) // put = upsert by id, matches examAttemptRepo
  },
  async get(id: string): Promise<RescueSession | undefined> {
    return db.rescueSessions.get(id)
  },
}
