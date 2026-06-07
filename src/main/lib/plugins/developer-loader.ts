import * as fs from "fs/promises"
import * as path from "path"
import { pathToFileURL } from "url"
import {
  buildPluginDeveloperTrustedGate,
  type PluginDeveloperTrustedGate,
  type PluginDeveloperTrustedLoadState,
} from "../../../shared/plugin-developer-trusted"
import type { PluginUpdateReviewMetadata } from "../../../shared/plugin-update-review"
import {
  discoverAllRuntimePlugins,
  type PluginInfo,
} from "."
import { scanPluginReviewDocument } from "./review-scan"
import {
  getDeveloperPluginTrustStatus,
  getPluginDeveloperModeState,
  recordPluginReviewScans,
} from "./update-review-state"
import { getElectronUserDataPath } from "../electron-app"

export interface LocusDeveloperPluginApi {
  version: 1
  plugin: {
    reviewKey: string
    id: string
    name: string
    version: string
    sourcePath: string
    dataPath: string
  }
  log: {
    info(message: string): void
    warn(message: string): void
    error(message: string): void
  }
}

interface DeveloperLoadContext {
  plugin: PluginInfo
  updateReview: PluginUpdateReviewMetadata
  manifestId: string
  entryPath: string
  entryContentHash: string
  bundleContentHash: string
  gate: PluginDeveloperTrustedGate
}

const loadStates = new Map<string, PluginDeveloperTrustedLoadState>()

export function getDeveloperPluginLoadState(
  pluginReviewKey: string,
): PluginDeveloperTrustedLoadState {
  return loadStates.get(pluginReviewKey) ?? {
    pluginReviewKey,
    status: "not-loaded",
  }
}

export function getDeveloperPluginLoadStates(): PluginDeveloperTrustedLoadState[] {
  return Array.from(loadStates.values())
    .sort((a, b) => a.pluginReviewKey.localeCompare(b.pluginReviewKey))
}

export function clearDeveloperPluginLoadStates(): void {
  loadStates.clear()
}

export async function loadDeveloperTrustedPlugin(
  pluginReviewKey: string,
): Promise<PluginDeveloperTrustedLoadState> {
  const context = await resolveDeveloperLoadContext(pluginReviewKey)
  if (!context.gate.canLoadTrustedCode) {
    return recordLoadState({
      pluginReviewKey,
      status: "blocked",
      blockedAt: new Date().toISOString(),
      errorCode: context.gate.reasons[0] ?? "blocked",
      errorMessage: "Developer plugin load is blocked by current trust gates.",
      entryPath: context.entryPath,
      entryContentHash: context.entryContentHash,
      bundleContentHash: context.bundleContentHash,
      gate: context.gate,
    })
  }

  try {
    const dataPath = getDeveloperPluginDataPath(context.plugin.reviewKey)
    await fs.mkdir(dataPath, { recursive: true })
    const api = buildDeveloperPluginApi(context.plugin, context.manifestId, dataPath)
    const url = pathToFileURL(context.entryPath)
    url.searchParams.set("locusEntryHash", context.entryContentHash)
    url.searchParams.set("locusBundleHash", context.bundleContentHash)
    const module = await import(url.href)
    await activateDeveloperPluginModule(module, api)
    return recordLoadState({
      pluginReviewKey,
      status: "loaded",
      loadedAt: new Date().toISOString(),
      entryPath: context.entryPath,
      entryContentHash: context.entryContentHash,
      bundleContentHash: context.bundleContentHash,
      gate: context.gate,
    })
  } catch (error) {
    return recordLoadState({
      pluginReviewKey,
      status: "failed",
      failedAt: new Date().toISOString(),
      errorCode: getSafeErrorCode(error),
      errorMessage: "Developer plugin entrypoint failed during load.",
      entryPath: context.entryPath,
      entryContentHash: context.entryContentHash,
      bundleContentHash: context.bundleContentHash,
      gate: context.gate,
    })
  }
}

async function resolveDeveloperLoadContext(
  pluginReviewKey: string,
): Promise<DeveloperLoadContext> {
  const plugins = await discoverAllRuntimePlugins()
  const plugin = plugins.find((candidate) => candidate.reviewKey === pluginReviewKey)
  if (!plugin) {
    return blockedContext(pluginReviewKey, "unsupported-source")
  }

  const scan = await scanPluginReviewDocument(plugin)
  const reviewResult = await recordPluginReviewScans([{
    pluginKey: plugin.reviewKey,
    document: scan.reviewDocument,
  }])
  const updateReview = reviewResult.metadataByPluginKey[plugin.reviewKey]
  const manifest = scan.developerTrusted.manifest
  const entryPath = scan.developerTrusted.entryRealPath
  const entryContentHash = scan.developerTrusted.entryContentHash
  const bundleContentHash = scan.developerTrusted.bundleContentHash
  const developerMode = await getPluginDeveloperModeState()
  const trustContext = manifest && updateReview && entryPath && entryContentHash && bundleContentHash
    ? {
        pluginReviewKey: plugin.reviewKey,
        pluginFingerprint: updateReview.fingerprint,
        manifestId: manifest.id,
        entryPath,
        entryContentHash,
        bundleContentHash,
        sourcePath: plugin.path,
      }
    : undefined
  const trustStatus = trustContext
    ? (await getDeveloperPluginTrustStatus(trustContext)).status
    : "missing"
  const gate = buildPluginDeveloperTrustedGate({
    runtime: plugin.runtime,
    targetMode: scan.targetModeSummary.targetMode,
    updateReviewStatus: updateReview?.status,
    safeModeEnabled: reviewResult.safeMode.enabled,
    developerModeEnabled: developerMode.enabled,
    isLocalDeveloperSource: plugin.sourceKind === "developer-local",
    hasValidManifest: Boolean(manifest),
    entryContained: Boolean(entryPath && entryContentHash && bundleContentHash),
    trustStatus,
  })

  return {
    plugin,
    updateReview: updateReview ?? {
      fingerprint: "",
      status: "new",
      changes: [],
      sourcePins: [],
    },
    manifestId: manifest?.id ?? "",
    entryPath: entryPath ?? "",
    entryContentHash: entryContentHash ?? "",
    bundleContentHash: bundleContentHash ?? "",
    gate,
  }
}

function blockedContext(
  pluginReviewKey: string,
  reason: PluginDeveloperTrustedGate["reasons"][number],
): DeveloperLoadContext {
  const gate: PluginDeveloperTrustedGate = {
    canTrustCurrentFingerprint: false,
    canLoadTrustedCode: false,
    reasons: [reason],
  }
  return {
    plugin: {
      runtime: "claude",
      reviewKey: pluginReviewKey,
      name: pluginReviewKey,
      version: "0.0.0",
      path: "",
      installRoot: "",
      source: "",
      marketplace: "",
      sourceKind: "developer-local",
      sourceTrust: "local",
      targetMode: "developer-trusted-code",
      executionStatus: "developer-trusted-code",
      updatePosture: "review-before-enable",
      diagnostics: [],
    },
    updateReview: {
      fingerprint: "",
      status: "new",
      changes: [],
      sourcePins: [],
    },
    manifestId: "",
    entryPath: "",
    entryContentHash: "",
    bundleContentHash: "",
    gate,
  }
}

function getDeveloperPluginDataPath(
  pluginReviewKey: string,
  userDataPath = getElectronUserDataPath(),
): string {
  return path.join(userDataPath, "plugin-data", sanitizePathSegment(pluginReviewKey))
}

function buildDeveloperPluginApi(
  plugin: PluginInfo,
  manifestId: string,
  dataPath: string,
): LocusDeveloperPluginApi {
  return {
    version: 1,
    plugin: {
      reviewKey: plugin.reviewKey,
      id: manifestId,
      name: plugin.name,
      version: plugin.version,
      sourcePath: plugin.path,
      dataPath,
    },
    log: {
      info: (message) => logDeveloperPluginMessage(plugin.reviewKey, "info", message),
      warn: (message) => logDeveloperPluginMessage(plugin.reviewKey, "warn", message),
      error: (message) => logDeveloperPluginMessage(plugin.reviewKey, "error", message),
    },
  }
}

async function activateDeveloperPluginModule(
  module: unknown,
  api: LocusDeveloperPluginApi,
): Promise<void> {
  const candidate = module as {
    default?: unknown
    activate?: unknown
  }
  const activator = typeof candidate.default === "function"
    ? candidate.default
    : typeof candidate.activate === "function"
    ? candidate.activate
    : typeof candidate.default === "object" &&
      candidate.default &&
      typeof (candidate.default as { activate?: unknown }).activate === "function"
    ? (candidate.default as { activate: (api: LocusDeveloperPluginApi) => unknown }).activate
    : undefined

  if (activator) {
    await activator(api)
  }
}

function logDeveloperPluginMessage(
  pluginReviewKey: string,
  level: "info" | "warn" | "error",
  message: string,
): void {
  const boundedMessage = String(message).slice(0, 500)
  console[level](`[developer-plugin:${pluginReviewKey}] ${boundedMessage}`)
}

function getSafeErrorCode(error: unknown): string {
  if (error instanceof Error && error.name.trim().length > 0) {
    return error.name.slice(0, 80)
  }
  return "DeveloperPluginLoadError"
}

function recordLoadState(state: PluginDeveloperTrustedLoadState): PluginDeveloperTrustedLoadState {
  loadStates.set(state.pluginReviewKey, state)
  return state
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120)
  return sanitized || "developer-plugin"
}
