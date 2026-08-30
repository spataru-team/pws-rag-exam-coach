# Evaluation

This document defines the metrics used to evaluate the app and describes the
evaluation harness.

## Metric families

### Learning metrics
- **Mastery growth** — change in `TopicMastery.masteryScore` over time.
- **Accuracy / confidence** — rolling EMAs per topic.
- **Retention** — performance on spaced-repetition reviews vs first attempts.
- **Streak / consistency** — study days without punishing missed days.
- **Weak-topic recovery** — mistakes later answered correctly (the "comeback").

### Subject-level metrics
- **Readiness** — exam-relevance-weighted mastery (`readinessEstimate`).
- **Coverage** — practised topics ÷ total exam-relevant topics.
- **Per-subject XP / level.**

### Retrieval metrics
- **Recall@k** — share of expected chunks retrieved in the top-K (k = 1/3/5).
- **MRR** — mean reciprocal rank of the first expected chunk (ordering quality).
- **Top-1 similarity** — strength of the best match.
- **Subject isolation** — retrieval never returns other subjects' chunks
  (unit-tested in `rag/retrieve.test.ts`).
- **Refusal accuracy** — share of off-topic (`expectInsufficient`) items correctly
  flagged. Measured **0.80 (4/5, n = 5)** in `auto`/`bge-m3` mode. The `auto`
  entry in `eval/thresholds.json` (0.75) is a **reference threshold only** — no
  `package.json` script or CI step runs `eval` with `--gate --mode=auto`, so it
  is never enforced. See the `DEFAULT_MIN_SIMILARITY` note in
  `docs/ARCHITECTURE.md` for how the similarity threshold is chosen and why it
  needs recalibrating per embedding model. **Not** gated for `deterministic`
  mode either: the offline stub has no real semantic discrimination (its
  off-topic and on-topic similarity ranges fully overlap), so its
  refusalAccuracy is not a meaningful signal. The deterministic
  `npm run eval:safety` benchmark (below) characterizes both refusal and
  citation-integrity behaviour without gating on it.
- **byLang breakdown** — every golden item now declares `lang: 'ru'|'ro'|'en'`
  (the *query's* language, not the corpus's), and `runEvalHarness` reports
  recall@5/MRR/avgTopSimilarity per language. This is the number that actually
  proves (or disproves) a fix for the ru-query-vs-ro-corpus failure mode — see
  "Cross-lingual coverage" below.

### Hybrid retrieval + reranker + query expansion
The default pipeline is **hybrid** (vector cosine + BM25-lite lexical, fused via
Reciprocal Rank Fusion) followed by a **conservative lexical reranker**
(`src/rag/lexical.ts`, `src/rag/rerank.ts`). The reranker keeps the first-stage
order as a strong prior and only promotes on clear lexical evidence (term
coverage / exact phrase), so a strong vector hit is never demoted. Before the
BM25 pass, a cross-language glossary built from every subject's own topic
titles (`src/rag/queryExpansion.ts`) expands the lexical-only query text — a
Russian query gets a chance at literal term overlap with a Romanian chunk,
without touching the (already multilingual) vector branch. A network-backed
`CrossEncoderReranker` also exists (`src/rag/crossEncoderReranker.ts`) but is
not the default — see `ovms/README.md`'s "Known limitation". Pure vector,
hybrid-only, and hybrid+rerank can be compared with `npm run eval:sweep`.

### Generation metrics
- **Groundedness** — share of cited chunk ids actually present in context
  (`tutorService`). A correct refusal scores 1.
- **Format compliance** — answer cites `[#id]` or correctly refuses.
- **Citation validity** — cited ids ⊆ retrieved ids.

### Model-performance metrics (Model Lab + Stats screen)
- **Latency** — average plus **p50 / p95 percentiles** (overall and per
  provider/model), shown on the Stats screen (`src/stats/metrics.ts`).
- **Tokens in/out**, **estimated cost**.
- **Groundedness**, **format compliance**, **user rating**, optional
  **teacher rating** — all captured in `ModelRunMetrics`.

### Accessibility metrics
- Keyboard navigability of all interactive controls.
- Visible focus indicators; information never conveyed by colour alone.
- Dyslexia mode increases line height, letter/word/paragraph spacing, font size.
- Correct rendering of Romanian diacritics (ă, â, î, ș, ț).
- Interface available in EN/RU/RO.

### Privacy / security metrics
- No personal name fields in the export (validated in `export/schema.ts`).
- No API keys in source or git; keys only in local IndexedDB.
- Cloud provider use shows an explicit warning before sending data.
- Export is explicit and user-triggered.

## Harness

`eval/harness.ts` is the shared core (used by both commands below). It loads the
golden sets in `eval/golden/`, runs subject-filtered retrieval against the packs,
and computes recall@1/3/5, MRR, avg top similarity and refusal accuracy, writing
a timestamped JSON report to `eval/results/`.

- All seven subjects have real golden items (`romanian` 16, `english` 8,
  `chemistry`/`math` 7 each, `russian` 6, `biology`/`history` 6 each — 56
  total), including one `expectInsufficient` off-topic item in each of 5 of the 7
  subjects (`romanian`, `biology`, `chemistry`, `math`, `russian`; `english` and
  `history` have none) and Russian-language cross-lingual items for
  `romanian`/`english`.
- Each item declares `expectedSubjectId`, `expectedTopicId`, `expectedChunkIds`,
  and optionally `expectedAnswerRubricId` / `expectInsufficient`.

Commands:
- **`npm run eval`** — auto mode: uses each pack's embedding model (real
  `bge-m3` via Ollama when present). Report only.
- **`npm run eval:sweep`** — sweeps topK × minSimilarity × {hybrid} × {rerank}
  and prints the best configs; used to pick the tuned defaults in
  `src/rag/retrieve.ts`.
- **`npm run eval:ci`** — **deterministic** mode (`--mode=deterministic`): re-embeds
  chunk text and queries with the offline stub, so the run is fully reproducible
  without Ollama, and **gates** (`--gate`) against `eval/thresholds.json`.

### CI gating
The CI workflow runs `npm run eval:ci` after the unit tests. The deterministic
gate catches *pipeline and data* regressions — a broken subject filter, ranking
bug, hybrid/rerank regression, or a golden item referencing a missing chunk —
reproducibly and offline. Thresholds (recall@5, MRR) live in
`eval/thresholds.json` with margin below measured values. Real semantic quality
is measured locally with `npm run eval` (Ollama up).

> Note: deterministic-mode scores reflect the lexical/stub pipeline, not real
> semantics. Run `ollama pull bge-m3` + `npm run seed`, then
> `npm run eval`, for realistic semantic numbers.

### Safety characterization benchmark (`npm run eval:safety`)
A separate deterministic, offline benchmark (`eval/safety/`) that **characterizes**
the reproducible public-fallback path for refusal and citation integrity.
**Report only** — no thresholds file, no `--gate`, no CI wiring. Its unit tests
run in `npm test`; the benchmark run is manual. `contentHash` over the
deterministic payload is stable across runs.

- **Subset B — citation integrity (13 synthetic fixtures).** The extracted
  `src/services/citationCheck.ts` pipeline (shared verbatim with `tutorService`)
  run over fixtures that each carry one pathology — fabricated markers, the
  partial-grounding fold boundary (`groundednessScore < 0.5`, strict), malformed
  markers, and controls. Every field is asserted exactly. The fixture set holds
  **29 `[#id]` markers, 15 of them deliberately fabricated**; the checker
  **caught and stripped all 15**, leaving **0 invalid markers** in the sanitized
  answers. Per-fixture mean ratios (`rawCitationValidity` etc.) are also reported
  but are a **fixture-composition diagnostic** — their value depends on how many
  fabricated markers the fixtures carry, not on system behaviour.

- **Subset A — refusal (14 synthetic cases).** Real `retrieveRelevantChunks` in
  deterministic mode against the public-fallback packs, which are embedded with a
  lightweight **hash-embedding stub**. Each case carries a **human-authored
  `shouldRefuse` label** — what a correct system ought to do, set independently of
  current behaviour — across clean and informal / L2-style (no-diacritics)
  student phrasing. The measured `insufficient` verdict is classified
  `correct` / `under-refusal` / `over-refusal` and reported with refusal
  recall / precision / F1 and an over-refusal rate.

  `DEFAULT_MIN_SIMILARITY` (0.42) is calibrated for `bge-m3`, **not** for the
  stub, so these numbers **characterize the boundary of the judge-demo fallback
  path — they are not a production semantic-refusal score**. A `shouldRefuse`
  mismatch here is a recorded scope-boundary finding, not a failure. Production
  semantic-refusal quality is evaluated separately on `bge-m3` (see the refusal
  accuracy metric above; deeper claim/faithfulness work is P1-1b).

  A companion over-refusal figure over the 34 on-topic golden items a clean
  public clone can evaluate (`romanian` 15 + `english` 8 + `biology` 5 +
  `history` 6) is reported alongside — **deterministic stub path, not a
  production figure** — and tracks the same `bge-m3`-vs-stub scale gap the
  deterministic `eval:ci` note above describes.

Cross-language refusal, claim-level faithfulness, and any gate decision are
explicitly out of scope for this benchmark.

### Cross-lingual coverage
Every golden item carries `lang` (the query's language) — not just the `*-ru`
id suffix convention some items also use — and `runEvalHarness` reports a
`byLang` breakdown of recall@5/MRR/avgTopSimilarity for `ru`/`ro`/`en`
(`npm run eval` / `npm run eval:ci` print one line per language). This is the
number that motivated and then measured the `bge-m3` migration and everything
built on top of it:

| stage | ru recall@5 | ru MRR | overall recall@5 | overall MRR | refusalAcc |
|---|---|---|---|---|---|
| nomic-embed-text@768 (pre-migration) | 0.625 | 0.358 | — | — | — |
| bge-m3@1024 (migration only) | 0.905 | 0.811 | 0.948 | 0.886 | 0.0 (broken — see below) |
| + fixed insufficient-gate scoping + recalibrated threshold | 0.905 | 0.811 | 0.948 | 0.886 | 0.8 |
| + cross-language query expansion | **0.940** | **0.829** | **0.967** | **0.896** | 0.8 |

The refusalAccuracy column tells its own story: after the bge-m3 migration it
measured **0.0** — `DEFAULT_MIN_SIMILARITY` was still tuned for nomic's lower
cosine baseline, and a second bug (the gate scanning a wider candidate pool
than the results actually returned) meant it stayed broken even after
retuning the number in isolation. Both are fixed in `src/rag/retrieve.ts`; see
the inline comments there for the exact measured before/after.
