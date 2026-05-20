# Change: Add provider profiles and local gateway routing

## Why
Locus currently has separate one-off provider settings for Claude custom models and helper APIs, and a saved Claude custom provider can become the implicit default over Claude Code OAuth. Users need explicit, switchable provider profiles that can cover China-hosted APIs and local OpenAI-compatible model servers without exposing secrets to the renderer.

## What Changes
- Add runtime-neutral provider profiles with encrypted tokens, preset metadata, capability status, and default bindings for Claude, Codex, and helper use cases.
- Route third-party Claude and Codex runs through a main-process local gateway that adapts Anthropic Messages, OpenAI Chat Completions, and OpenAI Responses-compatible providers.
- Make Claude OAuth and third-party provider usage explicit per run instead of using saved custom provider configuration as an automatic override.
- Add Settings > Models management for provider profiles, presets, tests, and defaults.

## Impact
- Affected specs: `agent-provider-profiles`, `claude-code-credentials`
- Affected code: SQLite schema/migrations, provider settings routers, Claude/Codex transports, main-process provider gateway, Settings > Models UI
