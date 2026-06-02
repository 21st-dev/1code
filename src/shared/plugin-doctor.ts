import type {
  PluginDiagnostic,
  PluginRuntime,
  PluginTargetMode,
} from "./plugin-target-modes"
import type {
  PluginSourcePin,
  PluginUpdateReviewMetadata,
} from "./plugin-update-review"
import type {
  PluginSafeModeState,
  PluginSafetyGate,
} from "./plugin-safety-gates"
import type {
  PluginControlledUiDiagnostic,
  PluginControlledUiGate,
  PluginControlledUiManifest,
} from "./plugin-controlled-ui"
import type {
  PluginDeveloperModeState,
  PluginDeveloperTrustedDiagnostic,
  PluginDeveloperTrustedGate,
  PluginDeveloperTrustedLoadState,
  PluginDeveloperTrustedManifest,
  PluginDeveloperTrustedStatus,
} from "./plugin-developer-trusted"
import type {
  PluginStoreApprovalStatus,
  PluginStoreBackupRecord,
  PluginStoreCandidateStatus,
  PluginStoreInstalledPackageRecord,
  PluginStoreValidationIssue,
} from "./plugin-store-pins"
import type {
  RuntimeMarketplaceDiagnostic,
  RuntimePluginMarketplaceSnapshot,
} from "./runtime-plugin-marketplace"

export type PluginDoctorCheckStatus =
  | "pass"
  | "info"
  | "warning"
  | "blocked"

export type PluginDoctorCheckCode =
  | "source-available"
  | "source-empty"
  | "source-missing"
  | "manifest-fingerprint"
  | "review-required"
  | "review-changed"
  | "reviewed"
  | "safe-mode"
  | "runtime-gate"
  | "codex-read-only"
  | "components-declared"
  | "mcp-declared"
  | "mcp-approval-fingerprint"
  | "controlled-ui-declared"
  | "controlled-ui-gate"
  | "controlled-ui-diagnostic"
  | "developer-mode"
  | "developer-trusted-declared"
  | "developer-trusted-gate"
  | "developer-trusted-trust"
  | "developer-trusted-load"
  | "developer-trusted-diagnostic"
  | "store-candidate"
  | "store-pin"
  | "store-approval"
  | "store-backup"
  | "store-target-mode"
  | "runtime-marketplace"
  | "runtime-marketplace-diagnostic"
  | "runtime-plugin-listing"
  | "component-path-warning"
  | "review-state"

export interface PluginDoctorCheck {
  code: PluginDoctorCheckCode
  status: PluginDoctorCheckStatus
  subject: string
  runtime?: PluginRuntime
  pluginReviewKey?: string
  details?: Record<string, string | number | boolean>
}

export interface PluginDoctorSourceInput {
  id: string
  runtime: PluginRuntime
  status: "available" | "empty" | "missing"
  path: string
  pluginCount: number
}

export interface PluginDoctorPluginInput {
  runtime: PluginRuntime
  reviewKey: string
  name: string
  source: string
  path: string
  updateReview: PluginUpdateReviewMetadata
  safetyGate: PluginSafetyGate
  sourcePins: PluginSourcePin[]
  diagnostics: PluginDiagnostic[]
  componentCounts: {
    commands: number
    skills: number
    agents: number
    mcpServers: number
  }
  controlledUi: {
    manifestPresent: boolean
    manifest?: PluginControlledUiManifest
    diagnostics: PluginControlledUiDiagnostic[]
    ignoredUnknownFields: string[]
    gate: PluginControlledUiGate
  }
  developerTrusted: {
    isDeveloperSource: boolean
    manifestPresent: boolean
    manifest?: PluginDeveloperTrustedManifest
    diagnostics: PluginDeveloperTrustedDiagnostic[]
    ignoredUnknownFields: string[]
    entryPath?: string
    entryRealPath?: string
    entryContentHash?: string
    bundleContentHash?: string
    bundleFileCount?: number
    bundleByteCount?: number
    trustStatus: PluginDeveloperTrustedStatus
    gate: PluginDeveloperTrustedGate
    loadState: PluginDeveloperTrustedLoadState
  }
  mcpServers: string[]
  mcpApprovalIdentifiers: Record<string, string>
}

export interface PluginDoctorStoreCandidateInput {
  storeEntryId: string
  runtime: PluginRuntime
  name: string
  candidateFingerprint: string
  status: PluginStoreCandidateStatus
  approvalStatus: PluginStoreApprovalStatus
  issues: PluginStoreValidationIssue[]
  sourceCommit: string
  packageHash?: string
  targetMode: PluginTargetMode
  installed?: PluginStoreInstalledPackageRecord
  backupRecords: PluginStoreBackupRecord[]
}

export interface PluginDoctorPluginDebug {
  runtime: PluginRuntime
  reviewKey: string
  name: string
  source: string
  path: string
  fingerprint: string
  lastReviewedFingerprint?: string
  reviewStatus: PluginUpdateReviewMetadata["status"]
  safetyGate: PluginSafetyGate
  sourcePins: PluginSourcePin[]
  diagnostics: PluginDiagnostic[]
  componentCounts: PluginDoctorPluginInput["componentCounts"]
  controlledUi: PluginDoctorPluginInput["controlledUi"]
  developerTrusted: PluginDoctorPluginInput["developerTrusted"]
  mcpServers: string[]
  mcpApprovalIdentifiers: Record<string, string>
  checks: PluginDoctorCheck[]
}

export interface PluginDoctorStoreCandidateDebug extends PluginDoctorStoreCandidateInput {
  checks: PluginDoctorCheck[]
}

export interface PluginDoctorReport {
  generatedAt: string
  safeMode: PluginSafeModeState
  developerMode: PluginDeveloperModeState
  reviewStatePath?: string
  summary: {
    totalChecks: number
    pass: number
    info: number
    warning: number
    blocked: number
    pluginCount: number
    blockedPluginCount: number
    mcpServerCount: number
  }
  checks: PluginDoctorCheck[]
  plugins: PluginDoctorPluginDebug[]
  storeCandidates: PluginDoctorStoreCandidateDebug[]
  runtimeMarketplaces: RuntimePluginMarketplaceSnapshot[]
}

export function buildPluginDoctorReport(input: {
  sources: PluginDoctorSourceInput[]
  plugins: PluginDoctorPluginInput[]
  safeMode: PluginSafeModeState
  developerMode: PluginDeveloperModeState
  reviewStatePath?: string
  storeCandidates?: PluginDoctorStoreCandidateInput[]
  runtimeMarketplaces?: RuntimePluginMarketplaceSnapshot[]
  now?: Date
}): PluginDoctorReport {
  const sourceChecks = input.sources.map(buildSourceCheck)
  const reviewStateCheck = buildReviewStateCheck(input.reviewStatePath)
  const developerModeCheck = buildDeveloperModeCheck(input.developerMode)
  const plugins = input.plugins.map(buildPluginDebug)
  const storeCandidates = (input.storeCandidates ?? []).map(buildStoreCandidateDebug)
  const runtimeMarketplaces = input.runtimeMarketplaces ?? []
  const runtimeMarketplaceChecks = runtimeMarketplaces.flatMap(
    (snapshot) => buildRuntimeMarketplaceChecks(snapshot, input.sources),
  )
  const checks = [
    reviewStateCheck,
    developerModeCheck,
    ...sourceChecks,
    ...runtimeMarketplaceChecks,
    ...plugins.flatMap((plugin) => plugin.checks),
    ...storeCandidates.flatMap((candidate) => candidate.checks),
  ]
  const summary = summarizeDoctorChecks(checks, plugins)

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    safeMode: input.safeMode,
    developerMode: input.developerMode,
    reviewStatePath: input.reviewStatePath,
    summary,
    checks,
    plugins,
    storeCandidates,
    runtimeMarketplaces,
  }
}

function buildSourceCheck(source: PluginDoctorSourceInput): PluginDoctorCheck {
  if (source.status === "missing") {
    return {
      code: "source-missing",
      status: "warning",
      subject: source.id,
      runtime: source.runtime,
      details: {
        path: source.path,
        pluginCount: source.pluginCount,
      },
    }
  }

  if (source.status === "empty") {
    return {
      code: "source-empty",
      status: "warning",
      subject: source.id,
      runtime: source.runtime,
      details: {
        path: source.path,
        pluginCount: source.pluginCount,
      },
    }
  }

  return {
    code: "source-available",
    status: "pass",
    subject: source.id,
    runtime: source.runtime,
    details: {
      path: source.path,
      pluginCount: source.pluginCount,
    },
  }
}

function buildReviewStateCheck(reviewStatePath: string | undefined): PluginDoctorCheck {
  return {
    code: "review-state",
    status: reviewStatePath ? "pass" : "warning",
    subject: "plugin-review-state",
    details: reviewStatePath ? { path: reviewStatePath } : undefined,
  }
}

function buildDeveloperModeCheck(
  developerMode: PluginDeveloperModeState,
): PluginDoctorCheck {
  return {
    code: "developer-mode",
    status: developerMode.enabled ? "warning" : "pass",
    subject: "developer-plugin-mode",
    details: {
      enabled: developerMode.enabled,
      updatedAt: developerMode.updatedAt ?? "",
    },
  }
}

function buildPluginDebug(plugin: PluginDoctorPluginInput): PluginDoctorPluginDebug {
  const checks = buildPluginChecks(plugin)
  return {
    runtime: plugin.runtime,
    reviewKey: plugin.reviewKey,
    name: plugin.name,
    source: plugin.source,
    path: plugin.path,
    fingerprint: plugin.updateReview.fingerprint,
    lastReviewedFingerprint: plugin.updateReview.lastReviewedFingerprint,
    reviewStatus: plugin.updateReview.status,
    safetyGate: plugin.safetyGate,
    sourcePins: plugin.sourcePins,
    diagnostics: plugin.diagnostics,
    componentCounts: plugin.componentCounts,
    controlledUi: plugin.controlledUi,
    developerTrusted: plugin.developerTrusted,
    mcpServers: plugin.mcpServers,
    mcpApprovalIdentifiers: plugin.mcpApprovalIdentifiers,
    checks,
  }
}

function buildPluginChecks(plugin: PluginDoctorPluginInput): PluginDoctorCheck[] {
  const checks: PluginDoctorCheck[] = []

  checks.push({
    code: "manifest-fingerprint",
    status: plugin.updateReview.fingerprint ? "pass" : "warning",
    subject: plugin.name,
    runtime: plugin.runtime,
    pluginReviewKey: plugin.reviewKey,
    details: {
      fingerprint: plugin.updateReview.fingerprint,
      status: plugin.updateReview.status,
    },
  })

  if (plugin.updateReview.status === "reviewed") {
    checks.push({
      code: "reviewed",
      status: "pass",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        lastReviewedFingerprint: plugin.updateReview.lastReviewedFingerprint ?? "",
      },
    })
  } else if (plugin.updateReview.status === "changed") {
    checks.push({
      code: "review-changed",
      status: "blocked",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
    })
  } else {
    checks.push({
      code: "review-required",
      status: plugin.runtime === "codex" ? "info" : "blocked",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        status: plugin.updateReview.status,
      },
    })
  }

  if (plugin.safetyGate.status === "safe-mode") {
    checks.push({
      code: "safe-mode",
      status: "blocked",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
    })
  }

  checks.push({
    code: plugin.runtime === "codex" ? "codex-read-only" : "runtime-gate",
    status: getRuntimeGateCheckStatus(plugin),
    subject: plugin.name,
    runtime: plugin.runtime,
    pluginReviewKey: plugin.reviewKey,
    details: {
      gateStatus: plugin.safetyGate.status,
      canEnable: plugin.safetyGate.canEnable,
      canApproveMcp: plugin.safetyGate.canApproveMcp,
      canUseMcp: plugin.safetyGate.canUseMcp,
    },
  })

  const componentTotal =
    plugin.componentCounts.commands +
    plugin.componentCounts.skills +
    plugin.componentCounts.agents +
    plugin.componentCounts.mcpServers
  checks.push({
    code: "components-declared",
    status: componentTotal > 0 ? "info" : "pass",
    subject: plugin.name,
    runtime: plugin.runtime,
    pluginReviewKey: plugin.reviewKey,
    details: plugin.componentCounts,
  })

  if (plugin.componentCounts.mcpServers > 0) {
    checks.push({
      code: "mcp-declared",
      status: plugin.safetyGate.canApproveMcp ? "info" : "blocked",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        count: plugin.componentCounts.mcpServers,
      },
    })
    checks.push({
      code: "mcp-approval-fingerprint",
      status: Object.keys(plugin.mcpApprovalIdentifiers).length > 0 ? "pass" : "warning",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        count: Object.keys(plugin.mcpApprovalIdentifiers).length,
      },
    })
  }

  if (plugin.controlledUi.manifestPresent) {
    const surfaceCount = plugin.controlledUi.manifest?.surfaces.length ?? 0
    checks.push({
      code: "controlled-ui-declared",
      status: surfaceCount > 0 ? "info" : "warning",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        surfaceCount,
        diagnosticCount: plugin.controlledUi.diagnostics.length,
        ignoredUnknownFieldCount: plugin.controlledUi.ignoredUnknownFields.length,
      },
    })
    checks.push({
      code: "controlled-ui-gate",
      status: getControlledUiGateCheckStatus(plugin.controlledUi.gate),
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        canRenderControlledUi: plugin.controlledUi.gate.canRenderControlledUi,
        canInvokeControlledAction: plugin.controlledUi.gate.canInvokeControlledAction,
        reasonCount: plugin.controlledUi.gate.reasons.length,
      },
    })
  }

  if (plugin.controlledUi.diagnostics.some((diagnostic) => diagnostic.severity === "blocked")) {
    checks.push({
      code: "controlled-ui-diagnostic",
      status: "blocked",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        blockedDiagnosticCount: plugin.controlledUi.diagnostics.filter(
          (diagnostic) => diagnostic.severity === "blocked",
        ).length,
      },
    })
  }

  if (hasDeveloperTrustedFacts(plugin.developerTrusted)) {
    const manifestPermissions = plugin.developerTrusted.manifest?.permissions.length ?? 0
    const manifestCapabilities = plugin.developerTrusted.manifest?.capabilities.length ?? 0
    checks.push({
      code: "developer-trusted-declared",
      status: plugin.developerTrusted.manifestPresent ? "warning" : "blocked",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        permissionCount: manifestPermissions,
        capabilityCount: manifestCapabilities,
        diagnosticCount: plugin.developerTrusted.diagnostics.length,
        ignoredUnknownFieldCount: plugin.developerTrusted.ignoredUnknownFields.length,
        bundleFileCount: plugin.developerTrusted.bundleFileCount ?? 0,
        bundleByteCount: plugin.developerTrusted.bundleByteCount ?? 0,
        bundleContentHash: plugin.developerTrusted.bundleContentHash ?? "",
        entryContentHash: plugin.developerTrusted.entryContentHash ?? "",
      },
    })

    checks.push({
      code: "developer-trusted-trust",
      status: getDeveloperTrustedTrustCheckStatus(plugin.developerTrusted.trustStatus),
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        trustStatus: plugin.developerTrusted.trustStatus,
      },
    })

    checks.push({
      code: "developer-trusted-gate",
      status: plugin.developerTrusted.gate.canLoadTrustedCode ? "pass" : "blocked",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        canTrustCurrentFingerprint: plugin.developerTrusted.gate.canTrustCurrentFingerprint,
        canLoadTrustedCode: plugin.developerTrusted.gate.canLoadTrustedCode,
        reasonCount: plugin.developerTrusted.gate.reasons.length,
        reasons: plugin.developerTrusted.gate.reasons.join(","),
      },
    })

    checks.push({
      code: "developer-trusted-load",
      status: getDeveloperTrustedLoadCheckStatus(plugin.developerTrusted.loadState),
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        loadStatus: plugin.developerTrusted.loadState.status,
        entryContentHash: plugin.developerTrusted.loadState.entryContentHash ?? "",
        bundleContentHash: plugin.developerTrusted.loadState.bundleContentHash ?? "",
        errorCode: plugin.developerTrusted.loadState.errorCode ?? "",
      },
    })
  }

  if (plugin.developerTrusted.diagnostics.some((diagnostic) => diagnostic.severity === "blocked")) {
    checks.push({
      code: "developer-trusted-diagnostic",
      status: "blocked",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
      details: {
        blockedDiagnosticCount: plugin.developerTrusted.diagnostics.filter(
          (diagnostic) => diagnostic.severity === "blocked",
        ).length,
      },
    })
  }

  if (plugin.diagnostics.some((diagnostic) => diagnostic.code === "component-path-outside-root")) {
    checks.push({
      code: "component-path-warning",
      status: "blocked",
      subject: plugin.name,
      runtime: plugin.runtime,
      pluginReviewKey: plugin.reviewKey,
    })
  }

  return checks
}

function buildStoreCandidateDebug(
  candidate: PluginDoctorStoreCandidateInput,
): PluginDoctorStoreCandidateDebug {
  const checks = buildStoreCandidateChecks(candidate)
  return {
    ...candidate,
    checks,
  }
}

function buildStoreCandidateChecks(
  candidate: PluginDoctorStoreCandidateInput,
): PluginDoctorCheck[] {
  const blockedIssueCodes = candidate.issues
    .filter((issue) => issue.severity === "blocked")
    .map((issue) => issue.code)
  const checks: PluginDoctorCheck[] = [{
    code: "store-candidate",
    status: getStoreCandidateCheckStatus(candidate.status),
    subject: candidate.name,
    runtime: candidate.runtime,
    details: {
      storeEntryId: candidate.storeEntryId,
      status: candidate.status,
      candidateFingerprint: candidate.candidateFingerprint,
      blockedIssueCodes: blockedIssueCodes.join(","),
    },
  }]

  checks.push({
    code: "store-pin",
    status: blockedIssueCodes.includes("immutable-commit-required") ||
      blockedIssueCodes.includes("invalid-package-hash") ||
      blockedIssueCodes.includes("missing-package-hash") ||
      blockedIssueCodes.includes("package-hash-mismatch")
      ? "blocked"
      : "pass",
    subject: candidate.name,
    runtime: candidate.runtime,
    details: {
      storeEntryId: candidate.storeEntryId,
      commit: candidate.sourceCommit,
      packageHash: candidate.packageHash ?? "",
    },
  })

  checks.push({
    code: "store-approval",
    status: candidate.approvalStatus === "current"
      ? "pass"
      : candidate.approvalStatus === "stale"
        ? "warning"
        : "info",
    subject: candidate.name,
    runtime: candidate.runtime,
    details: {
      storeEntryId: candidate.storeEntryId,
      approvalStatus: candidate.approvalStatus,
    },
  })

  checks.push({
    code: "store-target-mode",
    status: blockedIssueCodes.includes("remote-developer-trusted-code") ||
      candidate.targetMode === "developer-trusted-code"
      ? "blocked"
      : "pass",
    subject: candidate.name,
    runtime: candidate.runtime,
    details: {
      storeEntryId: candidate.storeEntryId,
      targetMode: candidate.targetMode,
    },
  })

  if (candidate.backupRecords.length > 0) {
    checks.push({
      code: "store-backup",
      status: "info",
      subject: candidate.name,
      runtime: candidate.runtime,
      details: {
        storeEntryId: candidate.storeEntryId,
        backupCount: candidate.backupRecords.length,
        latestBackupPath: candidate.backupRecords[0]?.backupPath ?? "",
      },
    })
  }

  return checks
}

function buildRuntimeMarketplaceChecks(
  snapshot: RuntimePluginMarketplaceSnapshot,
  sources: PluginDoctorSourceInput[],
): PluginDoctorCheck[] {
  const checks: PluginDoctorCheck[] = [{
    code: "runtime-marketplace",
    status: snapshot.marketplaces.length > 0 ? "pass" : "warning",
    subject: `${snapshot.runtime}-marketplaces`,
    runtime: snapshot.runtime,
    details: {
      marketplaceCount: snapshot.marketplaces.length,
      pluginCount: snapshot.plugins.length,
      refreshedAt: snapshot.refreshedAt,
    },
  }, {
    code: "runtime-plugin-listing",
    status: snapshot.plugins.length > 0 ? "pass" : "info",
    subject: `${snapshot.runtime}-plugins`,
    runtime: snapshot.runtime,
    details: {
      installedCount: snapshot.plugins.filter((plugin) => plugin.installed).length,
      availableCount: snapshot.plugins.filter((plugin) => !plugin.installed).length,
      pluginCount: snapshot.plugins.length,
    },
  }]

  for (const diagnostic of snapshot.diagnostics) {
    checks.push({
      code: "runtime-marketplace-diagnostic",
      status: getRuntimeMarketplaceDiagnosticStatus(diagnostic),
      subject: diagnostic.command ?? `${snapshot.runtime}-marketplace`,
      runtime: snapshot.runtime,
      details: {
        code: diagnostic.code,
        message: diagnostic.message,
        severity: diagnostic.severity,
        exitCode: diagnostic.exitCode ?? 0,
      },
    })
  }
  for (const diagnostic of buildRuntimeFilesystemFallbackDiagnostics(snapshot, sources)) {
    checks.push({
      code: "runtime-marketplace-diagnostic",
      status: getRuntimeMarketplaceDiagnosticStatus(diagnostic),
      subject: diagnostic.command ?? `${snapshot.runtime}-marketplace`,
      runtime: snapshot.runtime,
      details: {
        code: diagnostic.code,
        message: diagnostic.message,
        severity: diagnostic.severity,
        exitCode: diagnostic.exitCode ?? 0,
      },
    })
  }

  return checks
}

function buildRuntimeFilesystemFallbackDiagnostics(
  snapshot: RuntimePluginMarketplaceSnapshot,
  sources: PluginDoctorSourceInput[],
): RuntimeMarketplaceDiagnostic[] {
  const runtimeSources = sources.filter((source) =>
    source.runtime === snapshot.runtime &&
    source.status === "available" &&
    source.pluginCount > 0
  )
  if (runtimeSources.length === 0) return []

  const filesystemPluginCount = runtimeSources.reduce(
    (total, source) => total + source.pluginCount,
    0,
  )
  const installedRuntimePluginCount = snapshot.plugins.filter((plugin) => plugin.installed).length

  if (snapshot.marketplaces.length === 0) {
    return [{
      code: "filesystem-fallback",
      severity: "info",
      runtime: snapshot.runtime,
      command: `${snapshot.runtime}-filesystem-fallback`,
      message:
        "Filesystem fallback found local plugin packages while the runtime marketplace read reported no marketplace rows.",
    }]
  }

  if (
    installedRuntimePluginCount !== filesystemPluginCount
  ) {
    return [{
      code: "source-conflict",
      severity: "warning",
      runtime: snapshot.runtime,
      command: `${snapshot.runtime}-source-conflict`,
      message:
        "Runtime-owned plugin inventory differs from local filesystem fallback counts; runtime output remains authoritative.",
    }]
  }

  return []
}

function getRuntimeMarketplaceDiagnosticStatus(
  diagnostic: RuntimeMarketplaceDiagnostic,
): PluginDoctorCheckStatus {
  if (diagnostic.severity === "blocked") return "blocked"
  if (diagnostic.severity === "warning") return "warning"
  return "info"
}

function getStoreCandidateCheckStatus(
  status: PluginStoreCandidateStatus,
): PluginDoctorCheckStatus {
  if (status.startsWith("blocked")) return "blocked"
  if (status === "review-required" || status === "pin-changed" || status === "package-hash-changed") {
    return "warning"
  }
  return "pass"
}

function hasDeveloperTrustedFacts(
  developerTrusted: PluginDoctorPluginInput["developerTrusted"],
): boolean {
  return developerTrusted.isDeveloperSource ||
    developerTrusted.manifestPresent ||
    developerTrusted.trustStatus !== "missing" ||
    developerTrusted.loadState.status !== "not-loaded" ||
    developerTrusted.diagnostics.length > 0
}

function getDeveloperTrustedTrustCheckStatus(
  trustStatus: PluginDeveloperTrustedStatus,
): PluginDoctorCheckStatus {
  if (trustStatus === "current") return "pass"
  if (trustStatus === "stale") return "warning"
  return "blocked"
}

function getDeveloperTrustedLoadCheckStatus(
  loadState: PluginDeveloperTrustedLoadState,
): PluginDoctorCheckStatus {
  if (loadState.status === "loaded") return "pass"
  if (loadState.status === "not-loaded") return "info"
  return "blocked"
}

function getControlledUiGateCheckStatus(
  gate: PluginControlledUiGate,
): PluginDoctorCheckStatus {
  if (gate.canInvokeControlledAction) return "pass"
  if (gate.canRenderControlledUi) return "info"
  return gate.reasons.length > 0 ? "blocked" : "warning"
}

function getRuntimeGateCheckStatus(plugin: PluginDoctorPluginInput): PluginDoctorCheckStatus {
  if (plugin.runtime === "codex") return "info"
  if (plugin.safetyGate.status === "allowed") return "pass"
  return "blocked"
}

function summarizeDoctorChecks(
  checks: PluginDoctorCheck[],
  plugins: PluginDoctorPluginDebug[],
): PluginDoctorReport["summary"] {
  const countByStatus = {
    pass: 0,
    info: 0,
    warning: 0,
    blocked: 0,
  }

  for (const check of checks) {
    countByStatus[check.status] += 1
  }

  return {
    totalChecks: checks.length,
    ...countByStatus,
    pluginCount: plugins.length,
    blockedPluginCount: plugins.filter((plugin) =>
      plugin.checks.some((check) => check.status === "blocked")
    ).length,
    mcpServerCount: plugins.reduce(
      (count, plugin) => count + plugin.componentCounts.mcpServers,
      0,
    ),
  }
}
