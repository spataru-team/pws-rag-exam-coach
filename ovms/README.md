# OpenVINO Model Server (OVMS) for PWS RAG Exam Coach

Optimized local inference on Intel CPU/GPU/NPU. One server, one port, all three
RAG stages, OpenAI/Cohere-compatible — the app talks to it with no bespoke code:

- **Embeddings** → `OpenAICompatibleEmbeddingProvider` (`POST /v3/embeddings`, model `bge-m3`).
- **Rerank** → `CrossEncoderReranker` (`POST /v3/rerank`, model `bge-reranker-v2-m3`) —
  see the **known limitation** below before enabling this in the app.
- **Chat** → provider preset `openvino` (`POST /v3/chat/completions`, model `ov-llm`).

> Unlike Ollama, OVMS does **not** auto-download models. You prepare model graphs
> once into `./models`, then run the server. Everything below is verified end to
> end against a real OVMS 2026.3 container on this machine (AMD x86-64, CPU
> plugin) — not just read from docs.

## 1. Prepare model graphs

`ovms/tools/` holds a pinned copy of OVMS's own `export_model.py` helper (from
`openvinotoolkit/model_server`) plus a trimmed `requirements-export.txt` (drops
the diffusers/kokoro/datasets extras the image-gen and TTS export paths need,
which this project doesn't use). One-time setup:

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
# convention for the dense-vector output.
python export_model.py embeddings_ov \
  --source_model BAAI/bge-m3 --model_name bge-m3 --pooling CLS \
  --weight-format int8 --model_repository_path ../models \
  --config_file_path ../models/config.json --target_device CPU

# Reranker — bge-reranker-v2-m3 (multilingual, same family as bge-m3).
# ⚠️ See "Known limitation" below before wiring this into the app.
python export_model.py rerank_ov \
  --source_model BAAI/bge-reranker-v2-m3 --model_name bge-reranker-v2-m3 \
  --weight-format int8 --model_repository_path ../models \
  --config_file_path ../models/config.json --target_device CPU

# Chat — a pre-converted OpenVINO IR, no local conversion needed. 4B/int4 keeps
# latency reasonable on CPU; the plan's original 8B pick (OpenVINO/Qwen3-8B-int4-ov)
# is a drop-in swap (same --source_model, same --model_name) if the demo
# machine has the headroom and wants a stronger model.
python export_model.py text_generation \
  --source_model OpenVINO/Qwen3-4B-int4-ov --model_name ov-llm \
  --model_repository_path ../models --config_file_path ../models/config.json \
  --target_device CPU
```

**GPU/NPU on the competition machine:** target device is baked into each
graph at *export* time (`graph.pbtxt`'s `target_device` field), not a server
flag — re-run the exports above with `--target_device GPU` or `--target_device NPU`,
then uncomment the `devices:` passthrough in `docker-compose.yml`. Docker Desktop
on Windows can't pass through Intel iGPU/NPU either way; that needs Linux Docker
or the native `ovms.exe` binary (Windows 11 release, not this machine's Windows 10).

**Gotcha (already patched in the vendored `export_model.py`):** the upstream
script still calls `huggingface-cli download` for pre-converted `OpenVINO/*`
models; current `huggingface_hub` removed that command (it now just prints a
deprecation notice and exits nonzero). Patched to call `hf download` instead.

**Gotcha (fixed in `models/config.json`):** OVMS's JSON-schema validator has
`additionalProperties: false` at the top level — a stray `_comment` key (handy
for a hand-authored file, invalid for OVMS) makes the *whole* config rejected
with `Configuration file is not in valid configuration format`, so keep this
file to exactly `{"model_config_list": [...]}` and put explanations here instead.

**Gotcha (Git Bash on Windows):** `docker run`/`docker compose` with
`--config_path /workspace/config.json` gets mangled by MSYS's automatic
POSIX-path translation into `C:/Program Files/Git/workspace/config.json`.
Prefix with `MSYS_NO_PATHCONV=1` when running `docker` from Git Bash.

## 2. Run

```bash
docker compose -f ovms/docker-compose.yml up -d
curl http://localhost:8000/v2/health/ready          # readiness
```

## 3. Seed packs with OVMS embeddings

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
chunk vectors must come from the same model** — not just the same dimension —
so embed queries at runtime with the same OVMS endpoint. Before trusting an
OVMS-seeded pack against a different runtime backend (or vice versa), run
`npm run verify:embeddings` (`scripts/verify-embedding-space.ts`) to confirm the
two agree closely enough (cosine ≥ 0.98) to share one pack.

**Measured:** Ollama's `bge-m3` vs this OVMS int8 export — worst cosine **0.9995**
across 10 ru/ro/en probes (well past the 0.98 bar). The int8 quantization does not
measurably hurt this model's multilingual embedding quality.

## 4. Use in the app

- Settings → **"Использовать локальный OpenVINO (OVMS)"** (shown once
  `isOvmsReachable()` detects `/v2/health/ready`) sets the chat provider AND the
  embeddings backend together, so they can't drift into a broken combination.
- Manually: chat provider **OpenVINO (local, OVMS)** (model `ov-llm`, matching
  `config.json`); embeddings backend **OpenVINO / OpenAI-compatible**, base URL
  `http://localhost:8000/v3` (model name comes from the downloaded pack).
- Qwen3's chat template defaults to an internal "thinking" pass — the adapter
  sends `chat_template_kwargs: {enable_thinking: false}` for the `openvino`
  provider kind specifically (see `src/llm/adapters/openaiCompatible.ts`).
  Measured effect on the same Russian question: 12.2s / cut off mid-answer
  (`finish_reason: length`, budget spent on `<think>…</think>`) →
  6.3s / complete answer (`finish_reason: stop`).

## Known limitation: cross-encoder reranker is unreliable for Cyrillic

`CrossEncoderReranker` (`src/rag/crossEncoderReranker.ts`) and `selectReranker()`
(`src/rag/rerankRuntime.ts`) are implemented and unit-tested, but **deliberately
not wired into `ragService.ts`** — measured against this OVMS export of
`bge-reranker-v2-m3`:

| query language | relevant doc score | irrelevant doc score | correct? |
|---|---|---|---|
| en | 0.9995 | 0.000016 | ✅ |
| ro | 0.9997 | 0.000016 | ✅ |
| ru | 0.97–0.99 | 0.97–0.99 (sometimes *higher*) | ❌ |

Confirmed **not** a quantization artifact — re-exported at `--weight-format fp16`,
same result. Romanian (Latin script, diacritics) works perfectly; Russian
(Cyrillic) doesn't discriminate at all. bge-m3's own embeddings export (same
XLM-RoBERTa-large backbone) handles Cyrillic correctly (see the 0.9995 cosine
figure above), so this is isolated to `rerank_ov`'s tokenizer conversion
(`export_rerank_tokenizer` in `export_model.py` converts with
`add_special_tokens=False`, unlike the embeddings path) — not bge-m3 itself, not
quantization, not this app's code. Shipping it as the silent default would
regress the exact ru-language case the bge-m3 migration was fixing.

**Before re-enabling:** re-run the battery above against a fresh export (a
future OVMS/optimum-intel release may fix the tokenizer conversion), or try
Workers AI's hosted `@cf/baai/bge-reranker-base` via the Cloudflare proxy's
`/rerank` route (`src/server/openaiProxy.ts`) as an alternative.

**Update (24.08.2026) — both follow-up attempts tested, neither fixes it:**

*OVMS tokenizer-conversion hypotheses, rejected by experiment.* Two plausible
export-side causes for the symptom above were tested against a live re-export,
not just reasoned about:
1. `export_rerank_tokenizer` (`ovms/tools/export_model.py`) converts with
   `add_special_tokens=False`, unlike the embeddings path — re-exported with
   `add_special_tokens=True` to restore the `<s> query </s></s> doc </s>` pair
   markers a sequence-classification head expects.
2. `--max_doc_length` defaults to 16000, forced onto a model whose real
   position limit is far smaller — re-exported with `--max_doc_length 512`.

Neither changed the ru result *at all* — en/ro stayed at their already-correct
scores, and ru's relevant/irrelevant pair came back **byte-for-byte identical**
(0.9812 / 0.9765) between the two exports. That rules out both as the cause;
whatever is wrong is not in this app's tokenizer conversion or truncation
handling — most likely an inherent property of this quantized OVMS build on
Cyrillic, or of `bge-reranker-v2-m3` in this inference path more generally.

*Workers AI `@cf/baai/bge-reranker-base`, tested live — worse than OVMS.*
First live test of the proxy's `/rerank` route surfaced a real, independent bug
(not the Cyrillic issue): Workers AI's actual response shape uses `{id, score}`,
not the `{index, score}` the code assumed from docs it was never checked
against — every real call 502'd. Fixed in `openaiProxy.ts` (accepts `id` or
`index`), with a regression test. Once working, 5 ru relevant/irrelevant probe
pairs (photosynthesis, a quadratic equation, the periodic law, WWII's start
date, cell structure) scored correctly on only **1 of 5** — the other 4 ranked
the *irrelevant* document higher, several by a wide margin (e.g. 0.00017 vs
0.61 for the WWII pair). Several scores repeated **identically** across
unrelated queries (e.g. `0.6063408851623535` on both the photosynthesis and
WWII pairs), which looks like near-degenerate output on Russian input rather
than "weaker but real" discrimination — this backend is not a fix, and is
worse than doing nothing (the current `LexicalReranker` default at least never
inverts the ranking).

**Current recommendation:** leave the cross-encoder disabled by default on
both backends. The reranker fixes above did not move the needle either way —
`src/services/ragService.ts` is unchanged. The Workers AI response-shape fix
is real and kept (correct behavior for en/ro if this route is ever used, and
for any future model swap), independent of this decision.
