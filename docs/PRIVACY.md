# Privacy

PWS RAG Exam Coach is **local-first**. The design goal is that a student can use
it fully without creating an account, giving a real name, or sending anything
off their device or school network — by choosing a local provider (Mock, Ollama,
LM Studio, or a school-network OpenVINO server). The hosted demo trades that for
a real cloud LLM, behind a visible warning.

## What is stored, and where

- All learner data — profile, learning events, topic mastery, model metrics,
  settings — is stored in the browser via **IndexedDB** (Dexie). This stored
  data is **never transmitted**; it leaves the device only if the student
  explicitly exports it. (What the AI coach sends — the prompt — is covered
  under "Cloud LLM warning" below.)
- Identity is an **anonymous local id** (`stu_…`) generated on the device. No
  name, email, or other personal identifier is requested or stored.

## API keys

- User-provided API keys are stored **only** in local IndexedDB
  (`settings` store, key `llm.apiKey`).
- Keys are **never** hardcoded, committed, logged, or included in any export.
- The API key input uses a password field and `autocomplete="off"`.

## Cloud LLM warning

The AI prompt — the current question, the student's written answer, and the
retrieved study text (not the stored learner data above) — goes to a different
place depending on the selected provider:

- **On the device** — the **Mock** provider (offline, deterministic) and a local
  **Ollama** / **LM Studio** keep the prompt on the student's machine.
- **On the school LAN** — a school-network **OpenVINO Model Server (OVMS)** runs
  the models on one server on the school network. The prompt leaves the
  student's device but stays inside the school network.
- **To an external service** — **cloud** providers (the same-origin proxy /
  OpenAI-compatible / OpenRouter) send the prompt off the local environment.
  Before any cloud provider is used, the UI shows a clear warning
  (`llm.cloudWarning`) in onboarding, settings, and the Model Lab.

**First-run provider.** On a local run (`npm run dev` / `npm run preview`) the
app starts on the offline **Mock** provider — no prompt leaves the device until
the student picks another provider. On the hosted demo (or `npm run cf:dev` with
a configured proxy) the app detects the same-origin cloud proxy and starts on it
instead, still behind the warning above. Switching to a local provider in
Settings keeps prompts on the device or the school network. See
[LLM_PROVIDERS.md](./LLM_PROVIDERS.md).

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
