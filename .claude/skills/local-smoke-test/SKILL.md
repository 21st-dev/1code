---
name: local-smoke-test
description: Local verification checklist for 1Code desktop startup, repo selection, providers, and basic agent use.
---

Use this skill when planning or running a local smoke test for the 1Code app.

Keep these tracks separate:
- Startup and loginless local mode.
- Local repo selection and worktree setup.
- Claude provider configuration.
- Codex provider and MCP startup.
- Tool-call execution.
- Renderer UI behavior.

Suggested smoke flow:
1. Start the Electron dev app with the repo's known dev command.
2. Confirm the app reaches local mode without requiring hosted login.
3. Open a local repository.
4. Configure or select the intended model/provider.
5. Send a read-only prompt that requires basic project inspection.
6. Confirm the agent can read files and return a grounded answer.
7. Confirm no plaintext token appears in renderer storage or logs.
8. Record exact command output, app logs, and observed UI state.

Reporting:
- State the exact command used.
- State whether local mode loaded.
- State which repo was opened.
- State which provider/model was selected.
- State which tools were observed.
- List failures by track instead of summarizing them as one general app failure.
