/**
 * Builds subject packs (public/packs/<subject>.pack.json) by embedding the
 * authored chunk drafts. Uses Ollama bge-m3 (1024-dim, multilingual) when
 * reachable, otherwise falls back to the deterministic offline stub so the app
 * always has data.
 *
 * Run: npm run seed                  (all subjects; auto Ollama → fallback)
 *      npm run seed -- english       (only the given subject ids)
 *      EMBED_MODE=ollama npm run seed
 *      EMBED_MODE=deterministic npm run seed
 *      EMBED_MODE=openai-compatible npm run seed
 *        # OpenVINO Model Server (OVMS) / Workers AI / OpenAI embeddings. Config via env:
 *        #   EMBED_BASE_URL  (default http://localhost:8000/v3)
 *        #   EMBED_MODEL     (default bge-m3; must match EMBED_DIMENSIONS if set)
 *        #   EMBED_API_KEY   (optional bearer key for cloud endpoints)
 *        #   EMBED_DIMENSIONS (optional; positive integer — omit for bge-m3, it's 1024
 *        #                     natively and ignores OpenAI-style truncation)
 *
 * `npm run seed` is production / public-fallback only: it embeds the
 * hand-authored `src/data/chunks/*.chunks.ts` drafts plus any locally-generated
 * `corpus/out/*.chunks.json`. It NEVER pulls in synthetic demo content — that is
 * `npm run seed:demo` (scripts/seed-demo.ts), which calls `seedPacks({
 * includeDemo: true })`. See docs/JUDGE_REPRODUCIBILITY.md.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { chunkDraftsBySubject, type ChunkDraft } from '@/data/chunks'
import { demoChunkDraftsBySubject } from '@/data/chunks/demo'
import { listSubjects } from '@/data/subjectRegistry'
import {
  resolveEmbeddingProvider,
  type EmbeddingFactoryOptions,
  type EmbeddingMode,
  type EmbeddingProvider,
} from '@/rag/embeddings'
import { PACK_SCHEMA_VERSION, type SubjectPack } from '@/packs/types'
import type { Chunk } from '@/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'packs')
const CORPUS_OUT_DIR = join(__dirname, '..', 'corpus', 'out')

/**
 * Generated chunk drafts (scripts/ingest-pdf.ts output) live alongside the
 * hand-authored TS drafts, named `<subjectId>-<grade>-<lang>.chunks.json`.
 * A subject can have zero, one, or several of these (e.g. chemistry-9-ru +
 * chemistry-12-ru). Missing corpus/out/ (not every checkout runs the PDF
 * pipeline) is not an error — just no generated content to add.
 */
async function loadGeneratedChunks(subjectId: string): Promise<ChunkDraft[]> {
  let files: string[]
  try {
    files = await readdir(CORPUS_OUT_DIR)
  } catch {
    return []
  }
  const matches = files.filter((f) => f.startsWith(`${subjectId}-`) && f.endsWith('.chunks.json'))
  const drafts: ChunkDraft[] = []
  for (const f of matches) {
    const parsed = JSON.parse(await readFile(join(CORPUS_OUT_DIR, f), 'utf8')) as ChunkDraft[]
    drafts.push(...parsed)
  }
  return drafts
}

/** Cloud backends (Workers AI in particular) occasionally drop a connection or
 * time out under the sustained load of a multi-thousand-chunk run — retrying
 * the single failed request is far cheaper than losing an hour-long subject
 * run to one transient blip. */
async function embedWithRetry(
  embedder: EmbeddingProvider,
  text: string,
  attempts = 4,
): Promise<number[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await embedder.embed(text)
    } catch (err) {
      if (attempt >= attempts) throw err
      const delayMs = 500 * 2 ** (attempt - 1)
      console.warn(`[seed]   embed retry ${attempt}/${attempts - 1} after error: ${(err as Error).message} (waiting ${delayMs}ms)`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

/** Bounded-concurrency map — sequential embedding of a full textbook's worth
 * of chunks (hundreds to low thousands) is slow enough to be annoying, but
 * unbounded parallelism can overwhelm a local Ollama/OVMS instance. */
async function embedAll(
  drafts: ChunkDraft[],
  embedder: EmbeddingProvider,
  concurrency = 4,
): Promise<Chunk[]> {
  const results: Chunk[] = new Array(drafts.length)
  let next = 0
  let done = 0
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= drafts.length) return
      const draft = drafts[i]!
      const embedding = await embedWithRetry(embedder, draft.text)
      results[i] = { ...draft, embedding }
      done++
      if (done % 50 === 0 || done === drafts.length) {
        console.log(`[seed]   embedded ${done}/${drafts.length}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, drafts.length) }, worker))
  return results
}

/** Rounds to 5 decimals before serializing — bge-m3's own precision is far
 * coarser than float64's default ~17-significant-digit JSON stringification
 * (e.g. "0.0006489753723144531" vs the "0.00065" this produces), and that
 * gap alone was pushing packs over Cloudflare Pages' 25 MiB per-file limit
 * (see docs/DEPLOY_CLOUDFLARE.md — math.pack.json still cleared it at 6
 * decimals). 5 decimals is still ~100x finer than cosine similarity ranking
 * needs. */
function roundEmbedding(vec: number[]): number[] {
  return vec.map((v) => Math.round(v * 1e5) / 1e5)
}

function factoryOptions(mode: EmbeddingMode): EmbeddingFactoryOptions {
  const dimsRaw = process.env.EMBED_DIMENSIONS
  const dims = dimsRaw === undefined ? undefined : Number(dimsRaw)
  if (dims !== undefined && (!Number.isInteger(dims) || dims <= 0)) {
    throw new Error(`EMBED_DIMENSIONS must be a positive integer, got: "${dimsRaw}"`)
  }

  if (mode === 'openai-compatible') {
    return {
      mode,
      openaiCompatible: {
        baseUrl: process.env.EMBED_BASE_URL ?? 'http://localhost:8000/v3',
        model: process.env.EMBED_MODEL ?? 'bge-m3',
        ...(process.env.EMBED_API_KEY ? { apiKey: process.env.EMBED_API_KEY } : {}),
        ...(dims !== undefined ? { dimensions: dims, expectedDim: dims } : {}),
      },
    }
  }
  return { mode }
}

export interface SeedOptions {
  /** Subject-id filter. Empty / omitted = every registered subject. */
  only?: string[]
  /** Embedding mode. Defaults to `EMBED_MODE` env, then `'auto'`. */
  mode?: EmbeddingMode
  /**
   * Fill subjects that would otherwise have ZERO chunks with the self-authored
   * synthetic drafts from `src/data/chunks/demo/`, and tag those packs
   * `synthetic: true`. Off by default — only `npm run seed:demo` sets this.
   * Subjects that already have real (authored or corpus/out) chunks are never
   * touched, so a regenerated real corpus is never clobbered by demo content.
   */
  includeDemo?: boolean
  /** Output directory for `<subject>.pack.json`. Defaults to `public/packs/`. */
  outDir?: string
}

export interface SeedResult {
  subjectId: string
  chunkCount: number
  synthetic: boolean
}

/**
 * Core seeding routine, shared by `npm run seed` and `npm run seed:demo`.
 * Returns one row per seeded subject.
 */
export async function seedPacks(options: SeedOptions = {}): Promise<SeedResult[]> {
  const mode = options.mode ?? ((process.env.EMBED_MODE as EmbeddingMode) || 'auto')
  const outDir = options.outDir ?? OUT_DIR
  const embedder = await resolveEmbeddingProvider(factoryOptions(mode))
  console.log(`[seed] embedding model: ${embedder.modelId} (mode=${mode})${options.includeDemo ? ' — DEMO run (synthetic fallback enabled)' : ''}`)

  await mkdir(outDir, { recursive: true })

  const only = new Set(options.only ?? [])
  const subjects = listSubjects().filter((s) => only.size === 0 || only.has(s.id))
  const seeded: SeedResult[] = []

  for (const subject of subjects) {
    const authored = chunkDraftsBySubject[subject.id] ?? []
    const generated = await loadGeneratedChunks(subject.id)
    let drafts: ChunkDraft[] = [...authored, ...generated]
    let synthetic = false

    if (drafts.length === 0 && options.includeDemo) {
      const demo = demoChunkDraftsBySubject[subject.id] ?? []
      if (demo.length > 0) {
        drafts = demo
        synthetic = true
        console.log(`[seed] ${subject.id}: no real corpus — using ${demo.length} SYNTHETIC demo chunks`)
      }
    }

    if (generated.length > 0) {
      console.log(`[seed] ${subject.id}: ${authored.length} authored + ${generated.length} generated (corpus/out/)`)
    }

    const chunks = await embedAll(drafts, embedder)
    const pack: SubjectPack = {
      schemaVersion: PACK_SCHEMA_VERSION,
      subjectId: subject.id,
      embeddingModel: embedder.modelId,
      embeddingDim: embedder.dim,
      generatedAt: new Date().toISOString(),
      ...(synthetic ? { synthetic: true } : {}),
      chunks: chunks.map((c) => ({ ...c, embedding: roundEmbedding(c.embedding) })),
    }
    const file = join(outDir, `${subject.id}.pack.json`)
    await writeFile(file, JSON.stringify(pack), 'utf8')
    console.log(`[seed] wrote ${file} (${chunks.length} chunks${synthetic ? ', SYNTHETIC' : ''})`)
    seeded.push({ subjectId: subject.id, chunkCount: chunks.length, synthetic })
  }

  return seeded
}

async function main(): Promise<void> {
  // Optional subject-id filter from argv keeps unrelated packs untouched.
  const seeded = await seedPacks({ only: process.argv.slice(2) })
  const empty = seeded.filter((s) => s.chunkCount === 0).map((s) => s.subjectId)
  if (empty.length > 0) {
    console.log(
      `[seed] note: ${empty.join(', ')} produced empty packs (no public corpus). ` +
        `Regenerate locally, or run \`npm run seed:demo\` for synthetic demo content. ` +
        `See docs/JUDGE_REPRODUCIBILITY.md.`,
    )
  }
  console.log('[seed] done.')
}

// Only run the CLI when invoked directly (`tsx scripts/seed-packs.ts`), not when
// imported by scripts/seed-demo.ts or a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[seed] failed:', err)
    process.exit(1)
  })
}
