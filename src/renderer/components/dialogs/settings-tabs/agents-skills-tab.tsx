import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useListKeyboardNav } from "./use-list-keyboard-nav"
import { useAtomValue } from "jotai"
import { selectedProjectAtom, settingsSkillsSidebarWidthAtom } from "../../../features/agents/atoms"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { useI18n } from "../../../lib/i18n"
import { AlertTriangle, Download, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react"
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
  kind: "skill" | "command" | "registry-skill"
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
  }
}

// --- Detail Panel (Editable) ---
function ItemDetail({
  item,
  onSave,
  onDelete,
  onRegistryInstall,
  onRegistryRollback,
  isSaving,
  isRegistryActionPending,
}: {
  item: UnifiedItem
  onSave: (data: { description: string; content: string }) => void
  onDelete?: () => void
  onRegistryInstall?: (item: UnifiedItem, force?: boolean) => void
  onRegistryRollback?: (item: UnifiedItem) => void
  isSaving: boolean
  isRegistryActionPending?: boolean
}) {
  const { t } = useI18n()
  const [description, setDescription] = useState(item.description)
  const [content, setContent] = useState(item.content)
  const [viewMode, setViewMode] = useState<"rendered" | "editor">("rendered")

  const isRegistryItem = item.source === "registry" || item.kind === "registry-skill"
  const isReadOnly = item.source === "plugin" || isRegistryItem
  const registryStatus = item.registry?.status

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
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground truncate">{item.name}</h3>
              <span className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
                item.kind === "command"
                  ? "bg-orange-500/10 text-orange-500"
                  : item.source === "registry"
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-blue-500/10 text-blue-500"
              )}>
                {item.kind === "command" ? "Command" : item.source === "registry" ? "Registry" : "Skill"}
              </span>
              {registryStatus && (
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
                  registryStatus === "installed"
                    ? "bg-emerald-500/10 text-emerald-500"
                    : registryStatus === "not-installed"
                      ? "bg-muted text-muted-foreground"
                      : "bg-amber-500/10 text-amber-500"
                )}>
                  {registryStatus}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{item.path}</p>
          </div>
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

        {/* Usage */}
        <div className="space-y-1.5">
          <Label>{t("settings.skills.usage")}</Label>
          <div className="px-3 py-2 text-sm bg-muted/50 border border-border rounded-lg">
            <code className="text-xs text-foreground">
              {item.kind === "command" ? `/${item.name}` : `@${item.name}`}
            </code>
          </div>
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
              <div className="flex items-center gap-1.5 shrink-0">
                {["not-installed", "user-owned"].includes(registryStatus || "") && onRegistryInstall && (
                  <Button
                    size="sm"
                    variant={registryStatus === "user-owned" ? "outline" : "default"}
                    onClick={() => {
                      const force = registryStatus === "user-owned"
                        ? window.confirm(
                            t("settings.skills.confirmReplaceUserSkill", {
                              id: item.registry?.id || "",
                            }),
                          )
                        : false
                      if (registryStatus === "user-owned" && !force) return
                      onRegistryInstall(item, force)
                    }}
                    disabled={isRegistryActionPending}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    {registryStatus === "user-owned"
                      ? t("settings.skills.restore")
                      : t("settings.skills.install")}
                  </Button>
                )}
                {["update-available", "modified"].includes(registryStatus || "") && onRegistryInstall && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const force = registryStatus === "modified"
                        ? window.confirm(
                            t("settings.skills.confirmReplaceLocalChanges", {
                              id: item.registry?.id || "",
                            }),
                          )
                        : false
                      if (registryStatus === "modified" && !force) return
                      onRegistryInstall(item, force)
                    }}
                    disabled={isRegistryActionPending}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    {registryStatus === "modified"
                      ? t("settings.skills.restore")
                      : t("settings.skills.update")}
                  </Button>
                )}
                {item.registry.hasRollback && onRegistryRollback && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRegistryRollback(item)}
                    disabled={isRegistryActionPending}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    {t("settings.skills.rollBack")}
                  </Button>
                )}
              </div>
            </div>
            {item.registry.statusMessage && (
              <div className="flex items-start gap-2 text-[11px] text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{item.registry.statusMessage}</span>
              </div>
            )}
          </div>
        )}

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
            : item.source === "registry"
              ? "text-emerald-500/70"
              : "text-blue-500/70"
        )}>
          {item.kind === "command" ? "/" : "@"}
        </span>
        <span className="text-sm truncate">{item.name}</span>
      </div>
      {item.description && (
        <div className="text-[11px] text-muted-foreground truncate mt-0.5 pl-[18px]">
          {item.description}
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
    data: registrySkills = [],
    isLoading: isLoadingRegistry,
    refetch: refetchRegistry,
  } = trpc.skills.registryList.useQuery()

  const isLoading = isLoadingSkills || isLoadingCommands || isLoadingRegistry

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchSkills(), refetchCommands(), refetchRegistry()])
  }, [refetchSkills, refetchCommands, refetchRegistry])

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
    const registryById = new Map(registrySkills.map((skill) => [skill.id, skill]))
    const skillItems: UnifiedItem[] = skills.map((s) => ({
      id: `skill:${s.source}:${s.registry?.id || s.name}`,
      kind: "skill" as const,
      name: s.name,
      description: s.description,
      source: s.source,
      pluginName: s.pluginName,
      path: s.path,
      content: s.content,
      registry: s.registry
        ? {
            ...s.registry,
            statusMessage: registryById.get(s.registry.id)?.statusMessage,
          }
        : undefined,
    }))
    const cmdItems: UnifiedItem[] = commands.map((c) => ({
      id: `cmd:${c.source}:${c.name}`,
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
    const registryItems: UnifiedItem[] = registrySkills
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
          status: skill.status,
          version: skill.version,
          installedVersion: skill.installedVersion,
          registryId: skill.registryId,
          hasRollback: skill.hasRollback,
          statusMessage: skill.statusMessage,
        },
      }))

    return [...skillItems, ...cmdItems, ...registryItems]
  }, [skills, commands, registrySkills, t])

  // Filter by search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems
    const q = searchQuery.toLowerCase()
    return allItems.filter((i) =>
      i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    )
  }, [allItems, searchQuery])

  // Group by source
  const userItems = filteredItems.filter((i) => i.source === "user")
  const projectItems = filteredItems.filter((i) => i.source === "project")
  const registryItems = filteredItems.filter((i) => i.source === "registry")
  const pluginItems = filteredItems.filter((i) => i.source === "plugin")

  const allItemIds = useMemo(
    () => [...registryItems, ...userItems, ...projectItems, ...pluginItems].map((i) => i.id),
    [registryItems, userItems, projectItems, pluginItems]
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: allItemIds,
    selectedItem: selectedItemId,
    onSelect: setSelectedItemId,
  })

  const selectedItem = allItems.find((i) => i.id === selectedItemId) || null

  // Auto-select first item when data loads
  useEffect(() => {
    if (selectedItemId || isLoading || allItems.length === 0) return
    setSelectedItemId(allItems[0]!.id)
  }, [allItems, selectedItemId, isLoading])

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
        setSelectedItemId(`skill:${data.source}:${result.name}`)
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
        setSelectedItemId(`cmd:${data.source}:${result.name}`)
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

  const handleRegistryInstall = useCallback(async (item: UnifiedItem, force?: boolean) => {
    if (!item.registry?.id) return
    try {
      const result = await installRegistrySkillMutation.mutateAsync({
        id: item.registry.id,
        force,
      })
      toast.success(t("settings.skills.toast.registrySynced"), { description: result.displayName })
      await refetchAll()
      setSelectedItemId(`skill:registry:${result.id}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.skills.toast.failedToSyncRegistry")
      toast.error(t("settings.skills.toast.failedToSyncRegistry"), { description: message })
    }
  }, [installRegistrySkillMutation, refetchAll, t])

  const handleRegistryRollback = useCallback(async (item: UnifiedItem) => {
    if (!item.registry?.id) return
    try {
      await rollbackRegistrySkillMutation.mutateAsync({ id: item.registry.id })
      toast.success(t("settings.skills.toast.registryRolledBack"), { description: item.registry.id })
      await refetchAll()
      setSelectedItemId(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.skills.toast.failedToRollBackRegistry")
      toast.error(t("settings.skills.toast.failedToRollBackRegistry"), { description: message })
    }
  }, [rollbackRegistrySkillMutation, refetchAll, t])

  const handleCheckRegistry = useCallback(async () => {
    try {
      await refetchRegistry()
      toast.success(t("settings.skills.toast.registryChecked"))
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.skills.toast.failedToCheckRegistry")
      toast.error(t("settings.skills.toast.failedToCheckRegistry"), { description: message })
    }
  }, [refetchRegistry, t])

  const isSaving = updateSkillMutation.isPending || updateCommandMutation.isPending
  const isCreating = createSkillMutation.isPending || createCommandMutation.isPending
  const isDeleting = deleteSkillMutation.isPending || deleteCommandMutation.isPending
  const isRegistryActionPending =
    installRegistrySkillMutation.isPending || rollbackRegistrySkillMutation.isPending
  const totalCount = allItems.length

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
          {/* Item list */}
          <div ref={listRef} onKeyDown={listKeyDown} tabIndex={-1} className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
              </div>
            ) : totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <SkillIcon className="h-8 w-8 text-border mb-3" />
                <p className="text-sm text-muted-foreground mb-1">
                  {t("settings.skills.noSkillsOrCommands")}
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
            ) : filteredItems.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-muted-foreground">
                  {t("settings.skills.noResults")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Registry */}
                {registryItems.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      {t("common.registry")}
                    </p>
                    <div className="space-y-0.5">
                      {registryItems.map((item) => (
                        <SidebarListItem
                          key={item.id}
                          item={item}
                          isSelected={selectedItemId === item.id}
                          onSelect={setSelectedItemId}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* User */}
                {userItems.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      {t("common.user")}
                    </p>
                    <div className="space-y-0.5">
                      {userItems.map((item) => (
                        <SidebarListItem
                          key={item.id}
                          item={item}
                          isSelected={selectedItemId === item.id}
                          onSelect={setSelectedItemId}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Project */}
                {projectItems.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      {t("common.project")}
                    </p>
                    <div className="space-y-0.5">
                      {projectItems.map((item) => (
                        <SidebarListItem
                          key={item.id}
                          item={item}
                          isSelected={selectedItemId === item.id}
                          onSelect={setSelectedItemId}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Plugin */}
                {pluginItems.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      {t("common.plugin")}
                    </p>
                    <div className="space-y-0.5">
                      {pluginItems.map((item) => (
                        <SidebarListItem
                          key={item.id}
                          item={item}
                          isSelected={selectedItemId === item.id}
                          onSelect={setSelectedItemId}
                        />
                      ))}
                    </div>
                  </div>
                )}
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
            onDelete={!["plugin", "registry"].includes(selectedItem.source) ? () => setDeletingItem(selectedItem) : undefined}
            onRegistryInstall={handleRegistryInstall}
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
                : t("settings.skills.noneFound")}
            </p>
            {totalCount === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t("settings.skills.createFirst")}
              </Button>
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
