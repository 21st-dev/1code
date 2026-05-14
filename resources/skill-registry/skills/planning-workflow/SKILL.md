---
name: planning-workflow
description: General planning workflow for turning an ambiguous development request into a clear, executable plan before implementation.
---

Use this skill when a user asks for a new feature, meaningful behavior change, architecture change, or multi-step implementation.

Purpose:
- Clarify the goal before changing code.
- Separate product intent, technical approach, acceptance criteria, and implementation steps.
- Keep plans small enough to execute and verify.

Workflow:
1. Understand the current project context.
   - Read the local guidance files first when they exist, such as `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, or project-specific spec files.
   - Identify the app type, tech stack, test commands, and existing patterns.

2. Decide whether a formal proposal is needed.
   - Use a formal spec/proposal process if the repo requires one.
   - Proposals are usually needed for new product capabilities, architecture shifts, schema changes, security-sensitive changes, or breaking behavior.
   - Small config changes, documentation updates, and narrow bug fixes usually do not need a proposal unless the repo says otherwise.

3. Convert the request into a short design.
   - Goal: one sentence.
   - Non-goals: what will not be included.
   - Scope: files, modules, or user flows likely involved.
   - Risks: data loss, security, migration, UX, performance, or test gaps.
   - Acceptance criteria: observable behavior that proves the work is done.

4. Create an implementation plan.
   - Break work into small tasks with clear file ownership.
   - Prefer tests or smoke checks close to each task.
   - Include exact commands when known.
   - Avoid placeholders like "handle edge cases" without naming the cases.
   - Avoid broad refactors unless they are required for the goal.

5. Choose execution mode.
   - Inline execution: use for small or tightly coupled work.
   - Subagent workflow: use when tasks are independent enough for separate implementer/reviewer/tester roles.
   - Manual approval: stop and ask when the plan changes product behavior, security posture, or data model in a way the user has not approved.

Output format:
- Goal
- Scope
- Plan
- Verification
- Open questions, only if they block safe execution

Default stance:
- Keep the first version small.
- Prefer the repo's existing patterns.
- Do not make irreversible changes without explicit user intent.
