# Judge / reviewer reproducibility

This document is for anyone doing a **clean clone** of the public repository and
wanting to run the app, the tests and the retrieval evaluation without any
private data or external accounts.

> Development process and the human/AI division of responsibility:
> [AI_DEVELOPMENT.md](AI_DEVELOPMENT.md). Relationship to the earlier project
> (partial team continuity, what carried over, what is new):
> [EVOLUTION_FROM_2025.md](EVOLUTION_FROM_2025.md).

## TL;DR

```bash
npm install
npm run typecheck && npm test
EMBED_MODE=deterministic npm run seed   # offline; builds packs for the public-fallback subjects
npm run seed:demo                       # optional: synthetic corpora for the 3 empty subjects
npm run dev                             # http://localhost:5173
```

- `npm run typecheck`, `npm test` and `npm run build` need **no data at all**.
- `npm run eval` / `npm run eval:ci` need packs on disk — run a `seed` first
  (CI does `EMBED_MODE=deterministic npm run seed`).

## AI provider on the first run

The **first "Check answer" in Practice** is the first thing that needs an AI
provider. Onboarding **always pre-selects Mock**, in every run mode including the
deployed site:

| path | retrieval | answer-checking |
|---|---|---|
| **Quick demo / clean clone** — `npm run dev` or `npm run build && npm run preview` | offline deterministic-stub embeddings (stub-seeded packs) | **Mock** — deterministic grounded answer citing `[#chunk-id]`s, no network, ~1–2 s |
| **Public deployment** — the live site, or `cf:dev` with embeddings-only `.dev.vars` | **managed Workers AI `bge-m3`** via `/api/v1/embeddings` (keeps the RAG demo real) | **Mock** — managed chat is disabled; the barem-grading / diagnostic / Rescue flow runs offline with a deterministic, `[DEMO]`-labelled pseudo-score |
| **Private deployment** with `OPENAI_API_KEY` set | managed or local | Mock by default; `worker` (managed chat) is *offered* but never auto-selected |

- The probe (`src/llm/proxyProbe.ts`) is **non-generative** and only decides
  whether to *offer* `worker` — it never changes the selection.
- Real cloud answer-checking is **BYOK**: pick `openai` / `openrouter` in
  onboarding or Settings and enter your own key (stored only in local IndexedDB,
  behind the cloud-egress warning). *Documented as supported only after a
  deployed-browser check — see below.*
- Any local provider (Ollama / LM Studio / OpenVINO) is selectable but never
  auto-selected — it needs that server running.
- To explore Rescue Mode with nothing to type: Rescue → **"Открыть
  демонстрационную диагностику (DEMO)"** loads a seeded sample attempt through
  the real route engine, entirely in memory, with zero grading calls.
- If a selected provider can't be reached, Practice shows an explicit
  **"AI provider unavailable"** notice with the retrieved sources still listed.

So: on a clean clone, follow the TL;DR, complete onboarding **without changing
the AI-mode step**, open Practice for a seeded subject, and submit an answer —
you get a predictable grounded first response with no extra setup.

### BYOK in the deployed browser

`openai` / `openrouter` make a cross-origin request with your key from the
browser. OpenRouter documents browser/CORS support; direct calls to
`api.openai.com` from a Pages origin are **pending a keyed deployed-browser
check**. Until that check is recorded here, treat **OpenRouter** as the verified
in-browser BYOK path; an OpenAI key works with a local run or your own proxy.
There is no team-funded managed-chat fallback.

## What ships in the public repo, and what does not

The source code is MIT. The **retrieval corpora are not**: they are derived from
copyrighted Ministry-of-Education textbooks and ANCE exam materials, so this
repository intentionally omits them. Specifically gitignored:

| Path | Contents | In public repo? |
|---|---|---|
| `public/packs/*.pack.json` | per-subject chunk text + embedding vectors | ❌ (only `README.md`) |
| `corpus/out/` | derived textbook chunks (`npm run corpus:ingest` output) | ❌ (directory absent) |
| `corpus/raw/` | downloaded source PDFs | ❌ |
| `corpus/manifest.json` | textbook catalogue (metadata only) | ✅ |

`npm run seed` regenerates `public/packs/*.pack.json` from whatever chunk sources
are present locally.

## Subject-by-subject public fallback state

Two kinds of subject:

- **Hand-authored fallback** — a small teacher-written chunk set is committed as
  TypeScript (`src/data/chunks/<id>.chunks.ts`) and wired into
  `src/data/chunks/index.ts`. `npm run seed` always produces a usable pack.
- **Auto-ingested only** — the corpus comes exclusively from
  `corpus/out/<id>-*.chunks.json` (PDF ingestion output, gitignored). On a clean
  clone there is **nothing to seed**, so the pack is written with `chunks: []`.

| Subject | id | Public chunk source | Pack after a clean `npm run seed` |
|---|---|---|---|
| Romanian (alolingvi) | `romanian` | `src/data/chunks/romanian.chunks.ts` (17) | ✅ populated |
| English | `english` | `src/data/chunks/english.chunks.ts` (9) | ✅ populated |
| Biology | `biology` | `src/data/chunks/biology.chunks.ts` (8) | ✅ populated |
| History | `history` | `src/data/chunks/history.chunks.ts` (7) | ✅ populated |
| **Chemistry** | `chemistry` | *(none — `corpus/out/` only)* | ⚠️ **empty** — needs local regeneration |
| **Mathematics** | `math` | *(none — `corpus/out/` only)* | ⚠️ **empty** — needs local regeneration |
| **Russian** | `russian` | *(none — `corpus/out/` only)* | ⚠️ **empty** — needs local regeneration |

### How the empty state shows up

- **In the app**: opening Practice for chemistry / math / russian returns a
  dedicated notice ("This subject has no knowledge base in this build …"), *not*
  the generic "materials don't cover this question" message. Settings → Active
  subjects shows an `⚠️ empty — regenerate locally` badge for those packs.
  Internally this is `RetrievalResult.corpusEmpty` /
  `TutorResponse.corpusEmpty` / `PackStatus.empty`.
- **In `npm run eval`**: those three subjects are reported under
  `skippedSubjects` and the run is labelled
  `PUBLIC CLEAN-CLONE REPRODUCIBILITY RUN — PARTIAL SUBJECT COVERAGE`. The gate
  still fails if any of romanian / english / biology / history was not evaluated.

## Regenerating the real corpora (optional, needs the source PDFs)

See [`docs/SUBJECT_REGISTRY.md`](SUBJECT_REGISTRY.md) → "Auto-ingested subjects".
Briefly: `npm run corpus:fetch` → `npm run corpus:ingest` (per book) →
`npm run seed`. The PDFs are third-party copyrighted material and are not
distributed here.

## Redistribution-safe synthetic demo

`npm run seed:demo` runs the normal seed pipeline and then fills **only** the
otherwise-empty subjects with self-authored synthetic chunks from
`src/data/chunks/demo/` (5–8 per subject, generic textbook-independent concepts).

- Every synthetic passage is prefixed `[DEMO]`, its `source` is
  `SYNTHETIC DEMO — self-authored, not exam or textbook material`, and the pack
  is tagged `synthetic: true` and labelled **DEMO / SYNTHETIC** in Settings.
- It exercises the **same** embedding + retrieval + tutor code as production
  (`scripts/seed-packs.ts` `seedPacks()`, `src/rag/retrieve.ts`,
  `src/services/tutorService.ts`) — only the input text differs.
- `npm run seed` never touches the synthetic drafts. Synthetic packs are
  **excluded** from `npm run eval` (reported as `skipped: synthetic-pack`) so a
  demo seed can never stand in for, or inflate, the real benchmark.
- Synthetic content is **not** part of any figure in
  [`docs/EVALUATION.md`](EVALUATION.md) or
  [`docs/FIELD_DEPLOYMENT.md`](FIELD_DEPLOYMENT.md).

## The production retrieval benchmark is a different thing

The seven-subject recall/MRR figures in [`docs/EVALUATION.md`](EVALUATION.md) and
the README were measured with the **real** corpora and **bge-m3** embeddings
(`npm run eval` in `auto` mode against a fully-seeded checkout). The deterministic
clean-clone CI run is an offline smoke check over the publicly redistributable
subset only — bag-of-words stub embeddings, four subjects — and is not
comparable.
