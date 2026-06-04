## Context
The current local runtime platform spans Electron main-process provider storage, tRPC routers, provider-profile gateways, Claude Code runtime setup, MCP configuration mutation, and headless ACP protocol entry points. These surfaces cross trust boundaries between renderer, main process, user-provided provider endpoints, local runtime clients, and local filesystem configuration.

## Goals
- Keep provider secrets and voice transcription keys out of renderer persistence and inherited process env.
- Prevent upstream provider errors from echoing credentials into runtime responses.
- Keep raw Claude runtime logs disabled unless explicitly requested.
- Constrain MCP configuration writes to normalized server names and registered project paths.
- Store/run protocol job cwd as canonical filesystem paths.

## Non-Goals
- No new UI settings for raw logs in this slice.
- No product-positioning changes.
- No new provider or runtime capabilities.
- No TTS changes.

## Decisions
- Raw Claude logging is enabled only by `CLAUDE_RAW_LOG=1`.
- Voice transcription continues to use the existing `voice_transcription` helper API purpose and encrypted main-process storage.
- Gateway direct passthrough responses stream only successful upstream responses. Failed upstream responses are read, redacted, and returned as bounded JSON errors.
- MCP project-scoped writes resolve a project path through registered projects before mutating Claude config.
- Headless ACP `cwd` is canonicalized through the registered project path guard before creating protocol jobs.

## Verification
- Add or update tests for each boundary.
- Run targeted security tests, full Bun test suite, TypeScript, native module check, build, OpenSpec strict validation, and a real Electron startup smoke with recording evidence.
