# OVMS concurrency benchmark — Intel Xeon E5-2678 v3

A **synthetic, server-side concurrency test** for the OVMS chat endpoint. It
measures how one inference server behaves as the number of *simultaneous* client
requests rises through **1 → 5 → 10 → 20**.

It is **not** a classroom test: there are no 20 physical PCs, no students, no app
UI. A single load-generator machine on the same LAN sends HTTP requests; the Xeon
does inference only.

## What is measured

Target: `POST http://<XEON_IP>:8000/v3/chat/completions`, model **`ov-llm`**
(`OpenVINO/Qwen3-4B-int4-ov`, INT4) — the generation model in
`ovms/models/config.json`. No model, endpoint, or production setting is changed.

The request body mirrors what the app sends
(`src/llm/adapters/openaiCompatible.ts`): `temperature` is forced to `0` for
reproducibility (the app default is `0.2`), `max_tokens` is `30`, and
`chat_template_kwargs: {"enable_thinking": false}` is sent — without it Qwen3
spends the 30-token budget on an internal `<think>` pass and latency roughly
doubles, which would not represent the production path.

Same prompt for every request, at every level:

> `Briefly describe the water cycle in a few sentences.`

(chosen only because it is short, neutral, and long enough that the 30-token cap
is always hit — so every request generates the same number of tokens).

## Test matrix

| concurrency (max in flight) | measured requests | warmup (not counted) |
|---|---|---|
| 1 | 10 | 3 |
| 5 | 25 | 3 |
| 10 | 50 | 3 |
| 20 | 100 | 3 |

## How to run

On the **load-generator machine** (not the Xeon):

```powershell
python -m pip install -r scripts/requirements-benchmark.txt

./scripts/run_xeon_concurrency_benchmark.ps1 -Url http://<XEON_IP>:8000/v3/chat/completions
```

Or one level at a time:

```bash
python scripts/benchmark_ovms_concurrency.py \
  --url http://<XEON_IP>:8000/v3/chat/completions \
  --concurrency 5 --requests 25 --max-tokens 30 \
  --output-dir eval/results/intel-xeon-e5-2678v3-concurrency

python scripts/benchmark_ovms_concurrency.py \
  --summarize eval/results/intel-xeon-e5-2678v3-concurrency
```

## Files in this directory

| file | committed now? | filled |
|---|---|---|
| `environment.json` | yes (template) | `ovms_version` / `openvino_version` are `null` until you fill them from the container before committing results |
| `concurrency-01.json` … `concurrency-20.json` | no | written by the script on each run — one object per level with `metadata`, `summary`, and a `requests[]` array of per-request records |
| `summary.csv`, `summary.md` | no | written by `--summarize` after all four levels |

Per-request records include: `request_id`, `concurrency_level`, start/end
timestamps, `elapsed_seconds`, `http_status`, `success`, `timeout`,
`prompt_tokens`, `completion_tokens`, `finish_reason`, and `error`. Metrics the
endpoint does not return (e.g. a server-side processing time) are recorded as
`null`, never estimated.

## Reading the metrics honestly

- **`requests_per_second`** = successful requests ÷ the level's wall-clock time.
- **`aggregate_generation_tokens_per_second_end_to_end`** = total generated
  tokens across the level ÷ the level's wall-clock time. It is an *aggregate
  end-to-end* figure, **not** derived from any single request's HTTP latency, and
  is only reported when every successful request returned a completion-token
  count.
- Latency percentiles (`p50` / `p95`) are nearest-rank over the successful
  requests' end-to-end HTTP times.
- The point of the 1 → 20 sweep is the *shape*: how p95 latency and throughput
  change as concurrency rises on one server. A single number in isolation says
  little.
