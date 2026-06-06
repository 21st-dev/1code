## Context

The repo already uses explicit runtime capability manifests and shared guard
logic, but several high-risk behaviors are still easy to duplicate during
service extraction or runtime adapter work. The immediate confirmed duplicate is
renderer-side mutation of AskUserQuestion and guarded-run atoms in both Claude
IPC and Codex ACP transports.

## Goals

- Make canonical owners visible before code changes.
- Prevent old/new duplicate implementations from becoming normal migration
  style.
- Add a low-noise architecture guard that can run in local checks.
- Remove one confirmed duplicated state-transition path.

## Non-Goals

- Do not migrate Codex ACP to an official Codex SDK in this change.
- Do not rewrite Claude desktop chat or Codex desktop chat routing.
- Do not fully decompose the large runtime routers in this change.
- Do not make headless `codex exec` a desktop chat fallback.

## Decisions

- Use `docs/OWNERSHIP_MAP.md` as the human-readable owner table because it can
  be reviewed before any AI or human code change.
- Add `scripts/check-architecture-guards.mjs` as a focused text/structure guard
  rather than a broad lint rule, keeping false positives low.
- Keep runtime routes as temporary owners where extraction is not yet complete,
  but require future extractions to delete route-local duplicate logic in the
  same change.
- Use a shared renderer helper for AskUserQuestion and guarded-run chunk state so
  both transports call the same state-transition code.

## Risks

- A guard script can become noisy if it scans for broad keywords.
  Mitigation: restrict initial checks to known owner files and high-signal
  patterns.
- The ownership map can go stale.
  Mitigation: make `AGENTS.md` require reading/updating it before related
  changes, and make guard failures point back to the owner map.

## Migration Plan

1. Add owner map and no-double-path instructions.
2. Add the guard script and package script hook.
3. Move duplicated renderer runtime-event state handling into the shared owner.
4. Run OpenSpec validation, architecture guard, targeted tests, and TypeScript
   checks where practical.
