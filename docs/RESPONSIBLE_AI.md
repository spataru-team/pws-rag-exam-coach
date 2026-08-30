# Responsible AI

Every entry below points at code or a document in this repository. Where a
safeguard is partial or a risk is only mitigated by design intent, it says so.

## Risk / mitigation / evidence

### 1. Hallucination — a confident but unsupported answer

| | |
|---|---|
| **Mitigation** | Feedback is generated only over retrieved curriculum passages and is instructed to cite them as `[#chunkId]`. A citation to an id that was never retrieved is stripped from the answer before the student sees it; if most of an answer's citations are fabricated, the whole response is folded into the same "insufficient evidence" state the UI already shows. Retrieval itself refuses when the best match among the final top-K is below a per-model similarity threshold. |
| **Evidence** | Groundedness gate: `src/services/tutorService.ts` (mechanical citation pipeline extracted to `src/services/citationCheck.ts`, shared verbatim with the safety benchmark). Insufficient-evidence gate: `src/rag/retrieve.ts` (`DEFAULT_MIN_SIMILARITY`, 0.42 for `bge-m3`). Metrics — groundedness, format compliance, citation validity, refusal accuracy (**0.80 = 4/5, n = 5**, `auto`/`bge-m3` mode) — defined in [EVALUATION.md](./EVALUATION.md). The deterministic `npm run eval:safety` benchmark checks the citation pipeline against adversarial fixtures (every deliberately fabricated marker is caught and stripped) and characterizes the reproducible public-fallback refusal path; that fallback runs on a hash-embedding stub, so its refusal numbers are a scope-boundary characterization, not a production `bge-m3` figure. Report only, no gate. |

### 2. Incorrect AI grading

| | |
|---|---|
| **Mitigation** | Deterministic checks are used wherever the marking scheme can be applied exactly; the LLM grades only open-ended criteria where judgement is required. Each grading result carries a confidence signal; self-graded or low-confidence results are marked `needs_review` rather than treated as fact. The AI is **not** the official examiner — the teacher remains the final authority, and the app is positioned as preparation, not assessment. Grade bands are used only where an official source exists (nota 5–10, teacher-confirmed); the code explicitly refuses to invent the nota 1–4 bands. |
| **Evidence** | `src/learning/baremGrader.ts`, `src/learning/expressionMatch.ts`; `gradingConfidence` / `reviewStatus` in `src/learning/rescueEngine.ts`; the "do not invent" note in `src/learning/rescueConfig.ts`. |

### 3. Language / retrieval disparity

| | |
|---|---|
| **Mitigation** | The target audience queries in Russian against Romanian-language material, so the embedding model is multilingual (`bge-m3`, ru/ro/en) and evaluation is broken down **per query language**. A deterministic cross-language glossary (built from each subject's own topic titles, no LLM) gives a Russian query a chance at lexical overlap with a Romanian chunk. A cross-encoder reranker that **degraded** Russian retrieval was measured and **not shipped** — see risk 7. |
| **Evidence** | [EVALUATION.md](./EVALUATION.md) §Cross-lingual coverage: Russian-query Recall@5 **0.625 → 0.940**, MRR **0.358 → 0.829**. `src/rag/queryExpansion.ts`; `byLang` reporting in `eval/harness.ts`; [RUSSIAN_LANGUAGE_STATUS.html](./RUSSIAN_LANGUAGE_STATUS.html). |

### 4. Student privacy

| | |
|---|---|
| **Mitigation** | Local-first: profile, learning events, mastery, model metrics and settings live only in the browser (IndexedDB). Identity is an anonymous local id (`stu_…`) generated on the device — no name, email, or other personal identifier is requested or stored. Export is explicit and user-triggered; the export validator rejects any object carrying `name` / `firstName` / `lastName` / `email`. "Reset all local data" wipes every table. |
| **Evidence** | [PRIVACY.md](./PRIVACY.md); `validateProgressExport` in `src/export/schema.ts`; `src/storage/`. This is why the field-deployment data has no per-student usage figures. |

### 5. Cloud-data exposure

| | |
|---|---|
| **Mitigation** | Local providers keep the prompt in one of two places: the **Mock** provider and a local Ollama / LM Studio keep it **on the device**; a school-network **OpenVINO Model Server** keeps it **on the school LAN** (it leaves the student's device but not the school network). A **cloud** provider sends the prompt — including retrieved chunk text — to an external service, so the UI shows an explicit warning before any cloud provider is used, in onboarding, settings, and the Model Lab. On a local run (`npm run dev` / `npm run preview`) the app starts on the offline **Mock** provider — nothing leaves the device until the student picks another provider; on the hosted demo the app detects a configured same-origin cloud proxy and starts on it instead, behind the same warning. The hosted demo's proxy keeps API keys server-side, enforces a model allowlist, clamps output tokens, and rejects cross-origin calls. **The 2026 field deployment used this cloud path (hosted PWA over the Internet + cloud LLM), so that cohort's prompts did leave the school network; the local OpenVINO option was validated separately and was not used with that cohort** — see [FIELD_DEPLOYMENT.md](./FIELD_DEPLOYMENT.md). |
| **Evidence** | [PRIVACY.md](./PRIVACY.md) §Cloud LLM warning (`llm.cloudWarning`); `src/server/openaiProxy.ts`; [DEPLOY_CLOUDFLARE.md](./DEPLOY_CLOUDFLARE.md). |

### 6. Overconfidence in the predicted points

| | |
|---|---|
| **Mitigation** | The forecast reports two numbers, not one: a **conservative** figure (only counts a skill's gain once the last two micro-drills are both strong *and* confidently graded) and an **expected** figure (best single observation). Both are capped by the points actually lost on that skill and by the paper maximum. Drill performance is treated as evidence of readiness, never converted directly into exam points. The rescue route stops at a safety target set *above* the pass threshold, not at it. |
| **Evidence** | `estimateSkillGain` / `computeForecast` in `src/learning/rescueEngine.ts`; `passThreshold` (13) vs `safetyTarget` (18) in `src/learning/rescueConfig.ts`. |

### 7. Model / component regression

| | |
|---|---|
| **Mitigation** | A deterministic evaluation harness runs in CI on every push/PR and gates against recorded thresholds; the per-language breakdown catches language-specific regressions specifically. Before a pack is trusted against a different inference backend, a probe script requires cosine ≥ 0.98 between the two. A regression **has** been caught this way: after the embedding-model migration, refusal accuracy silently dropped to 0.0 (stale threshold + a gate-scoping bug) and was found by the harness, then fixed (0.0 → 0.80). A cross-encoder reranker that did not discriminate on Cyrillic input was measured, its likely causes tested by experiment, and the component was kept **disabled by default** on both backends tried. |
| **Evidence** | [EVALUATION.md](./EVALUATION.md) §CI gating; `eval/thresholds.json`; `scripts/verify-embedding-space.ts`; `ovms/README.md` §"Known limitation: cross-encoder reranker is unreliable for Cyrillic". |

## Responsible AI principles

### Human oversight
The teacher is the final authority on any grade; the app is preparation, not
assessment. Grading confidence is surfaced, low-confidence results are flagged
`needs_review`, and the points forecast is explicitly advisory (two bounded
numbers, capped, stopping above the pass line). See risks 2 and 6.

### Transparency and explainability
Every piece of feedback shows the source passage it used, the rubric criterion
in play, and the points involved. The prerequisite ("builds on") graph
(`src/learning/prerequisites.ts`, authored data, not LLM-generated) lets the coach
say *why* a topic is hard, not just restate it. Our use of AI-assisted
development, and the human/AI division of responsibility, is disclosed in
[AI_DEVELOPMENT.md](./AI_DEVELOPMENT.md) (linked from the README); known
model/component failure cases are documented in `ovms/README.md` and in risk 7
below. This document is part of that transparency.

### Privacy
Local-first, anonymous, no account. Stored learner data never leaves the device
(the student can export it explicitly). The AI prompt stays on the device with
the Mock provider, on the school LAN with a local OpenVINO/OVMS server, or goes
to an external service with a cloud provider — cloud always behind a visible
warning, and the default only on the hosted demo, never on a local run. See
risks 4 and 5 and [PRIVACY.md](./PRIVACY.md).

### Security, safety and reliability
Deterministic CI evaluation gate; per-language regression checks; cross-backend
embedding-space verification; graceful fallback (lexical reranker on any
cross-encoder error, offline embedding stub when no backend is reachable);
server-side key handling and request hardening in the hosted proxy. See risk 7.

### Equity and inclusion
The interface and the RAG pipeline are multilingual (EN/RU/RO); there is a
dyslexia-friendly mode, full keyboard navigation, correct Romanian diacritics,
and the app runs in a phone browser rather than requiring a home PC. The project
exists specifically for minority-language learners facing a non-native-language
state exam, and it **measured and corrected** the Russian-query retrieval gap
rather than assuming parity (risk 3).
