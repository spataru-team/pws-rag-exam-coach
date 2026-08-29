# Intel OpenVINO Deployment

One canonical reference for how PWS RAG Exam Coach uses the Intel stack, and
exactly which parts have been run versus planned. Reproduction commands live in
[`ovms/README.md`](../ovms/README.md); this document is the summary and the
validation-status record.

## Why local inference

This section describes an **optional deployment path** and its validation
status. The 2026 field deployment (the 112-student June cohort) **did not use
it** — students accessed the hosted browser/PWA application over the Internet;
access did not require the school LAN, and AI checking ran on a cloud LLM
through the application's API-backed proxy (see
[FIELD_DEPLOYMENT.md](./FIELD_DEPLOYMENT.md)). What follows is the local-path
rationale and what has been measured toward it.

The tool is for a state exam taken by students who may not have reliable internet
or a capable home PC, in schools that may not want student answers leaving the
building. A local inference path addresses all three:

- **Privacy** — student prompts and AI responses stay on the school network; they
  never reach a public cloud AI API. See [RESPONSIBLE_AI.md](./RESPONSIBLE_AI.md)
  risk 5.
- **Cost of access** — no per-request cloud LLM charge or quota; the recurring
  cost is the school's own hardware and electricity. (We do **not** publish a
  cost-per-student figure — none has been measured.)
- **CPU-first** — the models are quantized to run on an ordinary CPU; no GPU is
  required for the pipeline to work.

## Architecture

One OpenVINO Model Server container, one port, all three RAG stages, exposed
through OpenAI-/Cohere-compatible HTTP so the app needs no OVMS-specific code:

| Stage | Endpoint | Model name | App side |
|---|---|---|---|
| Embeddings | `POST /v3/embeddings` | `bge-m3` | `OpenAICompatibleEmbeddingProvider` (`resolveEmbeddingProvider('openai-compatible')`) |
| Rerank | `POST /v3/rerank` | `bge-reranker-v2-m3` | `CrossEncoderReranker` — **disabled by default**, see Limitations |
| Chat | `POST /v3/chat/completions` | `ov-llm` | chat provider preset `openvino` |

Settings offers a single toggle that switches the chat provider *and* the
embeddings backend together, so they cannot drift into a mismatched pair
(`isOvmsReachable()` probes `/v2/health/ready`).

## Models

| Role | Source | Format |
|---|---|---|
| Embeddings | `BAAI/bge-m3` (multilingual ru/ro/en, 1024-dim) | OpenVINO IR, INT8 weights, CLS pooling |
| Rerank | `BAAI/bge-reranker-v2-m3` | OpenVINO IR, INT8 weights |
| Chat | `OpenVINO/Qwen3-4B-int4-ov` (pre-converted IR) | INT4; the 8B variant is a drop-in `--source_model` swap |

## Conversion and quantization

`ovms/tools/export_model.py` is a pinned copy of OVMS's own export helper (one
patch: the upstream `huggingface-cli download` call is dead in current
`huggingface_hub`, replaced with `hf download`). It drives `optimum-cli export
openvino` / `optimum-intel` to produce OpenVINO IR, and `--weight-format int8`
applies **NNCF** INT8 weight compression (the export log confirms
`int8_asym, per-channel, 100%`). The target device is written into each model's
`graph.pbtxt` at export time — it is not a server flag — so a GPU or NPU build
means re-running the export with `--target_device GPU` / `NPU`.

Full commands: [`ovms/README.md`](../ovms/README.md) §1.

## OVMS serving

```bash
docker compose -f ovms/docker-compose.yml up -d
curl http://localhost:8000/v2/health/ready
```

`ovms/models/config.json` must be exactly `{"model_config_list": [ ... ]}` — the
OVMS schema is `additionalProperties: false`, so even a stray comment key makes
the whole config invalid. Seeding packs through OVMS: `ovms/README.md` §3.

## Validation performed

All of the following were run against a real OVMS container, not read from
documentation. Unless a row says "Xeon", it was measured on the AMD x86-64
development machine.

| What | Result |
|---|---|
| All three stages (embeddings, rerank, chat) respond correctly end-to-end | Functionally validated (AMD dev machine, OVMS 2026.3) |
| INT8 `bge-m3` export vs. Ollama `bge-m3`, 10 ru/ro/en probes | Worst-case cosine **0.9995** (bar: 0.98) — `npm run verify:embeddings`. INT8 does not measurably hurt multilingual embedding quality. |
| Qwen3 chat latency with `chat_template_kwargs: {enable_thinking: false}` (applied only for the `openvino` provider kind) | Same Russian question, single request: **12.2 s, cut off** → **6.3 s, complete answer**. Separate from the fixed-30-token concurrency benchmark below — different prompt, different output length, different machine. |
| `bge-reranker-v2-m3` cross-encoder on Cyrillic input | **Regression** — does not discriminate relevant from irrelevant on Russian queries (en/ro are correct). Two export-side hypotheses tested and rejected by experiment; a hosted alternative (`@cf/baai/bge-reranker-base`) tested and worse (1/5). Component **not shipped**. Full detail: `ovms/README.md` §"Known limitation". |
| **Chat serving on an Intel Xeon E5-2678 v3 (CPU), synthetic concurrency 1 → 20** | **185 requests, 100% success, 0 timeouts.** Full results and method: [§Concurrency benchmark](#concurrency-benchmark-intel-xeon-e5-2678-v3) below. |

## Current hardware status

| Item | Status | Notes |
|---|---|---|
| OVMS end-to-end (all 3 stages) | **Functionally validated** | on **x86-64 CPU (AMD)** — the development machine, OVMS 2026.3, CPU plugin |
| Chat serving on an **Intel Xeon E5-2678 v3 (CPU)** | **Measured** | 185 requests over a 1 → 20 concurrency sweep, 100% success — [§Concurrency benchmark](#concurrency-benchmark-intel-xeon-e5-2678-v3) |
| INT8 embedding quality | **Measured** (AMD) | 0.9995 cosine, 10 probes |
| Chat thinking-mode latency fix | **Measured** (AMD, single request) | 12.2 s → 6.3 s |
| Cross-encoder reranker on Cyrillic | **Measured — regression, not shipped** | see above |
| Embeddings / reranker throughput on the Xeon | **Not measured** | the concurrency benchmark was chat-only |
| Run on Intel Arc GPU | **Not yet validated** | An Intel Arc laptop is available. Needs a `--target_device GPU` re-export and either native `ovms.exe` or Linux Docker (Docker Desktop on Windows cannot pass through Intel iGPU/NPU). |
| Intel NPU | **Not applicable** | No NPU on the available machines (verified via `Core().available_devices`). |
| Physical multi-PC classroom trial | **Not done** | the concurrency numbers are synthetic — one load generator, not real devices or students |

The concurrency benchmark below is the one measurement taken on Intel silicon.
The embedding-quality and thinking-mode figures were taken on an AMD CPU; the
software stack (OpenVINO, OVMS, NNCF, `optimum-intel`) is Intel's regardless of
CPU vendor.

## Concurrency benchmark (Intel Xeon E5-2678 v3)

### Why it was run

The strongest claim for the local path is that a school can run it on hardware it
already has. A physical load test — 20 classroom PCs hitting one server at once —
could not be scheduled before the submission deadline. This synthetic benchmark is
the stand-in: it approximates the server-side concurrent request pressure expected
from a class, from a single machine, and characterises where latency and
throughput go as that pressure rises. It validates **infrastructure
scalability**, not student UX.

### Topology

```
separate Ryzen PC  ──(HTTP, local LAN)──►  Intel Xeon E5-2678 v3
(synthetic load generator)                 OVMS inference only, CPU
                                           POST /v3/chat/completions
```

The Xeon ran OVMS and nothing else during the test. The load generator only sent
requests, so its own CPU cost never competed with inference.

### What was measured

- **Server:** Intel Xeon E5-2678 v3 — a 2014 Haswell-EP part with AVX2 but
  without AVX-512 or VNNI available on newer server CPUs.
- **OVMS:** `2026.3.0.6f3df706b`; **OpenVINO:** `2026.3.0-22451`; **OpenVINO
  GenAI:** `2026.3.0.0-3277`; image `openvino/model_server:latest`.
- **Model:** `OpenVINO/Qwen3-4B-int4-ov` (INT4, pre-converted IR). It was served
  under the name **`qwen-test`** on that machine's OVMS config; the repo's
  `ovms/models/config.json` names the same model `ov-llm`. Same model, different
  local alias — no application config was changed for the test.
- **Request:** identical every time — one short neutral prompt, `max_tokens = 30`
  (every response hit the cap → identical generated length), `temperature = 0`,
  `chat_template_kwargs: {enable_thinking: false}` (production-path parity).
- **Per level:** 3 unmeasured warmup requests, then the measured requests, with a
  semaphore holding exactly *N* requests in flight.

### Results

| Concurrency | Measured requests | Success | p50 latency | p95 latency | Max latency | Requests/s | Aggregate gen tok/s (end-to-end) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1  | 10  | 10 / 10   | 1.4337 s | 1.8596 s | 1.8596 s  | 0.683  | 20.4894 |
| 5  | 25  | 25 / 25   | 3.4680 s | 4.9355 s | 5.0103 s  | 1.3493 | 40.4799 |
| 10 | 50  | 50 / 50   | 4.5340 s | 5.3377 s | 5.3382 s  | 2.1532 | 64.5963 |
| 20 | 100 | 100 / 100 | 5.9118 s | 11.5369 s | 11.5520 s | 2.5773 | 77.3193 |

- **Zero failures and zero timeouts at every level**, including concurrency 20
  (100 / 100).
- Single-request baseline: **~1.43 s median** for the fixed 30-token response.
- Aggregate end-to-end generation throughput rises **~20.5 → ~77.3 tokens/s** as
  concurrency goes 1 → 20.
- Latency rises with load, as expected: **p50 ~5.9 s, p95 ~11.5 s at concurrency
  20**. This is an honest capacity/latency trade-off — a 20-client burst is
  served without dropping requests, but each client waits longer.
- `aggregate gen tok/s` is total generated tokens across a level ÷ that level's
  wall-clock time. It is **not** derived from any single request's HTTP latency.

### Claim boundary

This is a **synthetic concurrency benchmark**, generated from one separate LAN
computer against the real Xeon OVMS server. It is **not** a physical 20-PC
classroom test, no students were involved, and it says nothing about the
application's UX under that load. It demonstrates that the local OpenVINO / OVMS
pipeline stays operational under classroom-scale concurrent request load on a
decade-old CPU without AI-specific acceleration — technical feasibility for shared
local inference, not proof of classroom experience.

### Raw evidence

- Summary: [`eval/results/intel-xeon-e5-2678v3-concurrency/summary.md`](../eval/results/intel-xeon-e5-2678v3-concurrency/summary.md) · [`summary.csv`](../eval/results/intel-xeon-e5-2678v3-concurrency/summary.csv)
- Environment: [`environment.json`](../eval/results/intel-xeon-e5-2678v3-concurrency/environment.json)
- Per-request records: `concurrency-01.json` … `concurrency-20.json` in the same directory
- Harness: `scripts/benchmark_ovms_concurrency.py`, runner `scripts/run_xeon_concurrency_benchmark.ps1`

## Reproduction

1. Prepare model graphs — `ovms/README.md` §1 (three `export_model.py` commands).
2. Run the server — `ovms/README.md` §2.
3. Seed packs through OVMS — `ovms/README.md` §3.
4. Verify the embedding space matches your packs —
   `npm run verify:embeddings` (`scripts/verify-embedding-space.ts`), bar is
   cosine ≥ 0.98.
5. Use it in the app — `ovms/README.md` §4.

## Limitations

- **Chat serving** is now measured on an Intel Xeon E5-2678 v3 (CPU); the
  **embedding-quality** and **thinking-mode** figures were measured on an AMD CPU.
- The concurrency benchmark is **synthetic** (one load generator) and **chat-only**
  — no physical multi-PC classroom trial, and no embeddings/reranker throughput
  measurement on the Xeon.
- GPU / NPU paths need Linux Docker or a native Windows 11 `ovms.exe` build.
- The cross-encoder reranker is disabled by default because of the Cyrillic
  regression above.

## Next validation step

In priority order (none of these have been performed; do not read them as claims):

1. A **physical multi-PC classroom trial** — real devices, real students — for
   which the synthetic concurrency benchmark is the current stand-in.
2. Embeddings + reranker throughput on the Xeon under the same concurrency sweep
   (this run was chat-only).
3. Re-export `bge-m3` with `--target_device GPU` on the Arc laptop; compare
   latency and throughput against the Xeon CPU figures.
