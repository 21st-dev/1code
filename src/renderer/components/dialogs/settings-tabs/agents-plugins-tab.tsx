import { useSetAtom } from "jotai"
import {
  ChevronRight,
  Code2,
  Download,
  FileCheck2,
  FolderPlus,
  Loader2,
  PackageCheck,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Stethoscope,
  Terminal,
  Trash2,
  Workflow,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { settingsPluginsSidebarWidthAtom } from "../../../features/agents/atoms"
import {
  agentsSettingsDialogActiveTabAtom,
  type SettingsTab,
} from "../../../lib/atoms"
import { useI18n } from "../../../lib/i18n"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { Button } from "../../ui/button"
import {
  CustomAgentIconFilled,
  OriginalMCPIcon,
  PluginFilledIcon,
  SkillIconFilled,
} from "../../ui/icons"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select"
import { Switch } from "../../ui/switch"
import { useListKeyboardNav } from "./use-list-keyboard-nav"

/** Format plugin name: "pyright-lsp" → "Pyright Lsp" */
function formatPluginName(name: string): string {
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

interface PluginComponent {
  name: string
  description?: string
}

type PluginRuntime = "claude" | "codex"
type RuntimeFilter = "all" | PluginRuntime
type PluginViewMode = "installed" | "sources" | "marketplaces" | "store"
type PluginSourceKind = "local-marketplace" | "cache" | "developer-local"
type PluginSourceTrust = "official" | "local" | "external"
type PluginSourceStatus = "available" | "empty" | "missing"
const CONTROLLED_UI_SELECT_UNSET_VALUE = "__locus_controlled_ui_unset__"
type PluginTargetMode =
  | "manifest-only"
  | "controlled-ui"
  | "developer-trusted-code"
type PluginExecutionStatus =
  | "not-run-by-locus"
  | "locus-controlled"
  | "locus-controlled-planned"
  | "trusted-code-planned"
  | "developer-trusted-code"
type PluginReviewStatus =
  | "metadata-only"
  | "mcp-review-required"
  | "read-only-cache"
type PluginUpdatePosture = "advisory-only" | "review-before-enable"
type PluginUpdateReviewStatus = "new" | "unchanged" | "changed" | "reviewed"
type PluginSafetyGateStatus =
  | "allowed"
  | "safe-mode"
  | "review-required"
  | "read-only"
type PluginSafetyGateReason =
  | "global-safe-mode"
  | "review-new"
  | "review-changed"
  | "review-unreviewed"
  | "codex-read-only-cache"
  | "no-mcp-servers"
type RuntimeNativeActivationBlockedReason =
  | "plugin-disabled"
  | "global-safe-mode"
  | "manifest-review-required"
  | "runtime-native-unsupported"
  | "per-run-plugin-control-missing"
  | "activation-identity-incomplete"
  | "activation-identity-unreviewed"
  | "activation-identity-drifted"
  | "mcp-approval-required"
  | "native-load-failed"
type RuntimeNativeActivationIdentityStatus =
  | "reviewed"
  | "identity-incomplete"
  | "identity-incomplete-acknowledged"
  | "identity-unreviewed"
  | "identity-drifted"
type PluginControlledUiGateReason =
  | "safe-mode"
  | "review-required"
  | "review-changed"
  | "review-unreviewed"
  | "invalid-contribution-manifest"
  | "unsupported-runtime"
  | "unsupported-target-mode"
  | "unsupported-surface"
  | "unsupported-action"
  | "permission-not-granted"
  | "permission-stale"
  | "codex-read-only-cache"
type PluginControlledUiGrantStatus = "current" | "stale" | "mismatch"
type PluginControlledUiSettingValue = string | boolean
type PluginDeveloperTrustedStatus = "current" | "stale" | "missing" | "mismatch"
type PluginDeveloperTrustedLoadStatus =
  | "not-loaded"
  | "blocked"
  | "loaded"
  | "failed"
type PluginDeveloperTrustedGateReason =
  | "developer-mode-disabled"
  | "safe-mode"
  | "review-required"
  | "review-changed"
  | "review-unreviewed"
  | "trust-missing"
  | "trust-stale"
  | "invalid-developer-manifest"
  | "entry-outside-root"
  | "unsupported-source"
  | "unsupported-runtime"
  | "unsupported-target-mode"
  | "codex-read-only-cache"
type PluginDiagnosticSeverity = "info" | "warning"
type PluginDiagnosticCode =
  | "metadata-only-no-execution"
  | "mcp-review-required"
  | "codex-read-only-cache"
  | "permission-scope-review-required"
  | "safe-mode-planned"
  | "component-path-outside-root"
  | "source-available"
  | "source-empty"
  | "source-missing"
  | "source-read-only-refresh"
  | "developer-trusted-code-full-trust"

interface PluginDiagnostic {
  code: PluginDiagnosticCode
  severity: PluginDiagnosticSeverity
}

interface PluginSourcePin {
  kind:
    | "cache-version"
    | "lock-source-ref"
    | "store-git-commit"
    | "store-package-sha256"
  value: string
  label?: string
  repo?: string
  path?: string
}

interface PluginReviewChange {
  field: string
  previous?: string
  current?: string
}

interface PluginUpdateReviewMetadata {
  fingerprint: string
  status: PluginUpdateReviewStatus
  firstSeenAt?: string
  lastSeenAt?: string
  lastReviewedAt?: string
  lastReviewedFingerprint?: string
  sourcePins: PluginSourcePin[]
  changes: PluginReviewChange[]
}

interface PluginSafetyGate {
  status: PluginSafetyGateStatus
  canEnable: boolean
  canApproveMcp: boolean
  canUseMcp: boolean
  reasons: PluginSafetyGateReason[]
}

interface RuntimeNativeActivationPolicy {
  status: "allowed" | "blocked"
  canActivateNative: boolean
  identityStatus: RuntimeNativeActivationIdentityStatus
  reasons: RuntimeNativeActivationBlockedReason[]
}

interface PluginControlledUiGate {
  canRenderControlledUi: boolean
  canInvokeControlledAction: boolean
  reasons: PluginControlledUiGateReason[]
}

interface PluginControlledUiDiagnostic {
  code: string
  severity: "info" | "warning" | "blocked"
  path?: string
  message?: string
}

interface PluginControlledUiField {
  id: string
  type: "text" | "checkbox" | "select"
  label: string
  description?: string
  options?: string[]
}

interface PluginControlledUiItem {
  type: "text" | "fact"
  text?: string
  label?: string
  value?: string
}

interface PluginControlledUiAction {
  id: string
  type: "insert-chat-draft"
  prompt: string
}

interface PluginControlledUiSurfaceBase {
  id: string
  type: "settings-section" | "workbench-panel" | "command-button"
  title: string
  description?: string
}

interface PluginControlledUiSettingsSection
  extends PluginControlledUiSurfaceBase {
  type: "settings-section"
  fields: PluginControlledUiField[]
}

interface PluginControlledUiWorkbenchPanel
  extends PluginControlledUiSurfaceBase {
  type: "workbench-panel"
  items: PluginControlledUiItem[]
}

interface PluginControlledUiCommandButton
  extends PluginControlledUiSurfaceBase {
  type: "command-button"
  label: string
  action: PluginControlledUiAction
}

type PluginControlledUiSurface =
  | PluginControlledUiSettingsSection
  | PluginControlledUiWorkbenchPanel
  | PluginControlledUiCommandButton

interface PluginControlledUiManifest {
  version: 1
  surfaces: PluginControlledUiSurface[]
}

interface PluginSafeModeState {
  enabled: boolean
  updatedAt?: string
}

interface PluginDeveloperModeState {
  enabled: boolean
  updatedAt?: string
}

interface PluginDeveloperTrustedManifest {
  schemaVersion: 1
  id: string
  name: string
  version: string
  entry: string
  description?: string
  author?: string
  minLocusVersion?: string
  permissions: string[]
  capabilities: string[]
}

interface PluginDeveloperTrustedDiagnostic {
  code: string
  severity: "info" | "warning" | "blocked"
  path?: string
  message?: string
}

interface PluginDeveloperTrustedGate {
  canTrustCurrentFingerprint: boolean
  canLoadTrustedCode: boolean
  reasons: PluginDeveloperTrustedGateReason[]
}

interface PluginDeveloperTrustedLoadState {
  pluginReviewKey: string
  status: PluginDeveloperTrustedLoadStatus
  entryPath?: string
  entryContentHash?: string
  bundleContentHash?: string
  loadedAt?: string
  failedAt?: string
  blockedAt?: string
  errorCode?: string
  errorMessage?: string
  gate?: PluginDeveloperTrustedGate
}

type PluginDoctorCheckStatus = "pass" | "info" | "warning" | "blocked"
type PluginDoctorCheckCode =
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
  | "runtime-native-activation"
  | "runtime-native-identity"
  | "component-path-warning"
  | "review-state"

interface PluginDoctorCheck {
  code: PluginDoctorCheckCode
  status: PluginDoctorCheckStatus
  subject: string
  runtime?: PluginRuntime
  pluginReviewKey?: string
  details?: Record<string, string | number | boolean>
}

interface PluginDoctorPluginDebug {
  runtime: PluginRuntime
  reviewKey: string
  name: string
  source: string
  path: string
  fingerprint: string
  lastReviewedFingerprint?: string
  reviewStatus: PluginUpdateReviewStatus
  safetyGate: PluginSafetyGate
  sourcePins: PluginSourcePin[]
  diagnostics: PluginDiagnostic[]
  componentCounts: {
    commands: number
    skills: number
    agents: number
    hooks: number
    mcpServers: number
  }
  controlledUi: {
    manifestPresent: boolean
    manifest?: PluginControlledUiManifest
    diagnostics: PluginControlledUiDiagnostic[]
    ignoredUnknownFields: string[]
    gate: PluginControlledUiGate
  }
  runtimeNativeActivation?: PluginData["runtimeNativeActivation"]
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
  checks: PluginDoctorCheck[]
}

interface PluginDoctorReport {
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

type RuntimeMarketplaceInventoryStatus =
  | "available"
  | "empty"
  | "missing"
  | "unavailable"
  | "degraded"
type RuntimeMarketplaceSourceKind = "runtime-cli" | "filesystem-fallback"
type RuntimeMarketplaceTrust = "official" | "local" | "external"
type RuntimePluginListingStatus =
  | "available"
  | "not-installed"
  | "installed"
  | "installed-enabled"
  | "installed-disabled"
  | "unknown"
type RuntimeMarketplaceDiagnosticSeverity = "info" | "warning" | "blocked"
type RuntimeMarketplaceDiagnosticCode =
  | "runtime-cli-unavailable"
  | "runtime-cli-timeout"
  | "runtime-cli-error"
  | "runtime-cli-parse-failed"
  | "runtime-command-empty"
  | "filesystem-fallback"
  | "source-conflict"

interface RuntimeMarketplaceDiagnostic {
  code: RuntimeMarketplaceDiagnosticCode
  severity: RuntimeMarketplaceDiagnosticSeverity
  message: string
  runtime?: PluginRuntime
  command?: string
  exitCode?: number
}

interface RuntimePluginComponentSummary {
  skills?: number
  mcpServers?: number
  hooks?: number
  apps?: number
  commands?: number
  agents?: number
  lspServers?: number
  unknown?: boolean
}

interface RuntimePluginMarketplace {
  runtime: PluginRuntime
  name: string
  source?: string
  path?: string
  targetable?: boolean
  sourceKind: RuntimeMarketplaceSourceKind
  trust: RuntimeMarketplaceTrust
  status: RuntimeMarketplaceInventoryStatus
  pluginCount?: number
  diagnostics: RuntimeMarketplaceDiagnostic[]
}

interface RuntimePluginListing {
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

interface RuntimePluginMarketplaceSnapshot {
  runtime: PluginRuntime
  marketplaces: RuntimePluginMarketplace[]
  plugins: RuntimePluginListing[]
  diagnostics: RuntimeMarketplaceDiagnostic[]
  refreshedAt: string
}

type RuntimePluginWriteActionId =
  | "codex.marketplace.add"
  | "codex.marketplace.upgrade"
  | "codex.marketplace.remove"
  | "codex.plugin.add"
  | "codex.plugin.remove"
  | "claude.marketplace.add"
  | "claude.marketplace.update"
  | "claude.marketplace.remove"
  | "claude.plugin.install"
  | "claude.plugin.update"
  | "claude.plugin.enable"
  | "claude.plugin.disable"
  | "claude.plugin.uninstall"

type RuntimePluginWriteScope = "user" | "project" | "local" | "managed"

interface RuntimePluginWriteTarget {
  pluginId?: string
  marketplace?: string
  source?: string
  scope?: RuntimePluginWriteScope
}

interface RuntimePluginWriteActionRequest {
  runtime: PluginRuntime
  action: RuntimePluginWriteActionId
  target: RuntimePluginWriteTarget
}

interface RuntimePluginWritePreview {
  previewId: string
  confirmationToken?: string
  operationFingerprint: string
  runtime: PluginRuntime
  action: RuntimePluginWriteActionId
  label: string
  command: "codex" | "claude"
  args: string[]
  commandDisplay: string
  target: RuntimePluginWriteTarget
  targetLabel: string
  destructive: boolean
  requiresTargetConfirmation: boolean
  canExecute: boolean
  blockedReason?: string
  impact: string
  reloadHint?: string
  expiresAt: string
}

type PluginStoreCandidateStatus =
  | "not-installed"
  | "installed-current"
  | "update-available"
  | "pin-changed"
  | "package-hash-changed"
  | "review-required"
  | "blocked-invalid-pin"
  | "blocked-missing-package-hash"
  | "blocked-target-mode"

type PluginStoreApprovalStatus = "missing" | "current" | "stale"

interface PluginStoreGitSourcePin {
  type: "git"
  repo: string
  commit: string
  path?: string
}

interface PluginStorePackagePin {
  sha256?: string
  sizeBytes?: number
}

interface PluginStoreCatalogEntry {
  schemaVersion: 1
  id: string
  runtime: PluginRuntime
  name: string
  version: string
  source: PluginStoreGitSourcePin
  package?: PluginStorePackagePin
  targetMode: PluginTargetMode
  declaredPermissions: string[]
  declaredMcpServers: string[]
}

interface PluginStoreCandidateReviewDocument {
  schemaVersion: 1
  storeEntryId: string
  runtime: PluginRuntime
  name: string
  version: string
  source: PluginStoreGitSourcePin
  package: PluginStorePackagePin
  targetMode: PluginTargetMode
  declaredPermissions: string[]
  declaredMcpServers: string[]
  sourcePins: PluginSourcePin[]
}

interface PluginStoreValidationIssue {
  code: string
  severity: "warning" | "blocked"
  field: string
  message: string
}

interface PluginStoreCandidateReview {
  document: PluginStoreCandidateReviewDocument
  status: PluginStoreCandidateStatus
  approvalStatus: PluginStoreApprovalStatus
  issues: PluginStoreValidationIssue[]
  changes: PluginReviewChange[]
}

interface PluginStoreInstalledPackageRecord {
  schemaVersion: 1
  pluginReviewKey: string
  storeEntryId: string
  commit: string
  packageHash?: string
  candidateFingerprint: string
  installedAt: string
  targetMode: PluginTargetMode
}

interface PluginStoreBackupRecord {
  schemaVersion: 1
  id: string
  pluginReviewKey: string
  storeEntryId: string
  backupPath: string
  previousPath: string
  previousFingerprint?: string
  previousCommit?: string
  previousPackageHash?: string
  createdAt: string
  restoredAt?: string
}

interface PluginStoreCandidatePreview {
  entry: PluginStoreCatalogEntry
  review: PluginStoreCandidateReview
  candidateFingerprint: string
  installed?: PluginStoreInstalledPackageRecord
}

interface PluginDoctorStoreCandidateDebug {
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
  checks: PluginDoctorCheck[]
}

interface PluginData {
  runtime: PluginRuntime
  reviewKey: string
  name: string
  version: string
  description?: string
  path: string
  installRoot: string
  source: string
  marketplace: string
  category?: string
  homepage?: string
  tags?: string[]
  sourceKind: PluginSourceKind
  sourceTrust: PluginSourceTrust
  targetMode: PluginTargetMode
  executionStatus: PluginExecutionStatus
  reviewStatus: PluginReviewStatus
  updatePosture: PluginUpdatePosture
  updateReview: PluginUpdateReviewMetadata
  safetyGate: PluginSafetyGate
  runtimeNativeActivation: {
    current: RuntimeNativeActivationPolicy
    enableCandidate: RuntimeNativeActivationPolicy
  }
  sourcePins: PluginSourcePin[]
  diagnostics: PluginDiagnostic[]
  controlledUi: {
    manifestPresent: boolean
    manifestPath?: string
    manifest?: PluginControlledUiManifest
    diagnostics: PluginControlledUiDiagnostic[]
    ignoredUnknownFields: string[]
    actionGrantStatuses: Record<string, PluginControlledUiGrantStatus>
    settingsValues: Record<
      string,
      Record<string, PluginControlledUiSettingValue>
    >
    gate: PluginControlledUiGate
  }
  developerTrusted: {
    manifestPresent: boolean
    manifestPath?: string
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
  isDisabled: boolean
  canToggle: boolean
  components: {
    commands: PluginComponent[]
    skills: PluginComponent[]
    agents: PluginComponent[]
    hooks: PluginComponent[]
    mcpServers: string[]
  }
  mcpApprovalIdentifiers: Record<string, string>
}

interface PluginSourceData {
  id: string
  runtime: PluginRuntime
  name: string
  description: string
  kind: PluginSourceKind
  trust: PluginSourceTrust
  status: PluginSourceStatus
  path: string
  pluginCount: number
  installHint: string
  diagnostics: PluginDiagnostic[]
  homepage?: string
}

interface RuntimeMarketplaceListItem extends RuntimePluginMarketplace {
  id: string
  plugins: RuntimePluginListing[]
  snapshotDiagnostics: RuntimeMarketplaceDiagnostic[]
  refreshedAt: string
}

interface McpServerStatus {
  status: string
  needsAuth: boolean
}

function getPluginKey(plugin: Pick<PluginData, "reviewKey" | "path">): string {
  return `${plugin.reviewKey}:${plugin.path}`
}

function getRuntimeLabel(
  runtime: PluginRuntime,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return runtime === "claude"
    ? t("settings.plugins.runtimeClaude")
    : t("settings.plugins.runtimeCodex")
}

function getRuntimeFilterLabel(
  filter: RuntimeFilter,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (filter === "all") return t("settings.plugins.runtimeAll")
  if (filter === "claude") return "Claude"
  return getRuntimeLabel(filter, t)
}

function getPluginStatusLabel(
  plugin: PluginData,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (!plugin.canToggle) return t("settings.plugins.installed")
  return plugin.isDisabled ? t("common.disabled") : t("common.active")
}

function canEnablePlugin(plugin: PluginData): boolean {
  if (plugin.runtime === "codex") {
    return plugin.runtimeNativeActivation.enableCandidate.canActivateNative
  }
  return plugin.safetyGate.canEnable
}

const RUNTIME_FILTERS: RuntimeFilter[] = ["all", "claude", "codex"]
const VIEW_MODES: PluginViewMode[] = [
  "installed",
  "sources",
  "marketplaces",
  "store",
]

function getViewModeLabel(
  viewMode: PluginViewMode,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (viewMode === "installed") return t("settings.plugins.viewInstalled")
  if (viewMode === "sources") return t("settings.plugins.viewSources")
  if (viewMode === "marketplaces") return t("settings.plugins.viewMarketplaces")
  return t("settings.plugins.viewLocusStore")
}

function getSourceKindLabel(
  kind: PluginSourceKind,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (kind) {
    case "local-marketplace":
      return t("settings.plugins.sourceKindLocalMarketplace")
    case "cache":
      return t("settings.plugins.sourceKindCache")
    case "developer-local":
      return t("settings.plugins.sourceKindDeveloperLocal")
  }
}

function getSourceTrustLabel(
  trust: PluginSourceTrust,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (trust) {
    case "official":
      return t("settings.plugins.sourceTrustOfficial")
    case "local":
      return t("settings.plugins.sourceTrustLocal")
    case "external":
      return t("settings.plugins.sourceTrustExternal")
  }
}

function getSourceStatusLabel(
  status: PluginSourceStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "available":
      return t("settings.plugins.sourceStatusAvailable")
    case "empty":
      return t("settings.plugins.sourceStatusEmpty")
    case "missing":
      return t("settings.plugins.sourceStatusMissing")
  }
}

function getSourceDescriptionLabel(
  runtime: PluginRuntime,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return runtime === "claude"
    ? t("settings.plugins.sourceDescriptionClaude")
    : t("settings.plugins.sourceDescriptionCodex")
}

function getSourceInstallHintLabel(
  runtime: PluginRuntime,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return runtime === "claude"
    ? t("settings.plugins.sourceInstallHintClaude")
    : t("settings.plugins.sourceInstallHintCodex")
}

function getSourceStatusClass(status: PluginSourceStatus): string {
  switch (status) {
    case "available":
      return "text-emerald-500"
    case "empty":
      return "text-amber-500"
    case "missing":
      return "text-muted-foreground"
  }
}

function getRuntimeMarketplaceStatusLabel(
  status: RuntimeMarketplaceInventoryStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "available":
      return t("settings.plugins.runtimeMarketplaceStatusAvailable")
    case "empty":
      return t("settings.plugins.runtimeMarketplaceStatusEmpty")
    case "missing":
      return t("settings.plugins.runtimeMarketplaceStatusMissing")
    case "unavailable":
      return t("settings.plugins.runtimeMarketplaceStatusUnavailable")
    case "degraded":
      return t("settings.plugins.runtimeMarketplaceStatusDegraded")
  }
}

function getRuntimeMarketplaceStatusClass(
  status: RuntimeMarketplaceInventoryStatus,
): string {
  switch (status) {
    case "available":
      return "text-emerald-500"
    case "empty":
    case "degraded":
      return "text-amber-500"
    case "missing":
    case "unavailable":
      return "text-muted-foreground"
  }
}

function getRuntimePluginListingStatusLabel(
  status: RuntimePluginListingStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "available":
      return t("settings.plugins.runtimePluginStatusAvailable")
    case "not-installed":
      return t("settings.plugins.runtimePluginStatusNotInstalled")
    case "installed":
      return t("settings.plugins.runtimePluginStatusInstalled")
    case "installed-enabled":
      return t("settings.plugins.runtimePluginStatusInstalledEnabled")
    case "installed-disabled":
      return t("settings.plugins.runtimePluginStatusInstalledDisabled")
    case "unknown":
      return t("settings.plugins.runtimePluginStatusUnknown")
  }
}

function getRuntimePluginListingStatusClass(
  status: RuntimePluginListingStatus,
): string {
  switch (status) {
    case "installed-enabled":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "installed":
    case "installed-disabled":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    case "not-installed":
    case "available":
    case "unknown":
      return "border-border bg-muted/20 text-muted-foreground"
  }
}

function getRuntimePluginWriteActionLabel(
  action: RuntimePluginWriteActionId,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (action) {
    case "codex.marketplace.add":
    case "claude.marketplace.add":
      return t("settings.plugins.runtimeMarketplaceAddMarketplace")
    case "codex.marketplace.upgrade":
      return t("settings.plugins.runtimeMarketplaceUpgradeMarketplace")
    case "claude.marketplace.update":
      return t("settings.plugins.runtimeMarketplaceUpdateMarketplace")
    case "codex.marketplace.remove":
    case "claude.marketplace.remove":
      return t("settings.plugins.runtimeMarketplaceRemoveMarketplace")
    case "codex.plugin.add":
      return t("settings.plugins.runtimePluginActionAdd")
    case "codex.plugin.remove":
      return t("settings.plugins.runtimePluginActionRemove")
    case "claude.plugin.install":
      return t("settings.plugins.runtimePluginActionInstall")
    case "claude.plugin.update":
      return t("settings.plugins.runtimePluginActionUpdate")
    case "claude.plugin.enable":
      return t("settings.plugins.runtimePluginActionEnable")
    case "claude.plugin.disable":
      return t("settings.plugins.runtimePluginActionDisable")
    case "claude.plugin.uninstall":
      return t("settings.plugins.runtimePluginActionUninstall")
  }
}

function getRuntimePluginWriteActions(
  plugin: RuntimePluginListing,
): RuntimePluginWriteActionId[] {
  if (plugin.runtime === "codex") {
    return plugin.installed ? ["codex.plugin.remove"] : ["codex.plugin.add"]
  }
  if (!plugin.installed) return ["claude.plugin.install"]
  const actions: RuntimePluginWriteActionId[] = ["claude.plugin.update"]
  if (plugin.enabled === false || plugin.status === "installed-disabled") {
    actions.push("claude.plugin.enable")
  } else if (plugin.enabled === true || plugin.status === "installed-enabled") {
    actions.push("claude.plugin.disable")
  }
  actions.push("claude.plugin.uninstall")
  return actions
}

function getTargetModeLabel(
  mode: PluginTargetMode,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (mode) {
    case "manifest-only":
      return t("settings.plugins.targetModeManifestOnly")
    case "controlled-ui":
      return t("settings.plugins.targetModeControlledUi")
    case "developer-trusted-code":
      return t("settings.plugins.targetModeDeveloperTrustedCode")
  }
}

function getTargetModeDescription(
  mode: PluginTargetMode,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (mode) {
    case "manifest-only":
      return t("settings.plugins.targetModeManifestOnlyDescription")
    case "controlled-ui":
      return t("settings.plugins.targetModeControlledUiDescription")
    case "developer-trusted-code":
      return t("settings.plugins.targetModeDeveloperTrustedCodeDescription")
  }
}

function getExecutionStatusLabel(
  status: PluginExecutionStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "not-run-by-locus":
      return t("settings.plugins.executionNotRunByLocus")
    case "locus-controlled":
      return t("settings.plugins.executionLocusControlled")
    case "locus-controlled-planned":
      return t("settings.plugins.executionLocusControlledPlanned")
    case "trusted-code-planned":
      return t("settings.plugins.executionTrustedCodePlanned")
    case "developer-trusted-code":
      return t("settings.plugins.executionDeveloperTrustedCode")
  }
}

function getReviewStatusLabel(
  status: PluginReviewStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "metadata-only":
      return t("settings.plugins.reviewMetadataOnly")
    case "mcp-review-required":
      return t("settings.plugins.reviewMcpRequired")
    case "read-only-cache":
      return t("settings.plugins.reviewReadOnlyCache")
  }
}

function getUpdateReviewStatusLabel(
  status: PluginUpdateReviewStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "new":
      return t("settings.plugins.updateReviewNew")
    case "unchanged":
      return t("settings.plugins.updateReviewUnchanged")
    case "changed":
      return t("settings.plugins.updateReviewChanged")
    case "reviewed":
      return t("settings.plugins.updateReviewReviewed")
  }
}

function getUpdatePostureLabel(
  posture: PluginUpdatePosture,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (posture) {
    case "advisory-only":
      return t("settings.plugins.updateAdvisoryOnly")
    case "review-before-enable":
      return t("settings.plugins.updateReviewBeforeEnable")
  }
}

function getTargetModeClass(mode: PluginTargetMode): string {
  switch (mode) {
    case "manifest-only":
      return "border-border bg-muted text-muted-foreground"
    case "controlled-ui":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
    case "developer-trusted-code":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  }
}

function getReviewStatusClass(status: PluginReviewStatus): string {
  switch (status) {
    case "metadata-only":
      return "text-muted-foreground"
    case "mcp-review-required":
      return "text-amber-600 dark:text-amber-300"
    case "read-only-cache":
      return "text-sky-700 dark:text-sky-300"
  }
}

function getUpdateReviewStatusClass(status: PluginUpdateReviewStatus): string {
  switch (status) {
    case "new":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
    case "unchanged":
      return "border-border bg-background text-muted-foreground"
    case "changed":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    case "reviewed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  }
}

function getStoreCandidateStatusLabel(
  status: PluginStoreCandidateStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "not-installed":
      return t("settings.plugins.storeStatusNotInstalled")
    case "installed-current":
      return t("settings.plugins.storeStatusInstalledCurrent")
    case "update-available":
      return t("settings.plugins.storeStatusUpdateAvailable")
    case "pin-changed":
      return t("settings.plugins.storeStatusPinChanged")
    case "package-hash-changed":
      return t("settings.plugins.storeStatusPackageHashChanged")
    case "review-required":
      return t("settings.plugins.storeStatusReviewRequired")
    case "blocked-invalid-pin":
      return t("settings.plugins.storeStatusBlockedInvalidPin")
    case "blocked-missing-package-hash":
      return t("settings.plugins.storeStatusBlockedMissingHash")
    case "blocked-target-mode":
      return t("settings.plugins.storeStatusBlockedTargetMode")
  }
}

function getStoreCandidateStatusClass(
  status: PluginStoreCandidateStatus,
): string {
  if (status.startsWith("blocked")) {
    return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
  }
  switch (status) {
    case "installed-current":
    case "not-installed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "update-available":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
    case "pin-changed":
    case "package-hash-changed":
    case "review-required":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
  }
  return "border-border bg-background text-muted-foreground"
}

function getStoreApprovalStatusLabel(
  status: PluginStoreApprovalStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "current":
      return t("settings.plugins.storeApprovalCurrent")
    case "stale":
      return t("settings.plugins.storeApprovalStale")
    case "missing":
      return t("settings.plugins.storeApprovalMissing")
  }
}

function getStoreApprovalStatusClass(
  status: PluginStoreApprovalStatus,
): string {
  switch (status) {
    case "current":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "stale":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    case "missing":
      return "border-border bg-background text-muted-foreground"
  }
}

function getSafetyGateStatusLabel(
  status: PluginSafetyGateStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "allowed":
      return t("settings.plugins.safetyGateAllowed")
    case "safe-mode":
      return t("settings.plugins.safetyGateSafeMode")
    case "review-required":
      return t("settings.plugins.safetyGateReviewRequired")
    case "read-only":
      return t("settings.plugins.safetyGateReadOnly")
  }
}

function getSafetyGateReasonLabel(
  reason: PluginSafetyGateReason,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (reason) {
    case "global-safe-mode":
      return t("settings.plugins.safetyReasonGlobalSafeMode")
    case "review-new":
      return t("settings.plugins.safetyReasonReviewNew")
    case "review-changed":
      return t("settings.plugins.safetyReasonReviewChanged")
    case "review-unreviewed":
      return t("settings.plugins.safetyReasonReviewUnreviewed")
    case "codex-read-only-cache":
      return t("settings.plugins.safetyReasonCodexReadOnly")
    case "no-mcp-servers":
      return t("settings.plugins.safetyReasonNoMcp")
  }
}

function getSafetyGateStatusClass(status: PluginSafetyGateStatus): string {
  switch (status) {
    case "allowed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "safe-mode":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    case "review-required":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    case "read-only":
      return "border-border bg-background text-muted-foreground"
  }
}

function getRuntimeNativeActivationStatusLabel(
  status: RuntimeNativeActivationPolicy["status"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  return status === "allowed"
    ? t("settings.plugins.runtimeNativeAllowed")
    : t("settings.plugins.runtimeNativeBlocked")
}

function getRuntimeNativeActivationStatusClass(
  status: RuntimeNativeActivationPolicy["status"],
): string {
  return status === "allowed"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
}

function getRuntimeNativeIdentityStatusLabel(
  status: RuntimeNativeActivationIdentityStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "reviewed":
      return t("settings.plugins.runtimeNativeIdentityReviewed")
    case "identity-incomplete":
      return t("settings.plugins.runtimeNativeIdentityIncomplete")
    case "identity-incomplete-acknowledged":
      return t("settings.plugins.runtimeNativeIdentityIncompleteAcknowledged")
    case "identity-unreviewed":
      return t("settings.plugins.runtimeNativeIdentityUnreviewed")
    case "identity-drifted":
      return t("settings.plugins.runtimeNativeIdentityDrifted")
  }
}

function getRuntimeNativeIdentityStatusClass(
  status: RuntimeNativeActivationIdentityStatus,
): string {
  switch (status) {
    case "reviewed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "identity-incomplete-acknowledged":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    case "identity-incomplete":
    case "identity-unreviewed":
    case "identity-drifted":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
  }
}

function getRuntimeNativeBlockedReasonLabel(
  reason: RuntimeNativeActivationBlockedReason,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (reason) {
    case "plugin-disabled":
      return t("settings.plugins.runtimeNativeReasonPluginDisabled")
    case "global-safe-mode":
      return t("settings.plugins.runtimeNativeReasonGlobalSafeMode")
    case "manifest-review-required":
      return t("settings.plugins.runtimeNativeReasonManifestReviewRequired")
    case "runtime-native-unsupported":
      return t("settings.plugins.runtimeNativeReasonUnsupported")
    case "per-run-plugin-control-missing":
      return t("settings.plugins.runtimeNativeReasonPerRunControlMissing")
    case "activation-identity-incomplete":
      return t("settings.plugins.runtimeNativeReasonIdentityIncomplete")
    case "activation-identity-unreviewed":
      return t("settings.plugins.runtimeNativeReasonIdentityUnreviewed")
    case "activation-identity-drifted":
      return t("settings.plugins.runtimeNativeReasonIdentityDrifted")
    case "mcp-approval-required":
      return t("settings.plugins.runtimeNativeReasonMcpApprovalRequired")
    case "native-load-failed":
      return t("settings.plugins.runtimeNativeReasonNativeLoadFailed")
  }
}

function getControlledUiSurfaceLabel(
  type: PluginControlledUiSurface["type"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (type) {
    case "settings-section":
      return t("settings.plugins.contributionSettingsSection")
    case "workbench-panel":
      return t("settings.plugins.contributionWorkbenchPanel")
    case "command-button":
      return t("settings.plugins.contributionActionEntry")
  }
}

function getControlledUiFieldTypeLabel(
  type: PluginControlledUiField["type"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (type) {
    case "text":
      return t("settings.plugins.contributionFieldText")
    case "checkbox":
      return t("settings.plugins.contributionFieldCheckbox")
    case "select":
      return t("settings.plugins.contributionFieldSelect")
  }
}

function getControlledUiGateReasonLabel(
  reason: PluginControlledUiGateReason,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (reason) {
    case "safe-mode":
      return t("settings.plugins.contributionReasonSafeMode")
    case "review-required":
      return t("settings.plugins.contributionReasonReviewRequired")
    case "review-changed":
      return t("settings.plugins.contributionReasonChanged")
    case "review-unreviewed":
      return t("settings.plugins.contributionReasonUnreviewed")
    case "invalid-contribution-manifest":
      return t("settings.plugins.contributionReasonInvalid")
    case "unsupported-runtime":
      return t("settings.plugins.contributionReasonUnsupportedRuntime")
    case "unsupported-target-mode":
      return t("settings.plugins.contributionReasonUnsupportedTarget")
    case "unsupported-surface":
      return t("settings.plugins.contributionReasonUnsupportedSurface")
    case "unsupported-action":
      return t("settings.plugins.contributionReasonUnsupportedAction")
    case "permission-not-granted":
      return t("settings.plugins.contributionReasonPermissionRequired")
    case "permission-stale":
      return t("settings.plugins.contributionReasonPermissionStale")
    case "codex-read-only-cache":
      return t("settings.plugins.contributionReasonCodexReadOnly")
  }
}

function getControlledUiActionKey(
  surface: PluginControlledUiCommandButton,
): string {
  return `${surface.id}:${surface.action.id}`
}

function getControlledUiContributionStatus(
  plugin: PluginData,
  surface: PluginControlledUiSurface,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (
    plugin.controlledUi.diagnostics.some(
      (diagnostic) => diagnostic.severity === "blocked",
    )
  ) {
    return t("settings.plugins.contributionStatusUnavailable")
  }
  if (surface.type === "workbench-panel") {
    return t("settings.plugins.contributionStatusSurfaceUnavailable")
  }
  if (plugin.controlledUi.gate.reasons.includes("safe-mode")) {
    return t("settings.plugins.contributionStatusSafeMode")
  }
  if (plugin.controlledUi.gate.reasons.includes("review-changed")) {
    return t("settings.plugins.contributionStatusChanged")
  }
  if (
    plugin.controlledUi.gate.reasons.includes("review-required") ||
    plugin.controlledUi.gate.reasons.includes("review-unreviewed")
  ) {
    return t("settings.plugins.contributionStatusNeedsReview")
  }
  if (plugin.controlledUi.gate.reasons.includes("codex-read-only-cache")) {
    return t("settings.plugins.contributionStatusReadOnly")
  }
  if (surface.type === "command-button") {
    const grantStatus =
      plugin.controlledUi.actionGrantStatuses[getControlledUiActionKey(surface)]
    if (grantStatus === "stale")
      return t("settings.plugins.contributionStatusPermissionStale")
    if (grantStatus !== "current")
      return t("settings.plugins.contributionStatusPermissionRequired")
  }
  return plugin.controlledUi.gate.canRenderControlledUi
    ? t("settings.plugins.contributionStatusAvailable")
    : t("settings.plugins.contributionStatusUnavailable")
}

function getControlledUiContributionStatusClass(
  plugin: PluginData,
  surface: PluginControlledUiSurface,
): string {
  if (
    plugin.controlledUi.diagnostics.some(
      (diagnostic) => diagnostic.severity === "blocked",
    ) ||
    plugin.controlledUi.gate.reasons.includes("safe-mode") ||
    plugin.controlledUi.gate.reasons.includes("review-changed") ||
    plugin.controlledUi.gate.reasons.includes("review-required") ||
    plugin.controlledUi.gate.reasons.includes("permission-stale")
  ) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
  }
  if (
    surface.type === "workbench-panel" ||
    plugin.controlledUi.gate.reasons.includes("codex-read-only-cache")
  ) {
    return "border-border bg-background text-muted-foreground"
  }
  if (plugin.controlledUi.gate.canRenderControlledUi) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  }
  return "border-border bg-background text-muted-foreground"
}

function getDeveloperTrustStatusLabel(
  status: PluginDeveloperTrustedStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "current":
      return t("settings.plugins.developerTrustCurrent")
    case "stale":
      return t("settings.plugins.developerTrustStale")
    case "missing":
      return t("settings.plugins.developerTrustMissing")
    case "mismatch":
      return t("settings.plugins.developerTrustMismatch")
  }
}

function getDeveloperLoadStatusLabel(
  status: PluginDeveloperTrustedLoadStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "not-loaded":
      return t("settings.plugins.developerLoadNotLoaded")
    case "blocked":
      return t("settings.plugins.developerLoadBlocked")
    case "loaded":
      return t("settings.plugins.developerLoadLoaded")
    case "failed":
      return t("settings.plugins.developerLoadFailed")
  }
}

function getDeveloperTrustStatusClass(
  status: PluginDeveloperTrustedStatus,
): string {
  switch (status) {
    case "current":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "stale":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    case "missing":
    case "mismatch":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
  }
}

function getDeveloperLoadStatusClass(
  status: PluginDeveloperTrustedLoadStatus,
): string {
  switch (status) {
    case "loaded":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "blocked":
    case "failed":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
    case "not-loaded":
      return "border-border bg-background text-muted-foreground"
  }
}

function getDeveloperGateReasonLabel(
  reason: PluginDeveloperTrustedGateReason,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (reason) {
    case "developer-mode-disabled":
      return t("settings.plugins.developerReasonModeDisabled")
    case "safe-mode":
      return t("settings.plugins.developerReasonSafeMode")
    case "review-required":
      return t("settings.plugins.developerReasonReviewRequired")
    case "review-changed":
      return t("settings.plugins.developerReasonReviewChanged")
    case "review-unreviewed":
      return t("settings.plugins.developerReasonReviewUnreviewed")
    case "trust-missing":
      return t("settings.plugins.developerReasonTrustMissing")
    case "trust-stale":
      return t("settings.plugins.developerReasonTrustStale")
    case "invalid-developer-manifest":
      return t("settings.plugins.developerReasonInvalidManifest")
    case "entry-outside-root":
      return t("settings.plugins.developerReasonEntryOutsideRoot")
    case "unsupported-source":
      return t("settings.plugins.developerReasonUnsupportedSource")
    case "unsupported-runtime":
      return t("settings.plugins.developerReasonUnsupportedRuntime")
    case "unsupported-target-mode":
      return t("settings.plugins.developerReasonUnsupportedTarget")
    case "codex-read-only-cache":
      return t("settings.plugins.developerReasonCodexReadOnly")
  }
}

function shortFingerprint(fingerprint: string): string {
  return fingerprint ? fingerprint.slice(0, 12) : "none"
}

function formatBundleSize(bytes: number | undefined): string {
  if (typeof bytes !== "number") return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatReviewTimestamp(
  value: string | undefined,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (!value) return t("settings.plugins.neverReviewed")
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function getSourcePinLabel(
  pin: PluginSourcePin,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (pin.kind) {
    case "cache-version":
      return t("settings.plugins.sourcePinCacheVersion")
    case "lock-source-ref":
      return t("settings.plugins.sourcePinLockRef")
    case "store-git-commit":
      return t("settings.plugins.sourcePinStoreCommit")
    case "store-package-sha256":
      return t("settings.plugins.sourcePinStorePackageHash")
  }
}

function getDiagnosticLabel(
  code: PluginDiagnosticCode,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (code) {
    case "metadata-only-no-execution":
      return t("settings.plugins.diagnosticMetadataOnlyNoExecution")
    case "mcp-review-required":
      return t("settings.plugins.diagnosticMcpReviewRequired")
    case "codex-read-only-cache":
      return t("settings.plugins.diagnosticCodexReadOnlyCache")
    case "permission-scope-review-required":
      return t("settings.plugins.diagnosticPermissionScopeReviewRequired")
    case "safe-mode-planned":
      return t("settings.plugins.diagnosticSafeModePlanned")
    case "component-path-outside-root":
      return t("settings.plugins.diagnosticComponentPathOutsideRoot")
    case "source-available":
      return t("settings.plugins.diagnosticSourceAvailable")
    case "source-empty":
      return t("settings.plugins.diagnosticSourceEmpty")
    case "source-missing":
      return t("settings.plugins.diagnosticSourceMissing")
    case "source-read-only-refresh":
      return t("settings.plugins.diagnosticSourceReadOnlyRefresh")
    case "developer-trusted-code-full-trust":
      return t("settings.plugins.diagnosticDeveloperTrustedCodeFullTrust")
  }
}

function getDiagnosticClass(severity: PluginDiagnosticSeverity): string {
  return severity === "warning"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    : "border-border bg-background text-muted-foreground"
}

function getDoctorStatusLabel(
  status: PluginDoctorCheckStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "pass":
      return t("settings.plugins.doctorStatusPass")
    case "info":
      return t("settings.plugins.doctorStatusInfo")
    case "warning":
      return t("settings.plugins.doctorStatusWarning")
    case "blocked":
      return t("settings.plugins.doctorStatusBlocked")
  }
}

function getDoctorStatusClass(status: PluginDoctorCheckStatus): string {
  switch (status) {
    case "pass":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "info":
      return "border-border bg-background text-muted-foreground"
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    case "blocked":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
  }
}

function getWorstDoctorStatus(
  checks: PluginDoctorCheck[],
): PluginDoctorCheckStatus {
  if (checks.some((check) => check.status === "blocked")) return "blocked"
  if (checks.some((check) => check.status === "warning")) return "warning"
  if (checks.some((check) => check.status === "info")) return "info"
  return "pass"
}

function getDoctorCheckLabel(
  code: PluginDoctorCheckCode,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (code) {
    case "source-available":
      return t("settings.plugins.doctorCheckSourceAvailable")
    case "source-empty":
      return t("settings.plugins.doctorCheckSourceEmpty")
    case "source-missing":
      return t("settings.plugins.doctorCheckSourceMissing")
    case "manifest-fingerprint":
      return t("settings.plugins.doctorCheckManifestFingerprint")
    case "review-required":
      return t("settings.plugins.doctorCheckReviewRequired")
    case "review-changed":
      return t("settings.plugins.doctorCheckReviewChanged")
    case "reviewed":
      return t("settings.plugins.doctorCheckReviewed")
    case "safe-mode":
      return t("settings.plugins.doctorCheckSafeMode")
    case "runtime-gate":
      return t("settings.plugins.doctorCheckRuntimeGate")
    case "codex-read-only":
      return t("settings.plugins.doctorCheckCodexReadOnly")
    case "components-declared":
      return t("settings.plugins.doctorCheckComponentsDeclared")
    case "mcp-declared":
      return t("settings.plugins.doctorCheckMcpDeclared")
    case "mcp-approval-fingerprint":
      return t("settings.plugins.doctorCheckMcpApprovalFingerprint")
    case "controlled-ui-declared":
      return t("settings.plugins.doctorCheckControlledUiDeclared")
    case "controlled-ui-gate":
      return t("settings.plugins.doctorCheckControlledUiGate")
    case "controlled-ui-diagnostic":
      return t("settings.plugins.doctorCheckControlledUiDiagnostic")
    case "developer-mode":
      return t("settings.plugins.doctorCheckDeveloperMode")
    case "developer-trusted-declared":
      return t("settings.plugins.doctorCheckDeveloperTrustedDeclared")
    case "developer-trusted-gate":
      return t("settings.plugins.doctorCheckDeveloperTrustedGate")
    case "developer-trusted-trust":
      return t("settings.plugins.doctorCheckDeveloperTrustedTrust")
    case "developer-trusted-load":
      return t("settings.plugins.doctorCheckDeveloperTrustedLoad")
    case "developer-trusted-diagnostic":
      return t("settings.plugins.doctorCheckDeveloperTrustedDiagnostic")
    case "store-candidate":
      return t("settings.plugins.doctorCheckStoreCandidate")
    case "store-pin":
      return t("settings.plugins.doctorCheckStorePin")
    case "store-approval":
      return t("settings.plugins.doctorCheckStoreApproval")
    case "store-backup":
      return t("settings.plugins.doctorCheckStoreBackup")
    case "store-target-mode":
      return t("settings.plugins.doctorCheckStoreTargetMode")
    case "runtime-marketplace":
      return t("settings.plugins.doctorCheckRuntimeMarketplace")
    case "runtime-marketplace-diagnostic":
      return t("settings.plugins.doctorCheckRuntimeMarketplaceDiagnostic")
    case "runtime-plugin-listing":
      return t("settings.plugins.doctorCheckRuntimePluginListing")
    case "runtime-native-activation":
      return t("settings.plugins.doctorCheckRuntimeNativeActivation")
    case "runtime-native-identity":
      return t("settings.plugins.doctorCheckRuntimeNativeIdentity")
    case "component-path-warning":
      return t("settings.plugins.doctorCheckComponentPathWarning")
    case "review-state":
      return t("settings.plugins.doctorCheckReviewState")
  }
}

function PluginDoctorSummaryPanel({
  report,
  isLoading,
}: {
  report?: PluginDoctorReport
  isLoading: boolean
}) {
  const { t } = useI18n()

  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Stethoscope className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">
              {t("settings.plugins.doctor")}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {isLoading
                ? t("common.loading")
                : t("settings.plugins.doctorSummary", {
                    blocked: report?.summary.blocked ?? 0,
                    warning: report?.summary.warning ?? 0,
                    checks: report?.summary.totalChecks ?? 0,
                  })}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
            report && report.summary.blocked > 0
              ? getDoctorStatusClass("blocked")
              : report && report.summary.warning > 0
                ? getDoctorStatusClass("warning")
                : getDoctorStatusClass("pass"),
          )}
        >
          {report && report.summary.blocked > 0
            ? getDoctorStatusLabel("blocked", t)
            : report && report.summary.warning > 0
              ? getDoctorStatusLabel("warning", t)
              : getDoctorStatusLabel("pass", t)}
        </span>
      </div>
    </div>
  )
}

function PluginDebugPanel({
  plugin,
  debug,
}: {
  plugin: PluginData
  debug?: PluginDoctorPluginDebug
}) {
  const { t } = useI18n()
  if (!debug) return null

  const approvalCount = Object.keys(debug.mcpApprovalIdentifiers).length
  const visibleChecks = debug.checks.slice(0, 8)
  const debugStatus = getWorstDoctorStatus(debug.checks)
  const showDeveloperTrustedFacts =
    debug.developerTrusted.isDeveloperSource ||
    debug.developerTrusted.manifestPresent ||
    debug.developerTrusted.loadState.status !== "not-loaded" ||
    debug.developerTrusted.trustStatus !== "missing"
  const developerGateReasons = debug.developerTrusted.gate.reasons.join(", ")

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Label>{t("settings.plugins.debug")}</Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("settings.plugins.debugHint")}
          </p>
        </div>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[10px] font-medium",
            getDoctorStatusClass(debugStatus),
          )}
        >
          {getDoctorStatusLabel(debugStatus, t)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="space-y-1">
          <p className="text-muted-foreground">
            {t("settings.plugins.doctorFingerprint")}
          </p>
          <p className="font-mono text-foreground" title={debug.fingerprint}>
            sha256:{shortFingerprint(debug.fingerprint)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">
            {t("settings.plugins.doctorLastReviewedFingerprint")}
          </p>
          <p
            className="font-mono text-foreground"
            title={debug.lastReviewedFingerprint}
          >
            sha256:{shortFingerprint(debug.lastReviewedFingerprint ?? "")}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">
            {t("settings.plugins.doctorComponentCounts")}
          </p>
          <p className="text-foreground">
            {[
              `${t("settings.plugins.doctorCommandsShort")}:${debug.componentCounts.commands}`,
              `${t("settings.plugins.doctorSkillsShort")}:${debug.componentCounts.skills}`,
              `${t("settings.plugins.doctorAgentsShort")}:${debug.componentCounts.agents}`,
              `${t("settings.plugins.doctorHooksShort")}:${debug.componentCounts.hooks}`,
              `MCP:${debug.componentCounts.mcpServers}`,
            ].join(" / ")}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">
            {t("settings.plugins.doctorMcpApprovals")}
          </p>
          <p className="text-foreground">
            {approvalCount} / {plugin.components.mcpServers.length}
          </p>
        </div>
      </div>

      {showDeveloperTrustedFacts ? (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-medium text-amber-900 dark:text-amber-100">
              {t("settings.plugins.doctorDeveloperTrust")}
            </p>
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                getDoctorStatusClass(
                  debug.developerTrusted.gate.canLoadTrustedCode
                    ? "pass"
                    : "blocked",
                ),
              )}
            >
              {getDeveloperLoadStatusLabel(
                debug.developerTrusted.loadState.status,
                t,
              )}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-amber-900/70 dark:text-amber-100/70">
                {t("settings.plugins.doctorDeveloperTrustStatus")}
              </p>
              <p className="font-medium text-amber-950 dark:text-amber-50">
                {getDeveloperTrustStatusLabel(
                  debug.developerTrusted.trustStatus,
                  t,
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-amber-900/70 dark:text-amber-100/70">
                {t("settings.plugins.doctorDeveloperLoadStatus")}
              </p>
              <p className="font-medium text-amber-950 dark:text-amber-50">
                {getDeveloperLoadStatusLabel(
                  debug.developerTrusted.loadState.status,
                  t,
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-amber-900/70 dark:text-amber-100/70">
                {t("settings.plugins.doctorDeveloperBundleHash")}
              </p>
              <p
                className="font-mono text-amber-950 dark:text-amber-50"
                title={debug.developerTrusted.bundleContentHash}
              >
                sha256:
                {shortFingerprint(
                  debug.developerTrusted.bundleContentHash ?? "",
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-amber-900/70 dark:text-amber-100/70">
                {t("settings.plugins.doctorDeveloperGateReasons")}
              </p>
              <p
                className="truncate text-amber-950 dark:text-amber-50"
                title={developerGateReasons}
              >
                {debug.developerTrusted.gate.reasons.length > 0
                  ? debug.developerTrusted.gate.reasons
                      .map((reason) => getDeveloperGateReasonLabel(reason, t))
                      .join(", ")
                  : "-"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t("settings.plugins.doctorChecks")}
        </p>
        <div className="space-y-1">
          {visibleChecks.map((check, index) => (
            <div
              key={`${check.code}-${index}`}
              className="grid grid-cols-[1fr_auto] items-start gap-2 rounded border border-border bg-muted/20 px-2 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {getDoctorCheckLabel(check.code, t)}
                </p>
                <p
                  className="truncate text-[11px] text-muted-foreground"
                  title={check.subject}
                >
                  {check.subject}
                </p>
              </div>
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                  getDoctorStatusClass(check.status),
                )}
              >
                {getDoctorStatusLabel(check.status, t)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: PluginDiagnostic[]
}) {
  const { t } = useI18n()
  if (diagnostics.length === 0) return null

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-2">
      <Label>{t("settings.plugins.diagnostics")}</Label>
      <div className="space-y-1.5">
        {diagnostics.map((diagnostic, index) => (
          <div
            key={`${diagnostic.code}-${index}`}
            className={cn(
              "flex items-start gap-2 rounded border px-2 py-1.5 text-xs leading-relaxed",
              getDiagnosticClass(diagnostic.severity),
            )}
          >
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                diagnostic.severity === "warning"
                  ? "bg-amber-500"
                  : "bg-muted-foreground/50",
              )}
            />
            <span>{getDiagnosticLabel(diagnostic.code, t)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PluginSafeModeControl({
  safeMode,
  onToggle,
  isToggling,
}: {
  safeMode: PluginSafeModeState
  onToggle: (enabled: boolean) => void
  isToggling: boolean
}) {
  const { t } = useI18n()
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2",
        safeMode.enabled
          ? "border-amber-500/30 bg-amber-500/10"
          : "border-border bg-background",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              safeMode.enabled ? "text-amber-500" : "text-muted-foreground",
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">
              {t("settings.plugins.safeMode")}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {safeMode.enabled
                ? t("settings.plugins.safeModeEnabledShort")
                : t("settings.plugins.safeModeDisabledShort")}
            </p>
          </div>
        </div>
        <Switch
          checked={safeMode.enabled}
          onCheckedChange={onToggle}
          disabled={isToggling}
        />
      </div>
    </div>
  )
}

function PluginDeveloperModeControl({
  developerMode,
  onToggle,
  onChooseSource,
  isToggling,
  isChoosingSource,
}: {
  developerMode: PluginDeveloperModeState
  onToggle: (enabled: boolean) => void
  onChooseSource: () => void
  isToggling: boolean
  isChoosingSource: boolean
}) {
  const { t } = useI18n()
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2",
        developerMode.enabled
          ? "border-amber-500/30 bg-amber-500/10"
          : "border-border bg-background",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Code2
            className={cn(
              "mt-0.5 h-3.5 w-3.5 shrink-0",
              developerMode.enabled
                ? "text-amber-500"
                : "text-muted-foreground",
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">
              {t("settings.plugins.developerMode")}
            </p>
            <p className="text-[10px] leading-snug text-muted-foreground">
              {developerMode.enabled
                ? t("settings.plugins.developerModeEnabledShort")
                : t("settings.plugins.developerModeDisabledShort")}
            </p>
          </div>
        </div>
        <Switch
          checked={developerMode.enabled}
          onCheckedChange={onToggle}
          disabled={isToggling}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[10px] leading-snug text-muted-foreground">
          {t("settings.plugins.developerModeHint")}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-6 shrink-0 px-1.5 text-[10px]"
          onClick={onChooseSource}
          disabled={isChoosingSource}
        >
          {isChoosingSource ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <FolderPlus className="mr-1 h-3 w-3" />
              {t("settings.plugins.addDeveloperSource")}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function PluginSafetyGatePanel({ plugin }: { plugin: PluginData }) {
  const { t } = useI18n()
  const gate = plugin.safetyGate
  const visibleReasons = gate.reasons.filter(
    (reason) => reason !== "no-mcp-servers",
  )

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{t("settings.plugins.safetyGate")}</Label>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[10px] font-medium",
            getSafetyGateStatusClass(gate.status),
          )}
        >
          {getSafetyGateStatusLabel(gate.status, t)}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("settings.plugins.safetyGateHint")}
      </p>
      {visibleReasons.length > 0 && (
        <div className="space-y-1.5">
          {visibleReasons.map((reason) => (
            <div
              key={reason}
              className="rounded border border-border bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground"
            >
              {getSafetyGateReasonLabel(reason, t)}
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">
            {t("settings.plugins.safetyCanEnable")}
          </p>
          <p className="text-xs font-medium text-foreground">
            {gate.canEnable
              ? t("settings.plugins.gateYes")
              : t("settings.plugins.gateNo")}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">
            {t("settings.plugins.safetyCanApproveMcp")}
          </p>
          <p className="text-xs font-medium text-foreground">
            {gate.canApproveMcp
              ? t("settings.plugins.gateYes")
              : t("settings.plugins.gateNo")}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">
            {t("settings.plugins.safetyCanUseMcp")}
          </p>
          <p className="text-xs font-medium text-foreground">
            {gate.canUseMcp
              ? t("settings.plugins.gateYes")
              : t("settings.plugins.gateNo")}
          </p>
        </div>
      </div>
    </div>
  )
}

function PluginRuntimeNativeActivationPanel({ plugin }: { plugin: PluginData }) {
  const { t } = useI18n()
  const current = plugin.runtimeNativeActivation.current
  const enableCandidate = plugin.runtimeNativeActivation.enableCandidate
  const reasonSource = plugin.isDisabled ? enableCandidate : current
  const visibleReasons = reasonSource.reasons
  const mcpApprovalRequired = enableCandidate.reasons.includes(
    "mcp-approval-required",
  )
  const hasNativeLoadFailure =
    current.reasons.includes("native-load-failed") ||
    enableCandidate.reasons.includes("native-load-failed")
  const componentSummary = [
    `${t("settings.plugins.doctorCommandsShort")}:${plugin.components.commands.length}`,
    `${t("settings.plugins.doctorSkillsShort")}:${plugin.components.skills.length}`,
    `${t("settings.plugins.doctorAgentsShort")}:${plugin.components.agents.length}`,
    `${t("settings.plugins.doctorHooksShort")}:${plugin.components.hooks.length}`,
    `MCP:${plugin.components.mcpServers.length}`,
  ].join(" / ")

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Label>{t("settings.plugins.runtimeNativeActivation")}</Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("settings.plugins.runtimeNativeHint")}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
            getRuntimeNativeActivationStatusClass(current.status),
          )}
        >
          {getRuntimeNativeActivationStatusLabel(current.status, t)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">
            {t("settings.plugins.runtimeNativeInstalledState")}
          </p>
          <p className="text-xs font-medium text-foreground">
            {t("settings.plugins.runtimeNativeInstalled")}
          </p>
        </div>
        <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">
            {t("settings.plugins.runtimeNativeEnablement")}
          </p>
          <p className="text-xs font-medium text-foreground">
            {plugin.isDisabled
              ? t("settings.plugins.runtimeNativeDisabled")
              : t("settings.plugins.runtimeNativeEnabled")}
          </p>
        </div>
        <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">
            {t("settings.plugins.runtimeNativeReview")}
          </p>
          <p className="text-xs font-medium text-foreground">
            {getUpdateReviewStatusLabel(plugin.updateReview.status, t)}
          </p>
        </div>
        <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">
            {t("settings.plugins.runtimeNativeRecovery")}
          </p>
          <p
            className={cn(
              "text-xs font-medium",
              hasNativeLoadFailure
                ? "text-red-700 dark:text-red-300"
                : "text-emerald-700 dark:text-emerald-300",
            )}
          >
            {hasNativeLoadFailure
              ? t("settings.plugins.runtimeNativeRecoveryFailed")
              : t("settings.plugins.runtimeNativeRecoveryReady")}
          </p>
        </div>
        <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">
            {t("settings.plugins.runtimeNativeCurrent")}
          </p>
          <p className="text-xs font-medium text-foreground">
            {getRuntimeNativeActivationStatusLabel(current.status, t)}
          </p>
        </div>
        <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">
            {t("settings.plugins.runtimeNativeEnableCandidate")}
          </p>
          <p className="text-xs font-medium text-foreground">
            {getRuntimeNativeActivationStatusLabel(
              enableCandidate.status,
              t,
            )}
          </p>
        </div>
        <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">
            {t("settings.plugins.runtimeNativeIdentity")}
          </p>
          <span
            className={cn(
              "mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium",
              getRuntimeNativeIdentityStatusClass(current.identityStatus),
            )}
          >
            {getRuntimeNativeIdentityStatusLabel(current.identityStatus, t)}
          </span>
        </div>
        <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">
            {t("settings.plugins.runtimeNativeMcpApproval")}
          </p>
          <p className="text-xs font-medium text-foreground">
            {plugin.components.mcpServers.length === 0
              ? t("settings.plugins.runtimeNativeMcpNotRequired")
              : mcpApprovalRequired
                ? t("settings.plugins.runtimeNativeMcpRequired")
                : t("settings.plugins.runtimeNativeMcpApproved")}
          </p>
        </div>
      </div>

      <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
        <p className="text-[10px] uppercase text-muted-foreground">
          {t("settings.plugins.runtimeNativeComponents")}
        </p>
        <p className="text-xs font-medium text-foreground">
          {componentSummary}
        </p>
      </div>

      {visibleReasons.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("settings.plugins.runtimeNativeBlockedReasons")}
          </p>
          {visibleReasons.map((reason) => (
            <div
              key={reason}
              className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:text-red-300"
            >
              {getRuntimeNativeBlockedReasonLabel(reason, t)}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("settings.plugins.runtimeNativeNoBlockedReasons")}
        </p>
      )}
    </div>
  )
}

function PluginControlledUiPanel({
  plugin,
  onSetSettingValue,
  onGrantAction,
  onInvokeAction,
  isSavingSetting,
  isGranting,
  isInvoking,
}: {
  plugin: PluginData
  onSetSettingValue: (
    surface: PluginControlledUiSettingsSection,
    field: PluginControlledUiField,
    value: PluginControlledUiSettingValue,
  ) => void
  onGrantAction: (surface: PluginControlledUiCommandButton) => void
  onInvokeAction: (surface: PluginControlledUiCommandButton) => void
  isSavingSetting: boolean
  isGranting: boolean
  isInvoking: boolean
}) {
  const { t } = useI18n()
  const surfaces = plugin.controlledUi.manifest?.surfaces ?? []
  const commandCount = surfaces.filter(
    (surface) => surface.type === "command-button",
  ).length
  const visibleReasons = plugin.controlledUi.gate.reasons.slice(0, 3)

  if (
    surfaces.length === 0 &&
    !plugin.controlledUi.manifestPresent &&
    plugin.targetMode !== "controlled-ui"
  ) {
    return null
  }

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Label>{t("settings.plugins.uiContributions")}</Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("settings.plugins.uiContributionsHint")}
          </p>
        </div>
        <span className="shrink-0 rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {t("settings.plugins.uiContributionCount", {
            count: surfaces.length,
          })}
        </span>
      </div>

      {surfaces.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-muted/20 px-2 py-2 text-xs text-muted-foreground">
          {t("settings.plugins.noUiContributions")}
        </div>
      ) : (
        <div className="space-y-2">
          {surfaces.map((surface) => {
            const status = getControlledUiContributionStatus(plugin, surface, t)
            const grantStatus =
              surface.type === "command-button"
                ? plugin.controlledUi.actionGrantStatuses[
                    getControlledUiActionKey(surface)
                  ]
                : undefined
            const canGrant =
              surface.type === "command-button" &&
              plugin.controlledUi.gate.canRenderControlledUi &&
              grantStatus !== "current"
            const canInvoke =
              surface.type === "command-button" &&
              plugin.controlledUi.gate.canInvokeControlledAction &&
              grantStatus === "current"

            return (
              <div
                key={`${surface.type}:${surface.id}`}
                className="rounded border border-border bg-muted/20 px-2 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-xs font-medium text-foreground">
                        {surface.title}
                      </p>
                      <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {getControlledUiSurfaceLabel(surface.type, t)}
                      </span>
                    </div>
                    {surface.description && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {surface.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                      getControlledUiContributionStatusClass(plugin, surface),
                    )}
                  >
                    {status}
                  </span>
                </div>

                {surface.type === "settings-section" &&
                  surface.fields.length > 0 && (
                    <div className="mt-2 grid gap-1.5">
                      {surface.fields.slice(0, 4).map((field) => {
                        const fieldValue =
                          plugin.controlledUi.settingsValues[surface.id]?.[
                            field.id
                          ]
                        const canEditField =
                          plugin.controlledUi.gate.canRenderControlledUi &&
                          !isSavingSetting
                        const currentTextValue =
                          typeof fieldValue === "string" ? fieldValue : ""

                        return (
                          <div
                            key={field.id}
                            className="grid gap-1.5 rounded border border-border bg-background px-2 py-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 font-medium text-muted-foreground">
                                {field.label}
                              </span>
                              <span className="shrink-0 rounded border border-border bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {getControlledUiFieldTypeLabel(field.type, t)}
                              </span>
                            </div>
                            {field.description && (
                              <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                                {field.description}
                              </p>
                            )}
                            {field.type === "checkbox" ? (
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={fieldValue === true}
                                  onCheckedChange={(checked) =>
                                    onSetSettingValue(surface, field, checked)
                                  }
                                  disabled={!canEditField}
                                />
                              </div>
                            ) : field.type === "select" ? (
                              <Select
                                value={
                                  typeof fieldValue === "string"
                                    ? fieldValue
                                    : CONTROLLED_UI_SELECT_UNSET_VALUE
                                }
                                onValueChange={(value) => {
                                  if (
                                    value !== CONTROLLED_UI_SELECT_UNSET_VALUE
                                  ) {
                                    onSetSettingValue(surface, field, value)
                                  }
                                }}
                                disabled={!canEditField}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem
                                    value={CONTROLLED_UI_SELECT_UNSET_VALUE}
                                    disabled
                                  >
                                    {t(
                                      "settings.plugins.contributionSettingUnset",
                                    )}
                                  </SelectItem>
                                  {(field.options ?? []).map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                key={`${field.id}:${currentTextValue}`}
                                defaultValue={currentTextValue}
                                disabled={!canEditField}
                                className="h-8 text-xs"
                                onBlur={(event) => {
                                  const nextValue = event.currentTarget.value
                                  if (nextValue !== currentTextValue) {
                                    onSetSettingValue(surface, field, nextValue)
                                  }
                                }}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                {surface.type === "workbench-panel" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("settings.plugins.workbenchContributionPlanned", {
                      count: surface.items.length,
                    })}
                  </p>
                )}

                {surface.type === "command-button" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {grantStatus !== "current" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onGrantAction(surface)}
                        disabled={!canGrant || isGranting}
                      >
                        {isGranting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          t("settings.plugins.approveControlledAction")
                        )}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onInvokeAction(surface)}
                        disabled={!canInvoke || isInvoking}
                      >
                        {isInvoking ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          t("settings.plugins.prepareControlledDraft")
                        )}
                      </Button>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {surface.action.type === "insert-chat-draft"
                        ? t("settings.plugins.controlledActionInsertDraft")
                        : t("settings.plugins.contributionStatusUnavailable")}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {(visibleReasons.length > 0 ||
        plugin.controlledUi.diagnostics.length > 0) && (
        <div className="space-y-1.5">
          {visibleReasons.map((reason) => (
            <div
              key={reason}
              className="rounded border border-border bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground"
            >
              {getControlledUiGateReasonLabel(reason, t)}
            </div>
          ))}
          {plugin.controlledUi.diagnostics
            .slice(0, 3)
            .map((diagnostic) => (
              <div
                key={`${diagnostic.code}-${diagnostic.path ?? diagnostic.message ?? "diagnostic"}`}
                className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200"
              >
                {diagnostic.message ?? diagnostic.code}
              </div>
            ))}
        </div>
      )}

      {commandCount > 0 && (
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          {t("settings.plugins.controlledActionHint")}
        </p>
      )}
    </div>
  )
}

function PluginDeveloperTrustPanel({
  plugin,
  developerTrustedFacts,
  onTrust,
  onRevokeTrust,
  onLoad,
  isTrusting,
  isRevoking,
  isLoadingPlugin,
}: {
  plugin: PluginData
  developerTrustedFacts?: PluginDoctorPluginDebug["developerTrusted"]
  onTrust: () => void
  onRevokeTrust: () => void
  onLoad: () => void
  isTrusting: boolean
  isRevoking: boolean
  isLoadingPlugin: boolean
}) {
  const { t } = useI18n()
  const developer = developerTrustedFacts ?? plugin.developerTrusted
  const isDeveloperPlugin =
    plugin.sourceKind === "developer-local" ||
    plugin.targetMode === "developer-trusted-code" ||
    developer.manifestPresent

  if (!isDeveloperPlugin) return null

  const manifest = developer.manifest
  const canTrust =
    developer.gate.canTrustCurrentFingerprint &&
    developer.trustStatus !== "current"
  const canLoad =
    developer.gate.canLoadTrustedCode && developer.loadState.status !== "loaded"
  const canRevoke = developer.trustStatus !== "missing"
  const visibleReasons = developer.gate.reasons.slice(0, 5)

  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Label>{t("settings.plugins.developerTrustedCode")}</Label>
          <p className="text-xs leading-relaxed text-amber-900/80 dark:text-amber-100/80">
            {t("settings.plugins.developerTrustedHint")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-medium",
              getDeveloperTrustStatusClass(developer.trustStatus),
            )}
          >
            {getDeveloperTrustStatusLabel(developer.trustStatus, t)}
          </span>
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-medium",
              getDeveloperLoadStatusClass(developer.loadState.status),
            )}
          >
            {getDeveloperLoadStatusLabel(developer.loadState.status, t)}
          </span>
        </div>
      </div>

      {manifest ? (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <p className="text-amber-900/70 dark:text-amber-100/70">
              {t("settings.plugins.developerManifestId")}
            </p>
            <p className="font-mono text-amber-950 dark:text-amber-50 break-all">
              {manifest.id}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-amber-900/70 dark:text-amber-100/70">
              {t("settings.plugins.version")}
            </p>
            <p className="font-mono text-amber-950 dark:text-amber-50">
              {manifest.version}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-amber-900/70 dark:text-amber-100/70">
              {t("settings.plugins.developerEntryHash")}
            </p>
            <p
              className="font-mono text-amber-950 dark:text-amber-50"
              title={developer.entryContentHash}
            >
              sha256:{shortFingerprint(developer.entryContentHash ?? "")}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-amber-900/70 dark:text-amber-100/70">
              {t("settings.plugins.developerBundleHash")}
            </p>
            <p
              className="font-mono text-amber-950 dark:text-amber-50"
              title={developer.bundleContentHash}
            >
              sha256:{shortFingerprint(developer.bundleContentHash ?? "")}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-amber-900/70 dark:text-amber-100/70">
              {t("settings.plugins.developerBundleSize")}
            </p>
            <p className="text-amber-950 dark:text-amber-50">
              {developer.bundleFileCount ?? 0} /{" "}
              {formatBundleSize(developer.bundleByteCount)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-amber-900/70 dark:text-amber-100/70">
              {t("settings.plugins.developerPermissions")}
            </p>
            <p
              className="truncate text-amber-950 dark:text-amber-50"
              title={manifest.permissions.join(", ")}
            >
              {manifest.permissions.length > 0
                ? manifest.permissions.join(", ")
                : "-"}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded border border-amber-500/30 bg-background/70 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-100">
          {t("settings.plugins.noDeveloperManifest")}
        </div>
      )}

      {(visibleReasons.length > 0 || developer.diagnostics.length > 0) && (
        <div className="space-y-1.5">
          {visibleReasons.map((reason) => (
            <div
              key={reason}
              className="rounded border border-amber-500/30 bg-background/70 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-100"
            >
              {getDeveloperGateReasonLabel(reason, t)}
            </div>
          ))}
          {developer.diagnostics.slice(0, 3).map((diagnostic) => (
            <div
              key={`${diagnostic.code}-${diagnostic.path ?? diagnostic.message ?? "diagnostic"}`}
              className="rounded border border-amber-500/30 bg-background/70 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-100"
            >
              {diagnostic.message ?? diagnostic.code}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onTrust}
          disabled={!canTrust || isTrusting}
          title={
            !canTrust
              ? t("settings.plugins.developerGateBlocksAction")
              : undefined
          }
        >
          {isTrusting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              {t("settings.plugins.trustDeveloperPlugin")}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onLoad}
          disabled={!canLoad || isLoadingPlugin}
          title={
            !canLoad
              ? t("settings.plugins.developerGateBlocksAction")
              : undefined
          }
        >
          {isLoadingPlugin ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              {t("settings.plugins.loadDeveloperPlugin")}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onRevokeTrust}
          disabled={!canRevoke || isRevoking}
        >
          {isRevoking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
              {t("settings.plugins.revokeDeveloperTrust")}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function PluginUpdateReviewPanel({
  plugin,
  onMarkReviewed,
  isMarkingReviewed,
}: {
  plugin: PluginData
  onMarkReviewed: () => void
  isMarkingReviewed: boolean
}) {
  const { t } = useI18n()
  const review = plugin.updateReview
  const sourcePins =
    review.sourcePins.length > 0 ? review.sourcePins : plugin.sourcePins
  const canMarkReviewed = review.status !== "reviewed"

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Label>{t("settings.plugins.updateReview")}</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                getUpdateReviewStatusClass(review.status),
              )}
            >
              {getUpdateReviewStatusLabel(review.status, t)}
            </span>
            <span
              className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
              title={review.fingerprint}
            >
              sha256:{shortFingerprint(review.fingerprint)}
            </span>
          </div>
        </div>
        {canMarkReviewed && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs shrink-0"
            onClick={onMarkReviewed}
            disabled={isMarkingReviewed}
          >
            {isMarkingReviewed ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <FileCheck2 className="h-3.5 w-3.5 mr-1.5" />
                {t("settings.plugins.markReviewed")}
              </>
            )}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="space-y-1">
          <p className="text-muted-foreground">
            {t("settings.plugins.firstSeen")}
          </p>
          <p className="text-foreground">
            {formatReviewTimestamp(review.firstSeenAt, t)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">
            {t("settings.plugins.lastReviewed")}
          </p>
          <p className="text-foreground">
            {formatReviewTimestamp(review.lastReviewedAt, t)}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t("settings.plugins.sourcePins")}
        </p>
        {sourcePins.length > 0 ? (
          <div className="space-y-1">
            {sourcePins.map((pin) => (
              <div
                key={`${pin.kind}:${pin.value}:${pin.repo ?? ""}:${pin.path ?? ""}`}
                className="rounded border border-border bg-muted/20 px-2 py-1.5"
              >
                <p className="text-[11px] text-muted-foreground">
                  {getSourcePinLabel(pin, t)}
                </p>
                <p className="text-xs font-mono text-foreground break-all">
                  {pin.value}
                </p>
                {(pin.repo || pin.path) && (
                  <p className="text-[11px] text-muted-foreground/70 break-all">
                    {[pin.repo, pin.path].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("settings.plugins.noSourcePins")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t("settings.plugins.changeSummary")}
        </p>
        {review.changes.length > 0 ? (
          <div className="space-y-1">
            {review.changes.map((change) => (
              <div
                key={change.field}
                className="grid grid-cols-[7rem_1fr] gap-2 rounded border border-border bg-muted/20 px-2 py-1.5 text-xs"
              >
                <span className="font-medium text-foreground">
                  {change.field}
                </span>
                <span className="min-w-0 text-muted-foreground break-all">
                  {change.previous ?? "none"} {"->"} {change.current ?? "none"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("settings.plugins.noReviewChanges")}
          </p>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        {t("settings.plugins.markReviewedHint")}
      </p>
    </div>
  )
}

// --- Detail Panel ---
function PluginDetail({
  plugin,
  pluginDebug,
  onToggleEnabled,
  isTogglingEnabled,
  onApproveMcpServers,
  isApprovingMcpServers,
  onNavigateToTab,
  mcpServerStatuses,
  onMcpAuth,
  isAuthenticating,
  onMarkReviewed,
  isMarkingReviewed,
  onSetControlledSetting,
  onGrantControlledAction,
  onInvokeControlledAction,
  isSavingControlledSetting,
  isGrantingControlledAction,
  isInvokingControlledAction,
  onTrustDeveloperPlugin,
  onRevokeDeveloperTrust,
  onLoadDeveloperPlugin,
  isTrustingDeveloperPlugin,
  isRevokingDeveloperTrust,
  isLoadingDeveloperPlugin,
}: {
  plugin: PluginData
  pluginDebug?: PluginDoctorPluginDebug
  onToggleEnabled: (enabled: boolean) => void
  isTogglingEnabled: boolean
  onApproveMcpServers?: () => void
  isApprovingMcpServers?: boolean
  onNavigateToTab: (tab: SettingsTab) => void
  mcpServerStatuses: Record<string, McpServerStatus>
  onMcpAuth: (serverName: string) => void
  isAuthenticating: boolean
  onMarkReviewed: () => void
  isMarkingReviewed: boolean
  onSetControlledSetting: (
    surface: PluginControlledUiSettingsSection,
    field: PluginControlledUiField,
    value: PluginControlledUiSettingValue,
  ) => void
  onGrantControlledAction: (surface: PluginControlledUiCommandButton) => void
  onInvokeControlledAction: (surface: PluginControlledUiCommandButton) => void
  isSavingControlledSetting: boolean
  isGrantingControlledAction: boolean
  isInvokingControlledAction: boolean
  onTrustDeveloperPlugin: () => void
  onRevokeDeveloperTrust: () => void
  onLoadDeveloperPlugin: () => void
  isTrustingDeveloperPlugin: boolean
  isRevokingDeveloperTrust: boolean
  isLoadingDeveloperPlugin: boolean
}) {
  const { t } = useI18n()
  const componentCount =
    plugin.components.commands.length +
    plugin.components.skills.length +
    plugin.components.agents.length +
    plugin.components.hooks.length +
    plugin.components.mcpServers.length
  const statusLabel = getPluginStatusLabel(plugin, t)
  const runtimeLabel = getRuntimeLabel(plugin.runtime, t)
  const canApproveMcp =
    plugin.runtime === "claude" &&
    !plugin.isDisabled &&
    plugin.components.mcpServers.length > 0 &&
    plugin.safetyGate.canApproveMcp &&
    !!onApproveMcpServers
  const canNavigateCapabilities =
    plugin.runtime === "claude" &&
    !plugin.isDisabled &&
    plugin.safetyGate.status === "allowed"
  const isEnableBlocked =
    plugin.canToggle && plugin.isDisabled && !canEnablePlugin(plugin)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-5">
          {/* Name & category with integrated toggle */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {formatPluginName(plugin.name)}
              </h3>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      plugin.canToggle && plugin.isDisabled
                        ? "bg-muted-foreground/40"
                        : "bg-emerald-500",
                    )}
                  />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      plugin.canToggle && plugin.isDisabled
                        ? "text-muted-foreground"
                        : "text-emerald-500",
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>
                {plugin.canToggle ? (
                  <Switch
                    checked={!plugin.isDisabled}
                    onCheckedChange={onToggleEnabled}
                    disabled={isTogglingEnabled || isEnableBlocked}
                  />
                ) : (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t("settings.plugins.readOnly")}
                  </span>
                )}
              </div>
            </div>
            {plugin.category && (
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                {plugin.category}
              </p>
            )}
          </div>

          {/* Description */}
          {plugin.description && (
            <p className="text-sm text-muted-foreground">
              {plugin.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground/70">
            {plugin.runtime === "claude"
              ? t("settings.plugins.claudePackageHint")
              : t("settings.plugins.codexPackageHint")}
          </p>

          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                  getTargetModeClass(plugin.targetMode),
                )}
              >
                {getTargetModeLabel(plugin.targetMode, t)}
              </span>
              <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {getExecutionStatusLabel(plugin.executionStatus, t)}
              </span>
              <span
                className={cn(
                  "rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium",
                  getReviewStatusClass(plugin.reviewStatus),
                )}
              >
                {getReviewStatusLabel(plugin.reviewStatus, t)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {getTargetModeDescription(plugin.targetMode, t)}
            </p>
          </div>

          <DiagnosticsPanel diagnostics={plugin.diagnostics} />
          <PluginSafetyGatePanel plugin={plugin} />
          <PluginRuntimeNativeActivationPanel plugin={plugin} />
          <PluginControlledUiPanel
            plugin={plugin}
            onSetSettingValue={onSetControlledSetting}
            onGrantAction={onGrantControlledAction}
            onInvokeAction={onInvokeControlledAction}
            isSavingSetting={isSavingControlledSetting}
            isGranting={isGrantingControlledAction}
            isInvoking={isInvokingControlledAction}
          />
          <PluginDeveloperTrustPanel
            plugin={plugin}
            developerTrustedFacts={pluginDebug?.developerTrusted}
            onTrust={onTrustDeveloperPlugin}
            onRevokeTrust={onRevokeDeveloperTrust}
            onLoad={onLoadDeveloperPlugin}
            isTrusting={isTrustingDeveloperPlugin}
            isRevoking={isRevokingDeveloperTrust}
            isLoadingPlugin={isLoadingDeveloperPlugin}
          />
          <PluginDebugPanel plugin={plugin} debug={pluginDebug} />

          <PluginUpdateReviewPanel
            plugin={plugin}
            onMarkReviewed={onMarkReviewed}
            isMarkingReviewed={isMarkingReviewed}
          />

          {/* Info */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.targetMode")}</Label>
              <p className="text-sm text-foreground">
                {getTargetModeLabel(plugin.targetMode, t)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.executionStatus")}</Label>
              <p className="text-sm text-foreground">
                {getExecutionStatusLabel(plugin.executionStatus, t)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.reviewStatus")}</Label>
              <p
                className={cn(
                  "text-sm font-medium",
                  getReviewStatusClass(plugin.reviewStatus),
                )}
              >
                {getReviewStatusLabel(plugin.reviewStatus, t)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.updatePosture")}</Label>
              <p className="text-sm text-foreground">
                {getUpdatePostureLabel(plugin.updatePosture, t)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.sourceTrust")}</Label>
              <p className="text-sm text-foreground">
                {getSourceTrustLabel(plugin.sourceTrust, t)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.runtime")}</Label>
              <p className="text-sm text-foreground">{runtimeLabel}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.capabilities")}</Label>
              <p className="text-sm text-foreground">
                {t("settings.plugins.capabilityCount", {
                  count: componentCount,
                })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.version")}</Label>
              <p className="text-sm text-foreground font-mono">
                {plugin.version}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.source")}</Label>
              <p className="text-sm text-foreground font-mono">
                {plugin.source}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.path")}</Label>
              <p className="text-sm text-foreground font-mono break-all">
                {plugin.path}
              </p>
            </div>
            {plugin.homepage && (
              <div className="space-y-1.5">
                <Label>{t("settings.plugins.homepage")}</Label>
                <a
                  href={plugin.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-blue-400 hover:underline break-all"
                >
                  {plugin.homepage}
                </a>
              </div>
            )}
            {plugin.tags && plugin.tags.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("settings.plugins.tags")}</Label>
                <div className="flex flex-wrap gap-1">
                  {plugin.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border border-border bg-background p-3 space-y-2">
            <Label>{t("settings.plugins.updateHandling")}</Label>
            <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              <p>{t("settings.plugins.pluginUpdateGuidance")}</p>
              <p>{t("settings.plugins.codexReferenceUpdateGuidance")}</p>
              <p>{t("settings.plugins.codexDesktopUpdateGuidance")}</p>
              <p>{t("settings.plugins.codexRuntimeUpdateGuidance")}</p>
            </div>
          </div>

          <div className="rounded-md border border-border bg-background p-3 space-y-2">
            <Label>{t("settings.plugins.safeModePlanning")}</Label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("settings.plugins.safeModePlanningGuidance")}
            </p>
          </div>

          {/* Components — clickable when the runtime exposes them to shared tabs */}
          {plugin.components.commands.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                {t("settings.plugins.commandsCount", {
                  count: plugin.components.commands.length,
                })}
              </Label>
              <div className="space-y-1">
                {plugin.components.commands.map((cmd) => (
                  <button
                    type="button"
                    key={cmd.name}
                    disabled={!canNavigateCapabilities}
                    onClick={() =>
                      canNavigateCapabilities && onNavigateToTab("skills")
                    }
                    className={cn(
                      "w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 transition-colors text-left group",
                      canNavigateCapabilities
                        ? "hover:bg-foreground/5 cursor-pointer"
                        : "cursor-default opacity-75",
                    )}
                  >
                    <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-medium text-foreground">
                        /{cmd.name}
                      </p>
                      {cmd.description && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                          {cmd.description}
                        </p>
                      )}
                    </div>
                    {canNavigateCapabilities && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {plugin.components.skills.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                {t("settings.plugins.skillsCount", {
                  count: plugin.components.skills.length,
                })}
              </Label>
              <div className="space-y-1">
                {plugin.components.skills.map((skill) => (
                  <button
                    type="button"
                    key={skill.name}
                    disabled={!canNavigateCapabilities}
                    onClick={() =>
                      canNavigateCapabilities && onNavigateToTab("skills")
                    }
                    className={cn(
                      "w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 transition-colors text-left group",
                      canNavigateCapabilities
                        ? "hover:bg-foreground/5 cursor-pointer"
                        : "cursor-default opacity-75",
                    )}
                  >
                    <SkillIconFilled className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-medium text-foreground">
                        {skill.name}
                      </p>
                      {skill.description && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                          {skill.description}
                        </p>
                      )}
                    </div>
                    {canNavigateCapabilities && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {plugin.components.agents.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                {t("settings.plugins.agentsCount", {
                  count: plugin.components.agents.length,
                })}
              </Label>
              <div className="space-y-1">
                {plugin.components.agents.map((agent) => (
                  <button
                    type="button"
                    key={agent.name}
                    disabled={!canNavigateCapabilities}
                    onClick={() =>
                      canNavigateCapabilities && onNavigateToTab("agents")
                    }
                    className={cn(
                      "w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 transition-colors text-left group",
                      canNavigateCapabilities
                        ? "hover:bg-foreground/5 cursor-pointer"
                        : "cursor-default opacity-75",
                    )}
                  >
                    <CustomAgentIconFilled className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-medium text-foreground">
                        {agent.name}
                      </p>
                      {agent.description && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                          {agent.description}
                        </p>
                      )}
                    </div>
                    {canNavigateCapabilities && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {plugin.components.hooks.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                {t("settings.plugins.hooksCount", {
                  count: plugin.components.hooks.length,
                })}
              </Label>
              <div className="space-y-1">
                {plugin.components.hooks.map((hook) => (
                  <div
                    key={hook.name}
                    className="w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left opacity-75"
                  >
                    <Workflow className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-medium text-foreground">
                        {hook.name}
                      </p>
                      {hook.description && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                          {hook.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {plugin.components.mcpServers.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label>
                  {t("settings.plugins.mcpServersCount", {
                    count: plugin.components.mcpServers.length,
                  })}
                </Label>
                {plugin.runtime === "claude" &&
                  plugin.components.mcpServers.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px] shrink-0"
                      disabled={!canApproveMcp || isApprovingMcpServers}
                      onClick={onApproveMcpServers}
                      title={
                        !canApproveMcp
                          ? t("settings.plugins.safetyGateBlocksAction")
                          : undefined
                      }
                    >
                      {isApprovingMcpServers ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <ShieldCheck className="h-3 w-3 mr-1.5" />
                          {t("settings.plugins.approveMcpServers")}
                        </>
                      )}
                    </Button>
                  )}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                {plugin.runtime === "claude"
                  ? t("settings.plugins.mcpApprovalHint")
                  : t("settings.plugins.codexMcpHint")}
              </p>
              <div className="space-y-1">
                {plugin.components.mcpServers.map((serverName) => {
                  const serverStatus = mcpServerStatuses[serverName]
                  const needsAuth = serverStatus?.needsAuth
                  const isConnected = serverStatus?.status === "connected"
                  return (
                    <div
                      key={serverName}
                      className="w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 group"
                    >
                      <OriginalMCPIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <button
                        type="button"
                        disabled={!canNavigateCapabilities}
                        onClick={() =>
                          canNavigateCapabilities && onNavigateToTab("mcp")
                        }
                        className={cn(
                          "min-w-0 flex-1 text-left",
                          canNavigateCapabilities && "hover:underline",
                        )}
                      >
                        <p className="text-xs font-mono font-medium text-foreground">
                          {serverName}
                        </p>
                      </button>
                      {needsAuth ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-6 px-2 text-[11px] shrink-0"
                          disabled={
                            isAuthenticating || !plugin.safetyGate.canUseMcp
                          }
                          onClick={() => onMcpAuth(serverName)}
                          title={
                            !plugin.safetyGate.canUseMcp
                              ? t("settings.plugins.safetyGateBlocksAction")
                              : undefined
                          }
                        >
                          {isAuthenticating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            t("settings.plugins.signIn")
                          )}
                        </Button>
                      ) : isConnected ? (
                        <span className="text-[11px] text-emerald-500 shrink-0">
                          {t("common.connected")}
                        </span>
                      ) : serverStatus ? (
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {serverStatus.status}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {plugin.runtime === "codex"
                            ? t("settings.plugins.declared")
                            : t("settings.plugins.pendingApproval")}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Sidebar list item ---
function PluginListItem({
  plugin,
  isSelected,
  onSelect,
}: {
  plugin: PluginData
  isSelected: boolean
  onSelect: (key: string) => void
}) {
  const { t } = useI18n()
  const componentCount =
    plugin.components.commands.length +
    plugin.components.skills.length +
    plugin.components.agents.length +
    plugin.components.hooks.length +
    plugin.components.mcpServers.length
  const statusLabel =
    plugin.runtime === "codex" || plugin.safetyGate.status === "allowed"
      ? getPluginStatusLabel(plugin, t)
      : getSafetyGateStatusLabel(plugin.safetyGate.status, t)

  return (
    <button
      type="button"
      data-item-id={getPluginKey(plugin)}
      onClick={() => onSelect(getPluginKey(plugin))}
      className={cn(
        "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="text-sm leading-tight truncate">
          {formatPluginName(plugin.name)}
        </div>
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
          {plugin.runtime === "claude" ? "Claude" : "Codex"}
        </span>
        <span
          className={cn(
            "shrink-0 rounded border px-1 py-0.5 text-[9px] font-medium",
            getTargetModeClass(plugin.targetMode),
          )}
        >
          {getTargetModeLabel(plugin.targetMode, t)}
        </span>
      </div>
      {plugin.description && (
        <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
          {plugin.description}
        </div>
      )}
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground/60">
        <span className="truncate">
          {t("settings.plugins.capabilityCount", { count: componentCount })}
        </span>
        <span
          className={cn(
            "shrink-0",
            (plugin.runtime === "codex" ||
              plugin.safetyGate.status === "allowed") &&
              !(plugin.canToggle && plugin.isDisabled)
              ? "text-emerald-500/80"
              : "text-muted-foreground/60",
          )}
        >
          {statusLabel}
        </span>
      </div>
    </button>
  )
}

function PluginSourceListItem({
  source,
  isSelected,
  onSelect,
}: {
  source: PluginSourceData
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      data-item-id={source.id}
      onClick={() => onSelect(source.id)}
      className={cn(
        "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="text-sm leading-tight truncate">{source.name}</div>
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
          {source.runtime === "claude" ? "Claude" : "Codex"}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
        {source.path}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground/60">
        <span className="truncate">
          {t("settings.plugins.sourcePluginCount", {
            count: source.pluginCount,
          })}
        </span>
        <span className={cn("shrink-0", getSourceStatusClass(source.status))}>
          {getSourceStatusLabel(source.status, t)}
        </span>
      </div>
    </button>
  )
}

function RuntimeMarketplaceListItem({
  marketplace,
  isSelected,
  onSelect,
}: {
  marketplace: RuntimeMarketplaceListItem
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  const installedCount = marketplace.plugins.filter(
    (plugin) => plugin.installed,
  ).length
  const availableCount = marketplace.plugins.length - installedCount
  return (
    <button
      type="button"
      data-item-id={marketplace.id}
      onClick={() => onSelect(marketplace.id)}
      className={cn(
        "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="text-sm leading-tight truncate">{marketplace.name}</div>
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
          {marketplace.runtime === "claude" ? "Claude" : "Codex"}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
        {marketplace.source ??
          marketplace.path ??
          t("settings.plugins.runtimeMarketplaceRuntimeOwned")}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground/60">
        <span className="truncate">
          {t("settings.plugins.runtimeMarketplacePluginSummary", {
            installed: installedCount,
            available: availableCount,
          })}
        </span>
        <span
          className={cn(
            "shrink-0",
            getRuntimeMarketplaceStatusClass(marketplace.status),
          )}
        >
          {getRuntimeMarketplaceStatusLabel(marketplace.status, t)}
        </span>
      </div>
    </button>
  )
}

function PluginStoreListItem({
  entry,
  isSelected,
  onSelect,
}: {
  entry: PluginStoreCatalogEntry
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      data-item-id={entry.id}
      onClick={() => onSelect(entry.id)}
      className={cn(
        "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <PackageCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="text-sm leading-tight truncate">
          {formatPluginName(entry.name)}
        </div>
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
          {entry.runtime === "claude" ? "Claude" : "Codex"}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
        {entry.source.repo}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground/60">
        <span className="truncate font-mono">
          {entry.source.commit ? entry.source.commit.slice(0, 12) : "-"}
        </span>
        <span
          className={cn(
            "shrink-0 rounded border px-1 py-0.5 text-[9px] font-medium",
            getTargetModeClass(entry.targetMode),
          )}
        >
          {getTargetModeLabel(entry.targetMode, t)}
        </span>
      </div>
    </button>
  )
}

function PluginStoreCandidateDetail({
  entry,
  preview,
  debug,
  isLoadingPreview,
  onApprove,
  onInstallOrUpdate,
  isApproving,
  isInstalling,
}: {
  entry: PluginStoreCatalogEntry
  preview?: PluginStoreCandidatePreview
  debug?: PluginDoctorStoreCandidateDebug
  isLoadingPreview: boolean
  onApprove: () => void
  onInstallOrUpdate: () => void
  isApproving: boolean
  isInstalling: boolean
}) {
  const { t } = useI18n()
  const review = preview?.review
  const document = review?.document
  const isBlocked =
    review?.issues.some((issue) => issue.severity === "blocked") ?? true
  const canApprove = Boolean(
    review && !isBlocked && review.approvalStatus !== "current",
  )
  const isInstalledCurrent = review?.status === "installed-current"
  const canInstall = Boolean(
    review &&
      !isBlocked &&
      review.approvalStatus === "current" &&
      !isInstalledCurrent,
  )
  const installLabel = isInstalledCurrent
    ? t("settings.plugins.storeStatusInstalledCurrent")
    : preview?.installed
      ? t("settings.plugins.storeUpdate")
      : t("settings.plugins.storeInstall")
  const backup = debug?.backupRecords[0]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                {formatPluginName(entry.name)}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {getRuntimeLabel(entry.runtime, t)} · {entry.version}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {review ? (
                <>
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                      getStoreCandidateStatusClass(review.status),
                    )}
                  >
                    {getStoreCandidateStatusLabel(review.status, t)}
                  </span>
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                      getStoreApprovalStatusClass(review.approvalStatus),
                    )}
                  >
                    {getStoreApprovalStatusLabel(review.approvalStatus, t)}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
              <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-100">
                {t("settings.plugins.storePinWarning")}
              </p>
            </div>
          </div>

          {isLoadingPreview ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("settings.plugins.storePreviewLoading")}
            </div>
          ) : !review || !document ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              {t("settings.plugins.storePreviewUnavailable")}
            </div>
          ) : (
            <>
              <div className="rounded-md border border-border bg-background p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">
                      {t("settings.plugins.storeRepo")}
                    </p>
                    <p className="font-mono text-foreground break-all">
                      {document.source.repo}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">
                      {t("settings.plugins.storeCommit")}
                    </p>
                    <p className="font-mono text-foreground break-all">
                      {document.source.commit}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">
                      {t("settings.plugins.storePath")}
                    </p>
                    <p className="font-mono text-foreground break-all">
                      {document.source.path ?? "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">
                      {t("settings.plugins.storeCandidateFingerprint")}
                    </p>
                    <p
                      className="font-mono text-foreground"
                      title={preview?.candidateFingerprint}
                    >
                      sha256:
                      {shortFingerprint(preview?.candidateFingerprint ?? "")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">
                      {t("settings.plugins.storePackageHash")}
                    </p>
                    <p className="font-mono text-foreground break-all">
                      {document.package.sha256 ?? "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">
                      {t("settings.plugins.storePackageSize")}
                    </p>
                    <p className="text-foreground">
                      {formatBundleSize(document.package.sizeBytes)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border bg-background p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                      getTargetModeClass(document.targetMode),
                    )}
                  >
                    {getTargetModeLabel(document.targetMode, t)}
                  </span>
                  <span className="rounded border border-border bg-muted/20 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t("settings.plugins.storeDeclaredPermissions", {
                      count: document.declaredPermissions.length,
                    })}
                  </span>
                  <span className="rounded border border-border bg-muted/20 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t("settings.plugins.storeDeclaredMcp", {
                      count: document.declaredMcpServers.length,
                    })}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {document.declaredPermissions.length > 0
                    ? document.declaredPermissions.join(", ")
                    : t("settings.plugins.storeNoDeclarations")}
                </p>
                {document.declaredMcpServers.length > 0 ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    MCP: {document.declaredMcpServers.join(", ")}
                  </p>
                ) : null}
              </div>

              <div className="rounded-md border border-border bg-background p-3 space-y-2">
                <Label>{t("settings.plugins.storeIssues")}</Label>
                {review.issues.length > 0 ? (
                  <div className="space-y-1">
                    {review.issues.map((issue, index) => (
                      <div
                        key={`${issue.code}-${issue.field}-${index}`}
                        className={cn(
                          "rounded border px-2 py-1.5 text-xs leading-relaxed",
                          issue.severity === "blocked"
                            ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
                        )}
                      >
                        <span className="font-medium">{issue.field}</span>
                        <span className="mx-1">·</span>
                        <span>{issue.message || issue.code}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("settings.plugins.storeNoIssues")}
                  </p>
                )}
              </div>

              <div className="rounded-md border border-border bg-background p-3 space-y-2">
                <Label>{t("settings.plugins.changeSummary")}</Label>
                {review.changes.length > 0 ? (
                  <div className="space-y-1">
                    {review.changes.map((change) => (
                      <div
                        key={change.field}
                        className="grid grid-cols-[8rem_1fr] gap-2 rounded border border-border bg-muted/20 px-2 py-1.5 text-xs"
                      >
                        <span className="font-medium text-foreground">
                          {change.field}
                        </span>
                        <span className="min-w-0 text-muted-foreground break-all">
                          {change.previous ?? "none"} {"->"}{" "}
                          {change.current ?? "none"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("settings.plugins.noReviewChanges")}
                  </p>
                )}
              </div>

              {backup ? (
                <div className="rounded-md border border-border bg-background p-3 space-y-1.5">
                  <Label>{t("settings.plugins.storeBackup")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.plugins.storeLatestBackup", {
                      date: formatReviewTimestamp(backup.createdAt, t),
                    })}
                  </p>
                  <p className="font-mono text-xs text-foreground break-all">
                    {backup.backupPath}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={onApprove}
                  disabled={!canApprove || isApproving}
                  title={
                    !canApprove
                      ? t("settings.plugins.storeApprovalGateBlocksAction")
                      : undefined
                  }
                >
                  {isApproving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                      {t("settings.plugins.storeApproveExact")}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={onInstallOrUpdate}
                  disabled={!canInstall || isInstalling}
                  title={
                    !canInstall
                      ? t("settings.plugins.storeInstallGateBlocksAction")
                      : undefined
                  }
                >
                  {isInstalling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      {installLabel}
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                {t("settings.plugins.storeActionHint")}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PluginSourceDetail({
  source,
  onRefresh,
  onRemoveDeveloperSource,
  isRefreshing,
  isRemovingDeveloperSource,
}: {
  source: PluginSourceData
  onRefresh: () => void
  onRemoveDeveloperSource: () => void
  isRefreshing: boolean
  isRemovingDeveloperSource: boolean
}) {
  const { t } = useI18n()
  const canRemoveDeveloperSource = source.kind === "developer-local"
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                {source.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {getRuntimeLabel(source.runtime, t)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs shrink-0"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 mr-1.5",
                    isRefreshing && "animate-spin",
                  )}
                />
                {t("settings.plugins.refresh")}
              </Button>
              {canRemoveDeveloperSource ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={onRemoveDeveloperSource}
                  disabled={isRemovingDeveloperSource}
                >
                  {isRemovingDeveloperSource ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      {t("settings.plugins.removeDeveloperSource")}
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {getSourceDescriptionLabel(source.runtime, t)}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.sourceStatus")}</Label>
              <p
                className={cn(
                  "text-sm font-medium",
                  getSourceStatusClass(source.status),
                )}
              >
                {getSourceStatusLabel(source.status, t)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.sourcePluginCountLabel")}</Label>
              <p className="text-sm text-foreground">
                {t("settings.plugins.sourcePluginCount", {
                  count: source.pluginCount,
                })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.sourceKind")}</Label>
              <p className="text-sm text-foreground">
                {getSourceKindLabel(source.kind, t)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.sourceTrust")}</Label>
              <p className="text-sm text-foreground">
                {getSourceTrustLabel(source.trust, t)}
              </p>
            </div>
          </div>

          <DiagnosticsPanel diagnostics={source.diagnostics} />

          <div className="space-y-1.5">
            <Label>{t("settings.plugins.sourcePath")}</Label>
            <p className="text-sm text-foreground font-mono break-all">
              {source.path}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.plugins.sourceInstallHint")}</Label>
            <p className="text-sm text-muted-foreground">
              {getSourceInstallHintLabel(source.runtime, t)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.plugins.updateHandling")}</Label>
            <p className="text-sm text-muted-foreground">
              {t("settings.plugins.sourceUpdateGuidance")}
            </p>
          </div>

          {source.homepage && (
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.homepage")}</Label>
              <a
                href={source.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-blue-400 hover:underline break-all"
              >
                {source.homepage}
              </a>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground/70">
            {source.kind === "developer-local"
              ? t("settings.plugins.developerSourceHint")
              : t("settings.plugins.sourcesReadOnlyHint")}
          </p>
        </div>
      </div>
    </div>
  )
}

function RuntimeMarketplaceDetail({
  marketplace,
  onRefresh,
  isRefreshing,
  actionPreview,
  runtimeActionConfirmation,
  onRuntimeActionConfirmationChange,
  onPreviewRuntimeAction,
  onExecuteRuntimeAction,
  onCancelRuntimeActionPreview,
  isPreviewingRuntimeAction,
  isExecutingRuntimeAction,
}: {
  marketplace: RuntimeMarketplaceListItem
  onRefresh: () => void
  isRefreshing: boolean
  actionPreview: RuntimePluginWritePreview | null
  runtimeActionConfirmation: string
  onRuntimeActionConfirmationChange: (value: string) => void
  onPreviewRuntimeAction: (request: RuntimePluginWriteActionRequest) => void
  onExecuteRuntimeAction: () => void
  onCancelRuntimeActionPreview: () => void
  isPreviewingRuntimeAction: boolean
  isExecutingRuntimeAction: boolean
}) {
  const { t } = useI18n()
  const [marketplaceSource, setMarketplaceSource] = useState("")
  const [marketplaceScope, setMarketplaceScope] =
    useState<RuntimePluginWriteScope>("user")
  const installedCount = marketplace.plugins.filter(
    (plugin) => plugin.installed,
  ).length
  const availableCount = marketplace.plugins.length - installedCount
  const diagnostics = [
    ...marketplace.diagnostics,
    ...marketplace.snapshotDiagnostics,
  ]
  const isRuntimeReportedGroup = marketplace.id.endsWith(
    ":runtime-reported-plugins",
  )
  const canTargetExistingMarketplace =
    marketplace.targetable !== false && !isRuntimeReportedGroup
  const isRuntimeActionBusy =
    isPreviewingRuntimeAction || isExecutingRuntimeAction || isRefreshing
  const marketplaceAddAction: RuntimePluginWriteActionId =
    marketplace.runtime === "codex"
      ? "codex.marketplace.add"
      : "claude.marketplace.add"
  const marketplaceUpdateAction: RuntimePluginWriteActionId =
    marketplace.runtime === "codex"
      ? "codex.marketplace.upgrade"
      : "claude.marketplace.update"
  const marketplaceRemoveAction: RuntimePluginWriteActionId =
    marketplace.runtime === "codex"
      ? "codex.marketplace.remove"
      : "claude.marketplace.remove"
  const canExecutePreview = Boolean(
    actionPreview?.canExecute &&
      actionPreview.confirmationToken &&
      (!actionPreview.requiresTargetConfirmation ||
        runtimeActionConfirmation === actionPreview.targetLabel),
  )

  useEffect(() => {
    setMarketplaceSource("")
    setMarketplaceScope("user")
  }, [marketplace.id])

  const previewMarketplaceAdd = () => {
    if (!marketplaceSource.trim()) return
    onPreviewRuntimeAction({
      runtime: marketplace.runtime,
      action: marketplaceAddAction,
      target: {
        source: marketplaceSource.trim(),
        scope: marketplace.runtime === "claude" ? marketplaceScope : undefined,
      },
    })
  }

  const previewMarketplaceAction = (action: RuntimePluginWriteActionId) => {
    onPreviewRuntimeAction({
      runtime: marketplace.runtime,
      action,
      target: {
        marketplace: marketplace.name,
        scope: marketplace.runtime === "claude" ? marketplaceScope : undefined,
      },
    })
  }

  const previewPluginAction = (
    plugin: RuntimePluginListing,
    action: RuntimePluginWriteActionId,
  ) => {
    onPreviewRuntimeAction({
      runtime: plugin.runtime,
      action,
      target: {
        pluginId: plugin.id,
        marketplace: plugin.marketplace,
        scope: plugin.runtime === "claude" ? marketplaceScope : undefined,
      },
    })
  }
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                {marketplace.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {getRuntimeLabel(marketplace.runtime, t)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs shrink-0"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5 mr-1.5",
                  isRefreshing && "animate-spin",
                )}
              />
              {t("settings.plugins.refresh")}
            </Button>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("settings.plugins.runtimeMarketplaceActionBoundaryHint")}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-border bg-background p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label>{t("settings.plugins.runtimeMarketplaceActions")}</Label>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("settings.plugins.runtimeMarketplaceActionsHint")}
                </p>
              </div>
              {canTargetExistingMarketplace ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={() =>
                    previewMarketplaceAction(marketplaceUpdateAction)
                  }
                  disabled={isRuntimeActionBusy}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  {getRuntimePluginWriteActionLabel(marketplaceUpdateAction, t)}
                </Button>
              ) : null}
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_8.5rem_auto]">
              <Input
                value={marketplaceSource}
                onChange={(event) => setMarketplaceSource(event.target.value)}
                placeholder={t(
                  "settings.plugins.runtimeMarketplaceAddSourcePlaceholder",
                )}
                className="h-8 text-xs"
              />
              {marketplace.runtime === "claude" ? (
                <Select
                  value={marketplaceScope}
                  onValueChange={(value) =>
                    setMarketplaceScope(value as RuntimePluginWriteScope)
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">user</SelectItem>
                    <SelectItem value="project">project</SelectItem>
                    <SelectItem value="local">local</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="hidden md:block" />
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={previewMarketplaceAdd}
                disabled={isRuntimeActionBusy || !marketplaceSource.trim()}
              >
                <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
                {getRuntimePluginWriteActionLabel(marketplaceAddAction, t)}
              </Button>
            </div>
            {canTargetExistingMarketplace ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    previewMarketplaceAction(marketplaceRemoveAction)
                  }
                  disabled={isRuntimeActionBusy}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  {getRuntimePluginWriteActionLabel(marketplaceRemoveAction, t)}
                </Button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {t(
                  isRuntimeReportedGroup
                    ? "settings.plugins.runtimeMarketplaceReportedPluginsActionsHint"
                    : "settings.plugins.runtimeMarketplaceEmptyActionsHint",
                )}
              </p>
            )}
            {marketplace.runtime === "codex" ? (
              <p className="text-[11px] text-muted-foreground">
                {t("settings.plugins.runtimeMarketplaceNoCodexEnableDisable")}
              </p>
            ) : null}
          </div>

          {actionPreview ? (
            <div
              className={cn(
                "rounded-md border p-3 space-y-3",
                actionPreview.canExecute
                  ? "border-border bg-background"
                  : "border-amber-500/30 bg-amber-500/10",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label>
                    {t("settings.plugins.runtimeMarketplaceActionPreview")}
                  </Label>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {actionPreview.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {actionPreview.canExecute
                      ? t("settings.plugins.runtimeMarketplacePreviewReady")
                      : (actionPreview.blockedReason ??
                        t("settings.plugins.runtimeMarketplacePreviewBlocked"))}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={onCancelRuntimeActionPreview}
                  disabled={isExecutingRuntimeAction}
                >
                  {t("settings.plugins.runtimeMarketplaceCancel")}
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>
                    {t("settings.plugins.runtimeMarketplaceCommand")}
                  </Label>
                  <p className="rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground break-all">
                    {actionPreview.commandDisplay}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t("settings.plugins.runtimeMarketplaceImpact")}
                  </Label>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {actionPreview.impact}
                  </p>
                  {actionPreview.reloadHint ? (
                    <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-200">
                      {t("settings.plugins.runtimeMarketplaceClaudeReloadHint")}
                    </p>
                  ) : null}
                </div>
              </div>
              {actionPreview.requiresTargetConfirmation ? (
                <div className="space-y-1.5">
                  <Label>
                    {t("settings.plugins.runtimeMarketplaceConfirmTarget", {
                      target: actionPreview.targetLabel,
                    })}
                  </Label>
                  <Input
                    value={runtimeActionConfirmation}
                    onChange={(event) =>
                      onRuntimeActionConfirmationChange(event.target.value)
                    }
                    placeholder={actionPreview.targetLabel}
                    className="h-8 text-xs font-mono"
                    disabled={isExecutingRuntimeAction}
                  />
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={onCancelRuntimeActionPreview}
                  disabled={isExecutingRuntimeAction}
                >
                  {t("settings.plugins.runtimeMarketplaceCancel")}
                </Button>
                <Button
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={onExecuteRuntimeAction}
                  disabled={!canExecutePreview || isExecutingRuntimeAction}
                >
                  {isExecutingRuntimeAction ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {t("settings.plugins.runtimeMarketplaceExecute")}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.runtimeMarketplaceStatus")}</Label>
              <p
                className={cn(
                  "text-sm font-medium",
                  getRuntimeMarketplaceStatusClass(marketplace.status),
                )}
              >
                {getRuntimeMarketplaceStatusLabel(marketplace.status, t)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.runtimeMarketplaceInventory")}</Label>
              <p className="text-sm text-foreground">
                {t("settings.plugins.runtimeMarketplacePluginSummary", {
                  installed: installedCount,
                  available: availableCount,
                })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.sourceTrust")}</Label>
              <p className="text-sm text-foreground">
                {getSourceTrustLabel(marketplace.trust, t)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("settings.plugins.runtimeMarketplaceSourceKind")}
              </Label>
              <p className="text-sm text-foreground">
                {t("settings.plugins.runtimeMarketplaceSourceRuntimeCli")}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.plugins.sourcePath")}</Label>
            <p className="text-sm text-foreground font-mono break-all">
              {marketplace.path ?? marketplace.source ?? "-"}
            </p>
          </div>

          {diagnostics.length > 0 ? (
            <div className="space-y-2">
              <Label>{t("settings.plugins.diagnostics")}</Label>
              <div className="space-y-1">
                {diagnostics.map((diagnostic, index) => (
                  <div
                    key={`${diagnostic.code}-${diagnostic.command ?? "runtime"}-${index}`}
                    className={cn(
                      "rounded border px-2 py-1.5 text-xs leading-relaxed",
                      diagnostic.severity === "blocked"
                        ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                        : diagnostic.severity === "warning"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                          : "border-border bg-muted/20 text-muted-foreground",
                    )}
                  >
                    <span className="font-medium">{diagnostic.code}</span>
                    <span className="mx-1">·</span>
                    <span>{diagnostic.message}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{t("settings.plugins.runtimeMarketplacePlugins")}</Label>
              <span className="text-[11px] text-muted-foreground">
                {t("settings.plugins.runtimeMarketplaceRefreshed", {
                  date: formatReviewTimestamp(marketplace.refreshedAt, t),
                })}
              </span>
            </div>
            {marketplace.plugins.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                {t("settings.plugins.runtimeMarketplaceNoPlugins")}
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-border bg-background">
                {marketplace.plugins.map((plugin) => (
                  <div
                    key={plugin.id}
                    className="border-b border-border/70 px-3 py-2 last:border-b-0"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">
                          {plugin.name}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground/70">
                          {plugin.id}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "w-fit rounded border px-1.5 py-0.5 text-[10px] font-medium",
                              getRuntimePluginListingStatusClass(plugin.status),
                            )}
                          >
                            {getRuntimePluginListingStatusLabel(
                              plugin.status,
                              t,
                            )}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {plugin.version ?? "-"}
                          </span>
                          <span
                            className="max-w-[22rem] truncate font-mono text-[10px] text-muted-foreground/70"
                            title={plugin.path ?? plugin.source}
                          >
                            {plugin.path ?? plugin.source ?? "-"}
                          </span>
                        </div>
                      </div>
                      <div className="flex max-w-[15rem] flex-wrap justify-end gap-1">
                        {getRuntimePluginWriteActions(plugin).map((action) => (
                          <Button
                            key={`${plugin.id}-${action}`}
                            variant="outline"
                            size="sm"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => previewPluginAction(plugin, action)}
                            disabled={isRuntimeActionBusy}
                          >
                            {action.includes("remove") ||
                            action.includes("uninstall") ? (
                              <Trash2 className="h-3 w-3 mr-1" />
                            ) : action.includes("disable") ? (
                              <ShieldOff className="h-3 w-3 mr-1" />
                            ) : action.includes("update") ? (
                              <RefreshCw className="h-3 w-3 mr-1" />
                            ) : (
                              <Download className="h-3 w-3 mr-1" />
                            )}
                            {getRuntimePluginWriteActionLabel(action, t)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Main Component ---
export function AgentsPluginsTab() {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<PluginViewMode>("installed")
  const [selectedPluginKey, setSelectedPluginKey] = useState<string | null>(
    null,
  )
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [selectedMarketplaceId, setSelectedMarketplaceId] = useState<
    string | null
  >(null)
  const [selectedStoreEntryId, setSelectedStoreEntryId] = useState<
    string | null
  >(null)
  const [runtimeActionPreview, setRuntimeActionPreview] =
    useState<RuntimePluginWritePreview | null>(null)
  const [runtimeActionConfirmation, setRuntimeActionConfirmation] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [runtimeFilter, setRuntimeFilter] = useState<RuntimeFilter>("all")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const setActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)

  // Focus search on "/" hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  const {
    data: plugins = [],
    isLoading,
    refetch,
  } = trpc.plugins.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })
  const {
    data: pluginSources = [],
    isLoading: isLoadingSources,
    refetch: refetchSources,
  } = trpc.plugins.sources.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })
  const {
    data: storeEntries = [],
    isLoading: isLoadingStore,
    refetch: refetchStoreCatalog,
  } = trpc.plugins.storeCatalog.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })
  const {
    data: runtimeMarketplaceSnapshots = [],
    isLoading: isLoadingRuntimeMarketplaces,
    refetch: refetchRuntimeMarketplaces,
  } = trpc.plugins.runtimeMarketplaces.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })
  const { data: safeMode = { enabled: false }, refetch: refetchSafeMode } =
    trpc.plugins.safeMode.useQuery(undefined, {
      staleTime: 5 * 60 * 1000,
    })
  const {
    data: developerMode = { enabled: false },
    refetch: refetchDeveloperMode,
  } = trpc.plugins.developerMode.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })
  const {
    data: doctorReport,
    isLoading: isLoadingDoctor,
    refetch: refetchDoctor,
  } = trpc.plugins.doctor.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })
  const {
    data: selectedStorePreview,
    isLoading: isLoadingStorePreview,
    refetch: refetchStorePreview,
  } = trpc.plugins.previewStoreCandidate.useQuery(
    selectedStoreEntryId
      ? { storeEntryId: selectedStoreEntryId }
      : { storeEntryId: "" },
    {
      enabled: viewMode === "store" && Boolean(selectedStoreEntryId),
      staleTime: 60 * 1000,
    },
  )

  // MCP server statuses for showing auth state in plugin detail
  const { data: allMcpConfig, refetch: refetchMcp } =
    trpc.claude.getAllMcpConfig.useQuery(undefined, {
      staleTime: 10 * 60 * 1000,
    })
  const mcpServerStatuses = useMemo(() => {
    const map: Record<string, McpServerStatus> = {}
    if (!allMcpConfig?.groups) return map
    for (const group of allMcpConfig.groups) {
      for (const server of group.mcpServers) {
        map[server.name] = {
          status: server.status,
          needsAuth: server.needsAuth,
        }
      }
    }
    return map
  }, [allMcpConfig])

  const startOAuthMutation = trpc.claude.startMcpOAuth.useMutation()
  const handleMcpAuth = useCallback(
    async (serverName: string) => {
      try {
        const result = await startOAuthMutation.mutateAsync({
          serverName,
          projectPath: "__global__",
        })
        if (result.success) {
          toast.success(
            t("settings.plugins.toast.authenticated", { name: serverName }),
          )
          await refetchMcp()
        } else {
          toast.error(
            result.error || t("settings.mcp.toast.authenticationFailed"),
          )
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("settings.mcp.toast.authenticationFailed"),
        )
      }
    },
    [startOAuthMutation, refetchMcp, t],
  )

  const setPluginEnabledMutation =
    trpc.claudeSettings.setPluginEnabled.useMutation()
  const setRuntimeNativeEnabledMutation =
    trpc.plugins.setRuntimeNativeEnabled.useMutation()
  const clearPluginCacheMutation = trpc.plugins.clearCache.useMutation()
  const markReviewedMutation = trpc.plugins.markReviewed.useMutation()
  const setSafeModeMutation = trpc.plugins.setSafeMode.useMutation()
  const setDeveloperModeMutation = trpc.plugins.setDeveloperMode.useMutation()
  const chooseDeveloperSourceMutation =
    trpc.plugins.chooseDeveloperSourceDirectory.useMutation()
  const removeDeveloperSourceMutation =
    trpc.plugins.removeDeveloperSource.useMutation()
  const trustDeveloperPluginMutation =
    trpc.plugins.trustDeveloperPlugin.useMutation()
  const revokeDeveloperTrustMutation =
    trpc.plugins.revokeDeveloperPluginTrust.useMutation()
  const loadDeveloperPluginMutation =
    trpc.plugins.loadDeveloperPlugin.useMutation()
  const setControlledSettingMutation =
    trpc.plugins.setControlledSetting.useMutation()
  const grantControlledActionMutation =
    trpc.plugins.grantControlledAction.useMutation()
  const invokeControlledActionMutation =
    trpc.plugins.invokeControlledAction.useMutation()
  const approveStoreCandidateMutation =
    trpc.plugins.approveStoreCandidate.useMutation()
  const installOrUpdateStoreCandidateMutation =
    trpc.plugins.installOrUpdateStoreCandidate.useMutation()
  const previewRuntimePluginWriteActionMutation =
    trpc.plugins.previewRuntimePluginWriteAction.useMutation()
  const executeRuntimePluginWriteActionMutation =
    trpc.plugins.executeRuntimePluginWriteAction.useMutation()

  const filteredPlugins = useMemo(() => {
    const runtimeFiltered =
      runtimeFilter === "all"
        ? plugins
        : plugins.filter((plugin) => plugin.runtime === runtimeFilter)

    if (!searchQuery.trim()) return runtimeFiltered
    const q = searchQuery.toLowerCase()
    // Normalize query: match both "pyright lsp" and "pyright-lsp"
    const qNoDashes = q.replace(/-/g, " ")
    const qWithDashes = q.replace(/ /g, "-")
    return runtimeFiltered.filter((p) => {
      const name = p.name.toLowerCase()
      if (
        name.includes(q) ||
        name.includes(qNoDashes) ||
        name.includes(qWithDashes)
      )
        return true
      if (p.runtime.includes(q)) return true
      if (p.source.toLowerCase().includes(q)) return true
      if (p.marketplace.toLowerCase().includes(q)) return true
      if (p.description?.toLowerCase().includes(q)) return true
      if (p.path.toLowerCase().includes(q)) return true
      if (
        p.components.commands.some(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q),
        )
      )
        return true
      if (
        p.components.skills.some(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q),
        )
      )
        return true
      if (
        p.components.agents.some(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q),
        )
      )
        return true
      if (
        p.components.hooks.some(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q),
        )
      )
        return true
      if (p.components.mcpServers.some((s) => s.toLowerCase().includes(q)))
        return true
      return false
    })
  }, [plugins, runtimeFilter, searchQuery])

  const pluginGroups = useMemo(() => {
    const groups: Array<{ id: string; label: string; plugins: PluginData[] }> =
      []
    const claudePlugins = filteredPlugins.filter(
      (plugin) => plugin.runtime === "claude",
    )
    const codexPlugins = filteredPlugins.filter(
      (plugin) => plugin.runtime === "codex",
    )
    const claudeEnabled = claudePlugins.filter((plugin) => !plugin.isDisabled)
    const claudeDisabled = claudePlugins.filter((plugin) => plugin.isDisabled)

    if (claudeEnabled.length > 0) {
      groups.push({
        id: "claude-enabled",
        label: `${getRuntimeLabel("claude", t)} · ${t("settings.plugins.enabled")}`,
        plugins: claudeEnabled,
      })
    }

    const addMarketplaceGroups = (
      runtime: PluginRuntime,
      runtimePlugins: PluginData[],
    ) => {
      const byMarketplace = new Map<string, PluginData[]>()
      for (const plugin of runtimePlugins) {
        const existing = byMarketplace.get(plugin.marketplace) || []
        existing.push(plugin)
        byMarketplace.set(plugin.marketplace, existing)
      }
      for (const [marketplace, marketplacePlugins] of Array.from(
        byMarketplace.entries(),
      ).sort(([a], [b]) => a.localeCompare(b))) {
        groups.push({
          id: `${runtime}-${marketplace}`,
          label: `${getRuntimeLabel(runtime, t)} · ${marketplace}`,
          plugins: marketplacePlugins,
        })
      }
    }

    addMarketplaceGroups("claude", claudeDisabled)
    addMarketplaceGroups("codex", codexPlugins)

    return groups
  }, [filteredPlugins, t])

  const filteredSources = useMemo(() => {
    const runtimeFiltered =
      runtimeFilter === "all"
        ? pluginSources
        : pluginSources.filter((source) => source.runtime === runtimeFilter)

    if (!searchQuery.trim()) return runtimeFiltered
    const q = searchQuery.toLowerCase()
    const qNoDashes = q.replace(/-/g, " ")
    const qWithDashes = q.replace(/ /g, "-")
    return runtimeFiltered.filter((source) => {
      const name = source.name.toLowerCase()
      if (
        name.includes(q) ||
        name.includes(qNoDashes) ||
        name.includes(qWithDashes)
      )
        return true
      if (source.runtime.includes(q)) return true
      if (source.kind.includes(q)) return true
      if (source.trust.includes(q)) return true
      if (source.status.includes(q)) return true
      if (source.description.toLowerCase().includes(q)) return true
      if (source.path.toLowerCase().includes(q)) return true
      if (source.installHint.toLowerCase().includes(q)) return true
      return false
    })
  }, [pluginSources, runtimeFilter, searchQuery])

  const runtimeMarketplaceItems = useMemo((): RuntimeMarketplaceListItem[] => {
    return runtimeMarketplaceSnapshots.flatMap((snapshot) => {
      const matchedPluginIds = new Set<string>()
      const marketplaceItems = snapshot.marketplaces.map((marketplace) => {
        const plugins = snapshot.plugins.filter(
          (plugin) =>
            plugin.marketplace === marketplace.name ||
            plugin.id.endsWith(`@${marketplace.name}`),
        )
        for (const plugin of plugins) {
          matchedPluginIds.add(plugin.id)
        }
        return {
          ...marketplace,
          id: `${marketplace.runtime}:${marketplace.name}`,
          pluginCount: marketplace.pluginCount ?? plugins.length,
          plugins,
          snapshotDiagnostics: snapshot.diagnostics,
          refreshedAt: snapshot.refreshedAt,
        }
      })
      const unmatchedPlugins = snapshot.plugins.filter(
        (plugin) => !matchedPluginIds.has(plugin.id),
      )
      if (unmatchedPlugins.length === 0) {
        if (marketplaceItems.length > 0) return marketplaceItems
        return [
          {
            runtime: snapshot.runtime,
            name: t("settings.plugins.marketplaceRuntimeEmptyTitle", {
              runtime: getRuntimeLabel(snapshot.runtime, t),
            }),
            targetable: false,
            sourceKind: "runtime-cli" as const,
            trust: "external" as const,
            status: "empty" as const,
            diagnostics: [],
            id: `${snapshot.runtime}:empty-marketplaces`,
            pluginCount: 0,
            plugins: [],
            snapshotDiagnostics: snapshot.diagnostics,
            refreshedAt: snapshot.refreshedAt,
          },
        ]
      }
      return [
        ...marketplaceItems,
        {
          runtime: snapshot.runtime,
          name: t("settings.plugins.runtimeMarketplaceReportedPlugins"),
          sourceKind: "runtime-cli" as const,
          trust: "external" as const,
          status: "available" as const,
          diagnostics: [],
          id: `${snapshot.runtime}:runtime-reported-plugins`,
          pluginCount: unmatchedPlugins.length,
          plugins: unmatchedPlugins,
          snapshotDiagnostics: snapshot.diagnostics,
          refreshedAt: snapshot.refreshedAt,
        },
      ]
    })
  }, [runtimeMarketplaceSnapshots, t])

  const filteredMarketplaces = useMemo(() => {
    const runtimeFiltered =
      runtimeFilter === "all"
        ? runtimeMarketplaceItems
        : runtimeMarketplaceItems.filter(
            (marketplace) => marketplace.runtime === runtimeFilter,
          )

    if (!searchQuery.trim()) return runtimeFiltered
    const q = searchQuery.toLowerCase()
    const qNoDashes = q.replace(/-/g, " ")
    const qWithDashes = q.replace(/ /g, "-")
    return runtimeFiltered.filter((marketplace) => {
      const name = marketplace.name.toLowerCase()
      if (
        name.includes(q) ||
        name.includes(qNoDashes) ||
        name.includes(qWithDashes)
      )
        return true
      if (marketplace.runtime.includes(q)) return true
      if (marketplace.status.includes(q)) return true
      if (marketplace.trust.includes(q)) return true
      if (marketplace.source?.toLowerCase().includes(q)) return true
      if (marketplace.path?.toLowerCase().includes(q)) return true
      if (
        marketplace.plugins.some(
          (plugin) =>
            plugin.name.toLowerCase().includes(q) ||
            plugin.id.toLowerCase().includes(q) ||
            plugin.version?.toLowerCase().includes(q) ||
            plugin.path?.toLowerCase().includes(q) ||
            plugin.source?.toLowerCase().includes(q),
        )
      )
        return true
      return false
    })
  }, [runtimeMarketplaceItems, runtimeFilter, searchQuery])

  const sourceGroups = useMemo(() => {
    const groups: Array<{
      id: string
      label: string
      sources: PluginSourceData[]
    }> = []
    for (const runtime of ["claude", "codex"] as const) {
      const runtimeSources = filteredSources.filter(
        (source) => source.runtime === runtime,
      )
      if (runtimeSources.length === 0) continue
      groups.push({
        id: runtime,
        label: `${getRuntimeLabel(runtime, t)} · ${t("settings.plugins.sources")}`,
        sources: runtimeSources,
      })
    }
    return groups
  }, [filteredSources, t])

  const marketplaceGroups = useMemo(() => {
    const groups: Array<{
      id: string
      label: string
      marketplaces: RuntimeMarketplaceListItem[]
    }> = []
    for (const runtime of ["claude", "codex"] as const) {
      const runtimeMarketplaces = filteredMarketplaces.filter(
        (marketplace) => marketplace.runtime === runtime,
      )
      if (runtimeMarketplaces.length === 0) continue
      groups.push({
        id: runtime,
        label: `${getRuntimeLabel(runtime, t)} · ${t("settings.plugins.viewMarketplaces")}`,
        marketplaces: runtimeMarketplaces,
      })
    }
    return groups
  }, [filteredMarketplaces, t])

  const filteredStoreEntries = useMemo(() => {
    const runtimeFiltered =
      runtimeFilter === "all"
        ? storeEntries
        : storeEntries.filter((entry) => entry.runtime === runtimeFilter)

    if (!searchQuery.trim()) return runtimeFiltered
    const q = searchQuery.toLowerCase()
    const qNoDashes = q.replace(/-/g, " ")
    const qWithDashes = q.replace(/ /g, "-")
    return runtimeFiltered.filter((entry) => {
      const name = entry.name.toLowerCase()
      if (
        name.includes(q) ||
        name.includes(qNoDashes) ||
        name.includes(qWithDashes)
      )
        return true
      if (entry.id.toLowerCase().includes(q)) return true
      if (entry.runtime.includes(q)) return true
      if (entry.version.toLowerCase().includes(q)) return true
      if (entry.source.repo.toLowerCase().includes(q)) return true
      if (entry.source.commit.toLowerCase().includes(q)) return true
      if (entry.source.path?.toLowerCase().includes(q)) return true
      if (entry.package?.sha256?.toLowerCase().includes(q)) return true
      return false
    })
  }, [runtimeFilter, searchQuery, storeEntries])

  const storeGroups = useMemo(() => {
    const groups: Array<{
      id: string
      label: string
      entries: PluginStoreCatalogEntry[]
    }> = []
    for (const runtime of ["claude", "codex"] as const) {
      const runtimeEntries = filteredStoreEntries.filter(
        (entry) => entry.runtime === runtime,
      )
      if (runtimeEntries.length === 0) continue
      groups.push({
        id: runtime,
        label: `${getRuntimeLabel(runtime, t)} · ${t("settings.plugins.store")}`,
        entries: runtimeEntries,
      })
    }
    return groups
  }, [filteredStoreEntries, t])

  const allPluginKeys = useMemo(
    () => pluginGroups.flatMap((group) => group.plugins.map(getPluginKey)),
    [pluginGroups],
  )
  const allSourceIds = useMemo(
    () =>
      sourceGroups.flatMap((group) => group.sources.map((source) => source.id)),
    [sourceGroups],
  )
  const allMarketplaceIds = useMemo(
    () =>
      marketplaceGroups.flatMap((group) =>
        group.marketplaces.map((marketplace) => marketplace.id),
      ),
    [marketplaceGroups],
  )
  const allStoreEntryIds = useMemo(
    () =>
      storeGroups.flatMap((group) => group.entries.map((entry) => entry.id)),
    [storeGroups],
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items:
      viewMode === "installed"
        ? allPluginKeys
        : viewMode === "sources"
          ? allSourceIds
          : viewMode === "marketplaces"
            ? allMarketplaceIds
            : allStoreEntryIds,
    selectedItem:
      viewMode === "installed"
        ? selectedPluginKey
        : viewMode === "sources"
          ? selectedSourceId
          : viewMode === "marketplaces"
            ? selectedMarketplaceId
            : selectedStoreEntryId,
    onSelect: (id) => {
      if (viewMode === "installed") {
        setSelectedPluginKey(id)
      } else if (viewMode === "sources") {
        setSelectedSourceId(id)
      } else if (viewMode === "marketplaces") {
        setSelectedMarketplaceId(id)
      } else {
        setSelectedStoreEntryId(id)
      }
    },
  })

  const selectedPlugin =
    plugins.find((p) => getPluginKey(p) === selectedPluginKey) || null
  const selectedSource =
    pluginSources.find((source) => source.id === selectedSourceId) || null
  const selectedMarketplace =
    runtimeMarketplaceItems.find(
      (marketplace) => marketplace.id === selectedMarketplaceId,
    ) || null
  const selectedStoreEntry =
    storeEntries.find((entry) => entry.id === selectedStoreEntryId) || null
  const selectedPluginDebug = selectedPlugin
    ? doctorReport?.plugins.find(
        (debug) => debug.reviewKey === selectedPlugin.reviewKey,
      )
    : undefined
  const selectedStoreDebug = selectedStoreEntry
    ? doctorReport?.storeCandidates.find(
        (debug) => debug.storeEntryId === selectedStoreEntry.id,
      )
    : undefined

  // Auto-select first plugin in display order (enabled first, then marketplace)
  useEffect(() => {
    if (viewMode !== "installed") return
    if (selectedPlugin && filteredPlugins.includes(selectedPlugin)) return
    if (isLoading || filteredPlugins.length === 0) {
      if (selectedPluginKey && filteredPlugins.length === 0)
        setSelectedPluginKey(null)
      return
    }
    const first = pluginGroups[0]?.plugins[0]
    setSelectedPluginKey(first ? getPluginKey(first) : null)
  }, [
    filteredPlugins,
    isLoading,
    pluginGroups,
    selectedPlugin,
    selectedPluginKey,
    viewMode,
  ])

  useEffect(() => {
    if (viewMode !== "sources") return
    if (selectedSource && filteredSources.includes(selectedSource)) return
    if (isLoadingSources || filteredSources.length === 0) {
      if (selectedSourceId && filteredSources.length === 0)
        setSelectedSourceId(null)
      return
    }
    const first = sourceGroups[0]?.sources[0]
    setSelectedSourceId(first?.id ?? null)
  }, [
    filteredSources,
    isLoadingSources,
    selectedSource,
    selectedSourceId,
    sourceGroups,
    viewMode,
  ])

  useEffect(() => {
    if (viewMode !== "marketplaces") return
    if (
      selectedMarketplace &&
      filteredMarketplaces.includes(selectedMarketplace)
    )
      return
    if (isLoadingRuntimeMarketplaces || filteredMarketplaces.length === 0) {
      if (selectedMarketplaceId && filteredMarketplaces.length === 0)
        setSelectedMarketplaceId(null)
      return
    }
    const first = marketplaceGroups[0]?.marketplaces[0]
    setSelectedMarketplaceId(first?.id ?? null)
  }, [
    filteredMarketplaces,
    isLoadingRuntimeMarketplaces,
    marketplaceGroups,
    selectedMarketplace,
    selectedMarketplaceId,
    viewMode,
  ])

  useEffect(() => {
    setRuntimeActionPreview(null)
    setRuntimeActionConfirmation("")
  }, [selectedMarketplaceId])

  useEffect(() => {
    if (viewMode !== "store") return
    if (selectedStoreEntry && filteredStoreEntries.includes(selectedStoreEntry))
      return
    if (isLoadingStore || filteredStoreEntries.length === 0) {
      if (selectedStoreEntryId && filteredStoreEntries.length === 0)
        setSelectedStoreEntryId(null)
      return
    }
    const first = storeGroups[0]?.entries[0]
    setSelectedStoreEntryId(first?.id ?? null)
  }, [
    filteredStoreEntries,
    isLoadingStore,
    selectedStoreEntry,
    selectedStoreEntryId,
    storeGroups,
    viewMode,
  ])

  const approveAllMutation =
    trpc.claudeSettings.approveAllPluginMcpServers.useMutation()
  const revokeAllMutation =
    trpc.claudeSettings.revokeAllPluginMcpServers.useMutation()

  const handleMarkReviewed = useCallback(
    async (plugin: PluginData) => {
      try {
        await markReviewedMutation.mutateAsync({
          reviewKey: plugin.reviewKey,
        })
        toast.success(t("settings.plugins.toast.reviewed"), {
          description: formatPluginName(plugin.name),
        })
        await Promise.all([refetch(), refetchDoctor()])
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [markReviewedMutation, refetch, refetchDoctor, t],
  )

  const handleToggleEnabled = useCallback(
    async (plugin: PluginData, enabled: boolean) => {
      try {
        if (plugin.runtime === "codex") {
          await setRuntimeNativeEnabledMutation.mutateAsync({
            reviewKey: plugin.reviewKey,
            enabled,
          })
        } else {
          await setPluginEnabledMutation.mutateAsync({
            pluginSource: plugin.source,
            enabled,
          })
        }

        if (
          plugin.runtime === "claude" &&
          !enabled &&
          plugin.components.mcpServers.length > 0
        ) {
          await revokeAllMutation.mutateAsync({
            pluginSource: plugin.source,
          })
        }

        toast.success(
          enabled
            ? t("settings.plugins.toast.enabled")
            : t("settings.plugins.toast.disabled"),
          {
            description: formatPluginName(plugin.name),
          },
        )
        await Promise.all([refetch(), refetchDoctor(), refetchMcp()])
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [
      setPluginEnabledMutation,
      setRuntimeNativeEnabledMutation,
      revokeAllMutation,
      refetch,
      refetchDoctor,
      refetchMcp,
      t,
    ],
  )

  const handleApproveMcpServers = useCallback(
    async (plugin: PluginData) => {
      if (
        plugin.runtime !== "claude" ||
        plugin.components.mcpServers.length === 0
      )
        return
      try {
        await approveAllMutation.mutateAsync({
          pluginSource: plugin.source,
          serverNames: plugin.components.mcpServers,
        })
        toast.success(t("settings.plugins.toast.mcpApproved"), {
          description: formatPluginName(plugin.name),
        })
        await refetchMcp()
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [approveAllMutation, refetchMcp, t],
  )

  const handleGrantControlledAction = useCallback(
    async (plugin: PluginData, surface: PluginControlledUiCommandButton) => {
      try {
        await grantControlledActionMutation.mutateAsync({
          reviewKey: plugin.reviewKey,
          contributionId: surface.id,
          actionId: surface.action.id,
        })
        toast.success(t("settings.plugins.toast.controlledActionApproved"), {
          description: surface.title,
        })
        await Promise.all([refetch(), refetchDoctor()])
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [grantControlledActionMutation, refetch, refetchDoctor, t],
  )

  const handleSetControlledSetting = useCallback(
    async (
      plugin: PluginData,
      surface: PluginControlledUiSettingsSection,
      field: PluginControlledUiField,
      value: PluginControlledUiSettingValue,
    ) => {
      try {
        await setControlledSettingMutation.mutateAsync({
          reviewKey: plugin.reviewKey,
          contributionId: surface.id,
          fieldId: field.id,
          value,
        })
        await refetch()
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [refetch, setControlledSettingMutation, t],
  )

  const handleInvokeControlledAction = useCallback(
    async (plugin: PluginData, surface: PluginControlledUiCommandButton) => {
      try {
        const result = await invokeControlledActionMutation.mutateAsync({
          reviewKey: plugin.reviewKey,
          contributionId: surface.id,
          actionId: surface.action.id,
        })
        await navigator.clipboard.writeText(result.prompt)
        toast.success(t("settings.plugins.toast.controlledDraftPrepared"), {
          description: surface.title,
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [invokeControlledActionMutation, t],
  )

  const handleApproveStoreCandidate = useCallback(
    async (entry: PluginStoreCatalogEntry) => {
      try {
        await approveStoreCandidateMutation.mutateAsync({
          storeEntryId: entry.id,
        })
        toast.success(t("settings.plugins.toast.storeCandidateApproved"), {
          description: formatPluginName(entry.name),
        })
        await Promise.all([refetchStorePreview(), refetchDoctor()])
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [approveStoreCandidateMutation, refetchDoctor, refetchStorePreview, t],
  )

  const handleInstallOrUpdateStoreCandidate = useCallback(
    async (entry: PluginStoreCatalogEntry) => {
      try {
        const result = await installOrUpdateStoreCandidateMutation.mutateAsync({
          storeEntryId: entry.id,
        })
        toast.success(
          result.backup
            ? t("settings.plugins.toast.storeCandidateUpdated")
            : t("settings.plugins.toast.storeCandidateInstalled"),
          { description: formatPluginName(entry.name) },
        )
        await Promise.all([
          refetch(),
          refetchStoreCatalog(),
          refetchStorePreview(),
          refetchDoctor(),
        ])
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [
      installOrUpdateStoreCandidateMutation,
      refetch,
      refetchDoctor,
      refetchStoreCatalog,
      refetchStorePreview,
      t,
    ],
  )

  const handlePreviewRuntimePluginWriteAction = useCallback(
    async (request: RuntimePluginWriteActionRequest) => {
      try {
        const preview =
          await previewRuntimePluginWriteActionMutation.mutateAsync(request)
        setRuntimeActionPreview(preview)
        setRuntimeActionConfirmation("")
        if (!preview.canExecute) {
          toast.error(
            preview.blockedReason ??
              t("settings.plugins.runtimeMarketplacePreviewBlocked"),
            {
              description: preview.label,
            },
          )
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [previewRuntimePluginWriteActionMutation, t],
  )

  const handleExecuteRuntimePluginWriteAction = useCallback(async () => {
    if (!runtimeActionPreview?.confirmationToken) return
    try {
      const result = await executeRuntimePluginWriteActionMutation.mutateAsync({
        previewId: runtimeActionPreview.previewId,
        confirmationToken: runtimeActionPreview.confirmationToken,
        targetConfirmation: runtimeActionPreview.requiresTargetConfirmation
          ? runtimeActionConfirmation
          : undefined,
      })
      if (result.status !== "success") {
        toast.error(
          result.diagnostics[0]?.message ??
            t("settings.plugins.runtimeMarketplaceActionFailed"),
          {
            description: result.preview.label,
          },
        )
        return
      }
      toast.success(t("settings.plugins.runtimeMarketplaceActionSucceeded"), {
        description: result.preview.label,
      })
      if (result.preview.reloadHint) {
        toast.success(t("settings.plugins.runtimeMarketplaceClaudeReloadHint"))
      }
      setRuntimeActionPreview(null)
      setRuntimeActionConfirmation("")
      await Promise.all([
        refetch(),
        refetchSources(),
        refetchRuntimeMarketplaces(),
        refetchDoctor(),
      ])
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("settings.plugins.runtimeMarketplaceActionFailed")
      toast.error(message)
    }
  }, [
    executeRuntimePluginWriteActionMutation,
    refetch,
    refetchDoctor,
    refetchRuntimeMarketplaces,
    refetchSources,
    runtimeActionConfirmation,
    runtimeActionPreview,
    t,
  ])

  const handleRefreshPlugins = useCallback(async () => {
    try {
      await clearPluginCacheMutation.mutateAsync()
      await Promise.all([
        refetch(),
        refetchSources(),
        refetchRuntimeMarketplaces(),
        refetchStoreCatalog(),
        selectedStoreEntryId ? refetchStorePreview() : Promise.resolve(),
        refetchDoctor(),
      ])
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("settings.plugins.toast.failedToUpdate")
      toast.error(message)
    }
  }, [
    clearPluginCacheMutation,
    refetch,
    refetchSources,
    refetchRuntimeMarketplaces,
    refetchStoreCatalog,
    refetchStorePreview,
    refetchDoctor,
    selectedStoreEntryId,
    t,
  ])

  const handleToggleSafeMode = useCallback(
    async (enabled: boolean) => {
      try {
        await setSafeModeMutation.mutateAsync({ enabled })
        toast.success(
          enabled
            ? t("settings.plugins.toast.safeModeEnabled")
            : t("settings.plugins.toast.safeModeDisabled"),
        )
        await Promise.all([
          refetchSafeMode(),
          refetch(),
          refetchDoctor(),
          refetchMcp(),
        ])
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [
      setSafeModeMutation,
      refetchSafeMode,
      refetch,
      refetchDoctor,
      refetchMcp,
      t,
    ],
  )

  const handleToggleDeveloperMode = useCallback(
    async (enabled: boolean) => {
      try {
        await setDeveloperModeMutation.mutateAsync({ enabled })
        toast.success(
          enabled
            ? t("settings.plugins.toast.developerModeEnabled")
            : t("settings.plugins.toast.developerModeDisabled"),
        )
        await Promise.all([refetchDeveloperMode(), refetch(), refetchDoctor()])
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [setDeveloperModeMutation, refetchDeveloperMode, refetch, refetchDoctor, t],
  )

  const handleChooseDeveloperSource = useCallback(async () => {
    try {
      const source = await chooseDeveloperSourceMutation.mutateAsync()
      if (!source) return
      toast.success(t("settings.plugins.toast.developerSourceAdded"))
      await Promise.all([refetchSources(), refetch(), refetchDoctor()])
      setViewMode("sources")
      setSelectedSourceId(source.id)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("settings.plugins.toast.failedToUpdate")
      toast.error(message)
    }
  }, [chooseDeveloperSourceMutation, refetchSources, refetch, refetchDoctor, t])

  const handleRemoveDeveloperSource = useCallback(
    async (source: PluginSourceData) => {
      if (source.kind !== "developer-local") return
      const confirmed = window.confirm(
        t("settings.plugins.confirmRemoveDeveloperSource", {
          name: source.name,
        }),
      )
      if (!confirmed) return
      try {
        await removeDeveloperSourceMutation.mutateAsync({ id: source.id })
        toast.success(t("settings.plugins.toast.developerSourceRemoved"))
        await Promise.all([refetchSources(), refetch(), refetchDoctor()])
        setSelectedSourceId(null)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [removeDeveloperSourceMutation, refetchSources, refetch, refetchDoctor, t],
  )

  const handleTrustDeveloperPlugin = useCallback(
    async (plugin: PluginData) => {
      try {
        await trustDeveloperPluginMutation.mutateAsync({
          reviewKey: plugin.reviewKey,
        })
        toast.success(t("settings.plugins.toast.developerTrusted"), {
          description: formatPluginName(plugin.name),
        })
        await Promise.all([refetch(), refetchDoctor()])
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [trustDeveloperPluginMutation, refetch, refetchDoctor, t],
  )

  const handleRevokeDeveloperTrust = useCallback(
    async (plugin: PluginData) => {
      const confirmed = window.confirm(
        t("settings.plugins.confirmRevokeDeveloperTrust", {
          name: formatPluginName(plugin.name),
        }),
      )
      if (!confirmed) return
      try {
        await revokeDeveloperTrustMutation.mutateAsync({
          reviewKey: plugin.reviewKey,
        })
        toast.success(t("settings.plugins.toast.developerTrustRevoked"), {
          description: formatPluginName(plugin.name),
        })
        await Promise.all([refetch(), refetchDoctor()])
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [revokeDeveloperTrustMutation, refetch, refetchDoctor, t],
  )

  const handleLoadDeveloperPlugin = useCallback(
    async (plugin: PluginData) => {
      try {
        const result = await loadDeveloperPluginMutation.mutateAsync({
          reviewKey: plugin.reviewKey,
        })
        if (result.status === "loaded") {
          toast.success(t("settings.plugins.toast.developerPluginLoaded"), {
            description: formatPluginName(plugin.name),
          })
        } else {
          toast.error(
            result.errorMessage ??
              t("settings.plugins.toast.developerPluginBlocked"),
            {
              description: formatPluginName(plugin.name),
            },
          )
        }
        await Promise.all([refetch(), refetchDoctor()])
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.plugins.toast.failedToUpdate")
        toast.error(message)
      }
    },
    [loadDeveloperPluginMutation, refetch, refetchDoctor, t],
  )

  const isRefreshingPlugins =
    isLoading ||
    isLoadingSources ||
    isLoadingRuntimeMarketplaces ||
    isLoadingStore ||
    clearPluginCacheMutation.isPending

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar - plugin list */}
      <ResizableSidebar
        isOpen={true}
        onClose={() => {}}
        widthAtom={settingsPluginsSidebarWidthAtom}
        minWidth={200}
        maxWidth={400}
        side="left"
        animationDuration={0}
        initialWidth={240}
        exitWidth={240}
        disableClickToClose={true}
      >
        <div
          className="flex flex-col h-full bg-background border-r overflow-hidden"
          style={{ borderRightWidth: "0.5px" }}
        >
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "h-7 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors",
                    viewMode === mode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {getViewModeLabel(mode, t)}
                </button>
              ))}
            </div>
          </div>
          <div className="px-2 pt-2 flex-shrink-0">
            <PluginSafeModeControl
              safeMode={safeMode}
              onToggle={handleToggleSafeMode}
              isToggling={setSafeModeMutation.isPending}
            />
          </div>
          <div className="px-2 pt-2 flex-shrink-0">
            <PluginDeveloperModeControl
              developerMode={developerMode}
              onToggle={handleToggleDeveloperMode}
              onChooseSource={handleChooseDeveloperSource}
              isToggling={setDeveloperModeMutation.isPending}
              isChoosingSource={chooseDeveloperSourceMutation.isPending}
            />
          </div>
          <div className="px-2 pt-2 flex-shrink-0">
            <PluginDoctorSummaryPanel
              report={doctorReport}
              isLoading={isLoadingDoctor}
            />
          </div>
          {/* Search */}
          <div className="px-2 pt-2 flex-shrink-0 flex items-center gap-1.5">
            <input
              ref={searchInputRef}
              placeholder={
                viewMode === "installed"
                  ? t("settings.plugins.searchPlaceholder")
                  : viewMode === "sources"
                    ? t("settings.plugins.searchSourcesPlaceholder")
                    : viewMode === "marketplaces"
                      ? t("settings.plugins.searchMarketplacesPlaceholder")
                      : t("settings.plugins.searchStorePlaceholder")
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={listKeyDown}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none"
            />
          </div>
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5">
              {RUNTIME_FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setRuntimeFilter(filter)}
                  className={cn(
                    "h-6 min-w-0 overflow-hidden truncate whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium leading-none transition-colors",
                    runtimeFilter === filter
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title={
                    filter === "all" ? undefined : getRuntimeLabel(filter, t)
                  }
                >
                  {getRuntimeFilterLabel(filter, t)}
                </button>
              ))}
            </div>
          </div>
          {/* Plugin/source list */}
          <div
            ref={listRef}
            role="listbox"
            onKeyDown={listKeyDown}
            tabIndex={-1}
            className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none"
          >
            {viewMode === "installed" ? (
              isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-muted-foreground">
                    {t("common.loading")}
                  </p>
                </div>
              ) : plugins.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <PluginFilledIcon className="h-8 w-8 text-border mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">
                    {t("settings.plugins.noPlugins")}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70">
                    {t("settings.plugins.installHint")}
                  </p>
                </div>
              ) : filteredPlugins.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-3">
                  <p className="text-xs font-medium text-foreground">
                    {searchQuery.trim()
                      ? t("settings.plugins.noResults")
                      : t("settings.plugins.runtimeEmptyTitle", {
                          runtime: getRuntimeFilterLabel(runtimeFilter, t),
                        })}
                  </p>
                  {!searchQuery.trim() && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {runtimeFilter === "codex"
                        ? t("settings.plugins.codexInstallHint")
                        : t("settings.plugins.claudeInstallHint")}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {pluginGroups.map((group) => (
                    <div key={group.id}>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                        {group.label}
                      </p>
                      <div className="space-y-0.5">
                        {group.plugins.map((plugin) => (
                          <PluginListItem
                            key={getPluginKey(plugin)}
                            plugin={plugin}
                            isSelected={
                              selectedPluginKey === getPluginKey(plugin)
                            }
                            onSelect={setSelectedPluginKey}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : viewMode === "sources" ? (
              isLoadingSources ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-muted-foreground">
                    {t("common.loading")}
                  </p>
                </div>
              ) : pluginSources.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <PluginFilledIcon className="h-8 w-8 text-border mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">
                    {t("settings.plugins.noSources")}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70">
                    {t("settings.plugins.sourcesEmptyDescription")}
                  </p>
                </div>
              ) : filteredSources.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-3">
                  <p className="text-xs font-medium text-foreground">
                    {searchQuery.trim()
                      ? t("settings.plugins.noResults")
                      : t("settings.plugins.sourceRuntimeEmptyTitle", {
                          runtime: getRuntimeFilterLabel(runtimeFilter, t),
                        })}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sourceGroups.map((group) => (
                    <div key={group.id}>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                        {group.label}
                      </p>
                      <div className="space-y-0.5">
                        {group.sources.map((source) => (
                          <PluginSourceListItem
                            key={source.id}
                            source={source}
                            isSelected={selectedSourceId === source.id}
                            onSelect={setSelectedSourceId}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : viewMode === "marketplaces" ? (
              isLoadingRuntimeMarketplaces ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-muted-foreground">
                    {t("common.loading")}
                  </p>
                </div>
              ) : runtimeMarketplaceItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <Terminal className="h-8 w-8 text-border mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">
                    {t("settings.plugins.noRuntimeMarketplaces")}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70">
                    {t("settings.plugins.runtimeMarketplacesEmptyDescription")}
                  </p>
                </div>
              ) : filteredMarketplaces.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-3">
                  <p className="text-xs font-medium text-foreground">
                    {searchQuery.trim()
                      ? t("settings.plugins.noResults")
                      : t("settings.plugins.marketplaceRuntimeEmptyTitle", {
                          runtime: getRuntimeFilterLabel(runtimeFilter, t),
                        })}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {marketplaceGroups.map((group) => (
                    <div key={group.id}>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                        {group.label}
                      </p>
                      <div className="space-y-0.5">
                        {group.marketplaces.map((marketplace) => (
                          <RuntimeMarketplaceListItem
                            key={marketplace.id}
                            marketplace={marketplace}
                            isSelected={
                              selectedMarketplaceId === marketplace.id
                            }
                            onSelect={setSelectedMarketplaceId}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : isLoadingStore ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-muted-foreground">
                  {t("common.loading")}
                </p>
              </div>
            ) : storeEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <PackageCheck className="h-8 w-8 text-border mb-3" />
                <p className="text-sm text-muted-foreground mb-1">
                  {t("settings.plugins.noStoreEntries")}
                </p>
                <p className="text-[11px] text-muted-foreground/70">
                  {t("settings.plugins.storeEmptyDescription")}
                </p>
              </div>
            ) : filteredStoreEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-3">
                <p className="text-xs font-medium text-foreground">
                  {searchQuery.trim()
                    ? t("settings.plugins.noResults")
                    : t("settings.plugins.storeRuntimeEmptyTitle", {
                        runtime: getRuntimeFilterLabel(runtimeFilter, t),
                      })}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {storeGroups.map((group) => (
                  <div key={group.id}>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.entries.map((entry) => (
                        <PluginStoreListItem
                          key={entry.id}
                          entry={entry}
                          isSelected={selectedStoreEntryId === entry.id}
                          onSelect={setSelectedStoreEntryId}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ResizableSidebar>

      {/* Right content - detail panel */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {viewMode === "installed" ? (
          selectedPlugin ? (
            <PluginDetail
              plugin={selectedPlugin}
              pluginDebug={selectedPluginDebug}
              onToggleEnabled={(enabled) =>
                handleToggleEnabled(selectedPlugin, enabled)
              }
              isTogglingEnabled={
                setPluginEnabledMutation.isPending ||
                setRuntimeNativeEnabledMutation.isPending
              }
              onApproveMcpServers={() =>
                handleApproveMcpServers(selectedPlugin)
              }
              isApprovingMcpServers={approveAllMutation.isPending}
              onNavigateToTab={setActiveTab}
              mcpServerStatuses={mcpServerStatuses}
              onMcpAuth={handleMcpAuth}
              isAuthenticating={startOAuthMutation.isPending}
              onMarkReviewed={() => handleMarkReviewed(selectedPlugin)}
              isMarkingReviewed={markReviewedMutation.isPending}
              onSetControlledSetting={(surface, field, value) =>
                handleSetControlledSetting(
                  selectedPlugin,
                  surface,
                  field,
                  value,
                )
              }
              onGrantControlledAction={(surface) =>
                handleGrantControlledAction(selectedPlugin, surface)
              }
              onInvokeControlledAction={(surface) =>
                handleInvokeControlledAction(selectedPlugin, surface)
              }
              isSavingControlledSetting={setControlledSettingMutation.isPending}
              isGrantingControlledAction={
                grantControlledActionMutation.isPending
              }
              isInvokingControlledAction={
                invokeControlledActionMutation.isPending
              }
              onTrustDeveloperPlugin={() =>
                handleTrustDeveloperPlugin(selectedPlugin)
              }
              onRevokeDeveloperTrust={() =>
                handleRevokeDeveloperTrust(selectedPlugin)
              }
              onLoadDeveloperPlugin={() =>
                handleLoadDeveloperPlugin(selectedPlugin)
              }
              isTrustingDeveloperPlugin={trustDeveloperPluginMutation.isPending}
              isRevokingDeveloperTrust={revokeDeveloperTrustMutation.isPending}
              isLoadingDeveloperPlugin={loadDeveloperPluginMutation.isPending}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <PluginFilledIcon className="h-12 w-12 text-border mb-4" />
              <p className="text-sm font-medium text-foreground">
                {plugins.length > 0
                  ? t("settings.plugins.selectToView")
                  : t("settings.plugins.noneInstalled")}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-sm">
                {plugins.length === 0
                  ? t("settings.plugins.emptyDescription")
                  : t("settings.plugins.runtimeDescription")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 h-7 px-2 text-xs"
                onClick={() => {
                  void handleRefreshPlugins()
                }}
                disabled={isRefreshingPlugins}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 mr-1.5",
                    isRefreshingPlugins && "animate-spin",
                  )}
                />
                {t("settings.plugins.refresh")}
              </Button>
            </div>
          )
        ) : viewMode === "sources" ? (
          selectedSource ? (
            <PluginSourceDetail
              source={selectedSource}
              onRefresh={() => {
                void handleRefreshPlugins()
              }}
              onRemoveDeveloperSource={() =>
                handleRemoveDeveloperSource(selectedSource)
              }
              isRefreshing={isRefreshingPlugins}
              isRemovingDeveloperSource={
                removeDeveloperSourceMutation.isPending
              }
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <PluginFilledIcon className="h-12 w-12 text-border mb-4" />
              <p className="text-sm font-medium text-foreground">
                {pluginSources.length > 0
                  ? t("settings.plugins.selectSourceToView")
                  : t("settings.plugins.noSources")}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-sm">
                {pluginSources.length === 0
                  ? t("settings.plugins.sourcesEmptyDescription")
                  : t("settings.plugins.sourcesDescription")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 h-7 px-2 text-xs"
                onClick={() => {
                  void handleRefreshPlugins()
                }}
                disabled={isRefreshingPlugins}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 mr-1.5",
                    isRefreshingPlugins && "animate-spin",
                  )}
                />
                {t("settings.plugins.refresh")}
              </Button>
            </div>
          )
        ) : viewMode === "marketplaces" ? (
          selectedMarketplace ? (
            <RuntimeMarketplaceDetail
              marketplace={selectedMarketplace}
              onRefresh={() => {
                void handleRefreshPlugins()
              }}
              isRefreshing={isRefreshingPlugins}
              actionPreview={runtimeActionPreview}
              runtimeActionConfirmation={runtimeActionConfirmation}
              onRuntimeActionConfirmationChange={setRuntimeActionConfirmation}
              onPreviewRuntimeAction={(request) => {
                void handlePreviewRuntimePluginWriteAction(request)
              }}
              onExecuteRuntimeAction={() => {
                void handleExecuteRuntimePluginWriteAction()
              }}
              onCancelRuntimeActionPreview={() => {
                setRuntimeActionPreview(null)
                setRuntimeActionConfirmation("")
              }}
              isPreviewingRuntimeAction={
                previewRuntimePluginWriteActionMutation.isPending
              }
              isExecutingRuntimeAction={
                executeRuntimePluginWriteActionMutation.isPending
              }
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <Terminal className="h-12 w-12 text-border mb-4" />
              <p className="text-sm font-medium text-foreground">
                {runtimeMarketplaceItems.length > 0
                  ? t("settings.plugins.selectMarketplaceToView")
                  : t("settings.plugins.noRuntimeMarketplaces")}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-sm">
                {runtimeMarketplaceItems.length === 0
                  ? t("settings.plugins.runtimeMarketplacesEmptyDescription")
                  : t("settings.plugins.runtimeMarketplacesDescription")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 h-7 px-2 text-xs"
                onClick={() => {
                  void handleRefreshPlugins()
                }}
                disabled={isRefreshingPlugins}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 mr-1.5",
                    isRefreshingPlugins && "animate-spin",
                  )}
                />
                {t("settings.plugins.refresh")}
              </Button>
            </div>
          )
        ) : selectedStoreEntry ? (
          <PluginStoreCandidateDetail
            entry={selectedStoreEntry}
            preview={selectedStorePreview}
            debug={selectedStoreDebug}
            isLoadingPreview={isLoadingStorePreview}
            onApprove={() => handleApproveStoreCandidate(selectedStoreEntry)}
            onInstallOrUpdate={() =>
              handleInstallOrUpdateStoreCandidate(selectedStoreEntry)
            }
            isApproving={approveStoreCandidateMutation.isPending}
            isInstalling={installOrUpdateStoreCandidateMutation.isPending}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <PackageCheck className="h-12 w-12 text-border mb-4" />
            <p className="text-sm font-medium text-foreground">
              {storeEntries.length > 0
                ? t("settings.plugins.selectStoreToView")
                : t("settings.plugins.noStoreEntries")}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-2 max-w-sm">
              {storeEntries.length === 0
                ? t("settings.plugins.storeEmptyDescription")
                : t("settings.plugins.storeDescription")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 h-7 px-2 text-xs"
              onClick={() => {
                void handleRefreshPlugins()
              }}
              disabled={isRefreshingPlugins}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5 mr-1.5",
                  isRefreshingPlugins && "animate-spin",
                )}
              />
              {t("settings.plugins.refresh")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
