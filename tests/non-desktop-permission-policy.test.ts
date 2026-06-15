import { describe, expect, test } from "bun:test"
import {
  resolveNonDesktopPermissionPolicy,
  type NonDesktopInteractiveRequirement,
} from "../src/main/lib/agent-runtime/permission-policy"
import { createAgentRuntimeRunRequest } from "../src/main/lib/headless/agent-runtime-contract"

describe("non-desktop runtime permission policy", () => {
  test("keeps ordinary headless plan and agent jobs on the batch capability gate", () => {
    const plan = resolveNonDesktopPermissionPolicy({
      source: "api",
      mode: "plan",
      executionProfile: "batch",
    })
    const agent = resolveNonDesktopPermissionPolicy({
      source: "daemon",
      mode: "agent",
      executionProfile: "batch",
    })

    expect(plan).toMatchObject({
      kind: "headless-batch",
      interaction: "none",
      enforcement: "batch-adapter-capability-gate",
      blockedRequirements: [],
      failClosedReasons: [],
    })
    expect(agent).toMatchObject({
      kind: "headless-batch",
      interaction: "none",
      enforcement: "batch-adapter-capability-gate",
    })
  })

  test("resolves a declared interaction bridge to interactive-user semantics", () => {
    const policy = resolveNonDesktopPermissionPolicy({
      source: "protocol",
      mode: "agent",
      executionProfile: "interactive",
      hasVisibleUserInteractionChannel: true,
      interactiveRequirements: ["ask-user-question"],
    })

    expect(policy).toMatchObject({
      kind: "interactive-user",
      interaction: "visible-user",
      enforcement: "interactive-user-bridge",
    })
  })

  test("resolves bounded non-desktop grants without claiming adapter enforcement", () => {
    const policy = resolveNonDesktopPermissionPolicy({
      source: "api",
      mode: "agent",
      executionProfile: "policy-grant",
      policyGrant: {
        scopes: ["workspace:file-write", "shell:project-only"],
      },
    })

    expect(policy).toMatchObject({
      kind: "policy-grant",
      interaction: "none",
      enforcement: "non-desktop-policy-grant",
      grantedScopes: ["workspace:file-write", "shell:project-only"],
      failClosedReasons: [],
    })
    expect(policy.diagnostics.join("\n")).toContain(
      "must not claim per-scope enforcement",
    )
  })

  test("fails closed when interaction-only requirements have no user channel", () => {
    const requirements: NonDesktopInteractiveRequirement[] = [
      "interactive-approval",
      "ask-user-question",
      "mcp-elicitation",
      "unknown-side-effect-approval",
    ]
    const policy = resolveNonDesktopPermissionPolicy({
      source: "api",
      mode: "agent",
      executionProfile: "batch",
      interactiveRequirements: requirements,
    })

    expect(policy).toMatchObject({
      kind: "fail-closed",
      interaction: "none",
      enforcement: "non-desktop-fail-closed",
      blockedRequirements: requirements,
      failClosedReasons: ["no_interaction_channel"],
    })
    expect(JSON.stringify(policy)).not.toMatch(/token|authorization|bearer/i)
  })

  test("headless request embeds resolved non-desktop policy semantics", () => {
    const request = createAgentRuntimeRunRequest({
      jobId: "job-policy",
      runtime: "codex",
      cwd: "/repo",
      mode: "agent",
      source: "api",
      executionProfile: "policy-grant",
      policyGrant: {
        scopes: ["workspace:file-write"],
      },
      prompt: "Run with a declared policy grant",
      signal: new AbortController().signal,
    })

    expect(request.permissionPolicy).toMatchObject({
      kind: "policy-grant",
      interaction: "none",
      grantedScopes: ["workspace:file-write"],
    })
  })
})
