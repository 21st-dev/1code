import type {
  PluginDiagnostic,
  PluginRuntime,
} from "./plugin-target-modes"
import type {
  PluginSourcePin,
  PluginUpdateReviewMetadata,
} from "./plugin-update-review"
import type {
  PluginSafeModeState,
  PluginSafetyGate,
} from "./plugin-safety-gates"

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
  mcpServers: string[]
  mcpApprovalIdentifiers: Record<string, string>
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
  mcpServers: string[]
  mcpApprovalIdentifiers: Record<string, string>
  checks: PluginDoctorCheck[]
}

export interface PluginDoctorReport {
  generatedAt: string
  safeMode: PluginSafeModeState
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
}

export function buildPluginDoctorReport(input: {
  sources: PluginDoctorSourceInput[]
  plugins: PluginDoctorPluginInput[]
  safeMode: PluginSafeModeState
  reviewStatePath?: string
  now?: Date
}): PluginDoctorReport {
  const sourceChecks = input.sources.map(buildSourceCheck)
  const reviewStateCheck = buildReviewStateCheck(input.reviewStatePath)
  const plugins = input.plugins.map(buildPluginDebug)
  const checks = [
    reviewStateCheck,
    ...sourceChecks,
    ...plugins.flatMap((plugin) => plugin.checks),
  ]
  const summary = summarizeDoctorChecks(checks, plugins)

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    safeMode: input.safeMode,
    reviewStatePath: input.reviewStatePath,
    summary,
    checks,
    plugins,
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
