import { describe, expect, test } from "bun:test"
import { KunHttpSseTransport } from "../src/main/lib/kun/kun-http-sse-transport"

describe("Kun HTTP/SSE transport", () => {
  test("sends the selected sandbox mode when creating a thread and turn", async () => {
    const bodies: Array<Record<string, unknown>> = []
    const transport = new KunHttpSseTransport({
      baseUrl: "http://127.0.0.1:34567",
      runtimeToken:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      sandboxMode: "danger-full-access",
      fetchImpl: async (url, init) => {
        bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>)
        if (String(url).endsWith("/v1/threads")) {
          return new Response(JSON.stringify({ id: "thread-1" }), {
            status: 200,
          })
        }
        return new Response(
          JSON.stringify({ threadId: "thread-1", turnId: "turn-1" }),
          { status: 200 },
        )
      },
    })

    const signal = new AbortController().signal
    await transport.createThread({
      workspace: "/repo",
      model: "kun",
      mode: "agent",
      signal,
    })
    await transport.startTurn({
      threadId: "thread-1",
      prompt: "hello",
      mode: "agent",
      signal,
    })

    expect(bodies).toEqual([
      expect.objectContaining({ sandboxMode: "danger-full-access" }),
      expect.objectContaining({ sandboxMode: "danger-full-access" }),
    ])
  })

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
