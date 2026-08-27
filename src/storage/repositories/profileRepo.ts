import type { StudentProfile } from '@/types'
import { db } from '../db'

/** Generates an anonymous, non-identifying local id. */
export function newAnonymousId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `stu_${rand}`
}

export const profileRepo = {
  async get(localId: string): Promise<StudentProfile | undefined> {
    return db.profiles.get(localId)
  },

  /** Returns the single local profile, if onboarding has completed. */
  async getCurrent(): Promise<StudentProfile | undefined> {
    return db.profiles.toCollection().first()
  },

  async save(profile: StudentProfile): Promise<void> {
    await db.profiles.put({ ...profile, updatedAt: new Date().toISOString() })
  },

  async update(
    localId: string,
    patch: Partial<StudentProfile>,
  ): Promise<StudentProfile | undefined> {
    const existing = await db.profiles.get(localId)
    if (!existing) return undefined
    const updated: StudentProfile = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    await db.profiles.put(updated)
    return updated
  },
}
