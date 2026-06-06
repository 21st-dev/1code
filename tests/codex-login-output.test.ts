import { describe, expect, test } from "bun:test"
import {
  appendCodexLoginOutput,
  extractFirstNonLocalhostUrl,
  isLocalhostHostname,
  redactCodexLoginOutput,
  redactCodexLoginUrlForDisplay,
} from "../src/main/lib/codex/login-output"

describe("Codex login output helpers", () => {
  test("recognizes localhost hosts and extracts the first remote URL", () => {
    expect(isLocalhostHostname("localhost")).toBe(true)
    expect(isLocalhostHostname("127.0.0.1")).toBe(true)
    expect(isLocalhostHostname("auth.localhost")).toBe(true)
    expect(isLocalhostHostname("example.com")).toBe(false)

    expect(
      extractFirstNonLocalhostUrl(
        "open http://localhost:1455 then https://auth.example.com/device?code=secret.",
      ),
    ).toBe("https://auth.example.com/device?code=secret")
  })

  test("redacts remote URLs, API keys, and token-like query fragments", () => {
    expect(
      redactCodexLoginUrlForDisplay(
        "https://auth.example.com/device?code=secret#frag.",
      ),
    ).toBe("https://auth.example.com/device?[redacted]#[redacted].")
    expect(redactCodexLoginUrlForDisplay("http://localhost:3000/callback?code=x")).toBe(
      "http://localhost:3000/callback?code=x",
    )
    expect(
      redactCodexLoginOutput(
        'key sk-1234567890abcdef token code=secret {"access_token":"abc"}',
      ),
    ).toBe(
      'key sk-[redacted] token code=[redacted] {"access_token":"[redacted]"}',
    )
  })

  test("appends cleaned output and stores the first remote login URL", () => {
    const session = { rawOutput: "", output: "", url: null as string | null }

    appendCodexLoginOutput(
      session,
      "\u001B[31mOpen https://auth.example.com/device?code=secret\u001B[0m",
    )
    appendCodexLoginOutput(session, " and sk-1234567890abcdef")

    expect(session.rawOutput).toContain(
      "https://auth.example.com/device?code=secret",
    )
    expect(session.output).toContain("https://auth.example.com/device?[redacted]")
    expect(session.output).toContain("sk-[redacted]")
    expect(session.url).toBe("https://auth.example.com/device?code=secret")
  })
})
