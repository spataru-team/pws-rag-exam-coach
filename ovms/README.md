# OpenVINO Model Server (OVMS) for PWS RAG Exam Coach

Local inference on an Intel software stack. One server, one port, all three RAG
stages behind an OpenAI-/Cohere-compatible API — the app talks to it with no
bespoke code:

- **Embeddings** → `OpenAICompatibleEmbeddingProvider` (`POST /v3/embeddings`, model `bge-m3`).
- **Chat** → provider preset `openvino` (`POST /v3/chat/completions`, model `ov-llm`).
- **Rerank** → `CrossEncoderReranker` (`POST /v3/rerank`, model `bge-reranker-v2-m3`) —
  **experimental, not used in production**, see [Rejected experiments](#rejected-experiments).

> OVMS does **not** auto-download models (unlike Ollama). You prepare model graphs
> once into `./models`, then run the server.

## Hardware used for the tests below

Everything in this document was verified against a **real OVMS 2026.3 container**,
not read from docs. The machine was **x86-64 CPU, CPU plugin — an AMD processor**
(the development machine). An Intel CPU machine and an Intel laptop with an Arc
GPU are available but OVMS has **not** yet been re-run on them; see
[`docs/INTEL_OPENVINO.md`](../docs/INTEL_OPENVINO.md) for the full hardware-status
table. The OpenVINO / OVMS / NNCF / `optimum-intel` stack is Intel's regardless of
CPU vendor, but no Intel-hardware latency figure is claimed here.

---

## Production path

### Models

| Role | Source | Format |
|---|---|---|
| Embeddings | `BAAI/bge-m3` (multilingual ru/ro/en, 1024-dim) | OpenVINO IR, INT8 weights, CLS pooling |
| Chat | `OpenVINO/Qwen3-4B-int4-ov` (pre-converted IR) | INT4; `OpenVINO/Qwen3-8B-int4-ov` is a drop-in `--source_model` swap if the machine has headroom |

### 1. Prepare model graphs

`ovms/tools/` holds a pinned copy of OVMS's own `export_model.py` helper (from
`openvinotoolkit/model_server`) plus a trimmed `requirements-export.txt` (drops
the diffusers/kokoro/datasets extras this project's export paths don't use).
One-time setup:

```bash
cd ovms/tools
python -m venv .venv
# Windows:
.venv\Scripts\python -m pip install -r requirements-export.txt
# then put .venv/Scripts (or .venv/bin) on PATH so `optimum-cli`/`hf` resolve —
# `export_model.py` shells out to them.
```

```bash
cd ovms/tools

# Embeddings — bge-m3, 1024-dim, multilingual. Must match the pack's recorded
# embeddingDim; see docs/ARCHITECTURE.md §RAG for why the model (not just the
# dimension) has to match what seeded the pack. CLS pooling is bge-m3's own
# convention for the dense-vector output. --weight-format int8 applies NNCF INT8
# weight compression (export log: "int8_asym, per-channel, 100%").
python export_model.py embeddings_ov \
  --source_model BAAI/bge-m3 --model_name bge-m3 --pooling CLS \
  --weight-format int8 --model_repository_path ../models \
  --config_file_path ../models/config.json --target_device CPU

# Chat — a pre-converted OpenVINO IR, no local conversion needed. 4B/int4 keeps
# latency reasonable on CPU.
python export_model.py text_generation \
  --source_model OpenVINO/Qwen3-4B-int4-ov --model_name ov-llm \
  --model_repository_path ../models --config_file_path ../models/config.json \
  --target_device CPU
```

Target device is baked into each graph at *export* time (`graph.pbtxt`'s
`target_device`), not a server flag — a GPU/NPU build means re-running the export
with `--target_device GPU` / `NPU` (see [Experiments](#experiments)).

### 2. Run

```bash
docker compose -f ovms/docker-compose.yml up -d
curl http://localhost:8000/v2/health/ready          # readiness
```

### 3. Seed packs with OVMS embeddings

```bash
# bash / CI
EMBED_MODE=openai-compatible \
EMBED_BASE_URL=http://localhost:8000/v3 \
EMBED_MODEL=bge-m3 \
npm run seed

# PowerShell
$env:EMBED_MODE='openai-compatible'; $env:EMBED_BASE_URL='http://localhost:8000/v3'
$env:EMBED_MODEL='bge-m3'; npm run seed
```

The pack records `embeddingModel: "bge-m3"` and `embeddingDim: 1024`. **Query and
chunk vectors must come from the same model** — not just the same dimension — so
embed queries at runtime with the same OVMS endpoint. Before trusting an
OVMS-seeded pack against a different runtime backend (or vice versa), run
`npm run verify:embeddings` (`scripts/verify-embedding-space.ts`): it requires
cosine ≥ 0.98 on a fixed ru/ro/en probe set.

### 4. Use in the app

- Settings → **"Использовать локальный OpenVINO (OVMS)"** (shown once
  `isOvmsReachable()` detects `/v2/health/ready`) sets the chat provider AND the
  embeddings backend together, so they can't drift into a broken combination.
- Manually: chat provider **OpenVINO (local, OVMS)** (model `ov-llm`); embeddings
  backend **OpenVINO / OpenAI-compatible**, base URL `http://localhost:8000/v3`.

### Measured results (production path)

| Test | Result | How |
|---|---|---|
| INT8 `bge-m3` export vs. Ollama `bge-m3` | worst-case cosine **0.9995** over 10 ru/ro/en probes (bar: 0.98) | `npm run verify:embeddings` |
| Qwen3 chat latency, same Russian question, with `chat_template_kwargs: {enable_thinking: false}` (adapter sends this only for the `openvino` provider kind) | **12.2 s / cut off mid-answer** (`finish_reason: length`, budget spent on `<think>…</think>`) → **6.3 s / complete answer** (`finish_reason: stop`) | curl to `/v3/chat/completions`, wall-clock |

INT8 quantization does not measurably hurt this model's multilingual embedding
quality.

### Setup gotchas

- **`export_model.py` HF download.** The upstream script calls
  `huggingface-cli download` for pre-converted `OpenVINO/*` models; current
  `huggingface_hub` removed that command. The vendored copy is patched to call
  `hf download`.
- **`models/config.json` must be exactly `{"model_config_list": [...]}`.** OVMS's
  JSON-schema validator is `additionalProperties: false` at the top level — a
  stray `_comment` key makes the *whole* config rejected. Put explanations here
  instead.
- **Git Bash on Windows.** `docker` with `--config_path /workspace/config.json`
  gets mangled by MSYS path translation. Prefix with `MSYS_NO_PATHCONV=1`.

---

## Experiments

### GPU / NPU serving — not yet run

- Re-run the exports above with `--target_device GPU` or `--target_device NPU`,
  then uncomment the `devices:` passthrough in `docker-compose.yml`.
- **Docker Desktop on Windows cannot pass through an Intel iGPU/NPU** — that needs
  Linux Docker or the native `ovms.exe` Windows 11 binary (not this machine's
  Windows 10).
- No Intel NPU is present on the available hardware (verified via
  `Core().available_devices`).

---

## Rejected experiments

### Cross-encoder reranker — EXPERIMENTAL, NOT USED IN PRODUCTION

`CrossEncoderReranker` (`src/rag/crossEncoderReranker.ts`) and `selectReranker()`
(`src/rag/rerankRuntime.ts`) are implemented and unit-tested, but **deliberately
not wired into `src/services/ragService.ts`**. The default reranker is the
deterministic offline `LexicalReranker`.

Export command (kept for reproducibility; do **not** run it for the production
path above):

```bash
cd ovms/tools
python export_model.py rerank_ov \
  --source_model BAAI/bge-reranker-v2-m3 --model_name bge-reranker-v2-m3 \
  --weight-format int8 --model_repository_path ../models \
  --config_file_path ../models/config.json --target_device CPU
```

**Why it is disabled** — measured against this OVMS export of
`bge-reranker-v2-m3`:

| query language | relevant doc score | irrelevant doc score | correct? |
|---|---|---|---|
| en | 0.9995 | 0.000016 | ✅ |
| ro | 0.9997 | 0.000016 | ✅ |
| ru | 0.97–0.99 | 0.97–0.99 (sometimes *higher*) | ❌ |

Romanian (Latin script, diacritics) works; Russian (Cyrillic) does not
discriminate at all. Confirmed **not** a quantization artifact (re-exported at
`--weight-format fp16`, same result). `bge-m3`'s own embeddings export (same
XLM-RoBERTa-large backbone) handles Cyrillic correctly — see the 0.9995 cosine
figure above — so the fault is isolated to `rerank_ov`'s tokenizer conversion,
not `bge-m3`, not quantization, not this app's code. Shipping it as the silent
default would regress the exact ru-language case the `bge-m3` migration fixed.

**Follow-up attempts (24.08.2026) — both tested against a live re-export, neither
fixes it:**

1. *Tokenizer-conversion hypotheses.* `export_rerank_tokenizer` converts with
   `add_special_tokens=False` (unlike the embeddings path) — re-exported with
   `add_special_tokens=True`. Separately, `--max_doc_length` defaults to 16000 —
   re-exported with `--max_doc_length 512`. Neither changed the ru result at all;
   the relevant/irrelevant pair came back **byte-for-byte identical**
   (0.9812 / 0.9765) between exports. Rules both out as the cause.
2. *Hosted alternative — `@cf/baai/bge-reranker-base` via the Cloudflare proxy's
   `/rerank` route.* First live test surfaced an unrelated real bug (Workers AI
   returns `{id, score}`, not the assumed `{index, score}` — every call 502'd;
   fixed in `src/server/openaiProxy.ts` with a regression test). Once working, 5
   ru relevant/irrelevant probe pairs scored correctly on only **1 of 5**; the
   other 4 ranked the *irrelevant* document higher, several scores repeated
   identically across unrelated queries (near-degenerate output). Worse than
   doing nothing — the `LexicalReranker` default never inverts the ranking.

**Current recommendation:** leave the cross-encoder disabled by default on both
backends. `src/services/ragService.ts` is unchanged. The Workers AI
response-shape fix is real and kept (correct for en/ro, and for any future model
swap), independent of this decision.

**Before re-enabling:** re-run the battery above against a fresh export (a future
OVMS / `optimum-intel` release may fix the tokenizer conversion).

---

## Known limitations

- **Hardware.** Everything here is measured on x86-64 CPU (AMD). No Intel-hardware
  or GPU/NPU figure exists yet — see
  [`docs/INTEL_OPENVINO.md`](../docs/INTEL_OPENVINO.md) §"Current hardware status".
- **GPU / NPU** paths need Linux Docker or a native Windows 11 `ovms.exe`.
- **Cross-encoder reranker** is disabled by default (Cyrillic regression above).
- **No load / throughput / concurrency testing** has been done.
