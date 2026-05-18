## Context
Claude Code and Codex load user skills from different home directories:

- Claude Code: `~/.claude/skills`
- Codex: `~/.codex/skills`

The app already has a bundled skill registry and verified installation flow for Claude Code. The same registry package can be installed into both runtime-specific skill roots, but each runtime needs separate install state, backup paths, overwrite protection, and UI status.

## Goals
- Make runtime targeting explicit in the registry APIs and UI.
- Keep the existing Claude Code behavior as the default for compatibility.
- Reuse the same manifest verification and backup flow for both runtimes.
- Avoid symlinking or sharing the two CLI skill directories.

## Non-Goals
- No remote package installation.
- No Codex plugin marketplace integration.
- No automatic mirroring between Claude and Codex after install.
- No migration of existing non-registry user skills.

## Design
Introduce a runtime target type:

```ts
type SkillRuntime = "claude" | "codex"
```

Registry operations resolve runtime-specific paths:

- `claude` installs to `~/.claude/skills`
- `codex` installs to `~/.codex/skills`

Each runtime keeps its own registry state and backup root. The renderer can request registry status for each runtime and present actions independently. A combined "both" UI action can call the same install mutation once for each runtime.
