import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { getElectronUserDataPath } from "../electron-app"
import type {
  McpRegistryRuntimeId,
  McpRegistryRuntimeLocalState,
} from "./installability"

export type McpRegistryVerificationStatus =
  | "installed-unverified"
  | "installed-needs-setup"
  | "ready-to-verify"
  | "failed-check"
  | "verified-local"

export type McpRegistryVerificationKeyInput = {
  runtime: McpRegistryRuntimeId
  serverName: string
  entryFingerprint: string
  configFingerprint: string
}

export type McpRegistryVerificationRecord = McpRegistryVerificationKeyInput & {
  id: string
  machineScope: "local"
  status: McpRegistryVerificationStatus
  reason?: string
  updatedAt: string
}

type VerificationStateFile = {
  version: 1
  records: Record<string, McpRegistryVerificationRecord>
}

type VerificationStateOptions = {
  userDataPath?: string
  now?: Date
}

const STATE_FILE_NAME = "mcp-registry-verification-state.json"

function canonicalKey(input: McpRegistryVerificationKeyInput): string {
  return JSON.stringify({
    machineScope: "local",
    runtime: input.runtime,
    serverName: input.serverName,
    entryFingerprint: input.entryFingerprint,
    configFingerprint: input.configFingerprint,
  })
}

export function buildMcpRegistryVerificationRecordId(
  input: McpRegistryVerificationKeyInput,
): string {
  const digest = createHash("sha256").update(canonicalKey(input)).digest("hex")
  return `mcp-registry-verification:${input.runtime}:${digest}`
}

export function getMcpRegistryVerificationStatePath(
  userDataPath = getElectronUserDataPath(),
): string {
  return join(userDataPath, STATE_FILE_NAME)
}

function emptyStateFile(): VerificationStateFile {
  return { version: 1, records: {} }
}

function normalizeRecord(
  id: string,
  value: unknown,
): McpRegistryVerificationRecord | null {
  if (!value || typeof value !== "object") return null
  const record = value as Partial<McpRegistryVerificationRecord>
  if (
    record.id !== id ||
    record.machineScope !== "local" ||
    (record.runtime !== "claude-code" && record.runtime !== "codex") ||
    typeof record.serverName !== "string" ||
    typeof record.entryFingerprint !== "string" ||
    typeof record.configFingerprint !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return null
  }
  if (
    record.status !== "installed-unverified" &&
    record.status !== "installed-needs-setup" &&
    record.status !== "ready-to-verify" &&
    record.status !== "failed-check" &&
    record.status !== "verified-local"
  ) {
    return null
  }

  return {
    id,
    machineScope: "local",
    runtime: record.runtime,
    serverName: record.serverName,
    entryFingerprint: record.entryFingerprint,
    configFingerprint: record.configFingerprint,
    status: record.status,
    ...(typeof record.reason === "string" && record.reason.trim()
      ? { reason: record.reason }
      : {}),
    updatedAt: record.updatedAt,
  }
}

async function readStateFile(
  options: VerificationStateOptions = {},
): Promise<VerificationStateFile> {
  const statePath = getMcpRegistryVerificationStatePath(options.userDataPath)
  try {
    const raw = await readFile(statePath, "utf-8")
    const parsed = JSON.parse(raw) as Partial<VerificationStateFile>
    const records: Record<string, McpRegistryVerificationRecord> = {}
    if (parsed.records && typeof parsed.records === "object") {
      for (const [id, value] of Object.entries(parsed.records)) {
        const record = normalizeRecord(id, value)
        if (record) records[id] = record
      }
    }
    return { version: 1, records }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return emptyStateFile()
    }
    throw error
  }
}

async function writeStateFile(
  state: VerificationStateFile,
  options: VerificationStateOptions = {},
): Promise<void> {
  const statePath = getMcpRegistryVerificationStatePath(options.userDataPath)
  await mkdir(dirname(statePath), { recursive: true })
  const tempPath = `${statePath}.tmp`
  await writeFile(`${statePath}.tmp`, `${JSON.stringify(state, null, 2)}\n`)
  await rename(tempPath, statePath)
}

export async function listMcpRegistryVerificationRecords(
  options: VerificationStateOptions = {},
): Promise<McpRegistryVerificationRecord[]> {
  const state = await readStateFile(options)
  return Object.values(state.records).sort((a, b) => a.id.localeCompare(b.id))
}

export async function getMcpRegistryVerificationRecord(
  input: McpRegistryVerificationKeyInput,
  options: VerificationStateOptions = {},
): Promise<McpRegistryVerificationRecord | null> {
  const state = await readStateFile(options)
  const id = buildMcpRegistryVerificationRecordId(input)
  return state.records[id] ?? null
}

export async function upsertMcpRegistryVerificationRecord(
  input: McpRegistryVerificationKeyInput & {
    status: McpRegistryVerificationStatus
    reason?: string
  },
  options: VerificationStateOptions = {},
): Promise<McpRegistryVerificationRecord> {
  const state = await readStateFile(options)
  const id = buildMcpRegistryVerificationRecordId(input)
  const record: McpRegistryVerificationRecord = {
    id,
    machineScope: "local",
    runtime: input.runtime,
    serverName: input.serverName,
    entryFingerprint: input.entryFingerprint,
    configFingerprint: input.configFingerprint,
    status: input.status,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    updatedAt: (options.now ?? new Date()).toISOString(),
  }
  state.records[id] = record
  await writeStateFile(state, options)
  return record
}

export function mcpRegistryVerificationRecordToLocalState(
  record: McpRegistryVerificationRecord | null | undefined,
): McpRegistryRuntimeLocalState | undefined {
  if (!record) return undefined
  return {
    runtime: record.runtime,
    status: record.status,
    ...(record.reason ? { reason: record.reason } : {}),
  }
}
