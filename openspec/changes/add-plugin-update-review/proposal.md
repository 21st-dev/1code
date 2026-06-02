# Change: Add plugin update review metadata

## Why
Locus can now show plugin target modes and keep Codex packages read-only, but it does not yet remember whether a plugin manifest changed between local refreshes. Users need a concrete local review signal for plugin updates without treating Codex++ tweak permissions or local hashes as a sandbox.

## What Changes
- Add local plugin manifest fingerprints for discovered Claude Code and Codex plugin packages.
- Persist the last scanned fingerprint and last reviewed fingerprint in local app data.
- Show update-review status, manifest hash, optional store/source pin metadata, and a bounded change summary in Settings > Plugins.
- Keep refresh/read/review actions local and advisory; do not install, update, enable, or execute plugins.

## Impact
- Affected specs: `runtime-plugins`
- Affected code: `src/main/lib/plugins`, `src/main/lib/trpc/routers/plugins.ts`, `src/shared`, `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`, plugin tests, i18n tests
