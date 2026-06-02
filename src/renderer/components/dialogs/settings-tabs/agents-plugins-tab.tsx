import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useSetAtom } from "jotai"
import { useListKeyboardNav } from "./use-list-keyboard-nav"
import { settingsPluginsSidebarWidthAtom } from "../../../features/agents/atoms"
import { agentsSettingsDialogActiveTabAtom, type SettingsTab } from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { useI18n } from "../../../lib/i18n"
import { Terminal, ChevronRight, Loader2, RefreshCw, ShieldCheck, FileCheck2, ShieldAlert } from "lucide-react"
import { PluginFilledIcon, SkillIconFilled, CustomAgentIconFilled, OriginalMCPIcon } from "../../ui/icons"
import { Button } from "../../ui/button"
import { Label } from "../../ui/label"
import { Switch } from "../../ui/switch"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import { toast } from "sonner"

/** Format plugin name: "pyright-lsp" → "Pyright Lsp" */
function formatPluginName(name: string): string {
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

interface PluginComponent {
  name: string
  description?: string
}

type PluginRuntime = "claude" | "codex"
type RuntimeFilter = "all" | PluginRuntime
type PluginViewMode = "installed" | "sources"
type PluginSourceKind = "local-marketplace" | "cache"
type PluginSourceTrust = "official" | "local" | "external"
type PluginSourceStatus = "available" | "empty" | "missing"
type PluginTargetMode = "manifest-only" | "controlled-ui" | "developer-trusted-code"
type PluginExecutionStatus = "not-run-by-locus" | "locus-controlled-planned" | "trusted-code-planned"
type PluginReviewStatus = "metadata-only" | "mcp-review-required" | "read-only-cache"
type PluginUpdatePosture = "advisory-only" | "review-before-enable"
type PluginUpdateReviewStatus = "new" | "unchanged" | "changed" | "reviewed"
type PluginSafetyGateStatus = "allowed" | "safe-mode" | "review-required" | "read-only"
type PluginSafetyGateReason =
  | "global-safe-mode"
  | "review-new"
  | "review-changed"
  | "review-unreviewed"
  | "codex-read-only-cache"
  | "no-mcp-servers"
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

interface PluginDiagnostic {
  code: PluginDiagnosticCode
  severity: PluginDiagnosticSeverity
}

interface PluginSourcePin {
  kind: "cache-version" | "lock-source-ref"
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

interface PluginSafeModeState {
  enabled: boolean
  updatedAt?: string
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
  sourcePins: PluginSourcePin[]
  diagnostics: PluginDiagnostic[]
  isDisabled: boolean
  canToggle: boolean
  components: {
    commands: PluginComponent[]
    skills: PluginComponent[]
    agents: PluginComponent[]
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

interface McpServerStatus {
  status: string
  needsAuth: boolean
}

function getPluginKey(plugin: Pick<PluginData, "reviewKey">): string {
  return plugin.reviewKey
}

function getRuntimeLabel(runtime: PluginRuntime, t: ReturnType<typeof useI18n>["t"]): string {
  return runtime === "claude"
    ? t("settings.plugins.runtimeClaude")
    : t("settings.plugins.runtimeCodex")
}

function getRuntimeFilterLabel(filter: RuntimeFilter, t: ReturnType<typeof useI18n>["t"]): string {
  if (filter === "all") return t("settings.plugins.runtimeAll")
  if (filter === "claude") return "Claude"
  return getRuntimeLabel(filter, t)
}

function getPluginStatusLabel(plugin: PluginData, t: ReturnType<typeof useI18n>["t"]): string {
  if (!plugin.canToggle) return t("settings.plugins.installed")
  return plugin.isDisabled ? t("common.disabled") : t("common.active")
}

const RUNTIME_FILTERS: RuntimeFilter[] = ["all", "claude", "codex"]
const VIEW_MODES: PluginViewMode[] = ["installed", "sources"]

function getViewModeLabel(viewMode: PluginViewMode, t: ReturnType<typeof useI18n>["t"]): string {
  return viewMode === "installed"
    ? t("settings.plugins.viewInstalled")
    : t("settings.plugins.viewSources")
}

function getSourceKindLabel(kind: PluginSourceKind, t: ReturnType<typeof useI18n>["t"]): string {
  switch (kind) {
    case "local-marketplace":
      return t("settings.plugins.sourceKindLocalMarketplace")
    case "cache":
      return t("settings.plugins.sourceKindCache")
  }
}

function getSourceTrustLabel(trust: PluginSourceTrust, t: ReturnType<typeof useI18n>["t"]): string {
  switch (trust) {
    case "official":
      return t("settings.plugins.sourceTrustOfficial")
    case "local":
      return t("settings.plugins.sourceTrustLocal")
    case "external":
      return t("settings.plugins.sourceTrustExternal")
  }
}

function getSourceStatusLabel(status: PluginSourceStatus, t: ReturnType<typeof useI18n>["t"]): string {
  switch (status) {
    case "available":
      return t("settings.plugins.sourceStatusAvailable")
    case "empty":
      return t("settings.plugins.sourceStatusEmpty")
    case "missing":
      return t("settings.plugins.sourceStatusMissing")
  }
}

function getSourceDescriptionLabel(runtime: PluginRuntime, t: ReturnType<typeof useI18n>["t"]): string {
  return runtime === "claude"
    ? t("settings.plugins.sourceDescriptionClaude")
    : t("settings.plugins.sourceDescriptionCodex")
}

function getSourceInstallHintLabel(runtime: PluginRuntime, t: ReturnType<typeof useI18n>["t"]): string {
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

function getTargetModeLabel(mode: PluginTargetMode, t: ReturnType<typeof useI18n>["t"]): string {
  switch (mode) {
    case "manifest-only":
      return t("settings.plugins.targetModeManifestOnly")
    case "controlled-ui":
      return t("settings.plugins.targetModeControlledUi")
    case "developer-trusted-code":
      return t("settings.plugins.targetModeDeveloperTrustedCode")
  }
}

function getTargetModeDescription(mode: PluginTargetMode, t: ReturnType<typeof useI18n>["t"]): string {
  switch (mode) {
    case "manifest-only":
      return t("settings.plugins.targetModeManifestOnlyDescription")
    case "controlled-ui":
      return t("settings.plugins.targetModeControlledUiDescription")
    case "developer-trusted-code":
      return t("settings.plugins.targetModeDeveloperTrustedCodeDescription")
  }
}

function getExecutionStatusLabel(status: PluginExecutionStatus, t: ReturnType<typeof useI18n>["t"]): string {
  switch (status) {
    case "not-run-by-locus":
      return t("settings.plugins.executionNotRunByLocus")
    case "locus-controlled-planned":
      return t("settings.plugins.executionLocusControlledPlanned")
    case "trusted-code-planned":
      return t("settings.plugins.executionTrustedCodePlanned")
  }
}

function getReviewStatusLabel(status: PluginReviewStatus, t: ReturnType<typeof useI18n>["t"]): string {
  switch (status) {
    case "metadata-only":
      return t("settings.plugins.reviewMetadataOnly")
    case "mcp-review-required":
      return t("settings.plugins.reviewMcpRequired")
    case "read-only-cache":
      return t("settings.plugins.reviewReadOnlyCache")
  }
}

function getUpdateReviewStatusLabel(status: PluginUpdateReviewStatus, t: ReturnType<typeof useI18n>["t"]): string {
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

function getUpdatePostureLabel(posture: PluginUpdatePosture, t: ReturnType<typeof useI18n>["t"]): string {
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

function getSafetyGateStatusLabel(status: PluginSafetyGateStatus, t: ReturnType<typeof useI18n>["t"]): string {
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

function getSafetyGateReasonLabel(reason: PluginSafetyGateReason, t: ReturnType<typeof useI18n>["t"]): string {
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

function shortFingerprint(fingerprint: string): string {
  return fingerprint ? fingerprint.slice(0, 12) : "none"
}

function formatReviewTimestamp(value: string | undefined, t: ReturnType<typeof useI18n>["t"]): string {
  if (!value) return t("settings.plugins.neverReviewed")
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function getSourcePinLabel(pin: PluginSourcePin, t: ReturnType<typeof useI18n>["t"]): string {
  switch (pin.kind) {
    case "cache-version":
      return t("settings.plugins.sourcePinCacheVersion")
    case "lock-source-ref":
      return t("settings.plugins.sourcePinLockRef")
  }
}

function getDiagnosticLabel(code: PluginDiagnosticCode, t: ReturnType<typeof useI18n>["t"]): string {
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
  }
}

function getDiagnosticClass(severity: PluginDiagnosticSeverity): string {
  return severity === "warning"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    : "border-border bg-background text-muted-foreground"
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: PluginDiagnostic[] }) {
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
              getDiagnosticClass(diagnostic.severity)
            )}
          >
            <span className={cn(
              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
              diagnostic.severity === "warning" ? "bg-amber-500" : "bg-muted-foreground/50"
            )} />
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
    <div className={cn(
      "rounded-lg border px-2.5 py-2",
      safeMode.enabled
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-border bg-background"
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert className={cn(
            "h-3.5 w-3.5 shrink-0",
            safeMode.enabled ? "text-amber-500" : "text-muted-foreground"
          )} />
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

function PluginSafetyGatePanel({ plugin }: { plugin: PluginData }) {
  const { t } = useI18n()
  const gate = plugin.safetyGate
  const visibleReasons = gate.reasons.filter((reason) => reason !== "no-mcp-servers")

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{t("settings.plugins.safetyGate")}</Label>
        <span className={cn(
          "rounded border px-1.5 py-0.5 text-[10px] font-medium",
          getSafetyGateStatusClass(gate.status),
        )}>
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
          <p className="text-[10px] uppercase text-muted-foreground">{t("settings.plugins.safetyCanEnable")}</p>
          <p className="text-xs font-medium text-foreground">
            {gate.canEnable ? t("settings.plugins.gateYes") : t("settings.plugins.gateNo")}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">{t("settings.plugins.safetyCanApproveMcp")}</p>
          <p className="text-xs font-medium text-foreground">
            {gate.canApproveMcp ? t("settings.plugins.gateYes") : t("settings.plugins.gateNo")}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">{t("settings.plugins.safetyCanUseMcp")}</p>
          <p className="text-xs font-medium text-foreground">
            {gate.canUseMcp ? t("settings.plugins.gateYes") : t("settings.plugins.gateNo")}
          </p>
        </div>
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
  const sourcePins = review.sourcePins.length > 0 ? review.sourcePins : plugin.sourcePins
  const canMarkReviewed = review.status !== "reviewed"

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Label>{t("settings.plugins.updateReview")}</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-medium",
              getUpdateReviewStatusClass(review.status)
            )}>
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
          <p className="text-muted-foreground">{t("settings.plugins.firstSeen")}</p>
          <p className="text-foreground">{formatReviewTimestamp(review.firstSeenAt, t)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">{t("settings.plugins.lastReviewed")}</p>
          <p className="text-foreground">{formatReviewTimestamp(review.lastReviewedAt, t)}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t("settings.plugins.sourcePins")}</p>
        {sourcePins.length > 0 ? (
          <div className="space-y-1">
            {sourcePins.map((pin) => (
              <div key={`${pin.kind}:${pin.value}:${pin.repo ?? ""}:${pin.path ?? ""}`} className="rounded border border-border bg-muted/20 px-2 py-1.5">
                <p className="text-[11px] text-muted-foreground">{getSourcePinLabel(pin, t)}</p>
                <p className="text-xs font-mono text-foreground break-all">{pin.value}</p>
                {(pin.repo || pin.path) && (
                  <p className="text-[11px] text-muted-foreground/70 break-all">
                    {[pin.repo, pin.path].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("settings.plugins.noSourcePins")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t("settings.plugins.changeSummary")}</p>
        {review.changes.length > 0 ? (
          <div className="space-y-1">
            {review.changes.map((change) => (
              <div key={change.field} className="grid grid-cols-[7rem_1fr] gap-2 rounded border border-border bg-muted/20 px-2 py-1.5 text-xs">
                <span className="font-medium text-foreground">{change.field}</span>
                <span className="min-w-0 text-muted-foreground break-all">
                  {change.previous ?? "none"} {"->"} {change.current ?? "none"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("settings.plugins.noReviewChanges")}</p>
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
}: {
  plugin: PluginData
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
}) {
  const { t } = useI18n()
  const componentCount =
    plugin.components.commands.length +
    plugin.components.skills.length +
    plugin.components.agents.length +
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
  const isEnableBlocked = plugin.canToggle && plugin.isDisabled && !plugin.safetyGate.canEnable

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-5">
          {/* Name & category with integrated toggle */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{formatPluginName(plugin.name)}</h3>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    plugin.canToggle && plugin.isDisabled ? "bg-muted-foreground/40" : "bg-emerald-500"
                  )} />
                  <span className={cn(
                    "text-sm font-medium",
                    plugin.canToggle && plugin.isDisabled ? "text-muted-foreground" : "text-emerald-500"
                  )}>
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
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">{plugin.category}</p>
            )}
          </div>

          {/* Description */}
          {plugin.description && (
            <p className="text-sm text-muted-foreground">{plugin.description}</p>
          )}
          <p className="text-xs text-muted-foreground/70">
            {plugin.runtime === "claude"
              ? t("settings.plugins.claudePackageHint")
              : t("settings.plugins.codexPackageHint")}
          </p>

          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                getTargetModeClass(plugin.targetMode)
              )}>
                {getTargetModeLabel(plugin.targetMode, t)}
              </span>
              <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {getExecutionStatusLabel(plugin.executionStatus, t)}
              </span>
              <span className={cn("rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium", getReviewStatusClass(plugin.reviewStatus))}>
                {getReviewStatusLabel(plugin.reviewStatus, t)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {getTargetModeDescription(plugin.targetMode, t)}
            </p>
          </div>

          <DiagnosticsPanel diagnostics={plugin.diagnostics} />
          <PluginSafetyGatePanel plugin={plugin} />

          <PluginUpdateReviewPanel
            plugin={plugin}
            onMarkReviewed={onMarkReviewed}
            isMarkingReviewed={isMarkingReviewed}
          />

          {/* Info */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.targetMode")}</Label>
              <p className="text-sm text-foreground">{getTargetModeLabel(plugin.targetMode, t)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.executionStatus")}</Label>
              <p className="text-sm text-foreground">{getExecutionStatusLabel(plugin.executionStatus, t)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.reviewStatus")}</Label>
              <p className={cn("text-sm font-medium", getReviewStatusClass(plugin.reviewStatus))}>
                {getReviewStatusLabel(plugin.reviewStatus, t)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.updatePosture")}</Label>
              <p className="text-sm text-foreground">{getUpdatePostureLabel(plugin.updatePosture, t)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.sourceTrust")}</Label>
              <p className="text-sm text-foreground">{getSourceTrustLabel(plugin.sourceTrust, t)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.runtime")}</Label>
              <p className="text-sm text-foreground">{runtimeLabel}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.capabilities")}</Label>
              <p className="text-sm text-foreground">
                {t("settings.plugins.capabilityCount", { count: componentCount })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.version")}</Label>
              <p className="text-sm text-foreground font-mono">{plugin.version}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.source")}</Label>
              <p className="text-sm text-foreground font-mono">{plugin.source}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.path")}</Label>
              <p className="text-sm text-foreground font-mono break-all">{plugin.path}</p>
            </div>
            {plugin.homepage && (
              <div className="space-y-1.5">
                <Label>{t("settings.plugins.homepage")}</Label>
                <a href={plugin.homepage} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-400 hover:underline break-all">{plugin.homepage}</a>
              </div>
            )}
            {plugin.tags && plugin.tags.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("settings.plugins.tags")}</Label>
                <div className="flex flex-wrap gap-1">
                  {plugin.tags.map((tag) => (
                    <span key={tag} className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
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
              <Label>{t("settings.plugins.commandsCount", { count: plugin.components.commands.length })}</Label>
              <div className="space-y-1">
                {plugin.components.commands.map((cmd) => (
                  <button
                    key={cmd.name}
                    disabled={!canNavigateCapabilities}
                    onClick={() => canNavigateCapabilities && onNavigateToTab("skills")}
                    className={cn(
                      "w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 transition-colors text-left group",
                      canNavigateCapabilities
                        ? "hover:bg-foreground/5 cursor-pointer"
                        : "cursor-default opacity-75"
                    )}
                  >
                    <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-medium text-foreground">/{cmd.name}</p>
                      {cmd.description && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{cmd.description}</p>
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
              <Label>{t("settings.plugins.skillsCount", { count: plugin.components.skills.length })}</Label>
              <div className="space-y-1">
                {plugin.components.skills.map((skill) => (
                  <button
                    key={skill.name}
                    disabled={!canNavigateCapabilities}
                    onClick={() => canNavigateCapabilities && onNavigateToTab("skills")}
                    className={cn(
                      "w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 transition-colors text-left group",
                      canNavigateCapabilities
                        ? "hover:bg-foreground/5 cursor-pointer"
                        : "cursor-default opacity-75"
                    )}
                  >
                    <SkillIconFilled className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-medium text-foreground">{skill.name}</p>
                      {skill.description && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{skill.description}</p>
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
              <Label>{t("settings.plugins.agentsCount", { count: plugin.components.agents.length })}</Label>
              <div className="space-y-1">
                {plugin.components.agents.map((agent) => (
                  <button
                    key={agent.name}
                    disabled={!canNavigateCapabilities}
                    onClick={() => canNavigateCapabilities && onNavigateToTab("agents")}
                    className={cn(
                      "w-full flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 transition-colors text-left group",
                      canNavigateCapabilities
                        ? "hover:bg-foreground/5 cursor-pointer"
                        : "cursor-default opacity-75"
                    )}
                  >
                    <CustomAgentIconFilled className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-medium text-foreground">{agent.name}</p>
                      {agent.description && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{agent.description}</p>
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

          {plugin.components.mcpServers.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label>{t("settings.plugins.mcpServersCount", { count: plugin.components.mcpServers.length })}</Label>
                {plugin.runtime === "claude" && plugin.components.mcpServers.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px] shrink-0"
                    disabled={!canApproveMcp || isApprovingMcpServers}
                    onClick={onApproveMcpServers}
                    title={!canApproveMcp ? t("settings.plugins.safetyGateBlocksAction") : undefined}
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
                        disabled={!canNavigateCapabilities}
                        onClick={() => canNavigateCapabilities && onNavigateToTab("mcp")}
                        className={cn(
                          "min-w-0 flex-1 text-left",
                          canNavigateCapabilities && "hover:underline"
                        )}
                      >
                        <p className="text-xs font-mono font-medium text-foreground">{serverName}</p>
                      </button>
                      {needsAuth ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-6 px-2 text-[11px] shrink-0"
                          disabled={isAuthenticating || !plugin.safetyGate.canUseMcp}
                          onClick={() => onMcpAuth(serverName)}
                          title={!plugin.safetyGate.canUseMcp ? t("settings.plugins.safetyGateBlocksAction") : undefined}
                        >
                          {isAuthenticating ? <Loader2 className="h-3 w-3 animate-spin" /> : t("settings.plugins.signIn")}
                        </Button>
                      ) : isConnected ? (
                        <span className="text-[11px] text-emerald-500 shrink-0">
                          {t("common.connected")}
                        </span>
                      ) : serverStatus ? (
                        <span className="text-[11px] text-muted-foreground shrink-0">{serverStatus.status}</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {plugin.runtime === "codex" ? t("settings.plugins.declared") : t("settings.plugins.pendingApproval")}
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
    plugin.components.mcpServers.length
  const statusLabel = plugin.safetyGate.status === "allowed"
    ? getPluginStatusLabel(plugin, t)
    : getSafetyGateStatusLabel(plugin.safetyGate.status, t)

  return (
    <button
      data-item-id={getPluginKey(plugin)}
      onClick={() => onSelect(getPluginKey(plugin))}
      className={cn(
        "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="text-sm leading-tight truncate">{formatPluginName(plugin.name)}</div>
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
          {plugin.runtime === "claude" ? "Claude" : "Codex"}
        </span>
        <span className={cn(
          "shrink-0 rounded border px-1 py-0.5 text-[9px] font-medium",
          getTargetModeClass(plugin.targetMode)
        )}>
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
        <span className={cn(
          "shrink-0",
          plugin.safetyGate.status === "allowed" && !(plugin.canToggle && plugin.isDisabled)
            ? "text-emerald-500/80"
            : "text-muted-foreground/60",
        )}>
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
      data-item-id={source.id}
      onClick={() => onSelect(source.id)}
      className={cn(
        "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
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
          {t("settings.plugins.sourcePluginCount", { count: source.pluginCount })}
        </span>
        <span className={cn("shrink-0", getSourceStatusClass(source.status))}>
          {getSourceStatusLabel(source.status, t)}
        </span>
      </div>
    </button>
  )
}

function PluginSourceDetail({
  source,
  onRefresh,
  isRefreshing,
}: {
  source: PluginSourceData
  onRefresh: () => void
  isRefreshing: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{source.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {getRuntimeLabel(source.runtime, t)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs shrink-0"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isRefreshing && "animate-spin")} />
              {t("settings.plugins.refresh")}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">{getSourceDescriptionLabel(source.runtime, t)}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.sourceStatus")}</Label>
              <p className={cn("text-sm font-medium", getSourceStatusClass(source.status))}>
                {getSourceStatusLabel(source.status, t)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.sourcePluginCountLabel")}</Label>
              <p className="text-sm text-foreground">
                {t("settings.plugins.sourcePluginCount", { count: source.pluginCount })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.sourceKind")}</Label>
              <p className="text-sm text-foreground">{getSourceKindLabel(source.kind, t)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.sourceTrust")}</Label>
              <p className="text-sm text-foreground">{getSourceTrustLabel(source.trust, t)}</p>
            </div>
          </div>

          <DiagnosticsPanel diagnostics={source.diagnostics} />

          <div className="space-y-1.5">
            <Label>{t("settings.plugins.sourcePath")}</Label>
            <p className="text-sm text-foreground font-mono break-all">{source.path}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.plugins.sourceInstallHint")}</Label>
            <p className="text-sm text-muted-foreground">{getSourceInstallHintLabel(source.runtime, t)}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.plugins.updateHandling")}</Label>
            <p className="text-sm text-muted-foreground">{t("settings.plugins.sourceUpdateGuidance")}</p>
          </div>

          {source.homepage && (
            <div className="space-y-1.5">
              <Label>{t("settings.plugins.homepage")}</Label>
              <a href={source.homepage} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-400 hover:underline break-all">
                {source.homepage}
              </a>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground/70">
            {t("settings.plugins.sourcesReadOnlyHint")}
          </p>
        </div>
      </div>
    </div>
  )
}

// --- Main Component ---
export function AgentsPluginsTab() {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<PluginViewMode>("installed")
  const [selectedPluginKey, setSelectedPluginKey] = useState<string | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
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

  const { data: plugins = [], isLoading, refetch } = trpc.plugins.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })
  const { data: pluginSources = [], isLoading: isLoadingSources, refetch: refetchSources } = trpc.plugins.sources.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })
  const { data: safeMode = { enabled: false }, refetch: refetchSafeMode } = trpc.plugins.safeMode.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })

  // MCP server statuses for showing auth state in plugin detail
  const { data: allMcpConfig, refetch: refetchMcp } = trpc.claude.getAllMcpConfig.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  })
  const mcpServerStatuses = useMemo(() => {
    const map: Record<string, McpServerStatus> = {}
    if (!allMcpConfig?.groups) return map
    for (const group of allMcpConfig.groups) {
      for (const server of group.mcpServers) {
        map[server.name] = { status: server.status, needsAuth: server.needsAuth }
      }
    }
    return map
  }, [allMcpConfig])

  const startOAuthMutation = trpc.claude.startMcpOAuth.useMutation()
  const handleMcpAuth = useCallback(async (serverName: string) => {
    try {
      const result = await startOAuthMutation.mutateAsync({
        serverName,
        projectPath: "__global__",
      })
      if (result.success) {
        toast.success(t("settings.plugins.toast.authenticated", { name: serverName }))
        await refetchMcp()
      } else {
        toast.error(result.error || t("settings.mcp.toast.authenticationFailed"))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings.mcp.toast.authenticationFailed"))
    }
  }, [startOAuthMutation, refetchMcp, t])

  const setPluginEnabledMutation = trpc.claudeSettings.setPluginEnabled.useMutation()
  const clearPluginCacheMutation = trpc.plugins.clearCache.useMutation()
  const markReviewedMutation = trpc.plugins.markReviewed.useMutation()
  const setSafeModeMutation = trpc.plugins.setSafeMode.useMutation()

  const filteredPlugins = useMemo(() => {
    const runtimeFiltered = runtimeFilter === "all"
      ? plugins
      : plugins.filter((plugin) => plugin.runtime === runtimeFilter)

    if (!searchQuery.trim()) return runtimeFiltered
    const q = searchQuery.toLowerCase()
    // Normalize query: match both "pyright lsp" and "pyright-lsp"
    const qNoDashes = q.replace(/-/g, " ")
    const qWithDashes = q.replace(/ /g, "-")
    return runtimeFiltered.filter((p) => {
      const name = p.name.toLowerCase()
      if (name.includes(q) || name.includes(qNoDashes) || name.includes(qWithDashes)) return true
      if (p.runtime.includes(q)) return true
      if (p.source.toLowerCase().includes(q)) return true
      if (p.marketplace.toLowerCase().includes(q)) return true
      if (p.description?.toLowerCase().includes(q)) return true
      if (p.path.toLowerCase().includes(q)) return true
      if (p.components.commands.some((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))) return true
      if (p.components.skills.some((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))) return true
      if (p.components.agents.some((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))) return true
      if (p.components.mcpServers.some((s) => s.toLowerCase().includes(q))) return true
      return false
    })
  }, [plugins, runtimeFilter, searchQuery])

  const pluginGroups = useMemo(() => {
    const groups: Array<{ id: string; label: string; plugins: PluginData[] }> = []
    const claudePlugins = filteredPlugins.filter((plugin) => plugin.runtime === "claude")
    const codexPlugins = filteredPlugins.filter((plugin) => plugin.runtime === "codex")
    const claudeEnabled = claudePlugins.filter((plugin) => !plugin.isDisabled)
    const claudeDisabled = claudePlugins.filter((plugin) => plugin.isDisabled)

    if (claudeEnabled.length > 0) {
      groups.push({
        id: "claude-enabled",
        label: `${getRuntimeLabel("claude", t)} · ${t("settings.plugins.enabled")}`,
        plugins: claudeEnabled,
      })
    }

    const addMarketplaceGroups = (runtime: PluginRuntime, runtimePlugins: PluginData[]) => {
      const byMarketplace = new Map<string, PluginData[]>()
      for (const plugin of runtimePlugins) {
        const existing = byMarketplace.get(plugin.marketplace) || []
        existing.push(plugin)
        byMarketplace.set(plugin.marketplace, existing)
      }
      for (const [marketplace, marketplacePlugins] of Array.from(byMarketplace.entries()).sort(([a], [b]) => a.localeCompare(b))) {
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
    const runtimeFiltered = runtimeFilter === "all"
      ? pluginSources
      : pluginSources.filter((source) => source.runtime === runtimeFilter)

    if (!searchQuery.trim()) return runtimeFiltered
    const q = searchQuery.toLowerCase()
    const qNoDashes = q.replace(/-/g, " ")
    const qWithDashes = q.replace(/ /g, "-")
    return runtimeFiltered.filter((source) => {
      const name = source.name.toLowerCase()
      if (name.includes(q) || name.includes(qNoDashes) || name.includes(qWithDashes)) return true
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

  const sourceGroups = useMemo(() => {
    const groups: Array<{ id: string; label: string; sources: PluginSourceData[] }> = []
    for (const runtime of ["claude", "codex"] as const) {
      const runtimeSources = filteredSources.filter((source) => source.runtime === runtime)
      if (runtimeSources.length === 0) continue
      groups.push({
        id: runtime,
        label: `${getRuntimeLabel(runtime, t)} · ${t("settings.plugins.sources")}`,
        sources: runtimeSources,
      })
    }
    return groups
  }, [filteredSources, t])

  const allPluginKeys = useMemo(
    () => pluginGroups.flatMap((group) => group.plugins.map(getPluginKey)),
    [pluginGroups]
  )
  const allSourceIds = useMemo(
    () => sourceGroups.flatMap((group) => group.sources.map((source) => source.id)),
    [sourceGroups]
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: viewMode === "installed" ? allPluginKeys : allSourceIds,
    selectedItem: viewMode === "installed" ? selectedPluginKey : selectedSourceId,
    onSelect: (id) => {
      if (viewMode === "installed") {
        setSelectedPluginKey(id)
      } else {
        setSelectedSourceId(id)
      }
    },
  })

  const selectedPlugin = plugins.find((p) => getPluginKey(p) === selectedPluginKey) || null
  const selectedSource = pluginSources.find((source) => source.id === selectedSourceId) || null

  // Auto-select first plugin in display order (enabled first, then marketplace)
  useEffect(() => {
    if (viewMode !== "installed") return
    if (selectedPlugin && filteredPlugins.includes(selectedPlugin)) return
    if (isLoading || filteredPlugins.length === 0) {
      if (selectedPluginKey && filteredPlugins.length === 0) setSelectedPluginKey(null)
      return
    }
    const first = pluginGroups[0]?.plugins[0]
    setSelectedPluginKey(first ? getPluginKey(first) : null)
  }, [filteredPlugins, isLoading, pluginGroups, selectedPlugin, selectedPluginKey, viewMode])

  useEffect(() => {
    if (viewMode !== "sources") return
    if (selectedSource && filteredSources.includes(selectedSource)) return
    if (isLoadingSources || filteredSources.length === 0) {
      if (selectedSourceId && filteredSources.length === 0) setSelectedSourceId(null)
      return
    }
    const first = sourceGroups[0]?.sources[0]
    setSelectedSourceId(first?.id ?? null)
  }, [filteredSources, isLoadingSources, selectedSource, selectedSourceId, sourceGroups, viewMode])

  const approveAllMutation = trpc.claudeSettings.approveAllPluginMcpServers.useMutation()
  const revokeAllMutation = trpc.claudeSettings.revokeAllPluginMcpServers.useMutation()

  const handleMarkReviewed = useCallback(async (plugin: PluginData) => {
    try {
      await markReviewedMutation.mutateAsync({
        reviewKey: plugin.reviewKey,
      })
      toast.success(t("settings.plugins.toast.reviewed"), {
        description: formatPluginName(plugin.name),
      })
      await refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.plugins.toast.failedToUpdate")
      toast.error(message)
    }
  }, [markReviewedMutation, refetch, t])

  const handleToggleEnabled = useCallback(async (plugin: PluginData, enabled: boolean) => {
    try {
      await setPluginEnabledMutation.mutateAsync({
        pluginSource: plugin.source,
        enabled,
      })

      if (!enabled && plugin.components.mcpServers.length > 0) {
        await revokeAllMutation.mutateAsync({
          pluginSource: plugin.source,
        })
      }

      toast.success(enabled ? t("settings.plugins.toast.enabled") : t("settings.plugins.toast.disabled"), {
        description: formatPluginName(plugin.name),
      })
      await Promise.all([refetch(), refetchMcp()])
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.plugins.toast.failedToUpdate")
      toast.error(message)
    }
  }, [setPluginEnabledMutation, revokeAllMutation, refetch, refetchMcp, t])

  const handleApproveMcpServers = useCallback(async (plugin: PluginData) => {
    if (plugin.runtime !== "claude" || plugin.components.mcpServers.length === 0) return
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
      const message = error instanceof Error ? error.message : t("settings.plugins.toast.failedToUpdate")
      toast.error(message)
    }
  }, [approveAllMutation, refetchMcp, t])

  const handleRefreshPlugins = useCallback(async () => {
    try {
      await clearPluginCacheMutation.mutateAsync()
      await Promise.all([refetch(), refetchSources()])
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.plugins.toast.failedToUpdate")
      toast.error(message)
    }
  }, [clearPluginCacheMutation, refetch, refetchSources, t])

  const handleToggleSafeMode = useCallback(async (enabled: boolean) => {
    try {
      await setSafeModeMutation.mutateAsync({ enabled })
      toast.success(enabled
        ? t("settings.plugins.toast.safeModeEnabled")
        : t("settings.plugins.toast.safeModeDisabled"))
      await Promise.all([refetchSafeMode(), refetch(), refetchMcp()])
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.plugins.toast.failedToUpdate")
      toast.error(message)
    }
  }, [setSafeModeMutation, refetchSafeMode, refetch, refetchMcp, t])

  const isRefreshingPlugins = isLoading || isLoadingSources || clearPluginCacheMutation.isPending

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
        <div className="flex flex-col h-full bg-background border-r overflow-hidden" style={{ borderRightWidth: "0.5px" }}>
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "h-6 rounded-md px-1.5 text-[11px] font-medium transition-colors",
                    viewMode === mode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
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
          {/* Search */}
          <div className="px-2 pt-2 flex-shrink-0 flex items-center gap-1.5">
            <input
              ref={searchInputRef}
              placeholder={viewMode === "installed"
                ? t("settings.plugins.searchPlaceholder")
                : t("settings.plugins.searchSourcesPlaceholder")}
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
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={filter === "all" ? undefined : getRuntimeLabel(filter, t)}
                >
                  {getRuntimeFilterLabel(filter, t)}
                </button>
              ))}
            </div>
          </div>
          {/* Plugin/source list */}
          <div ref={listRef} onKeyDown={listKeyDown} tabIndex={-1} className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none">
            {viewMode === "installed" ? (
              isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
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
                            isSelected={selectedPluginKey === getPluginKey(plugin)}
                            onSelect={setSelectedPluginKey}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : isLoadingSources ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
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
              onToggleEnabled={(enabled) => handleToggleEnabled(selectedPlugin, enabled)}
              isTogglingEnabled={setPluginEnabledMutation.isPending}
              onApproveMcpServers={() => handleApproveMcpServers(selectedPlugin)}
              isApprovingMcpServers={approveAllMutation.isPending}
              onNavigateToTab={setActiveTab}
              mcpServerStatuses={mcpServerStatuses}
              onMcpAuth={handleMcpAuth}
              isAuthenticating={startOAuthMutation.isPending}
              onMarkReviewed={() => handleMarkReviewed(selectedPlugin)}
              isMarkingReviewed={markReviewedMutation.isPending}
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
                onClick={() => { void handleRefreshPlugins() }}
                disabled={isRefreshingPlugins}
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isRefreshingPlugins && "animate-spin")} />
                {t("settings.plugins.refresh")}
              </Button>
            </div>
          )
        ) : selectedSource ? (
          <PluginSourceDetail
            source={selectedSource}
            onRefresh={() => { void handleRefreshPlugins() }}
            isRefreshing={isRefreshingPlugins}
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
              onClick={() => { void handleRefreshPlugins() }}
              disabled={isRefreshingPlugins}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isRefreshingPlugins && "animate-spin")} />
              {t("settings.plugins.refresh")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
