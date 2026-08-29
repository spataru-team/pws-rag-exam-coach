# Evolution from the earlier foundation

> **Transparency note.** This document was added **after** the competition
> submission to consolidate information already stated in the submitted
> application and visible in the repository. It does not alter the
> submission-state snapshot marked by the `intel-2026-submission` git tag.

The 2026 competition project is **not** unrelated to prior work, and it is
**not** a from-scratch build. It is a reused foundation plus a materially new
decision layer. This document separates what the repository independently shows
from what the team states.

---

## A. Repo-verifiable continuity

Evidence visible in this repository:

| Continuity | Evidence in this repo |
|---|---|
| A prior project **`edu-rag-mvp`** exists, with a Romanian textbook corpus (535 pre-embedded grade-9 chunks) in a Postgres/pgvector dump `ragdb_2026-02-09.sql` | `docs/superpowers/plans/2026-06-13-romanian-corpus-import.md` (goal, script header, source path) |
| Corpus **import tooling** that reads that prior dump | `scripts/import-corpus.ts`, `npm run import:corpus` |
| The current chunk/pack schema is **explicitly designed for continuity** with the prior corpus column layout | `src/packs/types.ts` — comment: chunk metadata "mirrors the existing `rag_chunks` columns … so a real corpus export can populate packs without type changes" |
| The 2026 competition decision layer is **dated** | design specs: barem grading `2026-06-10`, Cloudflare deploy `2026-06-13`, Rescue Mode `2026-08-11` — in `docs/superpowers/specs/` and `plans/` |

## B. Team-attested continuity (stated by the team; not independently provable from this repo)

- The earlier foundation dates to **2025**. *The team identifies `edu-rag-mvp`
  as its 2025 work; this repository's own history begins with the
  2026 "Initial public release" commit and does not independently prove the
  year.*
- The exact **authorship split** within that earlier project.
- Architectural elements the team reports were **carried forward** but whose
  earlier implementation is not contained in this repository:
  - local-first, browser-only architecture (IndexedDB, no account);
  - embedding-based multilingual retrieval (ru/ro/en) — note the *specific*
    embedding model was migrated in 2026 (`nomic-embed-text` → `bge-m3`, see
    [EVALUATION.md](EVALUATION.md));
  - the offline deterministic-stub embedding fallback;
  - the OpenAI-compatible LLM/embedding adapter pattern.

  These patterns are all present in the current code, but this repo cannot show
  whether they originated in 2025 or were rebuilt for 2026.

## C. Materially new in the 2026 competition layer

Everything that converts grounded feedback into **recovered official exam
points** — designed and built in 2026:

- **Barem grading** — an answer scored against the official ANCE marking
  scheme: deterministic where the scheme applies exactly, LLM only for
  open-ended criteria (`src/learning/baremGrader.ts`; design 2026-06-10).
- **Scoring atoms** — each rubric criterion becomes an atom tagged with the
  skill it tests.
- **🟢 / 🟡 / 🔴 zones** — skills sorted by recoverable value, not by weakness.
- **Rescue Mode** — a ranked route of 2–4 skills by
  lost-points × trainability × transfer-reliability ÷ training-cost, stopping
  once the projected score clears a margin **above** the pass line (design
  2026-08-11, built for a real retake cohort of six students).
- **Points forecast** — a conservative figure and an expected figure, both
  capped at the points actually lost; drill performance is treated as evidence
  of readiness, never converted directly into exam points.
- **Retake-driven iteration** — Rescue Mode exists because six students needed
  the August retake.
- **Intel / OpenVINO deployment path** — the current OpenVINO Model Server
  integration (all three RAG stages behind one OpenAI-compatible API, INT8/INT4
  exports) and the synthetic concurrency benchmark on an Intel Xeon E5-2678 v3
  are 2026 work ([INTEL_OPENVINO.md](INTEL_OPENVINO.md), `ovms/`). The
  local-first / on-CPU principle itself is part of the carried-forward
  foundation in section B.

## The innovation

Not RAG, and not any single model choice — using the **official scoring rubric**
as the thing that decides what matters, so grounded AI feedback becomes a
targeted, explainable path to the exam points a student can still realistically
earn.
