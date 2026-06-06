<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Architecture Ownership

Before changing runtime, provider, guard, auth, capability, MCP, chat, or
renderer runtime-event state logic, read `docs/OWNERSHIP_MAP.md` and identify
the canonical owner for the capability being changed.

This project does not allow old/new duplicate business paths. When extracting
logic into a new module, service, adapter, or helper, the same change must
remove or replace the old helper and call sites. Do not keep both paths alive.

Temporary dual paths are only allowed when the change includes all of these:
- a canonical owner
- an explicit migration flag or gate
- a deletion date or deletion follow-up
- tests or architecture guards proving the allowed boundary
- a deprecation comment naming the removal plan

Routes and transports may parse request or stream envelopes, but durable
business rules and shared state transitions must live in their canonical owner.
Do not add a second implementation just because another runtime, provider, or
UI path needs the same behavior.
