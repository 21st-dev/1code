# Change: Harden worktree setup trust

## Why
Worktree setup commands are loaded from repository-controlled files such as `.locus/worktree.json` and `.cursor/worktrees.json`. Running those shell commands automatically after chat creation allows a malicious repository to execute arbitrary code on the user's machine.

## What Changes
- Add a main-process trust gate before any repository-provided worktree setup command can run.
- Require explicit user approval after showing the original command list, config source, and config path.
- Remember approvals by project and setup command fingerprint so changed commands require fresh approval.
- Treat imported `.cursor` and legacy `.1code` setup configs the same as native Locus configs: visible and untrusted until approved.

## Impact
- Affected specs: `runtime-security-baseline`
- Affected code: worktree creation, worktree setup config execution, project chat worktree resolution, preload event bridge, renderer approval UI, local database schema
