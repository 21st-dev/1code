## 1. Implementation
- [x] 1.1 Extend skill registry install/status logic with Claude and Codex runtime targets.
- [x] 1.2 Expose runtime target parameters through the skills tRPC router.
- [x] 1.3 Update the Skills settings UI to show Claude/Codex registry states and install actions.
- [x] 1.4 Add bilingual UI copy for dual-runtime skill management.

## 2. Validation
- [x] 2.1 Run `openspec validate add-dual-runtime-skill-installs --strict --no-interactive`.
- [x] 2.2 Run `git diff --check`.
- [x] 2.3 Run `bun run ts:check`.
- [x] 2.4 Run `bun run build`.
