import { describe, expect, mock, test } from "bun:test"
import {
  type ClaudeMcpRegistryVerificationTargets,
  createClaudeMcpRegistryVerificationObserver,
} from "../src/main/lib/claude/agent-sdk-mcp-registry-verification"

const claudeTarget = {
  runtime: "claude-code" as const,
  serverName: "calculator-mcp-server",
  entryFingerprint: "sha256:entry",
  configFingerprint: "sha256:config",
}

type VerificationUpsert = NonNullable<
  Parameters<typeof createClaudeMcpRegistryVerificationObserver>[0]["upsert"]
>
type VerificationUpsertInput = Parameters<VerificationUpsert>[0]

function createTargets(
  extra: ClaudeMcpRegistryVerificationTargets = {},
): ClaudeMcpRegistryVerificationTargets {
  return {
    "calculator-mcp-server": claudeTarget,
    ...extra,
  }
}

describe("Claude MCP registry verification observer", () => {
  test("upgrades a registry server after a successful Claude MCP tool output", async () => {
    const upsert = mock(async (input: VerificationUpsertInput) => ({
      id: "record",
      machineScope: "local" as const,
      updatedAt: "2026-06-20T00:00:00.000Z",
      ...input,
    }))
    const observer = createClaudeMcpRegistryVerificationObserver({
      targets: createTargets(),
      upsert,
      warn: () => {},
    })

    observer.observeChunk({
      type: "tool-input-available",
      toolCallId: "toolu-1",
      toolName: "mcp__calculator-mcp-server__calculate",
      input: { expression: "2 + 2" },
    })
    observer.observeChunk({
      type: "tool-output-available",
      toolCallId: "toolu-1",
      output: { result: 4 },
    })

    await observer.flush()

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0]).toEqual({
      ...claudeTarget,
      status: "verified-local",
      reason: "claude-tool-call-success:calculate",
    })
  })

  test("does not verify unmatched tools, failed tool outputs, or Codex targets", async () => {
    const upsert = mock(async (input: VerificationUpsertInput) => ({
      id: "record",
      machineScope: "local" as const,
      updatedAt: "2026-06-20T00:00:00.000Z",
      ...input,
    }))
    const observer = createClaudeMcpRegistryVerificationObserver({
      targets: createTargets({
        "codex-server": {
          runtime: "codex",
          serverName: "codex-server",
          entryFingerprint: "sha256:codex-entry",
          configFingerprint: "sha256:codex-config",
        },
      }),
      upsert,
      warn: () => {},
    })

    observer.observeChunk({
      type: "tool-input-available",
      toolCallId: "unmatched",
      toolName: "Read",
      input: {},
    })
    observer.observeChunk({
      type: "tool-output-available",
      toolCallId: "unmatched",
      output: "ok",
    })
    observer.observeChunk({
      type: "tool-input-available",
      toolCallId: "failed",
      toolName: "mcp__calculator-mcp-server__calculate",
      input: {},
    })
    observer.observeChunk({
      type: "tool-output-error",
      toolCallId: "failed",
      errorText: "server failed",
    })
    observer.observeChunk({
      type: "tool-input-available",
      toolCallId: "codex",
      toolName: "mcp__codex-server__search",
      input: {},
    })
    observer.observeChunk({
      type: "tool-output-available",
      toolCallId: "codex",
      output: "ok",
    })

    await observer.flush()

    expect(upsert).not.toHaveBeenCalled()
  })

  test("does not verify domain-level error results returned as normal tool output", async () => {
    const upsert = mock(async (input: VerificationUpsertInput) => ({
      id: "record",
      machineScope: "local" as const,
      updatedAt: "2026-06-20T00:00:00.000Z",
      ...input,
    }))
    const observer = createClaudeMcpRegistryVerificationObserver({
      targets: createTargets(),
      upsert,
      warn: () => {},
    })

    const errorOutputs: unknown[] = [
      { error: "bad expression" },
      { result: { error: { message: "bad expression" } } },
      { isError: true, content: [{ type: "text", text: "bad expression" }] },
      { ok: false, result: "bad expression" },
      { success: false, result: "bad expression" },
      { status: "failed", result: "bad expression" },
      "Error: bad expression",
    ]

    for (const [index, output] of errorOutputs.entries()) {
      const toolCallId = `domain-error-${index}`
      observer.observeChunk({
        type: "tool-input-available",
        toolCallId,
        toolName: "mcp__calculator-mcp-server__calculate",
        input: {},
      })
      observer.observeChunk({
        type: "tool-output-available",
        toolCallId,
        output,
      })
    }

    await observer.flush()

    expect(upsert).not.toHaveBeenCalled()
  })

  test("deduplicates repeated successful outputs for the same local fingerprint", async () => {
    const upsert = mock(async (input: VerificationUpsertInput) => ({
      id: "record",
      machineScope: "local" as const,
      updatedAt: "2026-06-20T00:00:00.000Z",
      ...input,
    }))
    const observer = createClaudeMcpRegistryVerificationObserver({
      targets: createTargets(),
      upsert,
      warn: () => {},
    })

    for (const toolCallId of ["first", "second"]) {
      observer.observeChunk({
        type: "tool-input-available",
        toolCallId,
        toolName: "mcp__calculator-mcp-server__calculate",
        input: {},
      })
      observer.observeChunk({
        type: "tool-output-available",
        toolCallId,
        output: "ok",
      })
    }

    await observer.flush()

    expect(upsert).toHaveBeenCalledTimes(1)
  })
})
