import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useListKeyboardNav } from "./use-list-keyboard-nav"
import { useAtomValue } from "jotai"
import { selectedProjectAtom, settingsSkillsSidebarWidthAtom } from "../../../features/agents/atoms"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { useI18n } from "../../../lib/i18n"
import { AlertTriangle, Download, ExternalLink, PackageSearch, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react"
import { SkillIcon, MarkdownIcon, CodeIcon } from "../../ui/icons"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select"
import { Textarea } from "../../ui/textarea"
import { Button } from "../../ui/button"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import { ChatMarkdownRenderer } from "../../chat-markdown-renderer"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "../../ui/alert-dialog"
import { toast } from "sonner"

// --- Unified Item Type ---
interface UnifiedItem {
  id: string
  kind: "skill" | "command" | "registry-skill" | "registry-collection"
  name: string
  description: string
  source: "user" | "project" | "plugin" | "registry"
  pluginName?: string
  path: string
  content: string
  argumentHint?: string
  registry?: {
    id: string
    status: string
    version: string
    installedVersion?: string
    registryId: string
    hasRollback: boolean
    statusMessage?: string
    runtimes?: Partial<Record<SkillRuntime, RegistryRuntimeState>>
  }
  collection?: {
    id: string
    registryId: string
    sourceUrl: string
    installHint?: string
    recommendedAction?: string
    runtimes?: SkillRuntime[]
    license?: string
  }
}

type SkillsViewMode = "skills" | "commands"
type SkillFilter = "all" | "installed" | "available" | "collections" | "updates"
type SkillRuntime = "claude" | "codex"

const SKILL_FILTERS: SkillFilter[] = ["all", "installed", "available", "collections", "updates"]
const SKILL_RUNTIMES: SkillRuntime[] = ["claude", "codex"]

interface RegistryRuntimeState {
  status: string
  version: string
  installedVersion?: string
  registryId: string
  hasRollback: boolean
  statusMessage?: string
}

interface ItemGroup {
  id: string
  label: string
  items: UnifiedItem[]
}

function getSourceLabel(source: UnifiedItem["source"], t: ReturnType<typeof useI18n>["t"]) {
  if (source === "registry") return t("common.registry")
  if (source === "plugin") return t("common.plugin")
  if (source === "project") return t("common.project")
  return t("common.user")
}

function getItemStatusLabel(item: UnifiedItem, t: ReturnType<typeof useI18n>["t"]) {
  if (item.kind === "command") return t("settings.skills.statusCommand")
  if (item.kind === "registry-collection") return t("settings.skills.statusCollection")
  if (item.source === "plugin") return t("common.plugin")
  if (item.source === "project") return t("common.project")

  switch (item.registry?.status) {
    case "not-installed":
      return t("settings.skills.statusAvailable")
    case "update-available":
      return t("settings.skills.statusUpdateAvailable")
    case "modified":
      return t("settings.skills.statusModified")
    case "user-owned":
      return t("settings.skills.statusUserOwned")
    case "installed":
      return t("settings.skills.statusInstalled")
    default:
      return item.kind === "registry-skill"
        ? t("settings.skills.statusAvailable")
        : t("settings.skills.statusInstalled")
  }
}

function getItemStatusClass(item: UnifiedItem) {
  if (item.kind === "command") return "bg-orange-500/10 text-orange-500"
  if (item.kind === "registry-collection") return "bg-violet-500/10 text-violet-500"
  if (item.source === "plugin") return "bg-violet-500/10 text-violet-500"
  if (item.source === "project") return "bg-blue-500/10 text-blue-500"

  switch (item.registry?.status) {
    case "not-installed":
      return "bg-muted text-muted-foreground"
    case "update-available":
    case "modified":
      return "bg-amber-500/10 text-amber-500"
    case "user-owned":
      return "bg-sky-500/10 text-sky-500"
    case "installed":
      return "bg-emerald-500/10 text-emerald-500"
    default:
      return item.kind === "registry-skill"
        ? "bg-muted text-muted-foreground"
        : "bg-emerald-500/10 text-emerald-500"
  }
}

function isEditableItem(item: UnifiedItem) {
  return item.source !== "plugin" && item.kind !== "registry-skill" && item.kind !== "registry-collection"
}

function getRuntimeLabel(runtime: SkillRuntime, t: ReturnType<typeof useI18n>["t"]) {
  return runtime === "codex" ? t("settings.skills.runtimeCodex") : t("settings.skills.runtimeClaude")
}

function getRegistryRuntimeState(item: UnifiedItem, runtime: SkillRuntime) {
  const runtimeState = item.registry?.runtimes?.[runtime]
  if (runtimeState) return runtimeState
  if (runtime === "claude" && item.registry) {
    return {
      status: item.registry.status,
      version: item.registry.version,
      installedVersion: item.registry.installedVersion,
      registryId: item.registry.registryId,
      hasRollback: item.registry.hasRollback,
      statusMessage: item.registry.statusMessage,
    }
  }
  return undefined
}

function getRegistryRuntimeStates(item: UnifiedItem) {
  return SKILL_RUNTIMES
    .map((runtime) => getRegistryRuntimeState(item, runtime))
    .filter((state): state is RegistryRuntimeState => !!state)
}

function isInstalledRuntimeStatus(status?: string) {
  return ["installed", "modified", "update-available"].includes(status || "")
}

function isAvailableRuntimeStatus(status?: string) {
  return ["not-installed", "user-owned"].includes(status || "")
}

function isUpdateRuntimeStatus(status?: string) {
  return ["update-available", "modified", "missing-source", "integrity-error"].includes(status || "")
}

function isRuntimeActionable(status?: string) {
  return ["not-installed", "user-owned", "update-available", "modified"].includes(status || "")
}

function getRuntimeStatusClass(status?: string) {
  if (status === "installed") return "bg-emerald-500/10 text-emerald-500"
  if (status === "update-available" || status === "modified") return "bg-amber-500/10 text-amber-500"
  if (status === "user-owned") return "bg-sky-500/10 text-sky-500"
  if (status === "missing-source" || status === "integrity-error") return "bg-destructive/10 text-destructive"
  return "bg-muted text-muted-foreground"
}

function isRegistryAvailableItem(item: UnifiedItem) {
  if (item.kind === "registry-collection") return false
  if (!item.registry) return false
  return getRegistryRuntimeStates(item).some((state) => isAvailableRuntimeStatus(state.status))
}

function isRegistryInstalledItem(item: UnifiedItem) {
  if (item.kind === "registry-collection") return false
  if (!item.registry) return false
  return getRegistryRuntimeStates(item).some((state) => isInstalledRuntimeStatus(state.status))
}

function isRegistryUpdateItem(item: UnifiedItem) {
  if (item.kind === "registry-collection") return false
  if (!item.registry) return false
  return getRegistryRuntimeStates(item).some((state) => isUpdateRuntimeStatus(state.status))
}

function matchesSkillFilter(item: UnifiedItem, filter: SkillFilter) {
  if (filter === "all") return true
  if (filter === "installed") {
    return (
      item.kind !== "registry-skill" &&
      item.kind !== "registry-collection"
    ) || isRegistryInstalledItem(item)
  }
  if (filter === "available") return isRegistryAvailableItem(item)
  if (filter === "collections") return item.kind === "registry-collection"
  return isRegistryUpdateItem(item)
}

function getSkillFilterLabel(filter: SkillFilter, t: ReturnType<typeof useI18n>["t"]) {
  if (filter === "installed") return t("settings.skills.filterInstalled")
  if (filter === "available") return t("settings.skills.filterAvailable")
  if (filter === "collections") return t("settings.skills.filterCollections")
  if (filter === "updates") return t("settings.skills.filterUpdates")
  return t("settings.skills.filterAll")
}

function RegistryActionButtons({
  item,
  onRegistryInstall,
  onRegistryInstallBoth,
  onRegistryRollback,
  isRegistryActionPending,
}: {
  item: UnifiedItem
  onRegistryInstall?: (item: UnifiedItem, runtime: SkillRuntime, force?: boolean) => void
  onRegistryInstallBoth?: (item: UnifiedItem) => void
  onRegistryRollback?: (item: UnifiedItem, runtime: SkillRuntime) => void
  isRegistryActionPending?: boolean
}) {
  const { t } = useI18n()

  if (!item.registry) return null

  const actionableRuntimes = SKILL_RUNTIMES.filter((runtime) =>
    isRuntimeActionable(getRegistryRuntimeState(item, runtime)?.status),
  )

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
      {actionableRuntimes.length === 2 && onRegistryInstallBoth && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRegistryInstallBoth(item)}
          disabled={isRegistryActionPending}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          {t("settings.skills.installBoth")}
        </Button>
      )}
      {SKILL_RUNTIMES.map((runtime) => {
        const runtimeState = getRegistryRuntimeState(item, runtime)
        const status = runtimeState?.status
        if (!isRuntimeActionable(status) || !onRegistryInstall) return null

        const needsForce = status === "user-owned" || status === "modified"
        const runtimeLabel = getRuntimeLabel(runtime, t)
        const actionLabel =
          status === "update-available"
            ? t("settings.skills.updateRuntime", { runtime: runtimeLabel })
            : status === "modified" || status === "user-owned"
              ? t("settings.skills.restoreRuntime", { runtime: runtimeLabel })
              : t("settings.skills.installRuntime", { runtime: runtimeLabel })

        return (
          <Button
            key={runtime}
            size="sm"
            variant={runtime === "claude" ? "default" : "outline"}
            onClick={() => {
              const force = needsForce
                ? window.confirm(
                    status === "modified"
                      ? t("settings.skills.confirmReplaceLocalChanges", {
                          id: item.registry?.id || "",
                        })
                      : t("settings.skills.confirmReplaceUserSkill", {
                          id: item.registry?.id || "",
                        }),
                  )
                : false
              if (needsForce && !force) return
              onRegistryInstall(item, runtime, force)
            }}
            disabled={isRegistryActionPending}
          >
            {status === "update-available" || status === "modified" ? (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1.5" />
            )}
            {actionLabel}
          </Button>
        )
      })}
      {SKILL_RUNTIMES.map((runtime) => {
        const runtimeState = getRegistryRuntimeState(item, runtime)
        if (!runtimeState?.hasRollback || !onRegistryRollback) return null
        return (
          <Button
            key={`${runtime}-rollback`}
            size="sm"
            variant="outline"
            onClick={() => onRegistryRollback(item, runtime)}
            disabled={isRegistryActionPending}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            {t("settings.skills.rollBackRuntime", { runtime: getRuntimeLabel(runtime, t) })}
          </Button>
        )
      })}
    </div>
  )
}

// --- Detail Panel (Editable) ---
function ItemDetail({
  item,
  onSave,
  onDelete,
  onRegistryInstall,
  onRegistryInstallBoth,
  onRegistryRollback,
  isSaving,
  isRegistryActionPending,
}: {
  item: UnifiedItem
  onSave: (data: { description: string; content: string }) => void
  onDelete?: () => void
  onRegistryInstall?: (item: UnifiedItem, runtime: SkillRuntime, force?: boolean) => void
  onRegistryInstallBoth?: (item: UnifiedItem) => void
  onRegistryRollback?: (item: UnifiedItem, runtime: SkillRuntime) => void
  isSaving: boolean
  isRegistryActionPending?: boolean
}) {
  const { t } = useI18n()
  const [description, setDescription] = useState(item.description)
  const [content, setContent] = useState(item.content)
  const [viewMode, setViewMode] = useState<"rendered" | "editor">("rendered")

  const isReadOnly = !isEditableItem(item)

  // Reset local state when item changes
  useEffect(() => {
    setDescription(item.description)
    setContent(item.content)
    setViewMode("rendered")
  }, [item.id, item.description, item.content])

  const hasChanges =
    description !== item.description ||
    content !== item.content

  const handleSave = useCallback(() => {
    if (description !== item.description || content !== item.content) {
      onSave({ description, content })
    }
  }, [description, content, item.description, item.content, onSave])

  const handleBlur = useCallback(() => {
    if (isReadOnly) return
    if (description !== item.description || content !== item.content) {
      onSave({ description, content })
    }
  }, [description, content, item.description, item.content, onSave, isReadOnly])

  const handleToggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      if (prev === "editor" && !isReadOnly) {
        // Switching from editor to preview — auto-save
        if (description !== item.description || content !== item.content) {
          onSave({ description, content })
        }
      }
      return prev === "rendered" ? "editor" : "rendered"
    })
  }, [description, content, item.description, item.content, onSave, isReadOnly])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground truncate">{item.name}</h3>
              <span className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
                getItemStatusClass(item),
              )}>
                {getItemStatusLabel(item, t)}
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                {getSourceLabel(item.source, t)}
              </span>
            </div>
            <div className="mt-2 inline-flex items-center rounded-md border border-border bg-muted/40 px-2.5 py-1">
              <code className="text-xs text-foreground">
                {item.kind === "command"
                  ? `/${item.name}`
                  : item.kind === "registry-collection"
                    ? item.name
                    : `@${item.name}`}
              </code>
            </div>
          </div>
          {item.registry && (
            <RegistryActionButtons
              item={item}
              onRegistryInstall={onRegistryInstall}
              onRegistryInstallBoth={onRegistryInstallBoth}
              onRegistryRollback={onRegistryRollback}
              isRegistryActionPending={isRegistryActionPending}
            />
          )}
          {!isReadOnly && hasChanges && (
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label>{t("settings.skills.description")}</Label>
          {isReadOnly ? (
            <p className="text-sm text-foreground px-3 py-2 bg-muted/50 border border-border rounded-lg">
              {item.description || (
                <span className="text-muted-foreground">
                  {t("settings.skills.noDescription")}
                </span>
              )}
            </p>
          ) : (
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleBlur}
              placeholder={
                item.kind === "command"
                  ? t("settings.skills.commandDescriptionPlaceholder")
                  : t("settings.skills.skillDescriptionPlaceholder")
              }
            />
          )}
        </div>

        {item.registry && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {t("settings.skills.registryManaged")}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {item.registry.registryId} · {t("settings.skills.version")} {item.registry.version}
                  {item.registry.installedVersion && item.registry.installedVersion !== item.registry.version
                    ? ` · ${t("settings.skills.installed")} ${item.registry.installedVersion}`
                    : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SKILL_RUNTIMES.map((runtime) => {
                const runtimeState = getRegistryRuntimeState(item, runtime)
                return (
                  <div
                    key={runtime}
                    className="rounded-md border border-border bg-background/60 px-2.5 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-foreground">
                        {getRuntimeLabel(runtime, t)}
                      </span>
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
                        getRuntimeStatusClass(runtimeState?.status),
                      )}>
                        {runtimeState
                          ? getItemStatusLabel({
                              ...item,
                              registry: {
                                ...item.registry!,
                                status: runtimeState.status,
                              },
                            }, t)
                          : t("settings.skills.statusAvailable")}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {runtime === "codex" ? "~/.codex/skills" : "~/.claude/skills"}
                    </p>
                  </div>
                )
              })}
            </div>
            {item.registry.statusMessage && (
              <div className="flex items-start gap-2 text-[11px] text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{item.registry.statusMessage}</span>
              </div>
            )}
          </div>
        )}

        {item.collection && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {t("settings.skills.externalCollection")}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {item.collection.recommendedAction || t("settings.skills.externalCollectionHint")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  void window.desktopApi.openExternal(item.collection!.sourceUrl)
                }}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                {t("settings.skills.openSource")}
              </Button>
            </div>
            {item.collection.runtimes && item.collection.runtimes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.collection.runtimes.map((runtime) => (
                  <span
                    key={runtime}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
                  >
                    {getRuntimeLabel(runtime, t)}
                  </span>
                ))}
              </div>
            )}
            {item.collection.installHint && (
              <div className="rounded-md border border-border bg-background/60 px-2.5 py-2">
                <p className="text-[11px] font-medium text-foreground">
                  {t("settings.skills.installGuidance")}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground whitespace-pre-wrap">
                  {item.collection.installHint}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t("settings.skills.source")}</Label>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {getSourceLabel(item.source, t)}
              </span>
              <span className="text-xs text-muted-foreground font-mono truncate">
                {item.path}
              </span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>{t("settings.skills.instructions")}</Label>
            {!isReadOnly && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleToggleViewMode}
                    className="h-6 w-6 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
                    aria-label={
                      viewMode === "rendered"
                        ? t("settings.skills.editMarkdown")
                        : t("settings.skills.previewMarkdown")
                    }
                  >
                    <div className="relative w-4 h-4">
                      <MarkdownIcon
                        className={cn(
                          "absolute inset-0 w-4 h-4 transition-[opacity,transform] duration-200 ease-out",
                          viewMode === "rendered" ? "opacity-100 scale-100" : "opacity-0 scale-75",
                        )}
                      />
                      <CodeIcon
                        className={cn(
                          "absolute inset-0 w-4 h-4 transition-[opacity,transform] duration-200 ease-out",
                          viewMode === "editor" ? "opacity-100 scale-100" : "opacity-0 scale-75",
                        )}
                      />
                    </div>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {viewMode === "rendered"
                    ? t("settings.skills.editMarkdown")
                    : t("settings.skills.previewMarkdown")}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {viewMode === "rendered" || isReadOnly ? (
            <div
              className={cn(
                "rounded-lg border border-border bg-background overflow-hidden px-4 py-3 min-h-[120px] transition-colors",
                !isReadOnly && "cursor-pointer hover:border-foreground/20",
              )}
              onClick={isReadOnly ? undefined : handleToggleViewMode}
            >
              {content ? (
                <ChatMarkdownRenderer content={content} size="sm" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("settings.skills.noInstructions")}
                </p>
              )}
            </div>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={handleBlur}
              rows={16}
              className="font-mono resize-y"
              placeholder={
                item.kind === "command"
                  ? t("settings.skills.commandPromptPlaceholder")
                  : t("settings.skills.skillInstructionsPlaceholder")
              }
              autoFocus
            />
          )}
        </div>

        {/* Delete */}
        {!isReadOnly && onDelete && (
          <div className="pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {item.kind === "command"
                ? t("settings.skills.deleteCommand")
                : t("settings.skills.deleteSkill")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Create Form ---
function CreateItemForm({
  onCreated,
  onCancel,
  isSaving,
  hasProject,
  projectName,
}: {
  onCreated: (data: { name: string; description: string; content: string; source: "user" | "project"; kind: "skill" | "command" }) => void
  onCancel: () => void
  isSaving: boolean
  hasProject: boolean
  projectName?: string
}) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [source, setSource] = useState<"user" | "project">("user")
  const [kind, setKind] = useState<"skill" | "command">("skill")

  const canSave = name.trim().length > 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {kind === "skill"
              ? t("settings.skills.newSkill")
              : t("settings.skills.newCommand")}
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={() => onCreated({ name, description, content, source, kind })} disabled={!canSave || isSaving}>
              {isSaving ? t("common.creating") : t("common.create")}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("settings.skills.type")}</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as "skill" | "command")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="skill">
                {t("settings.skills.typeSkill")}
              </SelectItem>
              <SelectItem value="command">
                {t("settings.skills.typeCommand")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("settings.skills.name")}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "skill" ? "my-skill" : "my-command"}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            {t("settings.skills.nameHint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>{t("settings.skills.description")}</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              kind === "skill"
                ? t("settings.skills.whatSkillDoes")
                : t("settings.skills.whatCommandDoes")
            }
          />
        </div>

        {hasProject && (
          <div className="space-y-1.5">
            <Label>{t("settings.skills.scope")}</Label>
            <Select value={source} onValueChange={(v) => setSource(v as "user" | "project")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">
                  {kind === "skill"
                    ? t("settings.skills.scopeUserSkill")
                    : t("settings.skills.scopeUserCommand")}
                </SelectItem>
                <SelectItem value="project">
                  {projectName
                    ? t("settings.skills.scopeProjectNamed", {
                        project: projectName,
                      })
                    : t("common.project")} ({kind === "skill" ? ".claude/skills/" : ".claude/commands/"})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t("settings.skills.instructions")}</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className="font-mono resize-y"
            placeholder={
              kind === "skill"
                ? t("settings.skills.skillInstructionsPlaceholder")
                : t("settings.skills.commandPromptPlaceholder")
            }
          />
        </div>
      </div>
    </div>
  )
}

// --- Sidebar List Item ---
function SidebarListItem({
  item,
  isSelected,
  onSelect,
}: {
  item: UnifiedItem
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()

  return (
    <button
      data-item-id={item.id}
      onClick={() => onSelect(item.id)}
      className={cn(
        "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn(
          "text-[10px] font-medium shrink-0 w-3 text-center",
          item.kind === "command"
            ? "text-orange-500/70"
            : item.kind === "registry-collection"
              ? "text-violet-500/70"
            : item.source === "registry"
              ? "text-emerald-500/70"
              : "text-blue-500/70"
        )}>
          {item.kind === "command" ? "/" : item.kind === "registry-collection" ? "#" : "@"}
        </span>
        <span className="text-sm truncate flex-1">{item.name}</span>
        <span className={cn(
          "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
          getItemStatusClass(item),
        )}>
          {getItemStatusLabel(item, t)}
        </span>
      </div>
      {item.description && (
        <div className="text-[11px] text-muted-foreground truncate mt-0.5 pl-[18px]">
          {item.description}
        </div>
      )}
      {item.registry && (
        <div className="mt-1 flex items-center gap-1 pl-[18px]">
          {SKILL_RUNTIMES.map((runtime) => {
            const runtimeState = getRegistryRuntimeState(item, runtime)
            return (
              <span
                key={runtime}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  getRuntimeStatusClass(runtimeState?.status),
                )}
              >
                {getRuntimeLabel(runtime, t)}
              </span>
            )
          })}
        </div>
      )}
      {item.collection && (
        <div className="mt-1 flex items-center gap-1 pl-[18px]">
          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
            {t("settings.skills.external")}
          </span>
          {item.collection.runtimes?.map((runtime) => (
            <span
              key={runtime}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
            >
              {getRuntimeLabel(runtime, t)}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

// --- Main Component ---
export function AgentsSkillsTab() {
  const { t } = useI18n()
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeView, setActiveView] = useState<SkillsViewMode>("skills")
  const [activeSkillFilter, setActiveSkillFilter] = useState<SkillFilter>("all")
  const [showAddForm, setShowAddForm] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  const selectedProject = useAtomValue(selectedProjectAtom)

  // Fetch skills
  const { data: skills = [], isLoading: isLoadingSkills, refetch: refetchSkills } = trpc.skills.list.useQuery(
    selectedProject?.path ? { cwd: selectedProject.path } : undefined,
  )

  // Fetch commands
  const { data: commands = [], isLoading: isLoadingCommands, refetch: refetchCommands } = trpc.commands.list.useQuery(
    selectedProject?.path ? { projectPath: selectedProject.path } : undefined,
  )

  const {
    data: claudeRegistrySkills = [],
    isLoading: isLoadingClaudeRegistry,
    refetch: refetchClaudeRegistry,
  } = trpc.skills.registryList.useQuery({ runtime: "claude" })

  const {
    data: codexRegistrySkills = [],
    isLoading: isLoadingCodexRegistry,
    refetch: refetchCodexRegistry,
  } = trpc.skills.registryList.useQuery({ runtime: "codex" })

  const {
    data: registryCollections = [],
    isLoading: isLoadingRegistryCollections,
    refetch: refetchRegistryCollections,
  } = trpc.skills.registryCollections.useQuery()

  const isLoadingRegistry = isLoadingClaudeRegistry || isLoadingCodexRegistry || isLoadingRegistryCollections
  const isLoading = isLoadingSkills || isLoadingCommands || isLoadingRegistry

  const refetchAll = useCallback(async () => {
    await Promise.all([
      refetchSkills(),
      refetchCommands(),
      refetchClaudeRegistry(),
      refetchCodexRegistry(),
      refetchRegistryCollections(),
    ])
  }, [refetchSkills, refetchCommands, refetchClaudeRegistry, refetchCodexRegistry, refetchRegistryCollections])

  // Delete confirmation dialog state
  const [deletingItem, setDeletingItem] = useState<UnifiedItem | null>(null)

  // Mutations
  const updateSkillMutation = trpc.skills.update.useMutation()
  const createSkillMutation = trpc.skills.create.useMutation()
  const deleteSkillMutation = trpc.skills.delete.useMutation()
  const installRegistrySkillMutation = trpc.skills.registryInstall.useMutation()
  const rollbackRegistrySkillMutation = trpc.skills.registryRollback.useMutation()
  const updateCommandMutation = trpc.commands.update.useMutation()
  const createCommandMutation = trpc.commands.create.useMutation()
  const deleteCommandMutation = trpc.commands.delete.useMutation()

  // Build unified items
  const allItems = useMemo<UnifiedItem[]>(() => {
    const claudeRegistryById = new Map(claudeRegistrySkills.map((skill) => [skill.id, skill]))
    const codexRegistryById = new Map(codexRegistrySkills.map((skill) => [skill.id, skill]))
    const registryIds = new Set([
      ...claudeRegistrySkills.map((skill) => skill.id),
      ...codexRegistrySkills.map((skill) => skill.id),
    ])
    const registryCatalog = Array.from(registryIds)
      .map((id) => claudeRegistryById.get(id) || codexRegistryById.get(id))
      .filter((skill): skill is NonNullable<typeof skill> => !!skill)

    const toRuntimeMeta = (
      registry: (typeof claudeRegistrySkills)[number] | (typeof codexRegistrySkills)[number] | undefined,
    ): RegistryRuntimeState | undefined => {
      if (!registry) return undefined
      return {
        status: registry.status,
        version: registry.version,
        installedVersion: registry.installedVersion,
        registryId: registry.registryId,
        hasRollback: registry.hasRollback,
        statusMessage: registry.statusMessage,
      }
    }

    const toRegistryMeta = (registryId?: string) => {
      if (!registryId) return undefined
      const registry = claudeRegistryById.get(registryId) || codexRegistryById.get(registryId)
      if (!registry) return undefined
      const claudeRuntime = toRuntimeMeta(claudeRegistryById.get(registryId))
      const codexRuntime = toRuntimeMeta(codexRegistryById.get(registryId))
      return {
        id: registry.id,
        status: claudeRuntime?.status || registry.status,
        version: registry.version,
        installedVersion: claudeRuntime?.installedVersion || registry.installedVersion,
        registryId: registry.registryId,
        hasRollback: !!claudeRuntime?.hasRollback,
        statusMessage: claudeRuntime?.statusMessage || registry.statusMessage,
        runtimes: {
          claude: claudeRuntime,
          codex: codexRuntime,
        },
      }
    }

    const skillItems: UnifiedItem[] = skills.map((s) => {
      const registryCandidate = s.registry
        ? claudeRegistryById.get(s.registry.id) || codexRegistryById.get(s.registry.id)
        : claudeRegistryById.get(s.name) || codexRegistryById.get(s.name)
      const linkedRegistry = s.registry
        ? toRegistryMeta(s.registry.id)
        : registryCandidate && registryCandidate.status !== "not-installed"
          ? toRegistryMeta(registryCandidate.id)
          : undefined

      return {
        id: `skill:${s.source}:${s.pluginName || ""}:${linkedRegistry?.id || s.name}`,
        kind: "skill" as const,
        name: s.name,
        description: s.description,
        source: s.source,
        pluginName: s.pluginName,
        path: s.path,
        content: s.content,
        registry: linkedRegistry,
      }
    })
    const cmdItems: UnifiedItem[] = commands.map((c) => ({
      id: `cmd:${c.source}:${c.pluginName || ""}:${c.name}`,
      kind: "command" as const,
      name: c.name,
      description: c.description,
      source: c.source,
      pluginName: c.pluginName,
      path: c.path,
      content: c.content,
      argumentHint: c.argumentHint,
    }))
    const installedRegistryIds = new Set(
      skillItems
        .map((item) => item.registry?.id)
        .filter((id): id is string => !!id),
    )
    const registryItems: UnifiedItem[] = registryCatalog
      .filter((skill) => !installedRegistryIds.has(skill.id))
      .map((skill) => ({
        id: `registry:${skill.id}`,
        kind: "registry-skill" as const,
        name: skill.displayName || skill.id,
        description: skill.description,
        source: "registry" as const,
        path: `registry:${skill.id}`,
        content: [
          `# ${skill.displayName || skill.id}`,
          "",
          skill.description || t("settings.skills.noDescriptionSentence"),
          "",
          `${t("settings.skills.version")}: ${skill.version}`,
          `${t("settings.skills.status")}: ${skill.status}`,
        ].join("\n"),
        registry: {
          id: skill.id,
          status: claudeRegistryById.get(skill.id)?.status || skill.status,
          version: skill.version,
          installedVersion: claudeRegistryById.get(skill.id)?.installedVersion || skill.installedVersion,
          registryId: skill.registryId,
          hasRollback: !!claudeRegistryById.get(skill.id)?.hasRollback,
          statusMessage: claudeRegistryById.get(skill.id)?.statusMessage || skill.statusMessage,
          runtimes: {
            claude: toRuntimeMeta(claudeRegistryById.get(skill.id)),
            codex: toRuntimeMeta(codexRegistryById.get(skill.id)),
          },
        },
      }))

    const collectionItems: UnifiedItem[] = registryCollections.map((collection) => ({
      id: `collection:${collection.id}`,
      kind: "registry-collection" as const,
      name: collection.displayName || collection.id,
      description: collection.description,
      source: "registry" as const,
      path: collection.sourceUrl,
      content: [
        `# ${collection.displayName || collection.id}`,
        "",
        collection.description || t("settings.skills.noDescriptionSentence"),
        "",
        collection.recommendedAction
          ? `**${t("settings.skills.recommendation")}**: ${collection.recommendedAction}`
          : "",
        collection.installHint
          ? `**${t("settings.skills.installGuidance")}**: ${collection.installHint}`
          : "",
        `${t("settings.skills.source")}: ${collection.sourceUrl}`,
      ].filter(Boolean).join("\n\n"),
      collection: {
        id: collection.id,
        registryId: collection.registryId,
        sourceUrl: collection.sourceUrl,
        installHint: collection.installHint,
        recommendedAction: collection.recommendedAction,
        runtimes: collection.runtimes,
        license: collection.license,
      },
    }))

    return [...skillItems, ...cmdItems, ...registryItems, ...collectionItems]
  }, [skills, commands, claudeRegistrySkills, codexRegistrySkills, registryCollections, t])

  // Filter by search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems
    const q = searchQuery.toLowerCase()
    return allItems.filter((i) =>
      i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    )
  }, [allItems, searchQuery])

  const visibleGroups = useMemo<ItemGroup[]>(() => {
    if (activeView === "commands") {
      const commandItems = filteredItems.filter((item) => item.kind === "command")
      return [
        {
          id: "user-commands",
          label: t("common.user"),
          items: commandItems.filter((item) => item.source === "user"),
        },
        {
          id: "project-commands",
          label: t("common.project"),
          items: commandItems.filter((item) => item.source === "project"),
        },
        {
          id: "plugin-commands",
          label: t("common.plugin"),
          items: commandItems.filter((item) => item.source === "plugin"),
        },
      ].filter((group) => group.items.length > 0)
    }

    const skillItems = filteredItems.filter((item) => item.kind !== "command")
    if (activeSkillFilter !== "all") {
      return [
        {
          id: `skills-${activeSkillFilter}`,
          label: getSkillFilterLabel(activeSkillFilter, t),
          items: skillItems.filter((item) => matchesSkillFilter(item, activeSkillFilter)),
        },
      ].filter((group) => group.items.length > 0)
    }

    return [
      {
        id: "installed",
        label: t("settings.skills.groupInstalled"),
        items: skillItems.filter(
          (item) =>
            (
              item.kind !== "registry-skill" &&
              item.kind !== "registry-collection" &&
              (item.source === "user" || item.source === "registry")
            ) ||
            isRegistryInstalledItem(item),
        ),
      },
      {
        id: "available",
        label: t("settings.skills.groupAvailable"),
        items: skillItems.filter(
          (item) =>
            item.kind === "registry-skill" && !isRegistryInstalledItem(item),
        ),
      },
      {
        id: "collections",
        label: t("settings.skills.groupCollections"),
        items: skillItems.filter((item) => item.kind === "registry-collection"),
      },
      {
        id: "project",
        label: t("common.project"),
        items: skillItems.filter((item) => item.source === "project"),
      },
      {
        id: "plugin",
        label: t("common.plugin"),
        items: skillItems.filter((item) => item.source === "plugin"),
      },
    ].filter((group) => group.items.length > 0)
  }, [activeView, activeSkillFilter, filteredItems, t])

  const visibleItems = useMemo(
    () => visibleGroups.flatMap((group) => group.items),
    [visibleGroups],
  )

  const visibleItemIds = useMemo(
    () => visibleItems.map((i) => i.id),
    [visibleItems],
  )

  const skillFilterCounts = useMemo<Record<SkillFilter, number>>(() => {
    const skillItems = allItems.filter((item) => item.kind !== "command")
    return {
      all: skillItems.length,
      installed: skillItems.filter((item) => matchesSkillFilter(item, "installed")).length,
      available: skillItems.filter((item) => matchesSkillFilter(item, "available")).length,
      collections: skillItems.filter((item) => matchesSkillFilter(item, "collections")).length,
      updates: skillItems.filter((item) => matchesSkillFilter(item, "updates")).length,
    }
  }, [allItems])

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: visibleItemIds,
    selectedItem: selectedItemId,
    onSelect: setSelectedItemId,
  })

  const selectedItem = allItems.find((i) => i.id === selectedItemId) || null

  // Auto-select first item when data loads
  useEffect(() => {
    if (isLoading) return
    if (visibleItemIds.length === 0) {
      if (selectedItemId) setSelectedItemId(null)
      return
    }
    if (!selectedItemId || !visibleItemIds.includes(selectedItemId)) {
      setSelectedItemId(visibleItemIds[0]!)
    }
  }, [visibleItemIds, selectedItemId, isLoading])

  const handleCreate = useCallback(async (data: {
    name: string; description: string; content: string; source: "user" | "project"; kind: "skill" | "command"
  }) => {
    try {
      if (data.kind === "skill") {
        const result = await createSkillMutation.mutateAsync({
          name: data.name,
          description: data.description,
          content: data.content,
          source: data.source,
          cwd: selectedProject?.path,
        })
        toast.success(t("settings.skills.toast.skillCreated"), { description: result.name })
        setShowAddForm(false)
        await refetchAll()
        setSelectedItemId(`skill:${data.source}::${result.name}`)
      } else {
        const result = await createCommandMutation.mutateAsync({
          name: data.name,
          description: data.description,
          content: data.content,
          source: data.source,
          projectPath: selectedProject?.path,
        })
        toast.success(t("settings.skills.toast.commandCreated"), { description: result.name })
        setShowAddForm(false)
        await refetchAll()
        setSelectedItemId(`cmd:${data.source}::${result.name}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.skills.toast.failedToCreate")
      toast.error(t("settings.skills.toast.failedToCreate"), { description: message })
    }
  }, [createSkillMutation, createCommandMutation, selectedProject?.path, refetchAll, t])

  const handleSave = useCallback(async (
    item: UnifiedItem,
    data: { description: string; content: string },
  ) => {
    try {
      if (item.kind === "skill") {
        await updateSkillMutation.mutateAsync({
          path: item.path,
          name: item.name,
          description: data.description,
          content: data.content,
          cwd: selectedProject?.path,
        })
      } else {
        await updateCommandMutation.mutateAsync({
          path: item.path,
          name: item.name,
          description: data.description,
          content: data.content,
          argumentHint: item.argumentHint,
          projectPath: selectedProject?.path,
        })
      }
      toast.success(
        item.kind === "skill"
          ? t("settings.skills.toast.skillSaved")
          : t("settings.skills.toast.commandSaved"),
        { description: item.name },
      )
      await refetchAll()
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.skills.toast.failedToSave")
      toast.error(t("settings.skills.toast.failedToSave"), { description: message })
    }
  }, [updateSkillMutation, updateCommandMutation, selectedProject?.path, refetchAll, t])

  const handleDelete = useCallback(async () => {
    if (!deletingItem) return
    try {
      if (deletingItem.kind === "skill") {
        await deleteSkillMutation.mutateAsync({
          path: deletingItem.path,
          cwd: selectedProject?.path,
        })
      } else {
        await deleteCommandMutation.mutateAsync({
          path: deletingItem.path,
          projectPath: selectedProject?.path,
        })
      }
      toast.success(
        deletingItem.kind === "skill"
          ? t("settings.skills.toast.skillDeleted")
          : t("settings.skills.toast.commandDeleted"),
        { description: deletingItem.name },
      )
      setDeletingItem(null)
      setSelectedItemId(null)
      await refetchAll()
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.skills.toast.failedToDelete")
      toast.error(t("settings.skills.toast.failedToDelete"), { description: message })
    }
  }, [deletingItem, deleteSkillMutation, deleteCommandMutation, selectedProject?.path, refetchAll, t])

  const handleRegistryInstall = useCallback(async (
    item: UnifiedItem,
    runtime: SkillRuntime,
    force?: boolean,
  ) => {
    if (!item.registry?.id) return
    try {
      const result = await installRegistrySkillMutation.mutateAsync({
        id: item.registry.id,
        runtime,
        force,
      })
      toast.success(t("settings.skills.toast.registrySynced"), {
        description: `${result.displayName} · ${getRuntimeLabel(runtime, t)}`,
      })
      await refetchAll()
      setSelectedItemId(runtime === "claude" ? `skill:registry::${result.id}` : item.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.skills.toast.failedToSyncRegistry")
      toast.error(t("settings.skills.toast.failedToSyncRegistry"), { description: message })
    }
  }, [installRegistrySkillMutation, refetchAll, t])

  const handleRegistryInstallBoth = useCallback(async (item: UnifiedItem) => {
    if (!item.registry?.id) return

    const needsForce = SKILL_RUNTIMES.some((runtime) => {
      const status = getRegistryRuntimeState(item, runtime)?.status
      return status === "user-owned" || status === "modified"
    })
    const actionableRuntimes = SKILL_RUNTIMES.filter((runtime) =>
      isRuntimeActionable(getRegistryRuntimeState(item, runtime)?.status),
    )

    if (needsForce) {
      const confirmed = window.confirm(
        t("settings.skills.confirmInstallBoth", {
          id: item.registry.id,
        }),
      )
      if (!confirmed) return
    }

    try {
      await Promise.all(actionableRuntimes.map((runtime) =>
        installRegistrySkillMutation.mutateAsync({
          id: item.registry!.id,
          runtime,
          force: needsForce,
        }),
      ))
      toast.success(t("settings.skills.toast.registrySynced"), {
        description: t("settings.skills.syncedBoth", { id: item.registry.id }),
      })
      await refetchAll()
      setSelectedItemId(`skill:registry::${item.registry.id}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.skills.toast.failedToSyncRegistry")
      toast.error(t("settings.skills.toast.failedToSyncRegistry"), { description: message })
    }
  }, [installRegistrySkillMutation, refetchAll, t])

  const handleRegistryRollback = useCallback(async (item: UnifiedItem, runtime: SkillRuntime) => {
    if (!item.registry?.id) return
    try {
      await rollbackRegistrySkillMutation.mutateAsync({
        id: item.registry.id,
        runtime,
      })
      toast.success(t("settings.skills.toast.registryRolledBack"), {
        description: `${item.registry.id} · ${getRuntimeLabel(runtime, t)}`,
      })
      await refetchAll()
      setSelectedItemId(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.skills.toast.failedToRollBackRegistry")
      toast.error(t("settings.skills.toast.failedToRollBackRegistry"), { description: message })
    }
  }, [rollbackRegistrySkillMutation, refetchAll, t])

  const handleCheckRegistry = useCallback(async () => {
    try {
      await Promise.all([refetchClaudeRegistry(), refetchCodexRegistry(), refetchRegistryCollections()])
      toast.success(t("settings.skills.toast.registryChecked"))
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.skills.toast.failedToCheckRegistry")
      toast.error(t("settings.skills.toast.failedToCheckRegistry"), { description: message })
    }
  }, [refetchClaudeRegistry, refetchCodexRegistry, refetchRegistryCollections, t])

  const handleBrowseRegistry = useCallback(() => {
    setShowAddForm(false)
    setSearchQuery("")
    setActiveView("skills")
    setActiveSkillFilter("available")
    void Promise.all([refetchClaudeRegistry(), refetchCodexRegistry(), refetchRegistryCollections()])
  }, [refetchClaudeRegistry, refetchCodexRegistry, refetchRegistryCollections])

  const isSaving = updateSkillMutation.isPending || updateCommandMutation.isPending
  const isCreating = createSkillMutation.isPending || createCommandMutation.isPending
  const isDeleting = deleteSkillMutation.isPending || deleteCommandMutation.isPending
  const isRegistryActionPending =
    installRegistrySkillMutation.isPending || rollbackRegistrySkillMutation.isPending
  const totalCount = visibleItems.length
  const hasSearch = searchQuery.trim().length > 0
  const emptyTitle = activeView === "commands"
    ? t("settings.skills.noCommands")
    : activeSkillFilter === "available"
      ? t("settings.skills.noAvailableSkills")
      : activeSkillFilter === "updates"
        ? t("settings.skills.noSkillUpdates")
        : activeSkillFilter === "installed"
          ? t("settings.skills.noInstalledSkills")
          : activeSkillFilter === "collections"
            ? t("settings.skills.noExternalCollections")
            : t("settings.skills.noSkills")
  const emptyHint = activeView === "commands"
    ? t("settings.skills.commandsEmptyHint")
    : activeSkillFilter === "available"
      ? t("settings.skills.availableSkillsHint")
      : activeSkillFilter === "updates"
        ? t("settings.skills.skillUpdatesHint")
        : activeSkillFilter === "installed"
          ? t("settings.skills.installedSkillsHint")
          : activeSkillFilter === "collections"
            ? t("settings.skills.externalCollectionsHint")
            : t("settings.skills.emptyHint")

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar - item list */}
      <ResizableSidebar
        isOpen={true}
        onClose={() => {}}
        widthAtom={settingsSkillsSidebarWidthAtom}
        minWidth={200}
        maxWidth={400}
        side="left"
        animationDuration={0}
        initialWidth={240}
        exitWidth={240}
        disableClickToClose={true}
      >
        <div className="flex flex-col h-full bg-background border-r overflow-hidden" style={{ borderRightWidth: "0.5px" }}>
          {/* Search + Add */}
          <div className="px-2 pt-2 flex-shrink-0 flex items-center gap-1.5">
            <input
              ref={searchInputRef}
              placeholder={t("settings.skills.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={listKeyDown}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none"
            />
            <button
              onClick={handleCheckRegistry}
              disabled={isLoadingRegistry}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 disabled:opacity-50 transition-colors cursor-pointer"
              title={t("settings.skills.checkRegistry")}
            >
              <RefreshCw className={cn("h-4 w-4", isLoadingRegistry && "animate-spin")} />
            </button>
            <button
              onClick={() => { setShowAddForm(true); setSelectedItemId(null) }}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title={t("settings.skills.createNew")}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="px-2 pt-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleBrowseRegistry}
              className={cn(
                "h-8 w-full rounded-lg border px-2.5 text-xs font-medium transition-colors cursor-pointer flex items-center gap-2",
                activeView === "skills" && activeSkillFilter === "available"
                  ? "border-foreground/15 bg-foreground/5 text-foreground"
                  : "border-border bg-muted/30 text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              )}
              title={t("settings.skills.browseRegistryHint")}
              aria-label={t("settings.skills.browseRegistry")}
            >
              <PackageSearch className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate flex-1 text-left">
                {t("settings.skills.browseRegistry")}
              </span>
              <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {skillFilterCounts.available}
              </span>
            </button>
          </div>
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="grid grid-cols-2 rounded-lg bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setActiveView("skills")}
                className={cn(
                  "h-6 rounded-md text-xs font-medium transition-colors cursor-pointer",
                  activeView === "skills"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("settings.skills.viewSkills")}
              </button>
              <button
                type="button"
                onClick={() => setActiveView("commands")}
                className={cn(
                  "h-6 rounded-md text-xs font-medium transition-colors cursor-pointer",
                  activeView === "commands"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("settings.skills.viewCommands")}
              </button>
            </div>
          </div>
          {activeView === "skills" && (
            <div className="px-2 pt-2 flex-shrink-0">
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {SKILL_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveSkillFilter(filter)}
                    className={cn(
                      "h-6 shrink-0 rounded-md px-2 text-[11px] font-medium transition-colors cursor-pointer",
                      activeSkillFilter === filter
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                    )}
                  >
                    {getSkillFilterLabel(filter, t)}
                    <span className="ml-1 text-[10px] text-muted-foreground/70">
                      {skillFilterCounts[filter]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Item list */}
          <div ref={listRef} onKeyDown={listKeyDown} tabIndex={-1} className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
              </div>
            ) : hasSearch && totalCount === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-muted-foreground">
                  {t("settings.skills.noResults")}
                </p>
              </div>
            ) : totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <SkillIcon className="h-8 w-8 text-border mb-3" />
                <p className="text-sm text-muted-foreground mb-1">
                  {emptyTitle}
                </p>
                <p className="text-[11px] text-muted-foreground/70 mb-2">
                  {emptyHint}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {t("common.create")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleGroups.map((group) => (
                  <div key={group.id}>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <SidebarListItem
                          key={item.id}
                          item={item}
                          isSelected={selectedItemId === item.id}
                          onSelect={setSelectedItemId}
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
        {showAddForm ? (
          <CreateItemForm
            onCreated={handleCreate}
            onCancel={() => setShowAddForm(false)}
            isSaving={isCreating}
            hasProject={!!selectedProject?.path}
            projectName={selectedProject?.name}
          />
        ) : selectedItem ? (
          <ItemDetail
            item={selectedItem}
            onSave={(data) => handleSave(selectedItem, data)}
            onDelete={isEditableItem(selectedItem) ? () => setDeletingItem(selectedItem) : undefined}
            onRegistryInstall={handleRegistryInstall}
            onRegistryInstallBoth={handleRegistryInstallBoth}
            onRegistryRollback={handleRegistryRollback}
            isSaving={isSaving}
            isRegistryActionPending={isRegistryActionPending}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <SkillIcon className="h-12 w-12 text-border mb-4" />
            <p className="text-sm text-muted-foreground">
              {totalCount > 0
                ? t("settings.skills.selectToView")
                : emptyTitle}
            </p>
            {totalCount === 0 && (
              <>
                <p className="text-xs text-muted-foreground/70 mt-2 max-w-sm">
                  {emptyHint}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {t("settings.skills.createFirst")}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingItem} onOpenChange={(open) => { if (!open) setDeletingItem(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingItem?.kind === "skill"
                ? t("settings.skills.deleteSkillTitle")
                : t("settings.skills.deleteCommandTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.skills.deleteConfirmPrefix")}{" "}
              <strong>{deletingItem?.name}</strong>?{" "}
              {t("settings.skills.deleteConfirmSuffix")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
