import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"
import {
  KUN_SERVE_TEST_ONLY,
  KUN_SHELL_SANDBOX_MODE,
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
        env: {
          PATH: "/usr/local/bin",
          HOME: "/Users/test",
          OPENAI_API_KEY: "sk-provider-secret-value-123456",
          LOCUS_PROVIDER_GATEWAY_TOKEN: "gateway-token-secret",
          Authorization: "Bearer raw-header-secret",
          KUN_RUNTIME_TOKEN: "attacker-controlled-token",
        },
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
      expect(captured.env?.KUN_RUNTIME_TOKEN).not.toBe(
        "attacker-controlled-token",
      )
      expect(captured.env?.KUN_DATA_DIR).toBe(
        join(userDataPath, "kun-sessions", "run-1"),
      )
      expect(captured.env?.PATH).toBe("/usr/local/bin")
      expect(captured.env?.HOME).toBe("/Users/test")
      expect(captured.env).not.toHaveProperty("OPENAI_API_KEY")
      expect(captured.env).not.toHaveProperty("LOCUS_PROVIDER_GATEWAY_TOKEN")
      expect(captured.env).not.toHaveProperty("Authorization")
      expect(captured.args?.join(" ")).not.toContain(
        captured.env?.KUN_RUNTIME_TOKEN ?? "missing-token",
      )
      expect(captured.args?.join(" ")).not.toContain("sk-provider-secret")
      expect(captured.args?.join(" ")).not.toContain("gateway-token-secret")
      expect(captured.args?.join(" ")).not.toContain("Bearer")
      expect(handle.baseUrl).toBe("http://127.0.0.1:34567")
      await handle.close()
    } finally {
      rmSync(userDataPath, { recursive: true, force: true })
    }
  })

  test("passes the BYO config path to Kun without exposing runtime secrets", async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), "locus-kun-serve-"))
    const configPath = join(userDataPath, "config.json")
    const captured: {
      args?: string[]
      env?: NodeJS.ProcessEnv
    } = {}
    try {
      const handle = await launchKunServe({
        executable: "/usr/local/bin/kun",
        configPath,
        runId: "run-config",
        cwd: "/repo",
        env: {
          PATH: "/usr/local/bin",
          KUN_RUNTIME_TOKEN: "attacker-controlled-token",
          OPENAI_API_KEY: "sk-provider-secret-value-123456",
        },
        userDataPath,
        spawnProcess: (_command, args, options) => {
          captured.args = args
          captured.env = options.env as NodeJS.ProcessEnv
          const child = fakeChild()
          setImmediate(() => {
            child.stdout.emit(
              "data",
              Buffer.from(
                `${KUN_SERVE_TEST_ONLY.KUN_READY_PREFIX}${JSON.stringify({
                  service: "kun",
                  mode: "serve",
                  host: "127.0.0.1",
                  port: 34568,
                  dataDir: join(userDataPath, "kun-sessions", "run-config"),
                  approvalPolicy: "on-request",
                  sandboxMode: "workspace-write",
                  insecure: false,
                  pid: 456,
                })}\n`,
              ),
            )
          })
          return child
        },
      })

      expect(captured.args).toEqual(
        expect.arrayContaining(["serve", "--config", configPath]),
      )
      expect(captured.args?.join(" ")).not.toContain(
        captured.env?.KUN_RUNTIME_TOKEN ?? "missing-token",
      )
      expect(captured.args?.join(" ")).not.toContain("sk-provider-secret")
      expect(captured.env).not.toHaveProperty("OPENAI_API_KEY")
      await handle.close()
    } finally {
      rmSync(userDataPath, { recursive: true, force: true })
    }
  })

  test("passes danger-full-access only when requested by the guarded shell gate", async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), "locus-kun-serve-"))
    const captured: { args?: string[] } = {}
    try {
      const handle = await launchKunServe({
        executable: "/usr/local/bin/kun",
        runId: "run-shell",
        cwd: "/repo",
        userDataPath,
        sandboxMode: KUN_SHELL_SANDBOX_MODE,
        spawnProcess: (_command, args) => {
          captured.args = args
          const child = fakeChild()
          setImmediate(() => {
            child.stdout.emit(
              "data",
              Buffer.from(
                `${KUN_SERVE_TEST_ONLY.KUN_READY_PREFIX}${JSON.stringify({
                  service: "kun",
                  mode: "serve",
                  host: "127.0.0.1",
                  port: 34569,
                  dataDir: join(userDataPath, "kun-sessions", "run-shell"),
                  approvalPolicy: "on-request",
                  sandboxMode: "danger-full-access",
                  insecure: false,
                  pid: 789,
                })}\n`,
              ),
            )
          })
          return child
        },
      })

      expect(captured.args).toEqual(
        expect.arrayContaining(["--sandbox-mode", "danger-full-access"]),
      )
      await handle.close()
    } finally {
      rmSync(userDataPath, { recursive: true, force: true })
    }
  })

  test("rejects hardened handshake drift", () => {
    expect(() =>
      verifyKunReadyInfo(
        {
          service: "kun",
          mode: "serve",
          host: "127.0.0.1",
          port: 1234,
          approvalPolicy: "on-request",
          sandboxMode: "danger-full-access",
          insecure: false,
        },
        { sandboxMode: KUN_SHELL_SANDBOX_MODE },
      ),
    ).not.toThrow()
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

  test("redacts runtime token and provider-looking stderr when serve exits before ready", async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), "locus-kun-serve-"))
    try {
      await expect(
        launchKunServe({
          executable: "/usr/local/bin/kun",
          runId: "run-fail",
          cwd: "/repo",
          userDataPath,
          spawnProcess: (_command, _args, options) => {
            const child = fakeChild()
            setImmediate(() => {
              const runtimeToken = (options.env as NodeJS.ProcessEnv)
                .KUN_RUNTIME_TOKEN
              child.stderr.emit(
                "data",
                Buffer.from(
                  `stderr token=${runtimeToken} api_key=sk-provider-secret-value-123456`,
                ),
              )
              child.emit("exit", 1, null)
            })
            return child
          },
        }),
      ).rejects.toThrow("token=<redacted> api_key=<redacted>")
    } finally {
      rmSync(userDataPath, { recursive: true, force: true })
    }
  })
})
