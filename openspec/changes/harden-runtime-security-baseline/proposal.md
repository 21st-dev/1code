# Change: Harden Runtime Security Baseline

## Why
Provider credentials, runtime logs, gateway responses, and MCP configuration writes are foundation-level trust boundaries. They should be treated as a security baseline for the local runtime platform rather than as product-direction work.

## What Changes
- Keep voice transcription keys in main-process secure helper API storage and prevent env/localStorage fallback from becoming active again.
- Redact provider gateway upstream error bodies before returning errors to runtime clients or the renderer.
- Make Claude raw logging explicit opt-in instead of enabled by default in development.
- Guard Claude MCP configuration writes with server-name validation and registered project path resolution.
- Canonicalize protocol job cwd before storing/running headless ACP jobs.

## Impact
- Affected specs: runtime-security-baseline
- Affected code:
  - `src/main/lib/claude/env.ts`
  - `src/main/lib/claude/raw-logger.ts`
  - `src/main/lib/headless/acp-stdio.ts`
  - `src/main/lib/headless/schedules.ts`
  - `src/main/lib/provider-profiles/gateway.ts`
  - `src/main/lib/trpc/routers/claude.ts`
  - `src/main/lib/trpc/routers/voice.ts`
  - `src/main/lib/voice/transcription.ts`
  - `tests/`
- Out of scope:
  - README or product-positioning copy
  - Dynamic Workflows product support
  - TTS or new voice product features
