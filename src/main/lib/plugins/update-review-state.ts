import { createHash } from "crypto"
import { app } from "electron"
import * as fs from "fs/promises"
import * as path from "path"
import {
  buildPluginManifestReviewDocument,
  diffPluginManifestReviewDocuments,
  stableJsonStringify,
  type PluginManifestReviewDocument,
  type PluginSourcePin,
  type PluginUpdateReviewMetadata,
  type PluginUpdateReviewStatus,
} from "../../../shared/plugin-update-review"

const PLUGIN_REVIEW_STATE_VERSION = 1
const PLUGIN_REVIEW_STATE_FILE = "plugin-review-state.json"

interface PluginReviewStateRecord {
  fingerprint: string
  document: PluginManifestReviewDocument
  firstSeenAt: string
  lastSeenAt: string
  lastReviewedAt?: string
  lastReviewedFingerprint?: string
  lastReviewedDocument?: PluginManifestReviewDocument
}

interface PluginReviewState {
  schemaVersion: 1
  plugins: Record<string, PluginReviewStateRecord>
}

export interface PluginReviewScanInput {
  pluginKey: string
  document: PluginManifestReviewDocument
}

export interface PluginReviewScanResult {
  state: PluginReviewState
  metadataByPluginKey: Record<string, PluginUpdateReviewMetadata>
}

export function getPluginReviewStatePath(userDataPath = app.getPath("userData")): string {
  return path.join(userDataPath, PLUGIN_REVIEW_STATE_FILE)
}

export function hashPluginManifestReviewDocument(document: PluginManifestReviewDocument): string {
  return createHash("sha256")
    .update(stableJsonStringify(document))
    .digest("hex")
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as T
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8")
  await fs.rename(tmpPath, filePath)
}

export async function readPluginReviewState(
  filePath = getPluginReviewStatePath(),
): Promise<PluginReviewState> {
  try {
    const state = await readJsonFile<PluginReviewState>(filePath)
    if (state.schemaVersion !== PLUGIN_REVIEW_STATE_VERSION || !state.plugins) {
      return { schemaVersion: PLUGIN_REVIEW_STATE_VERSION, plugins: {} }
    }
    return state
  } catch {
    return { schemaVersion: PLUGIN_REVIEW_STATE_VERSION, plugins: {} }
  }
}

export async function writePluginReviewState(
  state: PluginReviewState,
  filePath = getPluginReviewStatePath(),
): Promise<void> {
  await writeJsonAtomic(filePath, state)
}

export async function recordPluginReviewScans(
  inputs: PluginReviewScanInput[],
  filePath = getPluginReviewStatePath(),
  now = new Date(),
): Promise<PluginReviewScanResult> {
  const state = await readPluginReviewState(filePath)
  const metadataByPluginKey: Record<string, PluginUpdateReviewMetadata> = {}
  const seenAt = now.toISOString()

  for (const input of inputs) {
    const fingerprint = hashPluginManifestReviewDocument(input.document)
    const previousRecord = state.plugins[input.pluginKey]
    const status = getPluginUpdateReviewStatus(previousRecord, fingerprint)
    const baselineDocument = previousRecord?.lastReviewedDocument ?? previousRecord?.document
    const changes = status === "changed"
      ? diffPluginManifestReviewDocuments(baselineDocument, input.document).slice(0, 12)
      : []

    const record: PluginReviewStateRecord = {
      fingerprint,
      document: input.document,
      firstSeenAt: previousRecord?.firstSeenAt ?? seenAt,
      lastSeenAt: seenAt,
      lastReviewedAt: previousRecord?.lastReviewedAt,
      lastReviewedFingerprint: previousRecord?.lastReviewedFingerprint,
      lastReviewedDocument: previousRecord?.lastReviewedDocument,
    }

    state.plugins[input.pluginKey] = record
    metadataByPluginKey[input.pluginKey] = {
      fingerprint,
      status,
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      lastReviewedAt: record.lastReviewedAt,
      lastReviewedFingerprint: record.lastReviewedFingerprint,
      sourcePins: input.document.sourcePins,
      changes,
    }
  }

  await writePluginReviewState(state, filePath)
  return { state, metadataByPluginKey }
}

export async function markPluginFingerprintReviewed(
  input: PluginReviewScanInput,
  filePath = getPluginReviewStatePath(),
  now = new Date(),
): Promise<PluginUpdateReviewMetadata> {
  const state = await readPluginReviewState(filePath)
  const fingerprint = hashPluginManifestReviewDocument(input.document)
  const reviewedAt = now.toISOString()
  const previousRecord = state.plugins[input.pluginKey]

  state.plugins[input.pluginKey] = {
    fingerprint,
    document: input.document,
    firstSeenAt: previousRecord?.firstSeenAt ?? reviewedAt,
    lastSeenAt: reviewedAt,
    lastReviewedAt: reviewedAt,
    lastReviewedFingerprint: fingerprint,
    lastReviewedDocument: input.document,
  }

  await writePluginReviewState(state, filePath)

  return {
    fingerprint,
    status: "reviewed",
    firstSeenAt: state.plugins[input.pluginKey].firstSeenAt,
    lastSeenAt: reviewedAt,
    lastReviewedAt: reviewedAt,
    lastReviewedFingerprint: fingerprint,
    sourcePins: input.document.sourcePins,
    changes: [],
  }
}

function getPluginUpdateReviewStatus(
  previousRecord: PluginReviewStateRecord | undefined,
  currentFingerprint: string,
): PluginUpdateReviewStatus {
  if (!previousRecord) return "new"
  if (previousRecord.lastReviewedFingerprint === currentFingerprint) return "reviewed"
  if (previousRecord.lastReviewedFingerprint) return "changed"
  if (previousRecord.fingerprint === currentFingerprint) return "unchanged"
  return "changed"
}

export async function extractCodexSourcePins(
  pluginRoot: string,
  cacheVersion?: string,
): Promise<PluginSourcePin[]> {
  const pins: PluginSourcePin[] = []
  const normalizedCacheVersion = cacheVersion?.trim()
  if (normalizedCacheVersion) {
    pins.push({
      kind: "cache-version",
      value: normalizedCacheVersion,
      label: "Codex cache version",
    })
  }

  const lockPath = path.join(pluginRoot, "plugin.lock.json")
  let lockJson: unknown
  try {
    lockJson = JSON.parse(await fs.readFile(lockPath, "utf-8")) as unknown
  } catch {
    return pins
  }

  for (const ref of collectLockSourceRefs(lockJson)) {
    pins.push(ref)
  }

  return dedupePins(pins)
}

function collectLockSourceRefs(value: unknown): PluginSourcePin[] {
  if (!value || typeof value !== "object") return []
  const pins: PluginSourcePin[] = []

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }

    const record = node as Record<string, unknown>
    const source = record.source
    if (source && typeof source === "object" && !Array.isArray(source)) {
      const sourceRecord = source as Record<string, unknown>
      const ref = typeof sourceRecord.ref === "string" ? sourceRecord.ref.trim() : ""
      if (ref) {
        pins.push({
          kind: "lock-source-ref",
          value: ref,
          label: "Lock source ref",
          repo: typeof sourceRecord.repo === "string" ? sourceRecord.repo : undefined,
          path: typeof sourceRecord.path === "string" ? sourceRecord.path : undefined,
        })
      }
    }

    for (const child of Object.values(record)) visit(child)
  }

  visit(value)
  return pins
}

function dedupePins(pins: PluginSourcePin[]): PluginSourcePin[] {
  const byKey = new Map<string, PluginSourcePin>()
  for (const pin of pins) {
    byKey.set(`${pin.kind}:${pin.value}:${pin.repo ?? ""}:${pin.path ?? ""}`, pin)
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const byKind = a.kind.localeCompare(b.kind)
    if (byKind !== 0) return byKind
    return a.value.localeCompare(b.value)
  })
}

export { buildPluginManifestReviewDocument, diffPluginManifestReviewDocuments }
