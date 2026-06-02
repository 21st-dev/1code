# Change: Add project init slash command

## Why
Users expect a first-run `/init` command for project instruction setup because Claude Code and Codex both expose similar initialization workflows. Locus currently lists built-in chat commands but omits a runtime-neutral project initialization entry point.

## What Changes
- Add Locus built-in `/init`, `/doctor`, and `/diff` slash commands for project instruction setup, local diagnostics, and working-tree review.
- Expand built-in prompt commands before sending so `/init` and existing prompt commands send their intended prompt text instead of raw slash text.
- Describe these commands in the Command Guide and slash picker as Locus workflows, not direct provider CLI commands.

## Impact
- Affected specs: agent-chat-commands
- Affected code: built-in slash command registry, slash-command expansion, new-chat slash handling, Command Guide descriptions, tests
