# Skill Registry Sync Smoke Test

## Date
2026-05-15

## Commands

```bash
bun run ts:check
git diff --check
openspec validate add-skill-registry-sync --strict --no-interactive
bun run build
```

## Registry Integrity Check

Verified every entry in `resources/skill-registry/manifest.json` by recalculating the SHA-256 directory hash for each bundled skill source directory.

Result:

```text
verified 11 registry skills
```

## Behavioral Smoke

Ran the registry service against temporary `HOME` directories to avoid touching real user skills.

Verified:

- clean profile starts with 11 `not-installed` registry skills
- bundled install writes `planning-workflow` into `~/.claude/skills`
- local edits are detected as `modified`
- forced restore creates a rollback backup
- rollback restores the previous edited files and reports `modified`
- user-owned skill directories are reported as `user-owned`
- installing over user-owned skills without `force` is blocked
- manifest hash mismatch reports `integrity-error`
- installing a mismatched package is blocked

Result:

```text
registry install/modify/restore/rollback smoke passed
registry user-owned overwrite protection smoke passed
registry integrity mismatch smoke passed
```

## Coverage Notes

- Bundled registry manifest and skill directories exist under `resources/skill-registry`.
- Packaged resources include `resources/skill-registry`.
- Registry install/update/restore/rollback writes are implemented in the main process.
- Registry actions verify package hash before writing.
- Existing user-created skill directories require explicit force/restore before replacement.
- Registry-managed local modifications are detected by comparing current directory hash to installed state.

## Remaining Follow-Up

Remote registry install is intentionally not enabled yet. Remote manifest checking is wired through `ONECODE_SKILL_REGISTRY_URL`; downloaded remote packages should be enabled only after adding signature policy and package format hardening.
