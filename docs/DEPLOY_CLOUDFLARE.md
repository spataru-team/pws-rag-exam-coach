# Deploy: Cloudflare Pages + OpenAI/Workers AI proxy

The app is a static Vite PWA; `/api/*` is served by a Cloudflare Pages Function
(`functions/api/[[path]].ts` → `src/server/openaiProxy.ts`). Chat goes to OpenAI;
embeddings go to **Cloudflare Workers AI** (`@cf/baai/bge-m3`, 1024-dim,
multilingual) via its OpenAI-compatible `/ai/v1/embeddings` endpoint — this keeps
the hosted path in the same vector space as local Ollama/OVMS `bge-m3` (see
docs/ARCHITECTURE.md §RAG). Neither secret ever reaches the browser.

What the proxy enforces:
- `/api/v1/embeddings` → Cloudflare Workers AI, forced `@cf/baai/bge-m3`
  (1024-dim); any client-supplied `dimensions` is stripped (bge-m3 doesn't
  support OpenAI's truncation param).
- `/api/v1/chat/completions` → OpenAI, model allowlist `{gpt-5.4-mini, gpt-5.4-nano}`
  (default `gpt-5.4-mini`), output tokens clamped to 512, `n:1`, `stream` stripped.
- Same-origin guard (rejects mismatched `Origin`).
- Each branch checks only its own secrets, so embeddings work even before the
  OpenAI key is set (and vice versa).

## Prerequisites
- An OpenAI API key with access to `gpt-5.4-mini` (chat only).
- A Cloudflare account + API token scoped to **Workers AI: Read** (embeddings only;
  this is a plain API token, not the Pages project's own deploy credentials).
- `wrangler` is already a dev dependency (`npx wrangler ...`).

## Step A — Re-seed the packs with bge-m3 (once, needs the CF token)
The query embedder and the pack vectors must share a space. Re-embed every subject
pack with `bge-m3`@1024, through the same Workers AI endpoint the proxy uses
(PowerShell):

```powershell
$env:EMBED_MODE = "openai-compatible"
$env:EMBED_BASE_URL = "https://api.cloudflare.com/client/v4/accounts/<CF_ACCOUNT_ID>/ai/v1"
$env:EMBED_MODEL = "@cf/baai/bge-m3"
$env:EMBED_API_KEY = "<CF_API_TOKEN>"
npm run seed
Remove-Item Env:EMBED_API_KEY
```

Verify, then commit:

```powershell
node -e "const p=require('./public/packs/romanian.pack.json');console.log(p.embeddingModel, p.embeddingDim, p.chunks.length, p.chunks.every(c=>c.embedding.length===p.embeddingDim))"
# expect: @cf/baai/bge-m3 1024 <n> true
git add public/packs/*.pack.json
git commit -m "data: re-seed packs with bge-m3@1024 (multilingual)"
```

Seeding via Ollama's local `bge-m3` also works and is faster for iteration, but
run `scripts/verify-embedding-space.ts` first — Ollama's bge-m3 build and the
Workers AI one must agree (cosine ≥ 0.98 on the probe set) before you rely on
Ollama-seeded packs against the hosted proxy.

## Step B — First deploy
```powershell
npx wrangler login            # or set CLOUDFLARE_API_TOKEN (Pages:Edit)
npm run build
npm run cf:deploy             # creates the Pages project; pick a name when prompted
```

## Step C — Set the secrets, then re-deploy
```powershell
npx wrangler pages secret put OPENAI_API_KEY     # paste the key (Production + Preview)
npx wrangler pages secret put CF_ACCOUNT_ID      # your Cloudflare account id
npx wrangler pages secret put CF_API_TOKEN       # Workers AI: Read scoped token
npm run build
npm run cf:deploy                                # so the Function picks up the secrets
```
(Dashboard alternative: Pages → project → Settings → Environment variables / secrets.)

## Local dev / re-seeding through the proxy (optional)
- Create `.dev.vars` (gitignored) with:
  ```
  OPENAI_API_KEY=sk-...
  CF_ACCOUNT_ID=...
  CF_API_TOKEN=...
  ```
- `npm run build && npm run cf:dev` serves the site + Functions at
  http://localhost:8788 (proxy at `/api/v1`). You can also point the seed at it:
  `EMBED_BASE_URL=http://localhost:8788/api/v1` (no key in the seed env — the
  Function injects it).

## Verify after deploy
1. Open the Pages URL; start a mock exam; submit one open-ended item.
2. Grading should return a **barem result** (not the self-assessment fallback), and
   the retrieved-sources panel should show chunks.
3. If grading is self-only or retrieval is "unavailable":
   - Check `OPENAI_API_KEY` (chat) and `CF_ACCOUNT_ID`/`CF_API_TOKEN` (embeddings)
     are all set on the project (and you re-deployed after setting them).
   - Tail logs: `npx wrangler pages deployment tail`.
   - In DevTools → Network, confirm `/api/v1/chat/completions` and
     `/api/v1/embeddings` return 200.
   - A `Pack schema mismatch` error in the console means the deployed packs
     predate the bge-m3 migration — re-run Step A.

## Notes
- Cost: Cloudflare Pages Functions free tier = 100k requests/day; static assets are
  free/unlimited. Workers AI has its own free daily neuron allowance, separate from
  Pages. Chat cost is OpenAI usage.
- Local Ollama: on a local run, Settings offers to use a detected local Ollama for
  **grading** only (embeddings stay on the proxy). On the hosted HTTPS site the probe
  fails by design, so the cloud proxy stays the default.
