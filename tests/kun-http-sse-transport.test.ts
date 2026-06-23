import { describe, expect, test } from "bun:test"
import { KunHttpSseTransport } from "../src/main/lib/kun/kun-http-sse-transport"

describe("Kun HTTP/SSE transport", () => {
  test("redacts runtime token and provider-looking text from HTTP errors", async () => {
    const runtimeToken =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    const requests: Array<{ url: string; authorization: string | null }> = []
    const transport = new KunHttpSseTransport({
      baseUrl: "http://127.0.0.1:34567",
      runtimeToken,
      fetchImpl: async (url, init) => {
        const headers = new Headers(init?.headers)
        requests.push({
          url: String(url),
          authorization: headers.get("authorization"),
        })
        return new Response(
          `rejected ${runtimeToken} api_key=sk-provider-secret-value-123456`,
          { status: 500 },
        )
      },
    })

    await expect(
      transport.createThread({
        workspace: "/repo",
        model: "kun",
        mode: "agent",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("rejected <redacted> api_key=<redacted>")

    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:34567/v1/threads",
        authorization: `Bearer ${runtimeToken}`,
      },
    ])
  })
})
