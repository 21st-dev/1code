import { createHash } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import {
  sanitizeMcpCommandArgs,
  sanitizeMcpUrlForPreview,
} from "../../../shared/mcp-import-preview"
import {
  buildDeveloperTrustedAcknowledgement,
  getDeveloperTrustedStatus,
  type PluginDeveloperModeState,
  type PluginDeveloperTrustedAcknowledgement,
  type PluginDeveloperTrustedStatus,
} from "../../../shared/plugin-developer-trusted"
import type { PluginSafeModeState } from "../../../shared/plugin-safety-gates"
import type {
  PluginStoreBackupRecord,
  PluginStoreCandidateApproval,
  PluginStoreCandidateReviewDocument,
  PluginStoreCandidateStatus,
  PluginStoreInstalledPackageRecord,
  PluginStoreValidationIssue,
} from "../../../shared/plugin-store-pins"
import {
  buildPluginManifestReviewDocument,
  diffPluginManifestReviewDocuments,
  type PluginManifestReviewDocument,
  type PluginRuntimeNativeActivationReviewMetadata,
  type PluginSourcePin,
  type PluginUpdateReviewMetadata,
  type PluginUpdateReviewStatus,
  stableJsonStringify,
} from "../../../shared/plugin-update-review"
import type { McpServerConfig } from "../claude-config"
import { getElectronUserDataPath } from "../electron-app"
import type { RuntimeNativeActivationIdentity } from "./runtime-native-activation"

const PLUGIN_REVIEW_STATE_VERSION = 1
const PLUGIN_REVIEW_STATE_FILE = "plugin-review-state.json"

interface PluginReviewStateRecord {
  fingerprint: string
  document: PluginManifestReviewDocument
  runtimeNativeActivationIdentity?: RuntimeNativeActivationIdentity
  firstSeenAt: string
  lastSeenAt: string
  lastReviewedAt?: string
  lastReviewedFingerprint?: string
  lastReviewedDocument?: PluginManifestReviewDocument
  lastReviewedRuntimeNativeActivationIdentityFingerprint?: string
  lastReviewedRuntimeNativeActivationIdentity?: RuntimeNativeActivationIdentity
}

interface PluginReviewState {
  schemaVersion: 1
  plugins: Record<string, PluginReviewStateRecord>
  safeMode?: PluginSafeModeState
  developerMode?: PluginDeveloperModeState
  developerSources?: PluginDeveloperSourceRecord[]
  developerTrustedPlugins?: Record<
    string,
    PluginDeveloperTrustedAcknowledgement
  >
  runtimeNativePluginEnablement?: Record<
    string,
    RuntimeNativePluginEnablementRecord
  >
  runtimeNativePluginScopedSelections?: RuntimeNativePluginScopedSelections
  storeCandidates?: Record<string, PluginStoreCandidateRecord>
  storeApprovals?: Record<string, PluginStoreCandidateApproval>
  installedStorePackages?: Record<string, PluginStoreInstalledPackageRecord>
  storeBackupRecords?: PluginStoreBackupRecord[]
}

export interface PluginStoreCandidateRecord {
  schemaVersion: 1
  storeEntryId: string
  candidateFingerprint: string
  document: PluginStoreCandidateReviewDocument
  status: PluginStoreCandidateStatus
  issues: PluginStoreValidationIssue[]
  previewedAt: string
}

export interface PluginDeveloperSourceRecord {
  id: string
  path: string
  addedAt: string
}

export interface RuntimeNativePluginEnablementRecord {
  enabled: boolean
  updatedAt: string
}

export type RuntimeNativePluginSelectionScopeKind =
  | "project"
  | "chat"
  | "subChat"

export interface RuntimeNativePluginSelectionScope {
  kind: RuntimeNativePluginSelectionScopeKind
  id: string
}

export interface RuntimeNativePluginActivationScopeContext {
  projectId?: string | null
  chatId?: string | null
  subChatId?: string | null
}

export interface RuntimeNativePluginScopedSelectionRecord {
  mode: "inherit" | "custom"
  enabledPluginReviewKeys: string[]
  updatedAt: string
}

export interface RuntimeNativePluginScopedSelections {
  projects: Record<string, RuntimeNativePluginScopedSelectionRecord>
  chats: Record<string, RuntimeNativePluginScopedSelectionRecord>
  subChats: Record<string, RuntimeNativePluginScopedSelectionRecord>
}

export interface RuntimeNativePluginEffectiveEnablement {
  scope: "global" | RuntimeNativePluginSelectionScopeKind
  scopeId?: string
  mode: "global" | "inherit" | "custom"
  enablement: Record<string, RuntimeNativePluginEnablementRecord>
}

export interface PluginReviewScanInput {
  pluginKey: string
  document: PluginManifestReviewDocument
  runtimeNativeActivationIdentity?: RuntimeNativeActivationIdentity
}

export interface PluginReviewScanResult {
  state: PluginReviewState
  safeMode: PluginSafeModeState
  metadataByPluginKey: Record<string, PluginUpdateReviewMetadata>
}

export interface PluginMcpApprovalFieldPresence {
  key: string
  hasValue: boolean
  valueSource?: "inline" | "env"
}

export interface PluginMcpApprovalDocument {
  schemaVersion: 1
  pluginSource: string
  serverName: string
  transportType?: string
  authType?: string
  command?: string
  url?: string
  cwd?: string
  enabled?: boolean
  disabled?: boolean
  args: Array<{
    value: string
    redacted: boolean
  }>
  env: PluginMcpApprovalFieldPresence[]
  envVars: string[]
  headers: PluginMcpApprovalFieldPresence[]
  oauthFields: string[]
}

export function getPluginReviewStatePath(
  userDataPath = getElectronUserDataPath(),
): string {
  return path.join(userDataPath, PLUGIN_REVIEW_STATE_FILE)
}

export function hashPluginManifestReviewDocument(
  document: PluginManifestReviewDocument,
): string {
  return createHash("sha256")
    .update(stableJsonStringify(document))
    .digest("hex")
}

export function buildPluginMcpApprovalDocument(input: {
  pluginSource: string
  serverName: string
  config: McpServerConfig
}): PluginMcpApprovalDocument {
  const config = input.config as Record<string, unknown>
  return {
    schemaVersion: 1,
    pluginSource: input.pluginSource,
    serverName: input.serverName,
    transportType: stringValue(config.transportType),
    authType: stringValue(config.authType),
    command: stringValue(config.command),
    url: sanitizeMcpUrlForPreview(config.url),
    cwd: stringValue(config.cwd),
    enabled: booleanValue(config.enabled),
    disabled: booleanValue(config.disabled),
    args: sanitizeMcpCommandArgs(config.args).map((arg) => ({
      value: arg.value,
      redacted: arg.redacted,
    })),
    env: normalizePresenceRecord(config.env),
    envVars: normalizeStringList(config.envVars),
    headers: [
      ...normalizePresenceRecord(config.headers, "inline"),
      ...normalizePresenceRecord(config.envHttpHeaders, "env"),
    ].sort(comparePresence),
    oauthFields: normalizeOauthFields(config._oauth),
  }
}

export function hashPluginMcpApprovalDocument(
  document: PluginMcpApprovalDocument,
): string {
  return createHash("sha256")
    .update(stableJsonStringify(document))
    .digest("hex")
}

export function buildPluginMcpApprovalIdentifier(input: {
  pluginSource: string
  serverName: string
  fingerprint: string
}): string {
  return `${input.pluginSource}:${input.serverName}#mcp-sha256:${input.fingerprint}`
}

export function buildCurrentPluginMcpApprovalIdentifier(input: {
  pluginSource: string
  serverName: string
  config: McpServerConfig
}): string {
  const document = buildPluginMcpApprovalDocument(input)
  return buildPluginMcpApprovalIdentifier({
    pluginSource: input.pluginSource,
    serverName: input.serverName,
    fingerprint: hashPluginMcpApprovalDocument(document),
  })
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
    return {
      schemaVersion: PLUGIN_REVIEW_STATE_VERSION,
      plugins: state.plugins,
      safeMode: normalizeSafeModeState(state.safeMode),
      developerMode: normalizeDeveloperModeState(state.developerMode),
      developerSources: normalizeDeveloperSources(state.developerSources),
      developerTrustedPlugins: normalizeDeveloperTrustedPlugins(
        state.developerTrustedPlugins,
      ),
      runtimeNativePluginEnablement: normalizeRuntimeNativePluginEnablement(
        state.runtimeNativePluginEnablement,
      ),
      runtimeNativePluginScopedSelections:
        normalizeRuntimeNativePluginScopedSelections(
          state.runtimeNativePluginScopedSelections,
        ),
      storeCandidates: normalizeStoreCandidates(state.storeCandidates),
      storeApprovals: normalizeStoreApprovals(state.storeApprovals),
      installedStorePackages: normalizeInstalledStorePackages(
        state.installedStorePackages,
      ),
      storeBackupRecords: normalizeStoreBackupRecords(state.storeBackupRecords),
    }
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

export function normalizeSafeModeState(
  value: PluginSafeModeState | undefined,
): PluginSafeModeState {
  return {
    enabled: value?.enabled === true,
    updatedAt:
      typeof value?.updatedAt === "string" ? value.updatedAt : undefined,
  }
}

export function isForcedPluginSafeModeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.LOCUS_PLUGIN_SAFE_MODE === "1" ||
    env.LOCUS_FORCE_PLUGIN_SAFE_MODE === "1"
  )
}

function applyForcedPluginSafeMode(
  state: PluginSafeModeState,
): PluginSafeModeState {
  if (!isForcedPluginSafeModeEnabled()) return state
  return {
    enabled: true,
    updatedAt: state.updatedAt,
  }
}

export function normalizeDeveloperModeState(
  value: PluginDeveloperModeState | undefined,
): PluginDeveloperModeState {
  return {
    enabled: value?.enabled === true,
    updatedAt:
      typeof value?.updatedAt === "string" ? value.updatedAt : undefined,
  }
}

export async function getPluginSafeModeState(
  filePath = getPluginReviewStatePath(),
): Promise<PluginSafeModeState> {
  const state = await readPluginReviewState(filePath)
  return applyForcedPluginSafeMode(normalizeSafeModeState(state.safeMode))
}

export async function getPluginDeveloperModeState(
  filePath = getPluginReviewStatePath(),
): Promise<PluginDeveloperModeState> {
  const state = await readPluginReviewState(filePath)
  return normalizeDeveloperModeState(state.developerMode)
}

export async function getRuntimeNativePluginEnablementState(
  filePath = getPluginReviewStatePath(),
): Promise<Record<string, RuntimeNativePluginEnablementRecord>> {
  const state = await readPluginReviewState(filePath)
  return normalizeRuntimeNativePluginEnablement(
    state.runtimeNativePluginEnablement,
  )
}

export async function getRuntimeNativePluginScopedSelectionsState(
  filePath = getPluginReviewStatePath(),
): Promise<RuntimeNativePluginScopedSelections> {
  const state = await readPluginReviewState(filePath)
  return normalizeRuntimeNativePluginScopedSelections(
    state.runtimeNativePluginScopedSelections,
  )
}

export async function getEffectiveRuntimeNativePluginEnablementState(
  context: RuntimeNativePluginActivationScopeContext = {},
  filePath = getPluginReviewStatePath(),
): Promise<RuntimeNativePluginEffectiveEnablement> {
  const state = await readPluginReviewState(filePath)
  return resolveRuntimeNativePluginEffectiveEnablement({
    globalEnablement: normalizeRuntimeNativePluginEnablement(
      state.runtimeNativePluginEnablement,
    ),
    scopedSelections: normalizeRuntimeNativePluginScopedSelections(
      state.runtimeNativePluginScopedSelections,
    ),
    context,
  })
}

export function resolveRuntimeNativePluginEffectiveEnablement(input: {
  globalEnablement: Record<string, RuntimeNativePluginEnablementRecord>
  scopedSelections?: RuntimeNativePluginScopedSelections
  context?: RuntimeNativePluginActivationScopeContext
}): RuntimeNativePluginEffectiveEnablement {
  const globalEnablement = normalizeRuntimeNativePluginEnablement(
    input.globalEnablement,
  )
  const scopedSelections = normalizeRuntimeNativePluginScopedSelections(
    input.scopedSelections,
  )
  const resolvedScope = resolveMostSpecificRuntimeNativePluginScope(
    scopedSelections,
    input.context ?? {},
  )
  if (!resolvedScope || resolvedScope.record.mode !== "custom") {
    return {
      scope: resolvedScope?.scope.kind ?? "global",
      scopeId: resolvedScope?.scope.id,
      mode: resolvedScope?.record.mode ?? "global",
      enablement: globalEnablement,
    }
  }

  const enablement: Record<string, RuntimeNativePluginEnablementRecord> = {}
  for (const pluginReviewKey of resolvedScope.record.enabledPluginReviewKeys) {
    const globalRecord = globalEnablement[pluginReviewKey]
    if (globalRecord?.enabled !== true) continue
    enablement[pluginReviewKey] = {
      enabled: true,
      updatedAt: resolvedScope.record.updatedAt,
    }
  }

  return {
    scope: resolvedScope.scope.kind,
    scopeId: resolvedScope.scope.id,
    mode: "custom",
    enablement,
  }
}

export async function getPluginStoreStateSnapshot(
  filePath = getPluginReviewStatePath(),
): Promise<{
  candidates: Record<string, PluginStoreCandidateRecord>
  approvals: Record<string, PluginStoreCandidateApproval>
  installedPackages: Record<string, PluginStoreInstalledPackageRecord>
  backupRecords: PluginStoreBackupRecord[]
}> {
  const state = await readPluginReviewState(filePath)
  return {
    candidates: normalizeStoreCandidates(state.storeCandidates),
    approvals: normalizeStoreApprovals(state.storeApprovals),
    installedPackages: normalizeInstalledStorePackages(
      state.installedStorePackages,
    ),
    backupRecords: normalizeStoreBackupRecords(state.storeBackupRecords),
  }
}

export async function recordPluginStoreCandidatePreview(
  input: {
    storeEntryId: string
    candidateFingerprint: string
    document: PluginStoreCandidateReviewDocument
    status: PluginStoreCandidateStatus
    issues: PluginStoreValidationIssue[]
  },
  filePath = getPluginReviewStatePath(),
  now = new Date(),
): Promise<PluginStoreCandidateRecord> {
  const state = await readPluginReviewState(filePath)
  const record: PluginStoreCandidateRecord = {
    schemaVersion: 1,
    storeEntryId: input.storeEntryId,
    candidateFingerprint: input.candidateFingerprint,
    document: input.document,
    status: input.status,
    issues: input.issues,
    previewedAt: now.toISOString(),
  }
  state.storeCandidates = {
    ...normalizeStoreCandidates(state.storeCandidates),
    [input.storeEntryId]: record,
  }
  await writePluginReviewState(state, filePath)
  return record
}

export async function approvePluginStoreCandidateFingerprint(
  approval: PluginStoreCandidateApproval,
  filePath = getPluginReviewStatePath(),
): Promise<PluginStoreCandidateApproval> {
  const state = await readPluginReviewState(filePath)
  state.storeApprovals = {
    ...normalizeStoreApprovals(state.storeApprovals),
    [approval.storeEntryId]: approval,
  }
  await writePluginReviewState(state, filePath)
  return approval
}

export async function recordInstalledPluginStorePackage(
  input: {
    installed: PluginStoreInstalledPackageRecord
    backup?: PluginStoreBackupRecord
  },
  filePath = getPluginReviewStatePath(),
): Promise<{
  installed: PluginStoreInstalledPackageRecord
  backup?: PluginStoreBackupRecord
}> {
  const state = await readPluginReviewState(filePath)
  state.installedStorePackages = {
    ...normalizeInstalledStorePackages(state.installedStorePackages),
    [input.installed.storeEntryId]: input.installed,
  }
  state.storeBackupRecords = [
    ...(input.backup ? [input.backup] : []),
    ...normalizeStoreBackupRecords(state.storeBackupRecords),
  ].slice(0, 64)
  await writePluginReviewState(state, filePath)
  return input
}

export async function setPluginSafeModeEnabled(
  enabled: boolean,
  filePath = getPluginReviewStatePath(),
  now = new Date(),
): Promise<PluginSafeModeState> {
  const state = await readPluginReviewState(filePath)
  state.safeMode = {
    enabled,
    updatedAt: now.toISOString(),
  }
  await writePluginReviewState(state, filePath)
  return state.safeMode
}

export async function setPluginDeveloperModeEnabled(
  enabled: boolean,
  filePath = getPluginReviewStatePath(),
  now = new Date(),
): Promise<PluginDeveloperModeState> {
  const state = await readPluginReviewState(filePath)
  state.developerMode = {
    enabled,
    updatedAt: now.toISOString(),
  }
  await writePluginReviewState(state, filePath)
  return state.developerMode
}

export async function setRuntimeNativePluginEnabled(
  input: {
    pluginReviewKey: string
    enabled: boolean
  },
  filePath = getPluginReviewStatePath(),
  now = new Date(),
): Promise<RuntimeNativePluginEnablementRecord> {
  const state = await readPluginReviewState(filePath)
  const enablement = normalizeRuntimeNativePluginEnablement(
    state.runtimeNativePluginEnablement,
  )
  const record: RuntimeNativePluginEnablementRecord = {
    enabled: input.enabled,
    updatedAt: now.toISOString(),
  }
  state.runtimeNativePluginEnablement = {
    ...enablement,
    [input.pluginReviewKey]: record,
  }
  await writePluginReviewState(state, filePath)
  return record
}

export async function setRuntimeNativePluginScopedSelection(
  input: {
    scope: RuntimeNativePluginSelectionScope
    mode: RuntimeNativePluginScopedSelectionRecord["mode"]
    enabledPluginReviewKeys?: string[]
  },
  filePath = getPluginReviewStatePath(),
  now = new Date(),
): Promise<RuntimeNativePluginScopedSelectionRecord> {
  const state = await readPluginReviewState(filePath)
  const scopedSelections = normalizeRuntimeNativePluginScopedSelections(
    state.runtimeNativePluginScopedSelections,
  )
  const record: RuntimeNativePluginScopedSelectionRecord = {
    mode: input.mode,
    enabledPluginReviewKeys:
      input.mode === "custom"
        ? normalizePluginReviewKeyList(input.enabledPluginReviewKeys ?? [])
        : [],
    updatedAt: now.toISOString(),
  }
  const bucket = getScopedSelectionBucket(scopedSelections, input.scope.kind)
  bucket[input.scope.id] = record
  state.runtimeNativePluginScopedSelections = scopedSelections
  await writePluginReviewState(state, filePath)
  return record
}

export async function getDeveloperPluginSources(
  filePath = getPluginReviewStatePath(),
): Promise<PluginDeveloperSourceRecord[]> {
  const state = await readPluginReviewState(filePath)
  return normalizeDeveloperSources(state.developerSources)
}

export async function addDeveloperPluginSource(
  sourcePath: string,
  filePath = getPluginReviewStatePath(),
  now = new Date(),
): Promise<PluginDeveloperSourceRecord> {
  const realSourcePath = await resolveDeveloperSourcePath(sourcePath)
  const source: PluginDeveloperSourceRecord = {
    id: buildDeveloperSourceId(realSourcePath),
    path: realSourcePath,
    addedAt: now.toISOString(),
  }
  const state = await readPluginReviewState(filePath)
  const sources = normalizeDeveloperSources(state.developerSources)
  state.developerSources = [
    ...sources.filter((candidate) => candidate.id !== source.id),
    source,
  ].sort((a, b) => a.path.localeCompare(b.path))
  await writePluginReviewState(state, filePath)
  return source
}

export async function removeDeveloperPluginSource(
  sourceId: string,
  filePath = getPluginReviewStatePath(),
): Promise<{ removed: boolean }> {
  const state = await readPluginReviewState(filePath)
  const sources = normalizeDeveloperSources(state.developerSources)
  const nextSources = sources.filter((source) => source.id !== sourceId)
  state.developerSources = nextSources
  await writePluginReviewState(state, filePath)
  return { removed: nextSources.length !== sources.length }
}

export async function trustDeveloperPluginFingerprint(
  input: {
    pluginReviewKey: string
    pluginFingerprint: string
    manifestId: string
    entryPath: string
    entryContentHash: string
    bundleContentHash: string
    sourcePath: string
  },
  filePath = getPluginReviewStatePath(),
  now = new Date(),
): Promise<PluginDeveloperTrustedAcknowledgement> {
  const state = await readPluginReviewState(filePath)
  const trust = buildDeveloperTrustedAcknowledgement({
    ...input,
    trustedAt: now.toISOString(),
  })
  state.developerTrustedPlugins = {
    ...normalizeDeveloperTrustedPlugins(state.developerTrustedPlugins),
    [input.pluginReviewKey]: trust,
  }
  await writePluginReviewState(state, filePath)
  return trust
}

export async function revokeDeveloperPluginTrust(
  pluginReviewKey: string,
  filePath = getPluginReviewStatePath(),
): Promise<{ revoked: boolean }> {
  const state = await readPluginReviewState(filePath)
  const trustedPlugins = normalizeDeveloperTrustedPlugins(
    state.developerTrustedPlugins,
  )
  const revoked = Boolean(trustedPlugins[pluginReviewKey])
  delete trustedPlugins[pluginReviewKey]
  state.developerTrustedPlugins = trustedPlugins
  await writePluginReviewState(state, filePath)
  return { revoked }
}

export async function getDeveloperPluginTrustStatus(
  input: {
    pluginReviewKey: string
    pluginFingerprint: string
    manifestId: string
    entryPath: string
    entryContentHash: string
    bundleContentHash: string
    sourcePath: string
  },
  filePath = getPluginReviewStatePath(),
): Promise<{
  status: PluginDeveloperTrustedStatus
  acknowledgement?: PluginDeveloperTrustedAcknowledgement
}> {
  const state = await readPluginReviewState(filePath)
  const acknowledgement = normalizeDeveloperTrustedPlugins(
    state.developerTrustedPlugins,
  )[input.pluginReviewKey]
  return {
    acknowledgement,
    status: getDeveloperTrustedStatus(acknowledgement, input),
  }
}

export async function recordPluginReviewScans(
  inputs: PluginReviewScanInput[],
  filePath = getPluginReviewStatePath(),
  now = new Date(),
): Promise<PluginReviewScanResult> {
  const state = await readPluginReviewState(filePath)
  const safeMode = applyForcedPluginSafeMode(
    normalizeSafeModeState(state.safeMode),
  )
  state.developerMode = normalizeDeveloperModeState(state.developerMode)
  state.developerSources = normalizeDeveloperSources(state.developerSources)
  state.developerTrustedPlugins = normalizeDeveloperTrustedPlugins(
    state.developerTrustedPlugins,
  )
  state.runtimeNativePluginEnablement = normalizeRuntimeNativePluginEnablement(
    state.runtimeNativePluginEnablement,
  )
  const metadataByPluginKey: Record<string, PluginUpdateReviewMetadata> = {}
  const seenAt = now.toISOString()

  for (const input of inputs) {
    const fingerprint = hashPluginManifestReviewDocument(input.document)
    const previousRecord = state.plugins[input.pluginKey]
    const status = getPluginUpdateReviewStatus(previousRecord, fingerprint)
    const baselineDocument =
      previousRecord?.lastReviewedDocument ?? previousRecord?.document
    const changes =
      status === "changed"
        ? diffPluginManifestReviewDocuments(
            baselineDocument,
            input.document,
          ).slice(0, 12)
        : []

    const record: PluginReviewStateRecord = {
      fingerprint,
      document: input.document,
      runtimeNativeActivationIdentity: input.runtimeNativeActivationIdentity,
      firstSeenAt: previousRecord?.firstSeenAt ?? seenAt,
      lastSeenAt: seenAt,
      lastReviewedAt: previousRecord?.lastReviewedAt,
      lastReviewedFingerprint: previousRecord?.lastReviewedFingerprint,
      lastReviewedDocument: previousRecord?.lastReviewedDocument,
      lastReviewedRuntimeNativeActivationIdentityFingerprint:
        previousRecord?.lastReviewedRuntimeNativeActivationIdentityFingerprint,
      lastReviewedRuntimeNativeActivationIdentity:
        previousRecord?.lastReviewedRuntimeNativeActivationIdentity,
    }

    state.plugins[input.pluginKey] = record
    metadataByPluginKey[input.pluginKey] = {
      fingerprint,
      status,
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      lastReviewedAt: record.lastReviewedAt,
      lastReviewedFingerprint: record.lastReviewedFingerprint,
      runtimeNativeActivation: buildRuntimeNativeActivationReviewMetadata({
        identity: input.runtimeNativeActivationIdentity,
        lastReviewedIdentityFingerprint:
          record.lastReviewedRuntimeNativeActivationIdentityFingerprint,
      }),
      sourcePins: input.document.sourcePins,
      changes,
    }
  }

  await writePluginReviewState(state, filePath)
  return { state, safeMode, metadataByPluginKey }
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
    runtimeNativeActivationIdentity: input.runtimeNativeActivationIdentity,
    firstSeenAt: previousRecord?.firstSeenAt ?? reviewedAt,
    lastSeenAt: reviewedAt,
    lastReviewedAt: reviewedAt,
    lastReviewedFingerprint: fingerprint,
    lastReviewedDocument: input.document,
    lastReviewedRuntimeNativeActivationIdentityFingerprint:
      input.runtimeNativeActivationIdentity?.identityFingerprint,
    lastReviewedRuntimeNativeActivationIdentity:
      input.runtimeNativeActivationIdentity,
  }

  await writePluginReviewState(state, filePath)

  return {
    fingerprint,
    status: "reviewed",
    firstSeenAt: state.plugins[input.pluginKey].firstSeenAt,
    lastSeenAt: reviewedAt,
    lastReviewedAt: reviewedAt,
    lastReviewedFingerprint: fingerprint,
    runtimeNativeActivation: buildRuntimeNativeActivationReviewMetadata({
      identity: input.runtimeNativeActivationIdentity,
      lastReviewedIdentityFingerprint:
        input.runtimeNativeActivationIdentity?.identityFingerprint,
    }),
    sourcePins: input.document.sourcePins,
    changes: [],
  }
}

function getPluginUpdateReviewStatus(
  previousRecord: PluginReviewStateRecord | undefined,
  currentFingerprint: string,
): PluginUpdateReviewStatus {
  if (!previousRecord) return "new"
  if (previousRecord.lastReviewedFingerprint === currentFingerprint)
    return "reviewed"
  if (previousRecord.lastReviewedFingerprint) return "changed"
  if (previousRecord.fingerprint === currentFingerprint) return "unchanged"
  return "changed"
}

function buildRuntimeNativeActivationReviewMetadata(input: {
  identity?: RuntimeNativeActivationIdentity
  lastReviewedIdentityFingerprint?: string
}): PluginRuntimeNativeActivationReviewMetadata | undefined {
  if (!input.identity) return undefined

  return {
    identityFingerprint: input.identity.identityFingerprint,
    identityStatus: input.identity.status,
    reviewStatus: getRuntimeNativeActivationReviewStatus({
      identity: input.identity,
      lastReviewedIdentityFingerprint: input.lastReviewedIdentityFingerprint,
    }),
    lastReviewedIdentityFingerprint: input.lastReviewedIdentityFingerprint,
    missingFields: input.identity.missingFields,
  }
}

function getRuntimeNativeActivationReviewStatus(input: {
  identity: RuntimeNativeActivationIdentity
  lastReviewedIdentityFingerprint?: string
}): PluginRuntimeNativeActivationReviewMetadata["reviewStatus"] {
  if (input.identity.status === "identity-incomplete") {
    return "identity-incomplete"
  }
  if (!input.lastReviewedIdentityFingerprint) {
    return "identity-unreviewed"
  }
  return input.lastReviewedIdentityFingerprint ===
    input.identity.identityFingerprint
    ? "reviewed"
    : "identity-drifted"
}

function normalizeDeveloperSources(
  value: PluginDeveloperSourceRecord[] | undefined,
): PluginDeveloperSourceRecord[] {
  if (!Array.isArray(value)) return []
  const byId = new Map<string, PluginDeveloperSourceRecord>()
  for (const source of value) {
    if (
      !source ||
      typeof source.id !== "string" ||
      source.id.trim().length === 0 ||
      typeof source.path !== "string" ||
      source.path.trim().length === 0
    ) {
      continue
    }
    byId.set(source.id, {
      id: source.id,
      path: source.path,
      addedAt: typeof source.addedAt === "string" ? source.addedAt : "",
    })
  }
  return Array.from(byId.values()).sort((a, b) => a.path.localeCompare(b.path))
}

function normalizeDeveloperTrustedPlugins(
  value: Record<string, PluginDeveloperTrustedAcknowledgement> | undefined,
): Record<string, PluginDeveloperTrustedAcknowledgement> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const normalized: Record<string, PluginDeveloperTrustedAcknowledgement> = {}
  for (const [key, trust] of Object.entries(value)) {
    if (
      !trust ||
      typeof trust !== "object" ||
      typeof trust.pluginReviewKey !== "string" ||
      trust.pluginReviewKey !== key ||
      typeof trust.pluginFingerprint !== "string" ||
      typeof trust.manifestId !== "string" ||
      typeof trust.entryPath !== "string" ||
      typeof trust.entryContentHash !== "string" ||
      typeof trust.bundleContentHash !== "string" ||
      typeof trust.sourcePath !== "string" ||
      typeof trust.trustedAt !== "string"
    ) {
      continue
    }
    normalized[key] = trust
  }
  return normalized
}

function normalizeRuntimeNativePluginEnablement(
  value: Record<string, RuntimeNativePluginEnablementRecord> | undefined,
): Record<string, RuntimeNativePluginEnablementRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const normalized: Record<string, RuntimeNativePluginEnablementRecord> = {}
  for (const [key, record] of Object.entries(value)) {
    if (
      typeof key !== "string" ||
      key.trim().length === 0 ||
      !record ||
      typeof record !== "object" ||
      typeof record.enabled !== "boolean" ||
      typeof record.updatedAt !== "string"
    ) {
      continue
    }
    normalized[key] = {
      enabled: record.enabled,
      updatedAt: record.updatedAt,
    }
  }
  return normalized
}

function normalizeRuntimeNativePluginScopedSelections(
  value: RuntimeNativePluginScopedSelections | undefined,
): RuntimeNativePluginScopedSelections {
  return {
    projects: normalizeScopedSelectionBucket(value?.projects),
    chats: normalizeScopedSelectionBucket(value?.chats),
    subChats: normalizeScopedSelectionBucket(value?.subChats),
  }
}

function normalizeScopedSelectionBucket(
  value: Record<string, RuntimeNativePluginScopedSelectionRecord> | undefined,
): Record<string, RuntimeNativePluginScopedSelectionRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const normalized: Record<string, RuntimeNativePluginScopedSelectionRecord> = {}
  for (const [scopeId, record] of Object.entries(value)) {
    if (
      typeof scopeId !== "string" ||
      scopeId.trim().length === 0 ||
      !record ||
      typeof record !== "object" ||
      (record.mode !== "inherit" && record.mode !== "custom") ||
      typeof record.updatedAt !== "string"
    ) {
      continue
    }
    normalized[scopeId] = {
      mode: record.mode,
      enabledPluginReviewKeys:
        record.mode === "custom"
          ? normalizePluginReviewKeyList(record.enabledPluginReviewKeys)
          : [],
      updatedAt: record.updatedAt,
    }
  }
  return normalized
}

function normalizePluginReviewKeyList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0),
    ),
  ).sort()
}

function resolveMostSpecificRuntimeNativePluginScope(
  scopedSelections: RuntimeNativePluginScopedSelections,
  context: RuntimeNativePluginActivationScopeContext,
):
  | {
      scope: RuntimeNativePluginSelectionScope
      record: RuntimeNativePluginScopedSelectionRecord
    }
  | null {
  const candidates: Array<{
    kind: RuntimeNativePluginSelectionScopeKind
    id?: string | null
  }> = [
    { kind: "subChat", id: context.subChatId },
    { kind: "chat", id: context.chatId },
    { kind: "project", id: context.projectId },
  ]
  for (const candidate of candidates) {
    const id = candidate.id?.trim()
    if (!id) continue
    const record = getScopedSelectionBucket(scopedSelections, candidate.kind)[id]
    if (!record) continue
    if (record.mode === "inherit") continue
    return { scope: { kind: candidate.kind, id }, record }
  }
  return null
}

function getScopedSelectionBucket(
  scopedSelections: RuntimeNativePluginScopedSelections,
  kind: RuntimeNativePluginSelectionScopeKind,
): Record<string, RuntimeNativePluginScopedSelectionRecord> {
  switch (kind) {
    case "project":
      return scopedSelections.projects
    case "chat":
      return scopedSelections.chats
    case "subChat":
      return scopedSelections.subChats
  }
}

function normalizeStoreCandidates(
  value: Record<string, PluginStoreCandidateRecord> | undefined,
): Record<string, PluginStoreCandidateRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const normalized: Record<string, PluginStoreCandidateRecord> = {}
  for (const [key, record] of Object.entries(value)) {
    if (
      !record ||
      typeof record !== "object" ||
      record.schemaVersion !== 1 ||
      record.storeEntryId !== key ||
      typeof record.candidateFingerprint !== "string" ||
      !record.document ||
      typeof record.document !== "object" ||
      typeof record.status !== "string" ||
      !Array.isArray(record.issues) ||
      typeof record.previewedAt !== "string"
    ) {
      continue
    }
    normalized[key] = record
  }
  return normalized
}

function normalizeStoreApprovals(
  value: Record<string, PluginStoreCandidateApproval> | undefined,
): Record<string, PluginStoreCandidateApproval> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const normalized: Record<string, PluginStoreCandidateApproval> = {}
  for (const [key, approval] of Object.entries(value)) {
    if (
      !approval ||
      typeof approval !== "object" ||
      approval.schemaVersion !== 1 ||
      approval.storeEntryId !== key ||
      typeof approval.commit !== "string" ||
      (approval.packageHash !== undefined &&
        typeof approval.packageHash !== "string") ||
      typeof approval.candidateFingerprint !== "string" ||
      typeof approval.approvedAt !== "string"
    ) {
      continue
    }
    normalized[key] = approval
  }
  return normalized
}

function normalizeInstalledStorePackages(
  value: Record<string, PluginStoreInstalledPackageRecord> | undefined,
): Record<string, PluginStoreInstalledPackageRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const normalized: Record<string, PluginStoreInstalledPackageRecord> = {}
  for (const [key, record] of Object.entries(value)) {
    if (
      !record ||
      typeof record !== "object" ||
      record.schemaVersion !== 1 ||
      record.storeEntryId !== key ||
      typeof record.pluginReviewKey !== "string" ||
      typeof record.commit !== "string" ||
      (record.packageHash !== undefined &&
        typeof record.packageHash !== "string") ||
      typeof record.candidateFingerprint !== "string" ||
      typeof record.installedAt !== "string" ||
      typeof record.targetMode !== "string"
    ) {
      continue
    }
    normalized[key] = record
  }
  return normalized
}

function normalizeStoreBackupRecords(
  value: PluginStoreBackupRecord[] | undefined,
): PluginStoreBackupRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter((record): record is PluginStoreBackupRecord =>
    Boolean(
      record &&
        typeof record === "object" &&
        record.schemaVersion === 1 &&
        typeof record.id === "string" &&
        typeof record.pluginReviewKey === "string" &&
        typeof record.storeEntryId === "string" &&
        typeof record.backupPath === "string" &&
        typeof record.previousPath === "string" &&
        typeof record.createdAt === "string",
    ),
  )
}

async function resolveDeveloperSourcePath(sourcePath: string): Promise<string> {
  const resolved = path.resolve(sourcePath)
  const realSourcePath = await fs.realpath(resolved)
  const stat = await fs.stat(realSourcePath)
  if (!stat.isDirectory()) {
    throw new Error("Developer plugin source must be a directory.")
  }
  return realSourcePath
}

function buildDeveloperSourceId(sourcePath: string): string {
  return createHash("sha256").update(sourcePath).digest("hex").slice(0, 16)
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
      const ref =
        typeof sourceRecord.ref === "string" ? sourceRecord.ref.trim() : ""
      if (ref) {
        pins.push({
          kind: "lock-source-ref",
          value: ref,
          label: "Lock source ref",
          repo:
            typeof sourceRecord.repo === "string"
              ? sourceRecord.repo
              : undefined,
          path:
            typeof sourceRecord.path === "string"
              ? sourceRecord.path
              : undefined,
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
    byKey.set(
      `${pin.kind}:${pin.value}:${pin.repo ?? ""}:${pin.path ?? ""}`,
      pin,
    )
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const byKind = a.kind.localeCompare(b.kind)
    if (byKind !== 0) return byKind
    return a.value.localeCompare(b.value)
  })
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    )
    .map((item) => item.trim())
    .sort()
}

function normalizePresenceRecord(
  value: unknown,
  valueSource: "inline" | "env" = "inline",
): PluginMcpApprovalFieldPresence[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, nested]) => ({
      key,
      hasValue: hasPresenceValue(nested),
      valueSource,
    }))
    .sort(comparePresence)
}

function hasPresenceValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return true
}

function comparePresence(
  a: PluginMcpApprovalFieldPresence,
  b: PluginMcpApprovalFieldPresence,
): number {
  const byKey = a.key.localeCompare(b.key)
  if (byKey !== 0) return byKey
  return (a.valueSource ?? "inline").localeCompare(b.valueSource ?? "inline")
}

function normalizeOauthFields(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.keys(value).filter(Boolean).sort()
}

export { buildPluginManifestReviewDocument, diffPluginManifestReviewDocuments }
