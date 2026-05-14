---
name: subagent-workflow
description: General workflow for coordinating specialist agents on implementation, review, security, and verification tasks.
---

Use this skill when work can be split across specialist agents or when a task benefits from independent implementation and review.

Core model:
- The main assistant is the coordinator.
- Specialist agents do bounded work with explicit context.
- Review happens before claiming completion.

Recommended roles:
- Explorer: read-only codebase investigation.
- Implementer: makes a narrowly scoped code change.
- Spec reviewer: checks whether the implementation matches the request.
- Code reviewer: checks correctness, maintainability, and regressions.
- Security reviewer: checks secrets, trust boundaries, permissions, and unsafe execution.
- Test runner: runs targeted verification and reports evidence.

Dispatch rules:
- Give each agent a bounded task, exact repo path, relevant files, and expected output.
- Do not ask an agent to infer the entire conversation history.
- For implementation agents, specify owned files or modules when possible.
- For review agents, provide the request, claimed implementation, changed files, and base/head context when available.
- Do not run multiple agents on overlapping write scopes unless coordination is explicit.

Implementation loop:
1. Explorer investigates current behavior if the change area is not clear.
2. Implementer makes one bounded change and reports:
   - Status: DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED
   - Files changed
   - Tests run
   - Concerns
3. Spec reviewer checks request compliance.
4. Code reviewer checks quality and regression risk.
5. Security reviewer runs only when auth, credentials, file access, command execution, network calls, or permissions are touched.
6. Test runner verifies the smallest useful checks.
7. Coordinator integrates results and decides whether to fix, continue, or escalate.

Stop conditions:
- Requirements are ambiguous enough that implementation would be guesswork.
- The implementation uncovers a larger architecture decision.
- A reviewer finds a critical or important issue that has not been resolved.
- Verification cannot be run and the remaining risk is material.

Output format:
- Agents used
- What each agent was asked to do
- Results and issues
- Fixes applied
- Final verification

Default stance:
- Subagents are useful for independent work, not for outsourcing judgment.
- The coordinator remains responsible for final correctness.
