import { describe, expect, test } from "bun:test"
import { redactRuntimePayload } from "../src/main/lib/agent-runtime/redaction"

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
})
