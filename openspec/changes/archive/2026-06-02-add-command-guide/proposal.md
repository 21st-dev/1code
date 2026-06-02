# Change: Add local Command Guide

## Why
Users can already trigger Locus slash commands, Claude Code commands, Codex commands, skills, and plugin-provided capabilities, but the app does not make the available command surface obvious. This creates uncertainty about what `/` can do and what the installed runtimes expose.

## What Changes
- Add a read-only Command Guide surface in Settings that summarizes locally detected Locus slash commands, local command files, runtime CLI subcommands, and plugin-provided command components.
- Show runtime executable path, version, and detection status for Claude Code and Codex when available.
- Clarify that runtime CLI command lists are detected from the local executable help output and may change when the runtime updates.
- Add an on-demand official command index snapshot that fetches selected Claude Code and Codex Markdown/llms sources, parses command references, stores source metadata locally, and displays last-updated/hash/source details.
- Compare local runtime help counts with the cached official CLI command counts so users can see when local bundled runtimes and provider docs may differ.
- Make the chat slash-command dropdown more self-explanatory without replacing the existing Skills/Commands editor.

## Impact
- Affected specs: command-guide
- Affected code: command scanning tRPC, official command index cache, Settings sidebar/content, slash command dropdown, i18n dictionaries
