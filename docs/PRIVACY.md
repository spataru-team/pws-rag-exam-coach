# Privacy

PWS RAG Exam Coach is **local-first**. The design goal is that a student can use
it without creating an account, giving a real name, or sending data anywhere.

## What is stored, and where

- All learner data — profile, learning events, topic mastery, model metrics,
  settings — is stored in the browser via **IndexedDB** (Dexie). It never leaves
  the device unless the student explicitly exports it or opts into a cloud LLM.
- Identity is an **anonymous local id** (`stu_…`) generated on the device. No
  name, email, or other personal identifier is requested or stored.

## API keys

- User-provided API keys are stored **only** in local IndexedDB
  (`settings` store, key `llm.apiKey`).
- Keys are **never** hardcoded, committed, logged, or included in any export.
- The API key input uses a password field and `autocomplete="off"`.

## Cloud LLM warning

- Local providers (Mock, Ollama, LM Studio) keep prompts on the device.
- Cloud providers (OpenAI-compatible, OpenRouter) send prompts — including
  retrieved chunk text — to an external service. Before such a provider is used,
  the UI shows a clear warning (`llm.cloudWarning`) in onboarding, settings, and
  the model lab.

## Export

- Export is **explicit and user-triggered** (Export screen → "Export JSON").
- The export (`ProgressExportJson`) contains progress, topic mastery, weak topics,
  an activity summary, and model metrics — and the anonymous id only.
- Mock-exam attempts are included in the export, with the student's written
  answers and the per-criterion grading feedback. As with all data, this stays on
  the device until the student chooses to export and share the file.
- `validateProgressExport` rejects any object that carries obvious personal-name
  fields (`name`, `firstName`, `lastName`, `email`) as a safety guard.

## Data reset

- Settings → "Reset all local data" wipes every IndexedDB table
  (`resetAllData`) and reloads the app.

## Separation of concerns

Local progress data (`storage/`) and LLM prompts (`llm/`) are kept in separate
layers. Retrieval and progress tracking are likewise separate, so learner
analytics are never bundled into outbound prompts beyond the retrieved study text
needed to ground an answer.
