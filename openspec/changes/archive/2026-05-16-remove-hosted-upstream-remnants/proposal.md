# Change: Remove hosted upstream remnants

## Why
The fork is now positioned as a local-first desktop coding-agent client, but several upstream hosted 1Code surfaces still exist behind Local-only guards. Keeping those dormant paths creates product confusion, runtime noise, and extra maintenance/security review work.

## What Changes
- Remove or fully isolate hosted-only product surfaces from the default local-first build: hosted desktop auth, sync/profile update, subscription/plan gating, remote sandbox chats/import, automations, inbox, hosted updater UI, hosted voice/TTS fallback, analytics, and error reporting.
- Keep the Local-only cloud guard as defense-in-depth. This change does not add a user-facing "Local-only" setting and does not make hosted upstream services part of the normal product.
- Preserve user-owned external services and local workflows: Claude Code local credentials, Codex credentials, API-key/custom-provider flows, Ollama, local projects, SQLite state, Git/GitHub operations, skills, MCP, and external links not owned by the upstream hosted product.
- Update docs and tests so the default build is described as local-first with hosted upstream remnants removed, rather than as a hosted product with cloud paths merely disabled.

## Impact
- Affected specs: `local-only-cloud-guard`
- Affected code:
  - Main process auth, updater, analytics, sandbox import, hosted voice/plan, and hosted fetch proxy paths
  - Renderer onboarding, sidebar, remote chat, archive, update, telemetry, and hosted subscription surfaces
  - Preload APIs for hosted auth/update/remote calls where no local use remains
  - Package dependencies for telemetry/update libraries if no longer referenced
- Active-change coordination:
  - `add-local-claude-code-credentials` is still active and touches Claude Code auth. Cleanup must avoid overwriting that work and should remove the old hosted sandbox OAuth path only after the local credential path is confirmed.
