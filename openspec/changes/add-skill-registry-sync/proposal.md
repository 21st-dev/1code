# Change: Add skill registry synchronization

## Why
Packaged 1Code cannot rely on a developer's local `~/.codex/skills` directory. Global skills should come from a versioned, verifiable data source so a packaged app can discover, install, update, and roll back reusable skills consistently across machines.

## What Changes
- Add a skill registry concept for versioned skill packs and manifests.
- Support bundled registry data shipped with the app as the first data source.
- Support remote registry checking as a follow-up path, with checksum/signature verification before install.
- Add install/update state for registry-managed skills without breaking user-created and project skills.
- Add manual "check for updates" and "apply update" flows before any registry-managed skill is changed.
- Keep local `~/.codex/skills` import as a developer-only migration utility, not the packaged product update model.

## Impact
- Affected specs: `skill-registry`
- Affected code:
  - `src/main/lib/trpc/routers/skills.ts`
  - `src/main/lib/trpc/routers/index.ts`
  - `src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx`
  - likely new main-process registry service under `src/main/lib/skills/`
  - likely bundled registry assets under `resources/` or another packaged asset directory
- Security considerations:
  - Registry downloads must verify content hashes before installation.
  - Remote sources must not execute post-install scripts.
  - Updates must not silently overwrite user-owned skills without backup and explicit user action.
