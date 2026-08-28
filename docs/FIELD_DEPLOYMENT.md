# Field Deployment — 2026

This document records how PWS RAG Exam Coach was used with real students during
the 2026 examination cycle, and — just as important — what those results **do not**
show. No student names or personal data appear here or anywhere in the repository.

## Context

In the Republic of Moldova every student must pass a Romanian exam to graduate.
Students taught in another language sit a **separate paper — Romanian as a
non-native language** (*Limba și literatura română pentru alolingvi*). At national
scale for the 2026 grade-9 session: **7,092** candidates registered, **5,996**
papers were actually written, and the main-session pass rate was **80.7%**
(82.7% in 2025); after the August retake session the figure for this subject
rose to **89.32%**. Sources are listed in the README.

The tool was used at one school with grade-9 students taught in Russian, during
the spring 2026 exam-preparation period, alongside their regular lessons.

## Main exam session

- **112 students had access** to the app during exam preparation.
- **106 of them passed** the main-session Romanian exam (**94.6%**).

"Had access" is the precise claim: the link was distributed through the school.
Individual in-app activity is **deliberately not tracked** (see
[RESPONSIBLE_AI.md](./RESPONSIBLE_AI.md) and [PRIVACY.md](./PRIVACY.md)), so we
cannot say how many of the 112 used it, or how often.

## What changed after the main session

Six students still needed the August retake. Their teachers' feedback, and the
pattern of where points had been lost, pointed at a specific gap: existing
practice told a student *what to revise* but not *which few skills would most
efficiently recover the points needed to pass*. That gap is what
**Rescue Mode** was built to close (skill-level diagnosis from the official
rubric → a ranked route of 2–4 recoverable skills → targeted micro-training →
an attainable-points forecast; see [ARCHITECTURE.md](./ARCHITECTURE.md) and
`src/learning/rescueEngine.ts`).

## August retake

- **6 students** needed the retake.
- Rescue Mode was offered **equally to all six**.
- **2 chose to use it** — confirmed by the host's unique-visitor analytics, not
  by self-report.
- **Both of those 2 passed** the retake.
- **The 4 who did not use it did not pass.**

## Observations

- The system ran in a real school setting, on students' own devices, against a
  real national exam with real consequences.
- The main-session cohort passed at 94.6% versus an 80.7% national main-session
  rate — a difference in the expected direction.
- In the retake group the contrast was 2/2 versus 0/4.

## Limitations

1. **No control group.** We did not withhold the tool from any student to form a
   randomized comparison during a real graduation exam. That was a deliberate
   ethical choice; it also means there is no counterfactual.
2. **Confounded support.** Every student also had regular teacher instruction.
   The tool's contribution cannot be separated from that.
3. **School vs country.** 94.6% (one school) and 80.7% (the whole country) are
   different populations; the comparison is suggestive, not controlled.
4. **No usage data.** Because individual in-app behaviour is not tracked, we
   cannot report how many of the 112 actively used the app or how intensively.
5. **Very small retake sample.** n = 2 vs n = 4, and the two users
   **self-selected** — students who chose to open the tool may have been more
   motivated to begin with.
6. **Single site, single cycle.** One school, one exam session.

## Why we do not claim causality

Given the limitations above, these results are **evidence of real-world
deployment and a promising signal**, not evidence that the app *caused* any
outcome. We state the numbers plainly and let them stand at that weight. The
value we do claim is the development loop they made possible:

real deployment → observed failure cases (the six retakes) → a specific product
change (Rescue Mode) → equal access to the improved tool → observed outcomes →
cautious evaluation.

## What would strengthen the evidence

Not yet done; listed for honesty, not as claims:

- A second school or a second exam cycle.
- A larger retake cohort.
- An opt-in usage signal that still respects the no-tracking design (e.g. an
  anonymous local counter the student chooses to share on export).
- Teacher-rated feedback quality on a sample of graded answers.
