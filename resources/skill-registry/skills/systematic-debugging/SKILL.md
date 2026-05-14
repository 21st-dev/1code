---
name: systematic-debugging
description: General debugging workflow for finding root cause before applying fixes.
---

Use this skill when there is a bug, failed test, build failure, runtime error, unexpected behavior, or confusing local setup issue.

Principle:
- Find the root cause before proposing or applying a fix.
- Do not stack speculative changes.

Workflow:
1. Capture the symptom.
   - Exact command, user action, or request.
   - Full relevant error message or log line.
   - Expected behavior vs actual behavior.

2. Reproduce or narrow.
   - Try the smallest command or UI path that shows the issue.
   - If it is not reproducible, gather more evidence before changing code.
   - Separate environment issues from product behavior.

3. Check recent and local context.
   - Current branch and dirty files.
   - Recent diffs related to the failure.
   - Relevant config, env vars, dependency versions, or service state.
   - Local guidance files and existing tests.

4. Trace the failing path.
   - Identify the boundary where good input becomes bad output.
   - For multi-component systems, inspect each boundary separately.
   - Prefer reading the call path over guessing from symptoms.

5. Compare with working examples.
   - Search the codebase for similar working flows.
   - Compare data shape, config, permissions, imports, and error handling.
   - Use established project patterns unless there is a clear reason not to.

6. State one hypothesis.
   - "I think the root cause is X because Y."
   - Test one variable at a time.
   - If the hypothesis fails, update the hypothesis instead of adding unrelated fixes.

7. Fix the root cause.
   - Add or run a focused regression test when feasible.
   - Make the smallest change that addresses the cause.
   - Avoid unrelated cleanup.

8. Verify.
   - Rerun the failing command or flow.
   - Run nearby tests or checks that could catch regressions.
   - State what remains unverified.

Output format:
- Symptom
- Evidence
- Root cause
- Fix
- Verification
- Remaining risk

Default stance:
- A fast fix without root cause is only acceptable when the user explicitly asks for a temporary workaround, and the risk is stated clearly.
