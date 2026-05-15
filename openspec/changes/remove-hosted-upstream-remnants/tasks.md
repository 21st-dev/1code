## 1. Inventory and Approval
- [x] 1.1 Review this proposal and confirm that hosted upstream surfaces should be removed from the default local-first build.
- [x] 1.2 Re-run `rg` inventory for hosted auth, remote sandbox, automations, inbox, updater, telemetry, subscription plan, and hosted voice/TTS paths.
- [x] 1.3 Confirm current active changes before editing overlapping Claude/Codex auth files.

## 2. Renderer Cleanup
- [x] 2.1 Remove hosted telemetry, updater, account/update controls, and remote-only settings surfaces from local-first UI.
- [x] 2.2 Hide remote sandbox chat source selectors, remote chat list fetches, remote archive restore paths, and "Open Locally" import UI in default Local-only mode.
- [x] 2.3 Remove Automations, Inbox, hosted subscription gating, hosted changelog/update, and hosted voice fallback UI.
- [x] 2.4 Keep local onboarding paths for Claude Code credentials, Codex, API key, custom provider, and Ollama.

## 3. Main Process Cleanup
- [x] 3.1 Remove hosted subscription-plan and analytics enrichment paths that no longer have local-first callers.
- [x] 3.2 Isolate sandbox import and hosted remote chat routers behind Local-only guards until a deeper remote-chat deletion pass can safely remove shared UI types.
- [x] 3.3 Remove hosted analytics/error-reporting initialization and plan enrichment.
- [x] 3.4 Remove hosted updater runtime and IPC APIs if no fork-owned update feed is retained.
- [x] 3.5 Keep `src/shared/local-only.ts` and `src/main/lib/local-only.ts` as defense-in-depth.

## 4. Preload, Dependencies, and Docs
- [x] 4.1 Remove unused preload APIs and TypeScript declarations for hosted update and telemetry calls.
- [x] 4.2 Remove unused dependencies such as Sentry, PostHog, and electron-updater only after imports are gone.
- [x] 4.3 Update README and CONTRIBUTING to describe hosted upstream remnants as removed from the default build.
- [x] 4.4 Update i18n copy that advertised removed hosted sidebar/update flows.

## 5. Validation
- [x] 5.1 Run `openspec validate remove-hosted-upstream-remnants --strict --no-interactive`.
- [x] 5.2 Run `bun run ts:check`.
- [x] 5.3 Run `bun run build`.
- [x] 5.4 Run `git diff --check`.
- [ ] 5.5 Smoke-test local startup without hosted overrides and confirm no official upstream hosted startup calls occur.
- [ ] 5.6 Smoke-test one local provider/Claude/Codex workflow to confirm user-owned external providers remain available.
