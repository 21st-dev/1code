# MCP Feature TODOs

## Code Review Issues

### Medium Priority

- [ ] **Fix AUTH pattern in isCredentialEnvVar()** (`src/main/lib/trpc/routers/mcp.ts:60`)
  - Current `/AUTH/i` pattern is too broad - matches `AUTHOR`, `AUTHENTICATE_URL`, etc.
  - Use more specific pattern like `/^AUTH[_-]?TOKEN/i` or `/OAUTH/i`

- [ ] **Add error toast notifications** (`src/renderer/features/mcp/ui/mcp-auth-modal.tsx`)
  - Mutation failures don't show user-facing error messages
  - Add `onError` handlers to `saveMutation` and `clearMutation`

- [ ] **Fix useEffect dependency** (`src/renderer/features/mcp/ui/mcp-auth-modal.tsx:57`)
  - `server?.credentialEnvVars` creates new array reference on each render
  - Use `JSON.stringify(server?.credentialEnvVars)` as dep or memoize

### Low Priority

- [ ] **Document base64 fallback security** (`src/main/lib/trpc/routers/mcp.ts:85-91`)
  - When `safeStorage.isEncryptionAvailable()` returns false, credentials stored as base64
  - Base64 is encoding, not encryption - document this security consideration

### Future Enhancements

- [ ] Add unit tests for MCP tRPC procedures
- [ ] Consider preserving mcp.json formatting when toggling servers
