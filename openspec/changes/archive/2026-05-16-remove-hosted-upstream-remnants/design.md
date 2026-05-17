## Context
`local-only-cloud-guard` currently protects the fork by defaulting to Local-only mode and blocking official upstream hosted hosts. That guard is useful, but the codebase still contains visible and hidden hosted product paths from the upstream app. The cleanup should make the default product simpler: local-first behavior should be the normal code path, not a hosted app with many disabled cloud branches.

## Goals
- Remove hosted-only user-facing surfaces and dead runtime paths from the default local-first build.
- Keep the centralized Local-only guard as a final safety boundary for official upstream hosts.
- Preserve all user-configured provider endpoints and local agent workflows.
- Reduce runtime warnings from disabled hosted features.
- Keep the change incremental and reviewable.

## Non-Goals
- Do not remove Claude Code, Codex, custom providers, Ollama, MCP, skills, local project selection, local SQLite state, terminal, git diff, staging, commits, or worktrees.
- Do not remove user-initiated GitHub or browser links.
- Do not build a replacement cloud sync, hosted sandbox, automations, or account system.
- Do not add a UI toggle for Local-only mode.
- Do not rewrite unrelated onboarding or provider configuration flows.

## Decisions
- Decision: Keep `src/shared/local-only.ts` and `src/main/lib/local-only.ts`.
  - Reason: They are the source of truth for official upstream host blocking and prevent accidental reintroduction of hosted calls.
- Decision: Remove hosted remnants by product surface, not by blind string deletion.
  - Reason: Terms such as `remote`, `sandbox`, `subscription`, and `update` also appear in local or generic code paths.
- Decision: Clean renderer entrypoints before deleting main-process handlers.
  - Reason: This lets the UI stop advertising hosted features while preserving a fallback guard during the transition.
- Decision: Coordinate with `add-local-claude-code-credentials`.
  - Reason: That active change replaces the old hosted Claude Code sandbox OAuth path with local credential import. Deleting shared auth code before that work settles would create avoidable conflicts.

## Cleanup Classification

### Remove or isolate from default build
- Hosted desktop auth and profile/sync APIs:
  - `src/renderer/login.html`
  - `auth:start-flow`, `auth:get-user`, `auth:update-user`, hosted token refresh, and hosted profile update paths when they are only used for upstream account flows
- Remote sandbox and hosted chat:
  - `src/renderer/lib/remote-api.ts`
  - `src/renderer/lib/remote-trpc.ts`
  - `src/renderer/features/agents/lib/remote-chat-transport.ts`
  - remote chat hooks, archive entries, sandbox import router, and "Open Locally" import flows that depend on upstream sandbox APIs
- Hosted-only sidebar surfaces:
  - Automations, Inbox, remote workspace counts, and cloud chat source selectors
- Hosted updates:
  - update banners, update IPC/preload APIs, updater channel UI, and `electron-updater` dependency if no fork-owned updater remains
- Telemetry and error reporting:
  - Sentry initialization
  - PostHog main/renderer analytics
  - plan-enrichment calls used only for analytics
- Hosted voice/TTS fallback:
  - subscription-plan checks and hosted voice calls
  - keep local provider/API-key voice only if product still exposes it

### Preserve
- Local-only guard host detection and blocked-response helpers
- Claude Code local credentials and refresh paths
- Codex subscription/API-key/local binary integration
- Custom model and user-configured Anthropic-compatible provider endpoints
- Ollama/local helper generation
- Local SQLite data and migrations
- Local project, terminal, git, worktree, diff, staging, commit, and PR/GitHub workflows
- MCP and skills
- External links that are not official upstream hosted services

## Migration Plan
1. Inventory hosted-only entrypoints and confirm there are no active local callers.
2. Remove renderer entrypoints and hosted-only state branches.
3. Remove or isolate main-process handlers and routers after renderer callers are gone.
4. Remove unused preload APIs and dependencies.
5. Update README/CONTRIBUTING/OpenSpec docs to describe the local-first default.
6. Run static checks and a local smoke test to confirm no hosted upstream startup calls occur.

## Risks / Trade-offs
- Risk: Removing remote-chat types too aggressively can break local archive/diff components that reuse the same UI.
  - Mitigation: Remove callers and mode branches incrementally, running type checks after each slice.
- Risk: Active Claude Code credential work may overlap with old hosted OAuth cleanup.
  - Mitigation: Treat `src/main/lib/trpc/routers/claude-code.ts` as coordinated work and avoid overwriting pending local-login changes.
- Risk: Update or telemetry dependencies may still be referenced indirectly.
  - Mitigation: remove dependencies only after `rg` confirms no imports remain and `bun run build` passes.

## Verification
- `openspec validate remove-hosted-upstream-remnants --strict --no-interactive`
- `bun run ts:check`
- `bun run build`
- `git diff --check`
- Local smoke launch with no hosted override:
  - App starts without desktop hosted login.
  - No 21st/1code/e2b/codesandbox startup requests are observed.
  - Local project chat can still run with local Claude/Codex/custom provider configuration.
  - User-configured provider endpoint calls are not blocked by the Local-only guard.
