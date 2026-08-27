/**
 * Cross-backend embedding-space check: run BEFORE relying on a second backend
 * (OVMS, the Cloudflare Workers AI proxy, a different bge-m3 quantization) to
 * embed a pack — different backends serving "the same" model can still diverge
 * (quantization, precision, pooling), which would silently poison retrieval:
 * queries and chunks would drift apart in cosine space with no error, no
 * exception, just quietly worse matches. This makes that failure loud instead.
 *
 * Probes a fixed multilingual sentence set (drawn from eval/golden — ro/ru/en,
 * the pilot's actual query mix) through both backends and requires
 * cosine(vecA, vecB) >= MIN_COSINE for every probe. Anything below that means:
 * don't mix packs seeded by A with a runtime embedder pointed at B — reseed
 * with the SAME backend the runtime will use instead.
 *
 * Run (PowerShell):
 *   $env:BACKEND_A_URL='http://localhost:11434/v1'; $env:BACKEND_A_MODEL='bge-m3'
 *   $env:BACKEND_B_URL='http://localhost:8000/v3';  $env:BACKEND_B_MODEL='bge-m3'
 *   npx tsx scripts/verify-embedding-space.ts
 *
 * Run (bash):
 *   BACKEND_A_URL=http://localhost:11434/v1 BACKEND_A_MODEL=bge-m3 \
 *   BACKEND_B_URL=http://localhost:8000/v3  BACKEND_B_MODEL=bge-m3 \
 *   npx tsx scripts/verify-embedding-space.ts
 *
 * To check the deployed Cloudflare proxy instead of OVMS, point BACKEND_B_URL
 * at `https://<project>.pages.dev/api/v1` — no API key needed client-side, the
 * Function injects its own secret.
 */
import { OpenAICompatibleEmbeddingProvider } from '@/rag/embeddings'
import { cosineSimilarity } from '@/rag/cosine'

const MIN_COSINE = 0.98

// Drawn from eval/golden/{romanian,english}.json — the pilot's real ro/ru/en
// query mix, not synthetic filler. Kept inline (not imported) so this script
// has no dependency on golden-set shape and stays runnable standalone.
const PROBES: string[] = [
  'Cum se formează articolul hotărât în limba română?',
  'Care sunt cele patru conjugări ale verbului românesc?',
  'Ce sunt sinonimele, antonimele și paronimele?',
  'Как в румынском языке присоединяется определённый артикль к существительному?',
  'Как исправить ошибку согласования и орфографии в румынском предложении?',
  'Что такое синонимы, антонимы и устойчивые словосочетания в английском языке?',
  'When do we use the present continuous tense?',
  'What is the difference between skimming and scanning?',
  'Ce este celula și care sunt componentele ei principale?',
  'Что такое причинно-следственная связь в истории?',
]

interface BackendConfig {
  label: string
  baseUrl: string
  model: string
  apiKey?: string
}

function backendFromEnv(prefix: 'BACKEND_A' | 'BACKEND_B'): BackendConfig | undefined {
  const baseUrl = process.env[`${prefix}_URL`]
  if (!baseUrl) return undefined
  return {
    label: prefix,
    baseUrl,
    model: process.env[`${prefix}_MODEL`] ?? 'bge-m3',
    apiKey: process.env[`${prefix}_API_KEY`],
  }
}

async function embedAll(config: BackendConfig): Promise<number[][]> {
  // expectedDim omitted deliberately: we want the raw output length from each
  // backend, not an assertion — a length mismatch IS one of the failure modes
  // this script is meant to catch, and it should be reported, not thrown.
  const provider = new OpenAICompatibleEmbeddingProvider({
    baseUrl: config.baseUrl,
    model: config.model,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  })
  const vectors: number[][] = []
  for (const probe of PROBES) {
    vectors.push(await provider.embed(probe))
  }
  return vectors
}

async function main(): Promise<void> {
  const a = backendFromEnv('BACKEND_A')
  const b = backendFromEnv('BACKEND_B')
  if (!a || !b) {
    console.error(
      '[verify-embedding-space] Set BACKEND_A_URL and BACKEND_B_URL (+ _MODEL, optional _API_KEY). See the file header for examples.',
    )
    process.exit(1)
  }

  console.log(`[verify-embedding-space] A = ${a.baseUrl} (${a.model})`)
  console.log(`[verify-embedding-space] B = ${b.baseUrl} (${b.model})`)
  console.log(`[verify-embedding-space] ${PROBES.length} probes, threshold cosine >= ${MIN_COSINE}`)

  const [vecsA, vecsB] = await Promise.all([embedAll(a), embedAll(b)])

  let worst = Infinity
  let failures = 0
  PROBES.forEach((probe, i) => {
    const va = vecsA[i]!
    const vb = vecsB[i]!
    if (va.length !== vb.length) {
      console.error(
        `[FAIL] dim mismatch on probe ${i} ("${probe.slice(0, 40)}…"): A=${va.length} B=${vb.length}`,
      )
      failures++
      return
    }
    const sim = cosineSimilarity(va, vb)
    worst = Math.min(worst, sim)
    const status = sim >= MIN_COSINE ? 'ok  ' : 'FAIL'
    console.log(`[${status}] cosine=${sim.toFixed(4)}  "${probe.slice(0, 50)}${probe.length > 50 ? '…' : ''}"`)
    if (sim < MIN_COSINE) failures++
  })

  console.log(`[verify-embedding-space] worst cosine = ${worst === Infinity ? 'n/a' : worst.toFixed(4)}`)
  if (failures > 0) {
    console.error(
      `[verify-embedding-space] ${failures}/${PROBES.length} probes FAILED. ` +
        `These two backends do NOT share a vector space — do not seed with one and query with the other.`,
    )
    process.exit(1)
  }
  console.log('[verify-embedding-space] PASSED — backends agree closely enough to share packs.')
}

main().catch((err) => {
  console.error('[verify-embedding-space] failed:', err)
  process.exit(1)
})
