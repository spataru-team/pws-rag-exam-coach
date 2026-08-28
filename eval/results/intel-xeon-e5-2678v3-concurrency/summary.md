# OVMS concurrency benchmark — summary

Synthetic server-side concurrency test. Load generated from a separate
LAN machine; the Xeon runs OVMS inference only. Not a classroom test.

| concurrency | total | ok | fail | timeout | success_rate | lat_min_s | lat_p50_s | lat_p95_s | lat_max_s | lat_mean_s | wall_clock_s | requests_per_s | total_completion_tokens | agg_gen_tok_per_s_e2e |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 10 | 10 | 0 | 0 | 1.0 | 1.2589 | 1.4337 | 1.8596 | 1.8596 | 1.4641 | 14.641691 | 0.683 | 300 | 20.4894 |
| 5 | 25 | 25 | 0 | 0 | 1.0 | 3.1559 | 3.468 | 4.9355 | 5.0103 | 3.7017 | 18.527726 | 1.3493 | 750 | 40.4799 |
| 10 | 50 | 50 | 0 | 0 | 1.0 | 4.2153 | 4.534 | 5.3377 | 5.3382 | 4.6408 | 23.221149 | 2.1532 | 1500 | 64.5963 |
| 20 | 100 | 100 | 0 | 0 | 1.0 | 4.5317 | 5.9118 | 11.5369 | 11.552 | 7.3027 | 38.800148 | 2.5773 | 3000 | 77.3193 |

`agg_gen_tok_per_s_e2e` = total generated tokens across the level ÷ the
level's wall-clock time (aggregate end-to-end). It is **not** derived from
any single request's HTTP latency, and is only filled when every
successful request reported a completion-token count.
