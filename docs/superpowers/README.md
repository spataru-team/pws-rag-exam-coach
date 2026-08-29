# Design & implementation-plan artifacts (AI-assisted development)

These files are **design specs and task-by-task implementation plans** produced
during 2026 development with **Claude Code** (the "Superpowers" agent workflow).
They are kept in the public repository for **provenance and transparency**: they
show the requirements the team set and the design analysis and code reviews
behind each feature.

- `specs/` — design documents (problem analysis, options, chosen approach).
- `plans/` — implementation plans the agent worked through step by step.

## How to read them

- **They are historical.** Some sections were **corrected or superseded during
  review** — each affected file carries a status / ⚠️ banner pointing to the
  authoritative version. Not every sentence in a plan represents a final,
  team-approved decision; the correction banners and the later plan revisions
  are part of that record.
- **The current architecture docs are authoritative** for how the code actually
  works today: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md),
  [`docs/EVALUATION.md`](../EVALUATION.md) and the module-level docs.
- Development-process context and the human/AI division of responsibility:
  [`docs/AI_DEVELOPMENT.md`](../AI_DEVELOPMENT.md).

## Post-submission work

Internal planning and audit records for **post-submission** improvements are
kept in a private workspace, not added here.
