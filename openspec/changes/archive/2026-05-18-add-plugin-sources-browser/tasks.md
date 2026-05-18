## 1. Implementation
- [x] 1.1 Add plugin source metadata and local/cache source discovery.
- [x] 1.2 Expose plugin sources through the plugins tRPC router.
- [x] 1.3 Add an Installed/Sources switch and source list/detail UI to Settings > Plugins.
- [x] 1.4 Add bilingual UI copy for source kind, trust, status, path, counts, and install hints.

## 2. Validation
- [x] 2.1 Run `openspec validate add-plugin-sources-browser --strict --no-interactive`.
- [x] 2.2 Run `git diff --check`.
- [x] 2.3 Run `bun run ts:check`.
- [x] 2.4 Run `bun run build`.
