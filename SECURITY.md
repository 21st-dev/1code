# Security Policy

## Supported Versions

Security fixes are accepted for the current `main` branch and the latest source
release published from this fork. Unsigned local/internal desktop packages are
test builds unless a release explicitly says otherwise.

Older forks, private branches, and locally modified builds are not covered unless
their maintainer can reproduce the issue on current `main`.

## Reporting a Vulnerability

Do not include secrets, live tokens, private repository paths, exploit payloads,
or sensitive logs in a public issue.

If GitHub private vulnerability reporting is available for this repository, use
that path first. Otherwise contact the maintainers privately before opening a
public issue. If no private channel is available, open a minimal public issue
that says a vulnerability report is available and omit exploit details until a
maintainer provides a private handoff path.

Helpful reports include:

- affected commit, tag, or package version
- operating system and install method
- whether `LOCUS_LOCAL_ONLY` or `MAIN_VITE_LOCAL_ONLY` was changed
- the affected runtime, provider, MCP server, CLI command, or UI flow
- clear reproduction steps using redacted sample data
- relevant logs with tokens, project names, local paths, and user data removed

## Security Boundaries

Locus is local-first, not offline-only. Jobs, event logs, settings, and project
state are stored locally by default, but selected runtimes, providers, MCP
servers, GitHub workflows, and voice transcription providers may receive prompts,
selected files, diffs, audio, tool context, or metadata when the user invokes
those paths.

Locus is not an OS sandbox. Terminal, git, filesystem, MCP, runtime tools, and
future computer-control flows can affect the local machine when authorized or
invoked. Supported safeguards are project/worktree-aware controls and visible
job/event auditing, not complete filesystem isolation.

Provider credentials are resolved in the main process. Renderer APIs should
receive IDs, status, and redacted metadata rather than raw provider secrets.
New provider/token writes use main-process secure storage and fail closed if OS
secure storage is unavailable. Legacy `locus:v1:base64:` credential reads remain
for compatibility only and must not be treated as new encrypted storage.

Voice transcription is configured through Settings > Models > Helper APIs. The
default local-first build no longer uses the legacy renderer/env
`MAIN_VITE_OPENAI_API_KEY` path or a hosted subscription fallback.

Local SQLite databases, run artifacts, logs, `.locus` files, `CODEX_HOME`,
Claude/Codex runtime config, and generated transcripts may contain sensitive
metadata. Do not attach them to public issues without review and redaction.

## Security-Sensitive Changes

New capabilities, breaking changes, architecture shifts, provider/auth changes,
permission model changes, sandboxing claims, hosted-surface changes, or other
security-sensitive work should go through OpenSpec before implementation unless
a maintainer explicitly treats the change as an urgent private security fix.
