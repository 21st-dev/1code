## Context
Existing provider configuration is split across `claude_provider_config`, `local_api_provider_configs`, renderer localStorage atoms, and Codex API-key state. This makes it hard to support many OpenAI-compatible China platforms and local model servers consistently.

## Goals
- Keep provider tokens encrypted and main-process-owned.
- Let users explicitly choose Claude Code OAuth, Codex ChatGPT/API key, or a provider profile per run.
- Support OpenAI Chat-compatible China/local endpoints and native Anthropic/Responses endpoints through one capability-tested profile model.
- Preserve existing legacy provider settings through migration/read compatibility.

## Non-Goals
- Do not bundle or download local model weights in this change.
- Do not write directly to `~/.codex/config.toml`.
- Do not guarantee every provider supports tools, vision, or agentic coding; detect and display capability status.

## Technical Decisions
- Store profiles in SQLite with JSON text columns for headers, target runtimes, capabilities, and last test status.
- Start one loopback gateway per app process only when a provider-profile runtime needs it.
- Give the gateway a random process token and route profile ids through local gateway URLs; the renderer never receives profile tokens.
- Codex profile runs use `codex-acp -c` runtime overrides rather than user config mutation.
- Legacy `custom-provider` source values resolve to the migrated legacy profile where available; otherwise they fail visibly instead of falling back silently.
