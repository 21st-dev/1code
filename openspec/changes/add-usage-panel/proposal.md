# Change: Add local usage panel

## Why
Users need a quick way to understand token usage inside Locus and distinguish locally observed usage from provider quota limits.

## What Changes
- Add a lightweight Usage entry in the agents sidebar footer.
- Show locally observed token usage for the current chat/workspace, today, and the last 7 days.
- Show current context window usage when available.
- Show estimated cost only when provider metadata reports cost.
- Let users set an optional local 7-day token budget and show estimated remaining usage from locally observed tokens.
- Keep provider limit status limited to Claude Code OAuth and Codex, with external usage links instead of unsupported remaining-quota claims.

## Impact
- Affected specs: usage-panel
- Affected code: sidebar footer, usage aggregation API, chat/message metadata aggregation, local usage budget preference, localized copy
