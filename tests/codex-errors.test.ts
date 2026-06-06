import { describe, expect, test } from "bun:test"
import {
  extractCodexError,
  getCodexErrorDiagnostics,
  isCodexAuthError,
} from "../src/main/lib/codex/errors"

describe("Codex error helpers", () => {
  test("normalizes nested provider errors and applies redaction hooks", () => {
    expect(
      extractCodexError(
        {
          data: {
            message:
              "login at https://example.com/device?code=SECRET with OPENAI_API_KEY=sk-secret",
            code: "401",
          },
        },
        {
          redactLoginOutput: (message) =>
            message.replace("https://example.com/device?code=SECRET", "[url]"),
        },
      ),
    ).toEqual({
      message:
        "login at https://example.com/device?code=*** with OPENAI_API_KEY=sk-***",
      code: "401",
    })
  })

  test("reports diagnostic code and exit status without exposing full errors", () => {
    expect(
      getCodexErrorDiagnostics({
        name: "CodexError",
        data: { code: "E_AUTH" },
        cause: { exitCode: 2 },
      }),
    ).toEqual({
      name: "CodexError",
      code: "E_AUTH",
      exitCode: 2,
    })

    expect(
      getCodexErrorDiagnostics({
        status: 403,
      }),
    ).toEqual({
      name: null,
      code: null,
      exitCode: 403,
    })
  })

  test("matches authentication hints in codes and messages", () => {
    expect(isCodexAuthError({ message: "Codex login required" })).toBe(true)
    expect(isCodexAuthError({ code: "401" })).toBe(true)
    expect(isCodexAuthError({ message: "network timeout" })).toBe(false)
  })
})
