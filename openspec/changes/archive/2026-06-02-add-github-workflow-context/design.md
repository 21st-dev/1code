## Context
Locus already runs Claude Code and Codex as local coding agent runtimes, and provider profiles let users route some agent work through third-party APIs. Claude Code and Codex have their own GitHub-related product features, but those features are not shared platform state inside Locus. If GitHub context stays inside a runtime transcript or a hosted integration, users lose continuity when switching runtimes.

This change adds a Locus-owned GitHub context layer for the currently opened local repository. The layer should make GitHub work items available to any runtime while preserving local-first credential boundaries.

## Goals
- Make GitHub issue, PR, check, CI log, and review-comment context available to Claude Code, Codex, and third-party provider-backed agent runs.
- Keep GitHub credentials outside Locus by relying on the user's local GitHub CLI authentication for the initial implementation.
- Keep read-only context as the first user-visible slice.
- Require explicit user confirmation before any GitHub mutation such as creating a pull request.
- Present GitHub context as a project/worktree workflow surface, not as another model/runtime option.

## Non-Goals
- Do not replace Claude Code or Codex native GitHub/cloud integrations.
- Do not add a new chat runtime.
- Do not store GitHub personal access tokens or implement a Locus GitHub OAuth flow in the first version.
- Do not add release publishing, artifact upload, auto-merge, automatic review replies, or automatic review-thread resolution.
- Do not build a generic Linear/Jira/GitLab abstraction before the GitHub workflow proves useful.

## Technical Decisions
- Use `gh` as the first authentication and API transport because it keeps tokens in the user's existing GitHub CLI credential store and avoids new credential storage in Locus.
- Execute GitHub workflow commands from the main process only, using the same shell-environment handling already needed for local Git/GitHub workflows in GUI-launched macOS sessions.
- Return structured, bounded JSON to the renderer; do not expose raw tokens, full unbounded CI logs, or arbitrary command output as renderer state.
- Treat CI logs and review comments as explicit agent context attachments or bounded prompt blocks selected by the user.
- Keep mutation commands behind typed request objects and confirmation gates. The renderer may draft title/body, but the main process should only execute create-PR commands after the user confirms the final request.
- Keep runtime dispatch separate from GitHub context loading: a GitHub context card should be attachable to whichever runtime is currently active.

## UX Shape
- A lightweight GitHub status area shows whether the current project is a GitHub repository, whether `gh` is installed, whether the user is authenticated, the current branch, and the current PR if one exists.
- A "Start from GitHub" entry lets users paste an issue or PR URL and turn it into an agent-ready task card.
- A current-PR card summarizes PR title, URL, state, review decision, checks, and unresolved review feedback.
- Context actions are explicit: "Send PR context to agent", "Send failing check log to agent", "Send review comments to agent", and "Create draft PR".
- First release should feel like context handoff, not automation. Locus prepares and carries context; users still choose when to run agents and when to mutate GitHub.

## Security and Privacy
- Locus must not read or persist GitHub access tokens.
- Authentication setup should happen through `gh auth login` in a terminal or external browser flow managed by GitHub CLI.
- Network operations should be scoped to the current repository or explicitly pasted GitHub URL.
- CI logs should be bounded and redacted before being attached to an agent conversation.
- GitHub mutations should be visibly attributed to the user's local GitHub CLI identity and require user confirmation.
