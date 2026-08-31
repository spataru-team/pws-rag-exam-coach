# Frozen synthetic answer set — `ro-synthetic-answers`

A frozen, fully synthetic set of student answers to the public ANCE Romanian
(alolingvi) papers **`ro-pr26`** and **`ro-sb26`**. It is the shared, label-free
input for two independent evaluation tracks:

- **P1-4 — human rubric agreement.** An independent Romanian-language teacher
  grades these answers by the official barem, without seeing any system output.
  Those labels live in a separate `eval/agreement/` directory and are **not**
  part of this frozen set.
- **P1-5 — Intel Xeon end-to-end benchmark.** These answers are the realistic
  grading workload driven through the production RAG + grading path on the Xeon.
  P1-5 uses them **only as workload input** and never reads any P1-4 label file.

## What is guaranteed

| | |
|---|---|
| Provenance | Fully synthetic, self-authored by the project team. Not real student work; not exam or textbook material beyond the public item prompts the answers respond to. |
| No labels | Contains **no** teacher scores and **no** system predictions at freeze time. |
| Real structure | Every `answersByItemId` key is a real item / sub-criterion id of its paper; grading uses the unchanged production barem structure. |
| Stable ids | `syn-<paper>-<nn>`, never reused. |
| Not tuned | Answers were written to span a realistic range, not to produce any particular grading outcome. |

## Coverage (`manifest.json`)

- **22 cases** — 11 `ro-pr26`, 11 `ro-sb26`.
- Bands: **strong** 5, **partial** 8, **l2-errors** 5 (missing diacritics,
  gender/number agreement slips, Russian calques, word order), **near-blank** 4.
- `manifest.json` records the `contentHash` (sha256 over the `cases` array), the
  per-case answered-item counts, and the FREEZE commit SHA.

## Freeze discipline

This directory is committed in its own **FREEZE** commit **before** any
annotation or any official system run. Two-stage freeze:

1. **This set** — frozen first.
2. **P1-4 teacher labels** (`eval/agreement/labels.teacher*.json`) — frozen in a
   separate commit, after annotation returns, before the first official
   `eval:agreement` run.

If a case must change after freeze, add a new case with a new id and bump
`schemaVersion`; do not edit a frozen case in place.
