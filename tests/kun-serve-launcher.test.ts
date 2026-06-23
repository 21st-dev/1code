import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"
import {
  KUN_SERVE_TEST_ONLY,
  launchKunServe,
  verifyKunReadyInfo,
} from "../src/main/lib/kun/kun-serve-launcher"

function fakeChild() {
  const child = new EventEmitter() as any
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  child.exitCode = null
  child.signalCode = null
  child.kill = (signal?: NodeJS.Signals) => {
    child.exitCode = 0
    child.signalCode = signal ?? null
    setImmediate(() => child.emit("exit", 0, signal ?? null))
    return true
  }
  return child
}

describe("Kun serve launcher", () => {
  test("passes runtimeToken via env and never argv", async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), "locus-kun-serve-"))
    const captured: {
      command?: string
      args?: string[]
      env?: NodeJS.ProcessEnv
      shell?: unknown
    } = {}
    try {
      const handlePromise = launchKunServe({
        executable: "/usr/local/bin/kun",
        runId: "run-1",
        cwd: "/repo",
        userDataPath,
        spawnProcess: (command, args, options) => {
          captured.command = command
          captured.args = args
          captured.env = options.env as NodeJS.ProcessEnv
          captured.shell = options.shell
          const child = fakeChild()
          setImmediate(() => {
            child.stdout.emit(
              "data",
              Buffer.from(
                `${KUN_SERVE_TEST_ONLY.KUN_READY_PREFIX}${JSON.stringify({
                  service: "kun",
                  mode: "serve",
                  host: "127.0.0.1",
                  port: 34567,
                  dataDir: join(userDataPath, "kun-sessions", "run-1"),
                  approvalPolicy: "on-request",
                  sandboxMode: "workspace-write",
                  insecure: false,
                  pid: 123,
                })}\n`,
              ),
            )
          })
          return child
        },
      })
      const handle = await handlePromise

      expect(captured.command).toBe("/usr/local/bin/kun")
      expect(captured.shell).toBe(false)
      expect(captured.args).toEqual([
        "serve",
        "--host",
        "127.0.0.1",
        "--port",
        "0",
        "--data-dir",
        join(userDataPath, "kun-sessions", "run-1"),
        "--approval-policy",
        "on-request",
        "--sandbox-mode",
        "workspace-write",
        "--insecure",
        "false",
      ])
      expect(captured.env?.KUN_RUNTIME_TOKEN).toMatch(/^[a-f0-9]{64}$/)
      expect(captured.args?.join(" ")).not.toContain(
        captured.env?.KUN_RUNTIME_TOKEN ?? "missing-token",
      )
      expect(handle.baseUrl).toBe("http://127.0.0.1:34567")
      await handle.close()
    } finally {
      rmSync(userDataPath, { recursive: true, force: true })
    }
  })

  test("rejects hardened handshake drift", () => {
    expect(() =>
      verifyKunReadyInfo({
        service: "kun",
        mode: "serve",
        host: "0.0.0.0",
        port: 1234,
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        insecure: false,
      }),
    ).toThrow("non-loopback")
    expect(() =>
      verifyKunReadyInfo({
        service: "kun",
        mode: "serve",
        host: "127.0.0.1",
        port: 1234,
        approvalPolicy: "auto",
        sandboxMode: "workspace-write",
        insecure: false,
      }),
    ).toThrow("approvalPolicy=auto")
    expect(() =>
      verifyKunReadyInfo({
        service: "kun",
        mode: "serve",
        host: "127.0.0.1",
        port: 1234,
        approvalPolicy: "on-request",
        sandboxMode: "danger-full-access",
        insecure: false,
      }),
    ).toThrow("sandboxMode=danger-full-access")
  })
})
