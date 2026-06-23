import { describe, expect, test } from "bun:test"
import { redactRuntimePayload } from "../src/main/lib/agent-runtime/redaction"
import { redactRendererRuntimeChunk } from "../src/main/lib/agent-runtime/stream-event-mapper"

describe("runtime trace redaction", () => {
  test("redacts secret-bearing keys recursively", () => {
    const result = redactRuntimePayload(
      {
        provider: {
          apiKey: "sk-test-secret-value",
          nested: { authorization: "Bearer abc.def.ghi" },
        },
        safe: "visible",
      },
      {
        runtimeId: "codex",
        runId: "run-1",
        source: "desktop-adapter",
      },
    )

    expect(result.payload).toEqual({
      provider: {
        apiKey: "<redacted>",
        nested: { authorization: "<redacted>" },
      },
      safe: "visible",
    })
    expect(result.appliedRules).toEqual(["secret-key"])
  })

  test("redacts secret-like strings without hiding safe text", () => {
    const result = redactRuntimePayload(
      {
        message: "failed with bearer abc.def.ghi and api_key=xyz123",
        status: "blocked",
      },
      {
        runtimeId: "claude-code",
        runId: "run-1",
        source: "runtime-diagnostic",
      },
    )

    expect(result.payload).toEqual({
      message: "failed with <redacted> and api_key=<redacted>",
      status: "blocked",
    })
    expect(result.appliedRules).toEqual(["secret-text"])
  })

  test("redacts exact secret hints even when the text has no secret prefix", () => {
    const runtimeToken =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    const result = redactRuntimePayload(
      {
        message: `Kun stderr echoed token ${runtimeToken}`,
        nested: {
          header: `Authorization: Bearer ${runtimeToken}`,
        },
      },
      {
        runtimeId: "kun",
        runId: "run-1",
        source: "desktop-adapter",
        secretHints: [runtimeToken],
      },
    )

    expect(JSON.stringify(result.payload)).not.toContain(runtimeToken)
    expect(result.payload).toEqual({
      message: "Kun stderr echoed token <redacted>",
      nested: {
        header: "Authorization: Bearer <redacted>",
      },
    })
    expect(result.appliedRules).toEqual(["secret-hint"])
  })

  test("redacts renderer runtime chunks beyond diagnostic chunk types", () => {
    const chunk = redactRendererRuntimeChunk({
      runtimeId: "codex",
      runId: "run-1",
      source: "runtime-diagnostic",
      chunk: {
        type: "ask-user-answer",
        delta: "provider returned Bearer abc.def.ghi with api_key=xyz123",
      },
    })

    expect(chunk).toEqual({
      type: "ask-user-answer",
      delta: "provider returned <redacted> with api_key=<redacted>",
    })
  })

  test("redacts secret hints from renderer runtime chunks", () => {
    const gatewayToken = "gateway-token-secret-value"
    const chunk = redactRendererRuntimeChunk({
      runtimeId: "kun",
      runId: "run-1",
      source: "runtime-diagnostic",
      secretHints: [gatewayToken],
      chunk: {
        type: "runtime-status",
        ok: false,
        blocker: {
          message: `profile gateway rejected ${gatewayToken}`,
        },
      },
    })

    expect(JSON.stringify(chunk)).not.toContain(gatewayToken)
    expect(chunk).toMatchObject({
      type: "runtime-status",
      blocker: {
        message: "profile gateway rejected <redacted>",
      },
    })
  })
})
