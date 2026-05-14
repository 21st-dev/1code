---
description: Ask the test-runner agent to plan or run targeted local smoke verification.
argument-hint: "[feature or flow to verify]"
---

@[agent:test-runner] @[skill:local-smoke-test]

Plan and, if appropriate, run targeted smoke verification for:

$ARGUMENTS

Keep startup, local repo selection, provider auth, MCP, and tool execution as separate tracks. Report commands, results, and remaining gaps.
