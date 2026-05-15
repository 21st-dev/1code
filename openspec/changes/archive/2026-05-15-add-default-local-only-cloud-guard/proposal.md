# Change: Add default local-only cloud guard

## Why
The open-source desktop app still has several code paths that contact upstream hosted services by default. Local-first users need a centralized guard that makes official cloud access opt-in rather than relying on scattered UI hiding.

## What Changes
- Default the app to local-only mode, with an explicit environment override for development or internal builds.
- Block upstream hosted APIs, CDN updates, remote sandbox, hosted auth, hosted voice/TTS, analytics, and error reporting while local-only mode is enabled.
- Add a main-process guard used by hosted feature entrypoints and renderer fetch proxies.
- Hide or disable renderer remote/cloud feature surfaces while preserving local projects, local SQLite data, Ollama, Git/GitHub operations, and user-configured AI providers.

## Impact
- Affected specs: `local-only-cloud-guard`
- Affected code:
  - Main process config/auth/update/proxy/voice/sandbox/OAuth/analytics paths
  - Renderer remote API clients, remote chat UI, beta/help/update surfaces, and TTS callers
  - Preload desktop API types and open-source documentation
