# Subject data packs

The per-subject data packs (`<id>.pack.json` — chunk text + `bge-m3` embedding
vectors) are **not included in this repository**. They are derived from
third-party copyrighted textbook material and are distributed separately.
`npm run seed` regenerates them locally.

## Which subjects seed to a usable pack on a clean clone

| Subject | Public chunk source | Clean `npm run seed` result |
|---|---|---|
| `romanian` | `src/data/chunks/romanian.chunks.ts` (hand-authored, 17) | populated |
| `english` | `src/data/chunks/english.chunks.ts` (hand-authored, 9) | populated |
| `biology` | `src/data/chunks/biology.chunks.ts` (hand-authored, 8) | populated |
| `history` | `src/data/chunks/history.chunks.ts` (hand-authored, 7) | populated |
| `chemistry` | none — `corpus/out/` only (gitignored) | **empty** (`chunks: []`) |
| `math` | none — `corpus/out/` only (gitignored) | **empty** (`chunks: []`) |
| `russian` | none — `corpus/out/` only (gitignored) | **empty** (`chunks: []`) |

**Chemistry, mathematics and Russian require local regeneration.** Either:

- regenerate the real corpora from Ministry textbook PDFs — see
  [`docs/SUBJECT_REGISTRY.md`](../../docs/SUBJECT_REGISTRY.md) → "Auto-ingested
  subjects" — then `npm run seed`; or
- run `npm run seed:demo` for a small, clearly-labelled self-authored synthetic
  corpus for exactly those three subjects (tagged `synthetic: true`, excluded
  from the retrieval benchmark).

See [`docs/JUDGE_REPRODUCIBILITY.md`](../../docs/JUDGE_REPRODUCIBILITY.md).
