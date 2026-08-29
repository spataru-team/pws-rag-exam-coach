# How this project was developed (AI-assisted development disclosure)

> **Transparency note.** This document was added **after** the competition
> submission to consolidate development-process information that was already
> disclosed in the submitted application and is visible in this repository's
> public history (commit trailers, the design/plan artifacts in
> [`docs/superpowers/`](superpowers/)). It does **not** exist in, and does not
> alter, the submission-state snapshot marked by the `intel-2026-submission`
> git tag.

PWS RAG Exam Coach was built by the team **with extensive use of Claude and
Claude Code**. This document states, as precisely as the evidence supports, what
that means — neither understating it ("AI only helped with syntax") nor
overstating the team's line-level authorship of the code.

## The balanced statement

- The **team owned** the problem, the requirements, the interpretation of the
  official ANCE marking scheme, the product and pedagogical decisions, the
  acceptance decisions, the evaluation criteria, and the interpretation of
  results.
- **Claude / Claude Code was used extensively** and generated a large share of
  the implementation patches, and also assisted with planning and document
  drafting and with development execution.
- The team **reviewed, tested, accepted, rejected and iterated on** the
  resulting work.

## The division of responsibility

### The team owned the decisions

- **Problem selection** — a Romanian-as-a-non-native-language exam that
  language-minority students in Moldova must pass, and a real retake cohort of
  six grade-9 students (see [FIELD_DEPLOYMENT.md](FIELD_DEPLOYMENT.md)).
- **The official scoring criteria** — the ANCE marking scheme (*barem*) is an
  external official document; the team sourced the test + barem PDFs from
  `ance.gov.md` and transcribed the grading grid. It is not AI-invented.
- **Product / pedagogical concepts** — scoring atoms, skill tags, the
  🟢/🟡/🔴 recoverable-value sorting, Rescue Mode, the
  lost-points × trainability × transfer ÷ cost prioritisation, and the
  conservative-vs-expected forecast that stops above a safety margin. The skill
  weights and the prerequisite ("builds on") graph are **hand-authored
  pedagogical estimates, not model output**
  (`src/learning/rescueConfig.ts`, `src/learning/prerequisites.ts`).
- **Acceptance criteria and review** — each design was written up and then
  reviewed; several design sections were **corrected in code review** and
  superseded (the correction banners are visible in
  [`docs/superpowers/`](superpowers/) — see its
  [README](superpowers/README.md)).
- **Evaluation criteria and interpretation** — the team defined the
  retrieval-validation criteria and the acceptance criteria, decided whether the
  measured results were acceptable, and interpreted them (for example the
  **rejected cross-encoder reranker**: measured, its likely causes tested by
  experiment, and **not shipped** — [ovms/README.md](../ovms/README.md)
  "Rejected experiments"). The recalibration history in `eval/thresholds.json`
  is the team's measurement record. Claude Code could generate harness code or
  run commands as part of the development workflow, but **Claude did not define
  the retrieval-validation criteria or decide whether the measured results were
  acceptable** — those evaluation decisions and their interpretation remained
  with the team.
- **Interpretation of the field results** — including the explicit
  "Why we do not claim causality" section in
  [FIELD_DEPLOYMENT.md](FIELD_DEPLOYMENT.md).
- **Privacy / local-first design** and the **Intel / OpenVINO** deployment
  choices.

### Claude Code's role in implementation

- Claude Code **generated a large share of the implementation patches** against
  the team's requirements and design documents, working task-by-task from the
  plans in [`docs/superpowers/plans/`](superpowers/plans/). This does **not**
  mean Claude implemented literally everything, and it does **not** mean the
  team hand-wrote the AI-generated patches.
- Post-release changes carry a `Co-Authored-By: Claude Sonnet 5` trailer and,
  where a session applies, a `Claude-Session:` trailer on the commit. The
  pre-release code was published as a single snapshot commit (`58cb562`
  "Initial public release"), so per-file authorship of that snapshot is not
  reconstructable from git.
- Claude Code did **not** choose the problem, define the official scoring
  criteria, decide the product concepts, set the evaluation criteria, or
  interpret the field-deployment results.

## "Team-directed integration" on merge commits

Post-submission improvement branches are merged by the `spataru-team` Git
identity. That denotes **team-directed integration** — the team reviewed,
tested and approved the change — **not** manual student authorship of the
AI-generated patches. The per-commit `Co-Authored-By: Claude` trailers on the
branch commits are preserved; history is never rewritten.

## Evidence

- `git log` — `Co-Authored-By: Claude` / `Claude-Session:` trailers (on the
  post-release commits).
- [`docs/superpowers/`](superpowers/) — the AI-assisted design specs and
  implementation-plan artifacts (see its [README](superpowers/README.md); read
  them as history, not as current documentation).
- The merge-commit bodies for the post-submission pull requests.
- [RESPONSIBLE_AI.md](RESPONSIBLE_AI.md) cross-links here; the relationship to
  the earlier project (partial team continuity, what carried over, what is new)
  is covered in [EVOLUTION_FROM_2025.md](EVOLUTION_FROM_2025.md).
