#!/usr/bin/env python3
"""Synthetic server-side concurrency benchmark for the OVMS chat endpoint.

This is a CONTROLLED load test, not a classroom test. It runs from a machine that
is NOT the inference server, and holds a fixed number of requests in flight at a
time (semaphore model), so the measured pressure on the server is exactly the
stated concurrency level.

Target: the generation model in `ovms/models/config.json` (`ov-llm`), served over
the OpenAI-compatible endpoint `POST {base}/v3/chat/completions`. It mirrors the
request the app actually sends (`src/llm/adapters/openaiCompatible.ts`), including
`chat_template_kwargs: {"enable_thinking": false}` for the OVMS/Qwen3 path.

Nothing here changes the server, the model, or the production config.

Usage (one level):

    python scripts/benchmark_ovms_concurrency.py \
        --url http://192.168.1.50:8000/v3/chat/completions \
        --model ov-llm \
        --concurrency 5 \
        --requests 25 \
        --max-tokens 30 \
        --output-dir eval/results/intel-xeon-e5-2678v3-concurrency

Aggregate the four level files into summary.csv / summary.md:

    python scripts/benchmark_ovms_concurrency.py \
        --summarize eval/results/intel-xeon-e5-2678v3-concurrency

Requires: aiohttp  (pip install -r scripts/requirements-benchmark.txt)
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import math
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import aiohttp
except ImportError:  # pragma: no cover - environment guard
    aiohttp = None


# A short, technically neutral prompt. It deliberately invites a longer answer so
# that a `--max-tokens 30` cap is reached every time (`finish_reason: length`),
# which keeps the generated-token count identical across requests and levels.
DEFAULT_PROMPT = "Briefly describe the water cycle in a few sentences."

LEVEL_FILE = {1: "concurrency-01.json", 5: "concurrency-05.json",
              10: "concurrency-10.json", 20: "concurrency-20.json"}


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def percentile(values: list[float], p: float) -> float | None:
    """Nearest-rank percentile (p in [0, 100]). None for an empty list."""
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    rank = math.ceil(p / 100 * len(s))
    rank = min(max(rank, 1), len(s))
    return s[rank - 1]


def build_body(args: argparse.Namespace) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": args.model,
        "messages": [{"role": "user", "content": args.prompt}],
        "temperature": args.temperature,
        "max_tokens": args.max_tokens,
        "stream": False,
    }
    # Deterministic sampling where the server honours it; ignored otherwise.
    if args.seed is not None:
        body["seed"] = args.seed
    # Production-path parity: the app sends this for the OVMS/Qwen3 provider so the
    # 30-token budget is not consumed by an internal <think> pass.
    if not args.enable_thinking:
        body["chat_template_kwargs"] = {"enable_thinking": False}
    return body


async def one_request(session: "aiohttp.ClientSession", url: str, body: dict[str, Any],
                      timeout: float, request_id: int, concurrency: int,
                      sem: asyncio.Semaphore) -> dict[str, Any]:
    async with sem:
        rec: dict[str, Any] = {
            "request_id": request_id,
            "concurrency_level": concurrency,
            "start_ts": None, "start_iso": None,
            "end_ts": None, "end_iso": None,
            "elapsed_seconds": None,
            "http_status": None,
            "success": False,
            "timeout": False,
            "prompt_tokens": None,
            "completion_tokens": None,
            "server_processing_seconds": None,
            "finish_reason": None,
            "error": None,
        }
        start = time.time()
        rec["start_ts"] = start
        rec["start_iso"] = iso(start)
        try:
            async with session.post(url, json=body,
                                    timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
                text = await resp.text()
                end = time.time()
                rec["http_status"] = resp.status
                # OVMS does not return a standard server-timing header today; capture
                # it only if some future build does. Never fabricate it.
                st = resp.headers.get("Server-Timing") or resp.headers.get("X-Inference-Time")
                if st:
                    rec["server_processing_seconds_raw"] = st
                if resp.status == 200:
                    try:
                        data = json.loads(text)
                    except json.JSONDecodeError as exc:
                        rec["error"] = f"non-JSON 200 body: {exc}"
                    else:
                        usage = data.get("usage") or {}
                        pt = usage.get("prompt_tokens")
                        ct = usage.get("completion_tokens")
                        rec["prompt_tokens"] = pt if isinstance(pt, int) else None
                        rec["completion_tokens"] = ct if isinstance(ct, int) else None
                        choices = data.get("choices") or []
                        if choices:
                            rec["finish_reason"] = choices[0].get("finish_reason")
                        rec["success"] = True
                else:
                    rec["error"] = f"HTTP {resp.status}: {text[:300]}"
        except asyncio.TimeoutError:
            end = time.time()
            rec["timeout"] = True
            rec["error"] = f"timeout after {timeout}s"
        except aiohttp.ClientError as exc:
            end = time.time()
            rec["error"] = f"{type(exc).__name__}: {exc}"
        except Exception as exc:  # noqa: BLE001 - record anything, never crash the batch
            end = time.time()
            rec["error"] = f"{type(exc).__name__}: {exc}"
        rec["end_ts"] = end
        rec["end_iso"] = iso(end)
        rec["elapsed_seconds"] = round(end - start, 6)
        return rec


async def warmup(session: "aiohttp.ClientSession", url: str, body: dict[str, Any],
                 timeout: float, count: int) -> None:
    if count <= 0:
        return
    print(f"[warmup] {count} request(s), not measured ...", file=sys.stderr, flush=True)
    for i in range(count):
        try:
            async with session.post(url, json=body,
                                    timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
                await resp.text()
                print(f"[warmup] {i + 1}/{count} -> HTTP {resp.status}", file=sys.stderr, flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[warmup] {i + 1}/{count} -> {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)


def summarize_level(records: list[dict[str, Any]], concurrency: int,
                    wall_start: float, wall_end: float) -> dict[str, Any]:
    ok = [r for r in records if r["success"]]
    fail = [r for r in records if not r["success"]]
    lat = [r["elapsed_seconds"] for r in ok]
    wall = round(wall_end - wall_start, 6)

    completion_tokens = [r["completion_tokens"] for r in ok if isinstance(r["completion_tokens"], int)]
    have_all_tokens = len(completion_tokens) == len(ok) and len(ok) > 0
    total_completion_tokens = sum(completion_tokens) if completion_tokens else None

    summary: dict[str, Any] = {
        "concurrency_level": concurrency,
        "total_requests": len(records),
        "successful_requests": len(ok),
        "failed_requests": len(fail),
        "timed_out_requests": sum(1 for r in records if r["timeout"]),
        "success_rate": round(len(ok) / len(records), 4) if records else None,
        "latency_seconds": {
            "min": round(min(lat), 4) if lat else None,
            "p50": round(percentile(lat, 50), 4) if lat else None,
            "p95": round(percentile(lat, 95), 4) if lat else None,
            "max": round(max(lat), 4) if lat else None,
            "mean": round(statistics.fmean(lat), 4) if lat else None,
        },
        "wall_clock_seconds": wall,
        "requests_per_second": round(len(ok) / wall, 4) if wall > 0 and ok else None,
        "completion_tokens_available_for_all_successes": have_all_tokens,
        "total_completion_tokens": total_completion_tokens,
        # Only meaningful as an AGGREGATE END-TO-END figure: sum of generated
        # tokens over the wall-clock of the whole level. NOT derived from any
        # single request's HTTP latency.
        "aggregate_generation_tokens_per_second_end_to_end": (
            round(total_completion_tokens / wall, 4)
            if have_all_tokens and total_completion_tokens is not None and wall > 0
            else None
        ),
        "finish_reasons": _count(r["finish_reason"] for r in ok),
        "errors": _count(r["error"] for r in fail),
    }
    return summary


def _count(items) -> dict[str, int]:
    out: dict[str, int] = {}
    for it in items:
        key = str(it)
        out[key] = out.get(key, 0) + 1
    return out


async def run_level(args: argparse.Namespace) -> dict[str, Any]:
    if aiohttp is None:
        sys.exit("aiohttp is required: pip install -r scripts/requirements-benchmark.txt")

    body = build_body(args)
    sem = asyncio.Semaphore(args.concurrency)
    connector = aiohttp.TCPConnector(limit=0)  # do not cap below our own semaphore

    async with aiohttp.ClientSession(connector=connector) as session:
        await warmup(session, args.url, body, args.timeout, args.warmup)

        print(f"[run] concurrency={args.concurrency} measured_requests={args.requests}",
              file=sys.stderr, flush=True)
        wall_start = time.time()
        tasks = [
            asyncio.create_task(
                one_request(session, args.url, body, args.timeout, i + 1, args.concurrency, sem)
            )
            for i in range(args.requests)
        ]
        records: list[dict[str, Any]] = []
        for fut in asyncio.as_completed(tasks):
            rec = await fut
            records.append(rec)
            done = len(records)
            mark = "ok" if rec["success"] else "FAIL"
            print(f"[run] {done}/{args.requests} {mark} "
                  f"{rec['elapsed_seconds']}s HTTP {rec['http_status']}",
                  file=sys.stderr, flush=True)
        wall_end = time.time()

    records.sort(key=lambda r: r["request_id"])
    summary = summarize_level(records, args.concurrency, wall_start, wall_end)

    out = {
        "metadata": {
            "generated_at": iso(time.time()),
            "url": args.url,
            "model": args.model,
            "concurrency": args.concurrency,
            "measured_requests": args.requests,
            "warmup_requests": args.warmup,
            "max_tokens": args.max_tokens,
            "temperature": args.temperature,
            "seed": args.seed,
            "enable_thinking": args.enable_thinking,
            "per_request_timeout_seconds": args.timeout,
            "prompt": args.prompt,
            "test_type": "synthetic server-side concurrency",
            "notes": "Load generated from a separate LAN machine. "
                     "Not a physical multi-PC classroom test.",
        },
        "summary": summary,
        "requests": records,
    }

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    fname = args.output_file or LEVEL_FILE.get(args.concurrency, f"concurrency-{args.concurrency:02d}.json")
    path = out_dir / fname
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"[run] wrote {path}", file=sys.stderr, flush=True)

    _print_level_summary(summary)
    return out


def _print_level_summary(s: dict[str, Any]) -> None:
    lat = s["latency_seconds"]
    print(
        "\n".join([
            "",
            f"  concurrency ............ {s['concurrency_level']}",
            f"  requests .............. {s['successful_requests']}/{s['total_requests']} ok "
            f"({s['failed_requests']} fail, {s['timed_out_requests']} timeout)",
            f"  success rate .......... {s['success_rate']}",
            f"  latency s (min/p50/p95/max/mean) .. "
            f"{lat['min']} / {lat['p50']} / {lat['p95']} / {lat['max']} / {lat['mean']}",
            f"  wall clock s .......... {s['wall_clock_seconds']}",
            f"  requests / second .... {s['requests_per_second']}",
            f"  total completion tokens .. {s['total_completion_tokens']}",
            f"  aggregate gen tok/s (end-to-end) .. "
            f"{s['aggregate_generation_tokens_per_second_end_to_end']}",
            "",
        ]),
        file=sys.stderr, flush=True,
    )


def do_summarize(directory: str) -> None:
    d = Path(directory)
    levels: list[dict[str, Any]] = []
    for conc in (1, 5, 10, 20):
        f = d / LEVEL_FILE[conc]
        if not f.exists():
            print(f"[summarize] missing {f} - skipping", file=sys.stderr)
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        levels.append(data["summary"] | {"_source": f.name})

    if not levels:
        sys.exit("[summarize] no concurrency-*.json files found")

    cols = [
        ("concurrency", "concurrency_level"),
        ("total", "total_requests"),
        ("ok", "successful_requests"),
        ("fail", "failed_requests"),
        ("timeout", "timed_out_requests"),
        ("success_rate", "success_rate"),
        ("lat_min_s", ("latency_seconds", "min")),
        ("lat_p50_s", ("latency_seconds", "p50")),
        ("lat_p95_s", ("latency_seconds", "p95")),
        ("lat_max_s", ("latency_seconds", "max")),
        ("lat_mean_s", ("latency_seconds", "mean")),
        ("wall_clock_s", "wall_clock_seconds"),
        ("requests_per_s", "requests_per_second"),
        ("total_completion_tokens", "total_completion_tokens"),
        ("agg_gen_tok_per_s_e2e", "aggregate_generation_tokens_per_second_end_to_end"),
    ]

    def cell(row: dict[str, Any], key) -> Any:
        if isinstance(key, tuple):
            return row.get(key[0], {}).get(key[1])
        return row.get(key)

    csv_path = d / "summary.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow([c[0] for c in cols])
        for row in levels:
            w.writerow([cell(row, c[1]) for c in cols])
    print(f"[summarize] wrote {csv_path}", file=sys.stderr)

    md = ["# OVMS concurrency benchmark — summary", "",
          "Synthetic server-side concurrency test. Load generated from a separate",
          "LAN machine; the Xeon runs OVMS inference only. Not a classroom test.",
          "", "| " + " | ".join(c[0] for c in cols) + " |",
          "|" + "|".join("---" for _ in cols) + "|"]
    for row in levels:
        md.append("| " + " | ".join(str(cell(row, c[1])) for c in cols) + " |")
    md += ["",
           "`agg_gen_tok_per_s_e2e` = total generated tokens across the level ÷ the",
           "level's wall-clock time (aggregate end-to-end). It is **not** derived from",
           "any single request's HTTP latency, and is only filled when every",
           "successful request reported a completion-token count.",
           ""]
    md_path = d / "summary.md"
    md_path.write_text("\n".join(md), encoding="utf-8")
    print(f"[summarize] wrote {md_path}", file=sys.stderr)


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--summarize", metavar="DIR",
                   help="aggregate concurrency-*.json in DIR into summary.csv/summary.md and exit")
    p.add_argument("--url", help="full chat-completions URL, e.g. http://XEON_IP:8000/v3/chat/completions")
    p.add_argument("--model", default="ov-llm")
    p.add_argument("--concurrency", type=int, help="max requests in flight at once")
    p.add_argument("--requests", type=int, help="number of MEASURED requests")
    p.add_argument("--max-tokens", type=int, default=30, dest="max_tokens")
    p.add_argument("--timeout", type=float, default=120.0, help="per-request timeout, seconds")
    p.add_argument("--warmup", type=int, default=3, help="unmeasured warmup requests")
    p.add_argument("--output-dir", default="eval/results/intel-xeon-e5-2678v3-concurrency", dest="output_dir")
    p.add_argument("--output-file", default=None, dest="output_file")
    p.add_argument("--prompt", default=DEFAULT_PROMPT)
    p.add_argument("--temperature", type=float, default=0.0)
    p.add_argument("--seed", type=int, default=0, help="deterministic sampling seed (server may ignore); pass a negative value to omit")
    p.add_argument("--enable-thinking", action="store_true", dest="enable_thinking",
                   help="do NOT send enable_thinking:false (default sends it, matching the app)")
    args = p.parse_args(argv)
    if args.seed is not None and args.seed < 0:
        args.seed = None
    return args


def main(argv: list[str]) -> None:
    args = parse_args(argv)
    if args.summarize:
        do_summarize(args.summarize)
        return
    missing = [n for n in ("url", "concurrency", "requests") if getattr(args, n) is None]
    if missing:
        sys.exit(f"missing required argument(s): {', '.join('--' + m for m in missing)}")
    asyncio.run(run_level(args))


if __name__ == "__main__":
    main(sys.argv[1:])
