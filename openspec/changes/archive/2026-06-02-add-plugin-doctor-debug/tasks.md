## 1. OpenSpec
- [x] 1.1 Review current `runtime-plugins` spec and active plugin changes for conflicts.
- [x] 1.2 Add proposal, design, tasks, and spec delta for plugin Doctor/Debug.
- [x] 1.3 Run `openspec validate add-plugin-doctor-debug --strict --no-interactive`.

## 2. Shared/Main Doctor Model
- [x] 2.1 Add shared Doctor/Debug types and aggregation helpers.
- [x] 2.2 Generate plugin Doctor checks from source status, review metadata, safety gates, component counts, MCP declarations, and local state.
- [x] 2.3 Expose Doctor/Debug data through the plugins tRPC router without raw secret values.

## 3. Runtime Gate Consistency
- [x] 3.1 Add a main-process helper for allowed Claude plugin runtime components.
- [x] 3.2 Gate plugin commands on enabled source, safe mode, and reviewed fingerprint.
- [x] 3.3 Gate plugin skills on enabled source, safe mode, and reviewed fingerprint.
- [x] 3.4 Gate plugin agents and agent loading on enabled source, safe mode, and reviewed fingerprint.

## 4. UI/UX
- [x] 4.1 Add a compact Doctor summary to Settings > Plugins.
- [x] 4.2 Add per-plugin Debug details without implying sandboxing or Codex++ compatibility.
- [x] 4.3 Localize English and Simplified Chinese copy.
- [x] 4.4 Review the UI after smoke and fix clarity/layout issues.

## 5. Tests
- [x] 5.1 Add shared Doctor model tests.
- [x] 5.2 Add source guards for runtime component gate coverage.
- [x] 5.3 Add UI/i18n source-guard tests.
- [x] 5.4 Run targeted plugin/i18n tests.
- [x] 5.5 Run full `bun run test`.
- [x] 5.6 Run `bun run ts:check`.
- [x] 5.7 Run `openspec validate add-plugin-doctor-debug --strict --no-interactive`.
- [x] 5.8 Run `git diff --check`.
- [x] 5.9 Run desktop Settings > Plugins smoke with a clean QA userData path.
- [x] 5.10 Record screenshot and video evidence.
