## 1. Implementation
- [x] 1.1 Add OpenSpec proposal, design, tasks, and requirement deltas.
- [x] 1.2 Add a shared main-process local-only guard and expose local-only state through preload.
- [x] 1.3 Guard auth, hosted API URL resolution, analytics, Sentry, updater, shell external links, and main-process fetch proxies.
- [x] 1.4 Guard hosted Claude OAuth, sandbox import/export, hosted voice backend, and renderer API fetch/TTS paths.
- [x] 1.5 Hide or disable remote sandbox, automations, inbox, subscription, update, and changelog renderer entrypoints.
- [x] 1.6 Update CSP and contributor documentation.

## 2. Validation
- [x] 2.1 Run `openspec validate add-default-local-only-cloud-guard --strict --no-interactive`.
- [x] 2.2 Run `bun run ts:check`.
- [x] 2.3 Run `bun run build`.
- [x] 2.4 Smoke launch with `env -u ELECTRON_RUN_AS_NODE bun run dev` and check startup logs for local app loading without hosted/update/analytics calls.
