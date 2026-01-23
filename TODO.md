# ii-client TODO

## Authentication

### Fix Custom OAuth Flow

**Status:** Low Priority - Workaround Available

**Problem:**
The custom OAuth implementation for Claude Code authentication is incomplete. While the authorization step works (browser opens, user authenticates), the token exchange fails with various errors.

**Current Workaround:**
The "Import from Claude CLI" option works perfectly:
- Opens Terminal window with `claude setup-token`
- User completes OAuth in browser
- Token stored in system keychain
- App reads token from keychain

**Implementation Details:**
- Location: `src/main/lib/oauth-server.ts`, `src/main/lib/oauth-utils.ts`
- Uses PKCE (RFC 7636) for secure OAuth without client secret
- Token endpoint: `https://api.anthropic.com/v1/oauth/token`
- Client ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e` (Claude Desktop client ID)

**Errors Encountered:**
- Missing `state` parameter (✅ Fixed)
- Wrong Content-Type (tried both JSON and form-urlencoded)
- Wrong endpoint path (tried `/v1/oauth/token`, `/api/oauth/token`, `/platform.claude.com`)
- 400/404 errors from Anthropic API

**Next Steps:**
1. Research the correct OAuth token exchange format for Anthropic
2. Verify all required parameters and headers
3. Consider contacting Anthropic support or reviewing Claude CLI source code
4. Alternative: Use device flow instead of authorization code flow

**Related Files:**
- `src/main/lib/oauth-server.ts` - Local OAuth server implementation
- `src/main/lib/oauth-utils.ts` - Shared OAuth utilities
- `src/main/lib/claude-token.ts` - Token management and CLI integration
- `src/main/lib/trpc/routers/claude-code.ts` - tRPC procedures for auth

**Priority:** Low - The CLI-based workaround is user-friendly and fully functional
