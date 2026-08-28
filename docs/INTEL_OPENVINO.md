# Intel OpenVINO Deployment

One canonical reference for how PWS RAG Exam Coach uses the Intel stack, and
exactly which parts have been run versus planned. Reproduction commands live in
[`ovms/README.md`](../ovms/README.md); this document is the summary and the
validation-status record.

## Why local inference

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

All of the following were run against a real OVMS 2026.3 container, not read from
documentation:

| What | Result |
|---|---|
| All three stages (embeddings, rerank, chat) respond correctly end-to-end | Functionally validated |
| INT8 `bge-m3` export vs. Ollama `bge-m3`, 10 ru/ro/en probes | Worst-case cosine **0.9995** (bar: 0.98) — `npm run verify:embeddings`. INT8 does not measurably hurt multilingual embedding quality. |
| Qwen3 chat latency with `chat_template_kwargs: {enable_thinking: false}` (applied only for the `openvino` provider kind) | Same Russian question: **12.2 s, cut off** → **6.3 s, complete answer** |
| `bge-reranker-v2-m3` cross-encoder on Cyrillic input | **Regression** — does not discriminate relevant from irrelevant on Russian queries (en/ro are correct). Two export-side hypotheses tested and rejected by experiment; a hosted alternative (`@cf/baai/bge-reranker-base`) tested and worse (1/5). Component **not shipped**. Full detail: `ovms/README.md` §"Known limitation". |

## Current hardware status

| Item | Status | Notes |
|---|---|---|
| OVMS end-to-end (all 3 stages) | **Functionally validated** | on **x86-64 CPU (AMD)** — the development machine, OVMS 2026.3, CPU plugin |
| INT8 embedding quality | **Measured** | 0.9995 cosine, 10 probes |
| Chat thinking-mode latency fix | **Measured** | 12.2 s → 6.3 s |
| Cross-encoder reranker on Cyrillic | **Measured — regression, not shipped** | see above |
| Run on an Intel CPU machine | **Not yet run** | An Intel CPU machine is available. The CPU graph is device-portable, so this is a "run it on the other box and record `FULL_DEVICE_NAME` + latency" task, not a re-export. |
| Run on Intel Arc GPU | **Not yet validated** | An Intel Arc laptop is available. Needs a `--target_device GPU` re-export and either native `ovms.exe` or Linux Docker (Docker Desktop on Windows cannot pass through Intel iGPU/NPU). |
| Intel NPU | **Not applicable** | No NPU on either available machine (verified via `Core().available_devices`). |
| Concurrent-classroom load test | **Not done** | No throughput or multi-client measurement has been performed. |

**We do not claim any Intel-hardware benchmark.** The software stack
(OpenVINO, OVMS, NNCF, `optimum-intel`) is Intel's regardless of CPU vendor, but a
latency figure "on Intel" requires running the graph on the Intel machine, which
has not been done yet.

## Reproduction

1. Prepare model graphs — `ovms/README.md` §1 (three `export_model.py` commands).
2. Run the server — `ovms/README.md` §2.
3. Seed packs through OVMS — `ovms/README.md` §3.
4. Verify the embedding space matches your packs —
   `npm run verify:embeddings` (`scripts/verify-embedding-space.ts`), bar is
   cosine ≥ 0.98.
5. Use it in the app — `ovms/README.md` §4.

## Limitations

- Hardware validated so far is **x86-64 CPU (AMD)**, not Intel-branded silicon.
- GPU / NPU paths need Linux Docker or a native Windows 11 `ovms.exe` build — not
  the current development machine.
- The cross-encoder reranker is disabled by default because of the Cyrillic
  regression above.
- No load, throughput, or concurrency testing has been done.

## Next validation step

In priority order (none of these have been performed; do not read them as claims):

1. Run the existing CPU graph on the Intel CPU machine; record
   `Core().get_property('CPU', 'FULL_DEVICE_NAME')` and a `/v3/embeddings` and
   `/v3/chat/completions` latency figure. This alone replaces the
   "AMD, not Intel" disclaimer.
2. Re-export `bge-m3` with `--target_device GPU` on the Arc laptop; compare
   latency against the CPU figure.
3. A concurrent-client load test (e.g. N simulated students) against a single
   OVMS instance, to characterise how many clients one school server supports.
