export type PluginRuntime = "claude" | "codex"

export type PluginTargetMode =
  | "manifest-only"
  | "controlled-ui"
  | "developer-trusted-code"

export type PluginExecutionStatus =
  | "not-run-by-locus"
  | "locus-controlled"
  | "locus-controlled-planned"
  | "trusted-code-planned"
  | "developer-trusted-code"

export type PluginReviewStatus =
  | "metadata-only"
  | "mcp-review-required"
  | "read-only-cache"

export type PluginUpdatePosture =
  | "advisory-only"
  | "review-before-enable"

export type PluginDiagnosticSeverity = "info" | "warning"

export type PluginDiagnosticCode =
  | "metadata-only-no-execution"
  | "mcp-review-required"
  | "codex-read-only-cache"
  | "permission-scope-review-required"
  | "safe-mode-planned"
  | "developer-trusted-code-full-trust"
  | "component-path-outside-root"
  | "source-available"
  | "source-empty"
  | "source-missing"
  | "source-read-only-refresh"

export interface PluginDiagnostic {
  code: PluginDiagnosticCode
  severity: PluginDiagnosticSeverity
}

export interface PluginTargetModeSummary {
  targetMode: PluginTargetMode
  executionStatus: PluginExecutionStatus
  updatePosture: PluginUpdatePosture
}

export function getManifestOnlyPluginTargetMode(): PluginTargetModeSummary {
  return {
    targetMode: "manifest-only",
    executionStatus: "not-run-by-locus",
    updatePosture: "advisory-only",
  }
}

export function getControlledUiPluginTargetMode(): PluginTargetModeSummary {
  return {
    targetMode: "controlled-ui",
    executionStatus: "locus-controlled",
    updatePosture: "review-before-enable",
  }
}

export function getDeveloperTrustedPluginTargetMode(): PluginTargetModeSummary {
  return {
    targetMode: "developer-trusted-code",
    executionStatus: "developer-trusted-code",
    updatePosture: "review-before-enable",
  }
}

export function getPluginReviewStatus(input: {
  runtime: PluginRuntime
  hasMcpServers: boolean
}): PluginReviewStatus {
  if (input.runtime === "codex") return "read-only-cache"
  return input.hasMcpServers ? "mcp-review-required" : "metadata-only"
}

function uniqueDiagnostics(diagnostics: PluginDiagnostic[]): PluginDiagnostic[] {
  const byCode = new Map<PluginDiagnosticCode, PluginDiagnostic>()
  for (const diagnostic of diagnostics) {
    byCode.set(diagnostic.code, diagnostic)
  }
  return Array.from(byCode.values())
}

export function getPluginDiagnostics(input: {
  runtime: PluginRuntime
  targetMode: PluginTargetMode
  reviewStatus: PluginReviewStatus
  baseDiagnostics?: PluginDiagnostic[]
}): PluginDiagnostic[] {
  const diagnostics: PluginDiagnostic[] = [...(input.baseDiagnostics ?? [])]

  if (input.targetMode === "manifest-only") {
    diagnostics.push({
      code: "metadata-only-no-execution",
      severity: "info",
    })
  }

  if (input.reviewStatus === "mcp-review-required") {
    diagnostics.push({
      code: "mcp-review-required",
      severity: "warning",
    })
  }

  if (input.runtime === "codex") {
    diagnostics.push({
      code: "codex-read-only-cache",
      severity: "info",
    })
  }

  if (input.targetMode === "developer-trusted-code") {
    diagnostics.push({
      code: "developer-trusted-code-full-trust",
      severity: "warning",
    })
  }

  diagnostics.push(
    {
      code: "permission-scope-review-required",
      severity: "info",
    },
    {
      code: "safe-mode-planned",
      severity: "info",
    },
  )

  return uniqueDiagnostics(diagnostics)
}

export function getPluginSourceDiagnostics(input: {
  status: "available" | "empty" | "missing"
}): PluginDiagnostic[] {
  const diagnostics: PluginDiagnostic[] = []

  if (input.status === "missing") {
    diagnostics.push({
      code: "source-missing",
      severity: "warning",
    })
  } else if (input.status === "empty") {
    diagnostics.push({
      code: "source-empty",
      severity: "warning",
    })
  } else {
    diagnostics.push({
      code: "source-available",
      severity: "info",
    })
  }

  diagnostics.push({
    code: "source-read-only-refresh",
    severity: "info",
  })

  return diagnostics
}
