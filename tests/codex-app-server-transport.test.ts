import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { describe, expect, test } from "bun:test"
import {
  createCodexAppServerStdioTransport,
} from "../src/main/lib/codex/app-server-transport"

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false

  kill() {
    this.killed = true
    this.emit("exit", null, "SIGTERM")
    return true
  }
}

describe("Codex app-server stdio transport", () => {
  test("redacts stderr before rejecting pending app-server requests", async () => {
    const child = new FakeChildProcess()
    const transport = createCodexAppServerStdioTransport({
      executable: "/bin/codex",
      spawnProcess: (() => child) as any,
    })

    const request = transport.request("initialize", {
      clientInfo: { name: "test" },
      capabilities: {},
    })

    child.stderr.write(
      "failed Authorization: Bearer app-server-secret-token access_token=oauth-secret-token",
    )
    child.emit("exit", 1, null)

    let message = ""
    try {
      await request
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toContain("Authorization: <redacted>")
    expect(message).toContain("access_token=<redacted>")
    expect(message).not.toContain("app-server-secret-token")
    expect(message).not.toContain("oauth-secret-token")
    await transport.close()
  })
})
