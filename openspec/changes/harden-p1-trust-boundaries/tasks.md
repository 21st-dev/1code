## 1. Path Boundary Hardening
- [x] 1.1 Add a shared path containment helper that rejects null bytes, absolute-path misuse, traversal segments, and root escapes.
- [x] 1.2 Require file read routes to read only inside registered project or worktree roots.
- [x] 1.3 Restrict command read/update/delete paths to Claude user or project command directories.
- [x] 1.4 Add adversarial regression tests for unauthorized file and command paths.

## 2. MCP OAuth Token Storage
- [x] 2.1 Move MCP OAuth access and refresh tokens from Claude config into app-owned safeStorage-backed storage.
- [x] 2.2 Materialize Authorization headers only in runtime memory before MCP SDK/tool calls.
- [x] 2.3 Migrate legacy plaintext OAuth fields out of Claude config when encountered.
- [x] 2.4 Add adversarial regression tests proving Claude config and token-store files do not contain plaintext OAuth tokens.
