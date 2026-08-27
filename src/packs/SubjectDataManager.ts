import type { SubjectId } from '@/types'
import { contentRepo, packRepo, type DownloadedPack } from '@/storage'
import { getSubject } from '@/data/subjectRegistry'
import { PACK_SCHEMA_VERSION, type SubjectPack } from './types'

export interface PackStatus {
  subjectId: SubjectId
  enabled: boolean
  downloaded: boolean
  embeddingModel?: string
  embeddingDim?: number
  chunkCount?: number
}

/**
 * Splits the single corpus into per-subject packs and downloads only what the
 * student needs. In the MVP packs are static files under a base URL; the same
 * code works against a remote repository URL later (configurable). Downloaded
 * data is cached in IndexedDB so the app stays fully offline afterwards.
 */
export class SubjectDataManager {
  private readonly baseUrl: string
  constructor(baseUrl: string = defaultBaseUrl()) {
    this.baseUrl = baseUrl
  }

  private packUrl(subjectId: SubjectId): string {
    return `${this.baseUrl.replace(/\/$/, '')}/${subjectId}.pack.json`
  }

  async isDownloaded(subjectId: SubjectId): Promise<boolean> {
    return packRepo.isDownloaded(subjectId)
  }

  async getStatus(subjectId: SubjectId): Promise<PackStatus> {
    const subject = getSubject(subjectId)
    const record = (await packRepo.list()).find((p) => p.subjectId === subjectId)
    return {
      subjectId,
      enabled: subject?.enabled ?? false,
      downloaded: record !== undefined,
      embeddingModel: record?.embeddingModel,
      embeddingDim: record?.embeddingDim,
      chunkCount: record?.chunkCount,
    }
  }

  /** Downloads (fetch + validate + cache) a subject pack into IndexedDB. */
  async download(subjectId: SubjectId): Promise<DownloadedPack> {
    const res = await fetch(this.packUrl(subjectId))
    if (!res.ok) {
      throw new Error(`Failed to download pack for ${subjectId}: HTTP ${res.status}`)
    }
    const pack = (await res.json()) as SubjectPack
    validatePack(pack, subjectId)

    await contentRepo.putChunks(pack.chunks)
    const subject = getSubject(subjectId)
    if (subject) await contentRepo.putTopics(subject.topicTree)

    const record: DownloadedPack = {
      subjectId,
      schemaVersion: pack.schemaVersion,
      embeddingModel: pack.embeddingModel,
      embeddingDim: pack.embeddingDim,
      chunkCount: pack.chunks.length,
      downloadedAt: new Date().toISOString(),
    }
    await packRepo.record(record)
    return record
  }

  /** Removes a downloaded pack and its cached content from IndexedDB. */
  async remove(subjectId: SubjectId): Promise<void> {
    await contentRepo.deleteChunksBySubject(subjectId)
    await contentRepo.deleteTopicsBySubject(subjectId)
    await packRepo.remove(subjectId)
  }

  /** The embedding model a downloaded pack was built with (for query matching). */
  async embeddingModelFor(subjectId: SubjectId): Promise<string | undefined> {
    return (await this.getStatus(subjectId)).embeddingModel
  }
}

function validatePack(pack: SubjectPack, expectedSubject: SubjectId): void {
  if (pack.schemaVersion !== PACK_SCHEMA_VERSION) {
    throw new Error(
      `Pack schema mismatch: expected ${PACK_SCHEMA_VERSION}, got ${pack.schemaVersion}. ` +
        `Packs built before the 1024-dim (bge-m3) migration must be reseeded (npm run seed).`,
    )
  }
  if (pack.subjectId !== expectedSubject) {
    throw new Error(`Pack subject mismatch: ${pack.subjectId} != ${expectedSubject}`)
  }
  if (!Number.isInteger(pack.embeddingDim) || pack.embeddingDim <= 0) {
    throw new Error(`Pack ${pack.subjectId} has invalid embeddingDim: ${pack.embeddingDim}`)
  }
  for (const chunk of pack.chunks) {
    if (chunk.embedding.length !== pack.embeddingDim) {
      throw new Error(
        `Chunk ${chunk.id} has ${chunk.embedding.length} dims, expected ${pack.embeddingDim}`,
      )
    }
  }
}

function defaultBaseUrl(): string {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.BASE_URL
      : '/'
  return `${base.replace(/\/$/, '')}/packs`
}

export const subjectDataManager = new SubjectDataManager()
