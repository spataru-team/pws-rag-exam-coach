# Intel Xeon E5-2678 v3 — end-to-end benchmark protocol (v1, FROZEN)

**Frozen 2026-08-31, before any official run.** If a measured issue forces a
change, publish it as `protocol.md` **v2** with a changelog entry — never edit v1
after results exist. `workload.json` carries `protocolVersion` and is frozen with
this file.

## Purpose

Measure the **real production request path** running end to end against
OpenVINO Model Server (OVMS) on an Intel Xeon E5-2678 v3, under a realistic
classroom-scale grading workload. Extends the existing chat-only concurrency
benchmark (`docs/INTEL_OPENVINO.md` §"Concurrency benchmark") to the full
pipeline.

This validates infrastructure behaviour (latency, throughput, stability under
load), **not** student UX and **not** grading quality — grading quality is P1-4,
a separate track that does not gate or depend on this one.

## Path under test — production, unmodified

The harness imports and calls the same `src/` functions the app calls. No
evaluation-only pipeline is constructed.

```
answer (frozen synthetic set)
  → OVMS embedding   (/v3/embeddings, bge-m3 INT8)         [Xeon]
  → retrieval        (hybrid vector + BM25-lite + RRF)     [in process]
  → lexical rerank   (LexicalReranker — the production default)   [in process]
  → OVMS grading/generation  (/v3/chat/completions, ov-llm INT4)  [Xeon]
  → barem parse                                            [in process]
```

The cross-encoder reranker is **disabled in production** (Cyrillic regression —
`ovms/README.md`), so there is **no OVMS `/rerank` call**. Only embeddings and
grading touch the Xeon; retrieval and lexical rerank run in the harness process,
exactly as they do in the browser.

`short`-type items are graded deterministically in process (no model call), as in
production. `open` / `correctness` items go to OVMS. `correctness` is graded once
per attempt.

## Inputs

- **Workload:** `eval/fixtures/ro-synthetic-answers/answers.json` (frozen; 22
  cases, `ro-pr26` / `ro-sb26`, bands strong / partial / l2-errors / near-blank).
  Realistic exam prompt lengths (the real ANCE item prompts + reading text) and
  realistic answer lengths (≈0–1200 chars/item, see `manifest.json` per-case
  `totalChars`).
- **Packs:** must be seeded with `bge-m3` (not `deterministic-stub`). The harness
  refuses to run against stub-seeded packs.
- Teacher labels are **never** read. No `eval/agreement/` file is imported.

## Environment capture (recorded in `environment.json` for the official run)

- CPU model, core/thread count, base/boost clock, `lscpu` flags (AVX2 / AVX-512 /
  VNNI presence), total RAM.
- OS + kernel; container runtime + version.
- OVMS version, OpenVINO version, OpenVINO GenAI version, image digest.
- Model ids, quantization, served graph names, `target_device` from each
  `graph.pbtxt`.
- Repo **git SHA** (dirty flag), `workload.json` `protocolVersion`, harness
  content hash.
- LAN topology: load generator host (separate machine), link, one line.

## Procedure

1. **Readiness gate.** `GET /v2/health/ready` on OVMS returns ready; a single
   probe embedding + probe chat succeed.
2. **Warm-up.** 5 unmeasured end-to-end attempts (results discarded) to load
   graphs and fill caches. `warmup.measured = false` in `workload.json`.
3. **Concurrency sweep.** For each level *N* in `[1, 5, 10, 20]`: a semaphore
   holds exactly *N* end-to-end attempts in flight; the harness replays attempts
   from the frozen set (cycling if fewer than the level's request count), 3
   repeats per level (`perLevelRepeats`).
4. **Classroom segment.** One sustained run: 20 virtual students, 1 attempt each,
   Poisson-jittered start over a 90 s window, per-student inter-item think time
   uniform in `[0, 8] s`. Approximates a class submitting near the end of a
   lesson.
5. Between segments: 30 s idle.

## Timeouts and success criteria

| Stage | Timeout | On exceed |
|---|---|---|
| single OVMS embedding call | 30 s | record as `failure: embedding-timeout`, attempt marked failed, continue |
| single OVMS grading call | 120 s | record as `failure: grading-timeout`, item marked failed, attempt continues |
| whole end-to-end attempt | 300 s | record as `failure: attempt-timeout` |

- An attempt is a **success** iff every non-`short` item returned a parseable
  barem result within its timeout and the attempt total was computed.
- Transport errors (connection reset, 5xx from OVMS) are recorded verbatim, not
  retried.
- **Every failure and timeout is preserved** in the raw output — never dropped,
  never summarised away.

## Metrics reported

Per concurrency level and for the classroom segment, reported **separately** (not
collapsed):

- **Stage latency:** embedding call, retrieval+rerank (in process), grading call
  — p50 / p95 / max each.
- **End-to-end attempt latency:** p50 / p95 / max.
- **Throughput:** attempts/min; aggregate generated tok/s (total completion
  tokens ÷ segment wall-clock — not derived from any single request).
- **Counts:** attempts total / succeeded / failed, by failure kind.
- **Load context:** requested concurrency vs. observed in-flight.

## Raw result format

`eval/results/intel-xeon-e5-2678v3-e2e/`:

- `environment.json` — the capture above.
- `raw/level-01.jsonl` … `raw/level-20.jsonl`, `raw/classroom.jsonl` — one line
  per attempt: `{ caseId, level, startedAt, endedAt, success, failure?,
  items: [{ itemId, stage: {embedMs, retrieveMs, gradeMs}, tokensIn, tokensOut,
  parsed, failure? }] }`.
- `summary.md` / `summary.csv` — the metrics table.
- `README.md` — one-paragraph claim boundary (synthetic LAN load generator, not a
  physical 20-PC classroom; infrastructure feasibility, not UX).

## Claim discipline

The load is generated from **one separate LAN machine**. It is **not** a physical
20-PC classroom test and no students are involved. Report it as evidence that the
local OpenVINO / OVMS pipeline stays operational end to end under classroom-scale
concurrent grading load — an honest latency/throughput trade-off, not proof of
classroom experience.
