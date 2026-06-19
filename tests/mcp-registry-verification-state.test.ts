import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setElectronUserDataPathProviderForTest } from "../src/main/lib/electron-app"
import {
  buildMcpRegistryVerificationRecordId,
  getMcpRegistryVerificationRecord,
  getMcpRegistryVerificationStatePath,
  listMcpRegistryVerificationRecords,
  mcpRegistryVerificationRecordToLocalState,
  upsertMcpRegistryVerificationRecord,
} from "../src/main/lib/mcp-registry/verification-state"

let userDataDir = ""

describe("MCP registry verification state", () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "locus-mcp-registry-state-"))
    setElectronUserDataPathProviderForTest(() => userDataDir)
  })

  afterEach(async () => {
    setElectronUserDataPathProviderForTest(null)
    await rm(userDataDir, { recursive: true, force: true })
    userDataDir = ""
  })

  test("keys records by local runtime, server, entry fingerprint, and config fingerprint", () => {
    const base = {
      runtime: "claude-code" as const,
      serverName: "registry_server",
      entryFingerprint: "sha256:entry",
      configFingerprint: "sha256:config",
    }

    const id = buildMcpRegistryVerificationRecordId(base)

    expect(id).toMatch(/^mcp-registry-verification:claude-code:[a-f0-9]{64}$/)
    expect(
      buildMcpRegistryVerificationRecordId({
        ...base,
        configFingerprint: "sha256:next-config",
      }),
    ).not.toBe(id)
    expect(
      buildMcpRegistryVerificationRecordId({
        ...base,
        runtime: "codex",
      }),
    ).not.toBe(id)
  })

  test("persists local verification records under the app userData directory", async () => {
    const key = {
      runtime: "claude-code" as const,
      serverName: "registry_server",
      entryFingerprint: "sha256:entry",
      configFingerprint: "sha256:config",
    }

    const record = await upsertMcpRegistryVerificationRecord(
      {
        ...key,
        status: "failed-check",
        reason: "tool-list-failure",
      },
      { now: new Date("2026-06-20T01:02:03.000Z") },
    )

    expect(record).toMatchObject({
      ...key,
      machineScope: "local",
      status: "failed-check",
      reason: "tool-list-failure",
      updatedAt: "2026-06-20T01:02:03.000Z",
    })
    expect(await getMcpRegistryVerificationRecord(key)).toEqual(record)
    expect(await listMcpRegistryVerificationRecords()).toEqual([record])

    const statePath = getMcpRegistryVerificationStatePath()
    expect(statePath).toBe(
      join(userDataDir, "mcp-registry-verification-state.json"),
    )
    const raw = await readFile(statePath, "utf-8")
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
      records: {
        [record.id]: {
          machineScope: "local",
          status: "failed-check",
        },
      },
    })
  })

  test("maps verification records into installability local state", async () => {
    const record = await upsertMcpRegistryVerificationRecord(
      {
        runtime: "claude-code",
        serverName: "ready_server",
        entryFingerprint: "sha256:entry",
        configFingerprint: "sha256:config",
        status: "ready-to-verify",
      },
      { now: new Date("2026-06-20T02:00:00.000Z") },
    )

    expect(mcpRegistryVerificationRecordToLocalState(record)).toEqual({
      runtime: "claude-code",
      status: "ready-to-verify",
    })
  })
})
