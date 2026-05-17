## 1. Implementation
- [x] 1.1 Extend the bundled registry manifest with external collection metadata.
- [x] 1.2 Expose external collections through the skills tRPC router.
- [x] 1.3 Render external collection cards in Settings > Skills without install/update actions.
- [x] 1.4 Add bilingual copy for external collection states and source links.

## 2. Validation
- [x] 2.1 Run `openspec validate add-external-skill-collections --strict --no-interactive`.
- [x] 2.2 Run registry integrity verification for bundled skills.
- [x] 2.3 Run `git diff --check`.
- [x] 2.4 Run `bun run ts:check`.
- [x] 2.5 Run `bun run build`.
