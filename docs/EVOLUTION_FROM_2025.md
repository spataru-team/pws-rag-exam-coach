# Evolution from the earlier project

> **Transparency note.** This document was added **after** the competition
> submission to consolidate information already stated in the submitted
> application and visible in the repository. It does not alter the
> submission-state snapshot marked by the `intel-2026-submission` git tag.

The 2026 competition project is **not** a from-scratch build, and it is **not**
simply a repackaged earlier codebase. This document separates what the team
states about that history from what this repository can independently show.

Labels used below:

- **[team-attested]** — stated by the team; not independently provable from this
  repository (its own git history begins with the 2026 "Initial public release"
  commit).
- **[repo-verifiable]** — an artifact in this repository supports it.

---

## Team continuity

**[team-attested]** The 2026 team is **only partially continuous** with the
earlier project — roughly half the team changed. So this is not "the same team's
previous project" without qualification; it is **an earlier project with partial
team continuity**.

## What carried over

**[team-attested]** The substantive carry-over is the **idea and hands-on
experience of RAG over educational material**:

> educational material → retrieval → an answer grounded in the textbook / material.

Direct technical-platform reuse is **not** the centre of the story; the narrow,
repo-verifiable technical carry-overs are listed near the end.

## What the earlier project was, and its limits

**[team-attested]**

- Its **main pedagogical function was grounded question answering over the
  supplied educational material**. It did **not** implement the current
  exam-competency / rubric-driven diagnostic and decision layer.
- **Difficult to transfer / deploy.** Moving it to another environment required
  substantial IT expertise — a practical scalability limitation.
- **A permissive content pipeline.** Many different educational materials could
  be added, at uneven quality, and several implementation approaches
  accumulated. The result was **a heterogeneous implementation-and-content
  collection rather than a standardized pedagogical platform**.

## Why the pedagogical architecture changed in 2026

**[team-attested]** A **general** "validate a student's competencies against
arbitrary material" layer was judged **impractical to scale**. It would require
subject teachers to:

- define the competencies,
- map every material to those competencies,
- create the assessment criteria,
- maintain those mappings as materials change.

That is work outside teachers' normal instructional load, so it was not a
realistic scaling strategy.

The 2026 answer is to **not** ask teachers to build a competency framework for
arbitrary materials, and instead use an **existing authoritative structure**:
the **official ANCE exam marking scheme (barem)**.

---

## A. Pedagogical evolution

| | Earlier project | 2026 |
|---|---|---|
| What the AI produces | a grounded answer from the material | a grounded answer **plus** a scored diagnosis and a point-recovery route |
| Where "what matters" comes from | the material itself | the **official ANCE rubric** |
| Pipeline | material → retrieval → grounded answer | student answer → **official rubric criteria / scoring atoms** → skill mapping → lost points → 🟢/🟡/🔴 **recoverable-value zones** → ranked **2–4-skill Rescue route** → **conservative / expected** recovered-points forecast |

**[repo-verifiable]** — the 2026 pipeline: barem grading
(`src/learning/baremGrader.ts`, design spec 2026-06-10); Rescue Mode
(`src/learning/rescueEngine.ts` / `rescueConfig.ts`, design 2026-08-11, built for
a real retake cohort of six students); the hand-authored skill weights and
prerequisite graph (`src/learning/prerequisites.ts`, "authored data, not built
by an LLM").

## B. Technological / access evolution

| | Earlier project | 2026 |
|---|---|---|
| How a learner reaches it | technically demanding deployment; mainly controlled environments | a **browser / PWA** opened on an ordinary phone or laptop |
| Inference | — | **multiple provider paths**: an offline / on-device demo (Mock), local providers (Ollama / LM Studio), a school-LAN **Intel / OpenVINO / OVMS** server, or cloud. **School-local OVMS is an optional privacy / offline deployment path, not a requirement for accessing the PWA.** |
| Workflow | several accumulated implementation approaches | one standardized diagnostic → route → drill → forecast workflow |

**[repo-verifiable]** — the PWA build (`vite-plugin-pwa`, `vite.config.ts`); the
provider presets and the capability-aware first-run selection
([LLM_PROVIDERS.md](LLM_PROVIDERS.md)); OVMS as one optional backend among
several (`ovms/`, [INTEL_OPENVINO.md](INTEL_OPENVINO.md)).

---

## Repo-verifiable technical carry-overs (secondary)

Narrower than the idea-level continuity above:

| Carry-over | Evidence |
|---|---|
| The earlier project (`edu-rag-mvp`) had a Romanian textbook corpus (535 pre-embedded chunks) in a Postgres/pgvector dump `ragdb_2026-02-09.sql` | `docs/superpowers/plans/2026-06-13-romanian-corpus-import.md` |
| Import tooling that reads that prior dump | `scripts/import-corpus.ts`, `npm run import:corpus` |
| The chunk/pack schema is deliberately shaped for continuity with the prior corpus column layout | `src/packs/types.ts` — "mirrors the existing `rag_chunks` columns … so a real corpus export can populate packs without type changes" |

**Not carried over — the embedding model.** The earlier system used
`nomic-embed-text`; `bge-m3` is a **2026 migration** made during the
Russian-query work (see [EVALUATION.md](EVALUATION.md), "Measured validation").

## The innovation

**The continuity is RAG over educational material. The 2026 innovation is not
RAG itself — it is using the official exam rubric as the decision layer that
turns grounded evidence into an explainable, personalized path to recover exam
points.**
