import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  assertValidCodexApiKey,
  validateCodexApiKey,
} from "../src/main/lib/codex/api-key-validation"

describe("Codex API key validation", () => {
  test("probes OpenAI models with the app-managed key without exposing it", async () => {
    const seen: Array<{ url: string; authorization: string | null }> = []
    const fetchImpl = async (input: string | URL, init?: RequestInit) => {
      seen.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("Authorization"),
      })
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    }

    await expect(
      validateCodexApiKey("sk-valid_for_test", { fetchImpl }),
    ).resolves.toEqual({ ok: true })

    expect(seen).toEqual([
      {
        url: "https://api.openai.com/v1/models",
        authorization: "Bearer sk-valid_for_test",
      },
    ])
  })

  test("classifies rejected OpenAI keys as needs-auth and redacts provider output", async () => {
    const apiKey = "sk-rejected_for_test"
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            message: `Incorrect API key provided: ${apiKey}.`,
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        }),
        { status: 401 },
      )

    const result = await validateCodexApiKey(apiKey, { fetchImpl })

    expect(result).toMatchObject({
      ok: false,
      category: "auth_failed",
      status: "needs-auth",
      httpStatus: 401,
    })
    expect(JSON.stringify(result)).not.toContain(apiKey)
    expect(JSON.stringify(result)).toContain("Incorrect API key provided: ***.")
  })

  test("redacts masked OpenAI key echoes from validation errors", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            message:
              "Incorrect API key provided: sk-**************************0608.",
          },
        }),
        { status: 401 },
      )

    const result = await validateCodexApiKey("sk-invalid_for_test", { fetchImpl })

    expect(JSON.stringify(result)).toContain("Incorrect API key provided: sk-***.")
    expect(JSON.stringify(result)).not.toContain("0608")
  })

  test("throws clear save-time errors for invalid keys", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
        status: 401,
      })

    await expect(
      assertValidCodexApiKey("sk-invalid_for_test", { fetchImpl }),
    ).rejects.toThrow("OpenAI rejected the saved Codex API key (401).")
  })

  test("keeps Codex key validation ahead of save, job creation, and ACP startup", () => {
    const codexRouterSource = readFileSync(
      join(process.cwd(), "src/main/lib/trpc/routers/codex.ts"),
      "utf-8",
    )

    expect(codexRouterSource).toContain("../../codex/api-key-validation")
    expect(codexRouterSource).toContain(
      "await assertValidCodexApiKey(input.apiKey)",
    )

    const validationIndex = codexRouterSource.indexOf(
      "const apiKeyValidation = await validateCodexApiKey",
    )
    const jobCreationIndex = codexRouterSource.indexOf(
      "const desktopJob = createAndRegisterDesktopChatAgentJob",
    )
    const adapterCreationIndex = codexRouterSource.indexOf(
      "const codexAdapter = createCodexAcpTemporaryCompatAdapter",
    )

    expect(validationIndex).toBeGreaterThan(0)
    expect(jobCreationIndex).toBeGreaterThan(validationIndex)
    expect(adapterCreationIndex).toBeGreaterThan(validationIndex)
    expect(codexRouterSource).toContain("buildCodexRuntimeStatusChunk(blocker)")
    expect(codexRouterSource).toContain("buildCodexCapabilityErrorChunk(blocker)")
  })
})
