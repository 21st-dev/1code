import type { PluginRuntime } from "./plugin-target-modes"

export type RuntimeMarketplaceInventoryStatus =
  | "available"
  | "empty"
  | "missing"
  | "unavailable"
  | "degraded"

export type RuntimeMarketplaceSourceKind =
  | "runtime-cli"
  | "filesystem-fallback"

export type RuntimeMarketplaceTrust =
  | "official"
  | "local"
  | "external"

export type RuntimePluginListingStatus =
  | "available"
  | "not-installed"
  | "installed"
  | "installed-enabled"
  | "installed-disabled"
  | "unknown"

export type RuntimeMarketplaceDiagnosticSeverity =
  | "info"
  | "warning"
  | "blocked"

export type RuntimeMarketplaceDiagnosticCode =
  | "runtime-cli-unavailable"
  | "runtime-cli-timeout"
  | "runtime-cli-error"
  | "runtime-cli-parse-failed"
  | "runtime-command-empty"
  | "filesystem-fallback"
  | "source-conflict"

export interface RuntimeMarketplaceDiagnostic {
  code: RuntimeMarketplaceDiagnosticCode
  severity: RuntimeMarketplaceDiagnosticSeverity
  message: string
  runtime?: PluginRuntime
  command?: string
  exitCode?: number
}

export interface RuntimePluginComponentSummary {
  skills?: number
  mcpServers?: number
  hooks?: number
  apps?: number
  commands?: number
  agents?: number
  lspServers?: number
  unknown?: boolean
}

export interface RuntimePluginMarketplace {
  runtime: PluginRuntime
  name: string
  source?: string
  path?: string
  sourceKind: RuntimeMarketplaceSourceKind
  trust: RuntimeMarketplaceTrust
  status: RuntimeMarketplaceInventoryStatus
  pluginCount?: number
  diagnostics: RuntimeMarketplaceDiagnostic[]
}

export interface RuntimePluginListing {
  runtime: PluginRuntime
  id: string
  marketplace?: string
  name: string
  version?: string
  status: RuntimePluginListingStatus
  statusText?: string
  installed: boolean
  enabled?: boolean
  source?: string
  path?: string
  scope?: string
  componentSummary?: RuntimePluginComponentSummary
  diagnostics: RuntimeMarketplaceDiagnostic[]
}

export interface RuntimePluginMarketplaceSnapshot {
  runtime: PluginRuntime
  marketplaces: RuntimePluginMarketplace[]
  plugins: RuntimePluginListing[]
  diagnostics: RuntimeMarketplaceDiagnostic[]
  refreshedAt: string
}

export function getRuntimeMarketplaceTrust(input: {
  runtime: PluginRuntime
  name: string
  source?: string
}): RuntimeMarketplaceTrust {
  const source = input.source?.trim().toLowerCase() ?? ""
  if (
    source.startsWith("/") ||
    source.startsWith(".") ||
    source.startsWith("~") ||
    /^[a-z]:[\\/]/i.test(source) ||
    source.includes("localhost")
  ) {
    return "local"
  }
  return source.startsWith("file:") ? "local" : "external"
}

export function normalizeRuntimePluginStatus(statusText: string): {
  status: RuntimePluginListingStatus
  installed: boolean
  enabled?: boolean
} {
  const normalized = statusText.trim().toLowerCase()
  if (!normalized) {
    return { status: "unknown", installed: false }
  }
  if (normalized.includes("not installed") || normalized === "available") {
    return { status: "not-installed", installed: false, enabled: false }
  }
  if (normalized.includes("installed") && normalized.includes("enabled")) {
    return { status: "installed-enabled", installed: true, enabled: true }
  }
  if (normalized.includes("installed") && normalized.includes("disabled")) {
    return { status: "installed-disabled", installed: true, enabled: false }
  }
  if (normalized.includes("installed")) {
    return { status: "installed", installed: true }
  }
  return { status: "available", installed: false }
}
