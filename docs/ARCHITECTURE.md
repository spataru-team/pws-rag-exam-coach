# Architecture

PWS RAG Exam Coach is a **local-first PWA** for multi-subject exam preparation.
All learner data stays in the browser (IndexedDB); the network is touched only
to download subject packs and (optionally) to call a cloud LLM.

## Layered design

The codebase enforces strict separation so each concern can evolve independently:

```
types/        Domain model (10 interfaces). Single source of truth.
data/         Subject registry + authored chunk drafts (per subject).
rag/          Retrieval ONLY: cosine, embeddings, retrieveRelevantChunks.
llm/          Providers ONLY: adapters, validation, prompt templates.
learning/     Pedagogy ONLY: mastery, spaced repetition, diagnostics,
              recommendation, gamification, progress. Pure functions.
storage/      Dexie/IndexedDB schema + thin repositories.
packs/        SubjectDataManager: download/remove per-subject data packs.
export/       ProgressExportJson builder + schema validator.
services/     Composition layer that wires rag + llm + learning + storage.
i18n/ theme/ a11y/   Interface language, themes, dyslexia mode, speech.
screens/ components/ app/   React UI (presentation + orchestration only).
```

**Invariants**

- `rag/` ⟂ `llm/` ⟂ `learning/` ⟂ `storage/` — no cross-imports between them.
- UI screens contain no pedagogical logic; they call `services/`.
- Subject-specific logic lives only in `data/subjects/` and
  `llm/promptTemplates/subjects.ts`.
- Pure pedagogy functions (`learning/`) take data in and return data out, which
  is why they are unit-tested directly.

## Data flow (a practice answer)

```
Screen (Practice)
  → services/tutorService.getTutorFeedback
      → services/ragService.retrieve
          → embedderForSubject (matches the pack's embedding model)
          → retrieveRelevantChunks (subject-filtered cosine over IndexedDB chunks)
      → llm/promptTemplates.buildFeedbackPrompt (generic + subject rules)
      → llm/adapters.createAdapter(...).chat(...)
      → measure groundedness/format, persist ModelRunMetrics
  → services/progressService.recordLearningEvent
      → eventRepo.add + learning/mastery.updateMastery + masteryRepo.save
```

## RAG

- Embedding dimensionality is **per-pack**, not a global constant: each
  `SubjectPack` records its own `embeddingDim` (`src/packs/types.ts`), validated
  against every chunk's vector length at load (`SubjectDataManager`). The app
  default is **1024** (`DEFAULT_EMBEDDING_DIM`), matching `bge-m3` — chosen for
  strong multilingual (ru/ro/en) retrieval, since the target audience queries in
  Russian against Romanian-language material. `EmbeddingProvider` itself exposes
  `dim`, so a provider validates its own output against the pack it's serving
  rather than a hardcoded number (`assertEmbeddingDim`).
- `EmbeddingProvider` implementations: `OllamaEmbeddingProvider` (default
  `bge-m3`), `DeterministicEmbeddingProvider` (offline stub, dim configurable),
  and `OpenAICompatibleEmbeddingProvider` (any OpenAI-compatible `/embeddings`
  endpoint — OpenVINO Model Server, Cloudflare Workers AI, OpenAI).
  `resolveEmbeddingProvider('auto')` probes Ollama and falls back to the stub;
  `'openai-compatible'` targets OVMS/cloud. Chat likewise has an `openvino`
  provider that reuses the OpenAI-compatible adapter (OVMS `/v3`) — see
  `ovms/README.md` for the full local setup, verified export commands, and a
  documented Qwen3 "thinking mode" latency fix
  (`chat_template_kwargs: {enable_thinking: false}` in
  `src/llm/adapters/openaiCompatible.ts`, gated to `kind === 'openvino'`). The
  hosted Cloudflare proxy routes `/api/v1/embeddings` (and now `/api/v1/rerank`)
  to Workers AI's own endpoints (`@cf/baai/bge-m3` / `@cf/baai/bge-reranker-base`),
  not OpenAI — see `src/server/openaiProxy.ts` and `docs/DEPLOY_CLOUDFLARE.md`.
  The proxy's embeddings and chat branches are **independent capabilities**
  (`GET /api/v1/health` → `{ embeddingsConfigured, chatConfigured }`); the
  first-run provider is always Mock, and the managed-chat `worker` preset is
  opt-in — offered only when `chatConfigured`, disabled on the public deployment,
  never auto-selected.
- **Query and chunk vectors must come from the same model — same dimension is
  not sufficient**, a different model at an equal dimension is still a
  different, incomparable vector space. Each pack records its `embeddingModel`;
  retrieval picks a matching query embedder. Before pointing a runtime backend
  at a pack seeded by a different backend (e.g. OVMS-seeded pack, Ollama
  runtime), run `npm run verify:embeddings`
  (`scripts/verify-embedding-space.ts`) — it embeds a fixed ru/ro/en probe set
  through both and requires cosine ≥ 0.98, catching a quantization/precision
  drift before it silently degrades retrieval.
- Retrieval always filters by `subjectId` first; `topicId` is an optional
  further filter. The `ChunkSource`/`VectorIndex` abstraction allows swapping the
  linear cosine scan for sqlite-vec / wasm / pgvector later.
- **Insufficient-evidence gate.** `insufficient` is computed from the max cosine
  similarity among the *final* top-K results actually returned (after rerank),
  never a wider intermediate pool — computing it against a bigger pool let a
  coincidentally-similar chunk elsewhere in a 300+-chunk subject mask a
  genuinely off-topic query. `DEFAULT_MIN_SIMILARITY` (`src/rag/retrieve.ts`) is
  tuned per embedding model (0.42 for bge-m3, was 0.15 for nomic-embed-text) —
  recalibrate with `npm run eval:sweep` if the model changes; `npm run eval`'s
  `refusalAccuracy`/`byLang` breakdown is what catches a wrong threshold.
- **Cross-language query expansion** (`src/rag/queryExpansion.ts`) feeds the
  lexical/BM25 branch only (the vector branch is already multilingual via
  bge-m3): a deterministic glossary built from every subject's own topic titles
  (ru/ro/en already authored in `src/data/subjects/*.ts`) cross-links a topic's
  terms across languages, so a Russian query gets a chance at lexical overlap
  with a Romanian-language chunk. No LLM call, no external dictionary.
- **Second-stage reranker** is pluggable (`RetrieveOptions.reranker`,
  `src/rag/rerank.ts`'s `Reranker` interface) — `LexicalReranker` (deterministic,
  offline) is the default. `CrossEncoderReranker`
  (`src/rag/crossEncoderReranker.ts`) talks to a Cohere-shaped `/rerank`
  endpoint (OVMS or the Cloudflare proxy) with a fallback to the lexical
  reranker on any error; it is implemented and tested but **not yet the
  default** — see `ovms/README.md`'s "Known limitation" for why (a real,
  measured Cyrillic-discrimination bug in the current bge-reranker-v2-m3 OVMS
  export, not this app's code).
- **Groundedness gate** (`src/services/tutorService.ts`): a `[#chunkId]`
  citation the model invents (an id that was never actually retrieved) is
  stripped from the answer text before it reaches the student; if most of an
  answer's citations are fabricated, the response is folded into the same
  `insufficient` signal the UI already surfaces, rather than serving a
  confident-looking but unverifiable explanation.
- **Prerequisite ("concept") graph** (`src/learning/prerequisites.ts`): every
  `Topic.prerequisites` array is real authored data, not built by an LLM.
  `prerequisiteChain()` is a pure BFS over it — cycle-safe, depth-capped —
  surfaced in `Practice.tsx` as a "builds on" list the student can click through.
  This is the answer to "how is this different from a chat-bot over the
  textbook": the coach can point at *why* a topic is hard, not just restate it.

## Subject data packs

The single corpus is split per subject. Structural metadata (topic tree,
exercise types, rubrics) ships in the registry and is always available; the heavy
chunk + embedding payload is a downloadable pack (`public/packs/<id>.pack.json`).
`SubjectDataManager.download()` fetches, validates (against the pack's own
`embeddingDim`), and caches a pack in IndexedDB. The base URL is configurable, so
packs can later be served from a remote repository.

Packs are generated by `npm run seed` (see `scripts/seed-packs.ts`), which embeds
the authored chunk drafts. If neither Ollama nor an explicit backend is
reachable, `resolveEmbeddingProvider('auto')` falls back to the deterministic
offline stub so the app still has *some* pack to work with — but the committed
packs in `public/packs/` are real `bge-m3` vectors (seeded via local Ollama), not
the stub, so retrieval quality out of the box reflects the real model.

## Visual assets (figures)

Exam papers and textbooks carry drawings, diagrams, formulas and tables that
plain-text chunks can't represent. `VisualAsset` (`src/types/asset.ts`) is a
standalone PNG (never base64-embedded in a pack — packs already run tens of
MB) referenced by `ExamItem.assets`, `ExamPaper.sourceAssets`,
`DrillItem.assets`, or a chunk's `metadata.figures`, and rendered inline by
`FigureView`/`FigureList` (`src/components/FigureView.tsx`) with click-to-zoom
and a white backing plate (source drawings are ink-on-transparent, which
would vanish in dark theme without it).

`scripts/extract-figures.ts` produces these PNGs + a `figures.json` manifest
from a source PDF: it renders each page via `pdfjs-dist` + `@napi-rs/canvas`,
then either crops a hand-specified pixel rectangle (`--crop`, always
available) or auto-detects figure regions (`src/media/figureLayout.ts`'s pure
geometry helpers — box clustering, page-frame/ruling-line rejection, and a
size cap that excludes the large answer-writing rectangles real exam pages
draw per task, which would otherwise chain-cluster into a page-spanning
blob; see that file's and the script's doc comments for the verified,
non-obvious details). `scripts/fetch-exam-papers.ts` downloads the source
test/barem PDFs from ANCE by their verified filename pattern into
`corpus/raw/exams/` (gitignored, third-party copyright).

The barem-grading LLM prompt (`src/llm/promptTemplates/barem.ts`) has no
vision call — an item's figures are described to the model as text (its
`description`, falling back to localized `caption`/`alt`) so grading a
"see the drawing" geometry answer isn't blind to what the student saw.

## Build / scripts

- `npm run dev` / `build` / `preview` — Vite + `vite-plugin-pwa`.
- `npm run typecheck` — strict `tsc -b`.
- `npm test` — Vitest unit suites.
- `npm run seed` — (re)generate subject packs.
- `npm run exams:fetch` / `npm run figures:extract` — fetch exam PDFs / crop figures (see "Visual assets" above).
- `npm run eval` — run the evaluation harness.

## Adding a subject

See [SUBJECT_REGISTRY.md](./SUBJECT_REGISTRY.md). In short: add a `Subject` config,
author chunk drafts, register both, run the seed — no core code changes.
