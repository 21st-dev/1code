import { describe, expect, test } from "bun:test"
import {
  buildCodexCapabilityErrorChunk,
  buildCodexRuntimeAvailability,
  buildCodexRuntimeAvailabilityFromComponents,
  buildCodexRuntimeStatusChunk,
  createCodexRuntimeComponent,
  createCodexRuntimeBlocker,
  type CodexAcpRuntimeLike,
  type RuntimeExecutableLike,
} from "../src/shared/codex-runtime-status"

const readyExecutable = (path: string): RuntimeExecutableLike => ({
  ok: true,
  path,
  exists: true,
  isExecutable: true,
  error: null,
  hint: "ready hint",
})

const missingExecutable = (
  path: string,
  hint = "install runtime",
): RuntimeExecutableLike => ({
  ok: false,
  path,
  exists: false,
  isExecutable: false,
  error: "Runtime executable was not found.",
  hint,
})

const acpRuntime = (
  executable: RuntimeExecutableLike,
  spawnOk = true,
): CodexAcpRuntimeLike => ({
  ...executable,
  spawnProbe: {
    ok: spawnOk,
    exitCode: spawnOk ? 0 : 1,
    signal: null,
    error: spawnOk ? null : "codex-acp --help exited with code 1.",
    stdoutPreview: "",
    stderrPreview: "",
    durationMs: 12,
  },
})

describe("Codex runtime status", () => {
  test("reports ready only when CLI, ACP runtime, and ACP spawn probe all pass", () => {
    const availability = buildCodexRuntimeAvailability({
      loginCli: readyExecutable("/bin/codex"),
      acp: acpRuntime(readyExecutable("/bin/codex-acp")),
    })

    expect(availability.ok).toBe(true)
    expect(availability.blockers).toEqual([])
    expect(availability.components.map((component) => component.id)).toEqual([
      "login-cli",
      "acp-runtime",
      "acp-spawn",
    ])
    expect(availability.components.every((component) => component.ok)).toBe(true)
  })

  test("separates missing CLI from ACP runtime status", () => {
    const availability = buildCodexRuntimeAvailability({
      loginCli: missingExecutable("/missing/codex", "download Codex CLI"),
      acp: acpRuntime(readyExecutable("/bin/codex-acp")),
    })

    expect(availability.ok).toBe(false)
    expect(availability.blockers).toHaveLength(1)
    expect(availability.blockers[0]).toMatchObject({
      component: "login-cli",
      status: "missing",
      hint: "download Codex CLI",
    })
    expect(
      availability.components.find((component) => component.id === "acp-runtime"),
    ).toMatchObject({ ok: true, status: "ready" })
  })

  test("separates ACP spawn probe failure from executable discovery", () => {
    const availability = buildCodexRuntimeAvailability({
      loginCli: readyExecutable("/bin/codex"),
      acp: acpRuntime(readyExecutable("/bin/codex-acp"), false),
    })

    expect(availability.ok).toBe(false)
    expect(availability.blockers).toEqual([
      {
        component: "acp-spawn",
        status: "failed",
        message: "codex-acp --help exited with code 1.",
        hint: "ready hint",
      },
    ])
  })

  test("builds non-secret runtime and capability error chunks", () => {
    const blocker = createCodexRuntimeBlocker({
      id: "provider-profile",
      label: "Codex provider profile",
      status: "unavailable",
      ok: false,
      message: "Provider profile is not available for Codex.",
      hint: "Choose a provider profile that targets Codex.",
    })

    expect(buildCodexRuntimeStatusChunk(blocker)).toEqual({
      type: "runtime-status",
      runtime: "codex",
      ok: false,
      blocker,
    })
    expect(buildCodexCapabilityErrorChunk(blocker)).toEqual({
      type: "capability-error",
      runtime: "codex",
      capability: "provider-profile",
      errorText: "Provider profile is not available for Codex.",
      blocker,
    })
  })

  test("keeps non-blocking login and policy states from failing runtime readiness", () => {
    const baseAvailability = buildCodexRuntimeAvailability({
      loginCli: readyExecutable("/bin/codex"),
      acp: acpRuntime(readyExecutable("/bin/codex-acp")),
    })
    const availability = buildCodexRuntimeAvailabilityFromComponents([
      ...baseAvailability.components,
      createCodexRuntimeComponent({
        id: "login",
        label: "Codex login",
        status: "needs-auth",
        ok: false,
        blocking: false,
        error: "Codex login or API key is required.",
        hint: "Connect Codex or choose a provider profile.",
      }),
      createCodexRuntimeComponent({
        id: "provider-profile",
        label: "Codex provider profile",
        status: "unknown",
        ok: true,
        blocking: false,
        hint: "Checked for the selected run.",
      }),
      createCodexRuntimeComponent({
        id: "mcp",
        label: "Codex MCP configuration",
        status: "unknown",
        ok: true,
        blocking: false,
        hint: "Checked for the selected project before each run.",
      }),
      createCodexRuntimeComponent({
        id: "local-only",
        label: "Local-only policy",
        status: "ready",
        ok: true,
        blocking: false,
        hint: "Policy is active.",
      }),
    ])

    expect(availability.ok).toBe(true)
    expect(availability.blockers).toEqual([])
    expect(
      availability.components.find((component) => component.id === "login"),
    ).toMatchObject({ status: "needs-auth", blocking: false })
  })

  test("makes run-specific MCP needs-auth a blocking status chunk", () => {
    const blocker = createCodexRuntimeBlocker({
      id: "mcp",
      label: "Codex MCP auth",
      status: "needs-auth",
      ok: false,
      message: "Codex MCP server 'example' needs authentication.",
      hint: "Authenticate the MCP server before starting this Codex run.",
    })

    expect(buildCodexRuntimeStatusChunk(blocker)).toMatchObject({
      type: "runtime-status",
      ok: false,
      blocker: {
        component: "mcp",
        status: "needs-auth",
      },
    })
  })
})
