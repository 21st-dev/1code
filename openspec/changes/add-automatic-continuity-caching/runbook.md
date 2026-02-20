# Automatic Continuity Runbook

## Scope
This runbook covers operating and troubleshooting Automatic Continuity + Caching in 1Code desktop.

## Runtime Controls
- `ONECODE_CONTINUITY_MODE=off|passive|active`
- `ONECODE_CONTINUITY_ENABLE_SNAPSHOT=0|1` (default enabled)
- `ONECODE_CONTINUITY_ENABLE_REHYDRATE=0|1` (default disabled)
- `ONECODE_CONTINUITY_ARTIFACT_POLICY=auto-write-manual-commit|auto-write-memory-branch`
- `ONECODE_CONTINUITY_MEMORY_BRANCH=<branch-name>` (default `memory/continuity`)

## Recommended Rollout
1. Start with `ONECODE_CONTINUITY_MODE=passive`.
2. Verify telemetry for pack hit rates and governor decisions.
3. Move to `ONECODE_CONTINUITY_MODE=active` with rehydrate disabled.
4. Enable rehydrate only after quality gate:
   - `ONECODE_CONTINUITY_ENABLE_REHYDRATE=1`

## Safeguard Policy
- Default policy is `auto-write-manual-commit`.
- Even when auto-commit is configured, continuity blocks automatic commits unless current branch equals configured memory branch.
- Feature branches are protected by this guard.

## Operational Checks
- Validate spec state:
  - `bun run openspec:validate`
- Inspect continuity settings via TRPC:
  - `continuitySettings.get`
- Update continuity settings via TRPC:
  - `continuitySettings.update`

## Troubleshooting
- Symptom: No continuity behavior at all.
  - Check `ONECODE_CONTINUITY_MODE`; `off` disables all continuity processing.
- Symptom: Metrics appear but prompt behavior unchanged.
  - Expected in `passive` mode.
- Symptom: Snapshot artifacts created but no rehydrate turnover.
  - Ensure `ONECODE_CONTINUITY_ENABLE_REHYDRATE=1`.
- Symptom: Auto-commit requested but not happening.
  - Expected unless current branch matches `ONECODE_CONTINUITY_MEMORY_BRANCH`.
- Symptom: High context cost with low cache reuse.
  - Confirm stable task prompts and repo state; check pack cache hit telemetry.
