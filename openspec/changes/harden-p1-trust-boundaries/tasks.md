## 1. Path Boundary Hardening
- [x] 1.1 Add a shared path containment helper that rejects null bytes, absolute-path misuse, traversal segments, and root escapes.
- [x] 1.2 Require file read routes to read only inside registered project or worktree roots.
- [x] 1.3 Restrict command read/update/delete paths to Claude user or project command directories.
- [x] 1.4 Add adversarial regression tests for unauthorized file and command paths.
