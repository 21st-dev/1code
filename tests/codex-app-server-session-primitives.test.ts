import { describe, expect, test } from "bun:test"
import {
  getAgentRuntimeCapability,
  isRuntimeCapabilitySupported,
} from "../src/shared/agent-runtime-capabilities"
import {
  CodexAppServerSessionPrimitiveUnsupportedError,
  assertCodexAppServerSessionPrimitiveSupported,
  resolveCodexAppServerSessionPrimitive,
} from "../src/main/lib/codex/app-server-session-primitives"

describe("Codex app-server session primitives", () => {
  test("keeps app-server rollback and fork unsupported until durable policy exists", () => {
    for (const primitive of ["rollback", "fork"] as const) {
      expect(resolveCodexAppServerSessionPrimitive(primitive)).toEqual({
        supported: false,
        primitive,
        reason: "unsupported-until-durable-local-file-policy",
        message:
          `Codex app-server ${primitive} remains unsupported until Locus has ` +
          "durable thread references and a tested local file rollback policy.",
      })
      expect(() =>
        assertCodexAppServerSessionPrimitiveSupported(primitive),
      ).toThrow(CodexAppServerSessionPrimitiveUnsupportedError)
    }
  })

  test("does not promote Codex rollback capability from app-server schema presence", () => {
    expect(isRuntimeCapabilitySupported("codex", "rollback")).toBe(false)
    expect(getAgentRuntimeCapability("codex", "rollback")).toMatchObject({
      status: "unsupported",
      scope: "unavailable",
    })
  })
})
