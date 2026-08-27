# PWS RAG Exam Coach

A **local-first, multilingual, adaptive RAG** web app (PWA) for exam preparation
and subject-based learning. The first complete subject is **Romanian language**
for students from Russian-language schools; English, Biology and History are
present at the data/model level and prepared for later activation.

- 🔒 **Local-first**: all learner data stays in the browser (IndexedDB). No
  account, no real name — only an anonymous local id.
- 🌍 **EN / RU / RO** interface, light/dark themes, **dyslexia-friendly** mode,
  keyboard navigation, correct Romanian diacritics.
- 📚 **RAG-grounded** feedback over `bge-m3` (1024-dim, multilingual ru/ro/en)
  chunks, with subject-filtered retrieval and citation of chunk ids; refuses
  when local materials lack enough evidence.
- 🧩 **Multi-subject by design**: subjects are data + config, downloaded as
  per-subject packs. Adding a subject needs no core code changes.
- 🤖 **Provider-neutral LLM** layer: Mock, Ollama, LM Studio, OpenAI-compatible,
  OpenRouter. Keys stored only locally; explicit cloud warning.

## Quick start

```bash
npm install
npm run seed     # generate subject packs (Ollama bge-m3 if present, else offline stub)
npm run dev      # http://localhost:5173
```

Build & preview:

```bash
npm run build
npm run preview
```

### Real semantic embeddings

The committed packs already carry real `bge-m3` (1024-dim, multilingual)
vectors, seeded via local Ollama. To regenerate them yourself:

```bash
ollama pull bge-m3
npm run seed     # regenerates all packs with real 1024-dim vectors
```

If neither Ollama nor an explicit `EMBED_MODE` backend is reachable, seeding
falls back to a deterministic offline stub so the app still has data — but
retrieval quality then reflects the stub, not real semantics. Retrieval always
uses an embedder matching each pack's recorded model *and* dimension
(`embeddingModel` / `embeddingDim`); before pointing one backend's runtime at
another backend's pack (e.g. OVMS pack, Ollama runtime), run
`npm run verify:embeddings` — see docs/ARCHITECTURE.md §RAG.

## Scripts

| script | purpose |
|--------|---------|
| `npm run dev` / `build` / `preview` | Vite + PWA |
| `npm run typecheck` | strict `tsc -b` |
| `npm test` | Vitest unit tests |
| `npm run seed` | (re)generate subject packs |
| `npm run eval` | retrieval evaluation harness → `eval/results/` |

## Screens

Onboarding · Subject Dashboard · Diagnostic Test · Practice Session ·
Topic Review · Model Lab · Export · Settings.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/SUBJECT_REGISTRY.md](docs/SUBJECT_REGISTRY.md)
- [docs/EVALUATION.md](docs/EVALUATION.md)
- [docs/PRIVACY.md](docs/PRIVACY.md)
- [docs/LLM_PROVIDERS.md](docs/LLM_PROVIDERS.md)

## Tech stack

TypeScript · React · Vite · `vite-plugin-pwa` · Dexie (IndexedDB) · i18next ·
Zustand · Vitest. CSS variables for themes; OpenAI-compatible LLM adapter;
`bge-m3` 1024-dim multilingual embeddings via Ollama/OVMS/Workers AI (with
offline fallback).
