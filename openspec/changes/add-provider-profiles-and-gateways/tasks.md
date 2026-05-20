## 1. Specification
- [x] 1.1 Add provider-profile requirements and Claude precedence modifications.
- [x] 1.2 Validate the OpenSpec change strictly.

## 2. Storage and Main Process
- [x] 2.1 Add provider profile/default schema and migration.
- [x] 2.2 Add provider presets and secure profile persistence router.
- [x] 2.3 Add local gateway proxy/transforms and capability tests.

## 3. Runtime Integration
- [x] 3.1 Route Claude provider-profile runs through the gateway.
- [x] 3.2 Route Codex provider-profile runs through `codex-acp` runtime config overrides.
- [x] 3.3 Migrate/read legacy custom-provider and helper API settings without exposing tokens.

## 4. Renderer
- [x] 4.1 Replace ambiguous Claude `auto` behavior with explicit OAuth default.
- [x] 4.2 Add Provider Profiles management UI in Settings > Models.
- [x] 4.3 Expose profile choices in the model selector and helper defaults.

## 5. Verification
- [x] 5.1 Add targeted tests for profile validation, transforms, gateway auth, migration, and redaction.
- [x] 5.2 Run `bun run test`, `bun run ts:check`, `bun run build`, and `git diff --check`.
