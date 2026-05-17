## 1. Implementation
- [x] 1.1 Add runtime-aware plugin metadata and Codex plugin cache discovery.
- [x] 1.2 Expose combined Claude/Codex plugin lists through the plugins tRPC router.
- [x] 1.3 Update Settings > Plugins with runtime filters, grouped empty states, and runtime-specific actions.
- [x] 1.4 Keep Claude plugin MCP approval explicit and remove enable-time auto-approval.
- [x] 1.5 Add bilingual UI copy for runtime labels, read-only Codex state, and approval guidance.

## 2. Validation
- [x] 2.1 Run `openspec validate add-dual-runtime-plugins --strict --no-interactive`.
- [x] 2.2 Run `git diff --check`.
- [x] 2.3 Run `bun run ts:check`.
- [x] 2.4 Run `bun run build`.
