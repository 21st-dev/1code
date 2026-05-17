import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, CheckCircle2, Download, ExternalLink, PackageSearch, Plus, RotateCcw, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { settingsAgentsSidebarWidthAtom } from "../../../features/agents/atoms"
import { trpc } from "../../../lib/trpc"
import { useI18n } from "../../../lib/i18n"
import { cn } from "../../../lib/utils"
import { CustomAgentIconFilled } from "../../ui/icons"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../ui/alert-dialog"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import { Textarea } from "../../ui/textarea"
import { ToolSelector } from "./tool-selector"
import { useListKeyboardNav } from "./use-list-keyboard-nav"

type ToolMode = "all" | "allowlist" | "denylist"

type AppAgent = {
  id: string
  name: string
  description: string
  prompt: string
  tools: string[]
  disallowedTools: string[]
}

type AppAgentFormData = {
  name: string
  description: string
  prompt: string
  tools?: string[]
  disallowedTools?: string[]
}

type RegistryAppAgent = {
  id: string
  name: string
  displayName: string
  sourceId: string
  sourceName: string
  sourceUrl: string
  upstreamPath: string
  category: string
  status: "not-installed" | "installed"
}

type AgentViewMode = "local" | "registry"

function slugifyAgentName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function arraysEqual(a: string[] = [], b: string[] = []) {
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}

function getToolMode(agent?: Pick<AppAgent, "tools" | "disallowedTools">): ToolMode {
  if (agent?.tools?.length) return "allowlist"
  if (agent?.disallowedTools?.length) return "denylist"
  return "all"
}

function getSelectedTools(agent?: Pick<AppAgent, "tools" | "disallowedTools">) {
  if (agent?.tools?.length) return agent.tools
  if (agent?.disallowedTools?.length) return agent.disallowedTools
  return []
}

function buildToolPayload(toolMode: ToolMode, selectedTools: string[]) {
  return {
    tools: toolMode === "allowlist" ? selectedTools : undefined,
    disallowedTools: toolMode === "denylist" ? selectedTools : undefined,
  }
}

function AppAgentEditor({
  agent,
  isCreating,
  isSaving,
  onCancelCreate,
  onSave,
  onDelete,
}: {
  agent: AppAgent | null
  isCreating: boolean
  isSaving: boolean
  onCancelCreate: () => void
  onSave: (data: AppAgentFormData) => Promise<void>
  onDelete: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(agent?.name ?? "")
  const [description, setDescription] = useState(agent?.description ?? "")
  const [prompt, setPrompt] = useState(agent?.prompt ?? "")
  const [toolMode, setToolMode] = useState<ToolMode>(getToolMode(agent ?? undefined))
  const [selectedTools, setSelectedTools] = useState<string[]>(getSelectedTools(agent ?? undefined))

  useEffect(() => {
    setName(agent?.name ?? "")
    setDescription(agent?.description ?? "")
    setPrompt(agent?.prompt ?? "")
    setToolMode(getToolMode(agent ?? undefined))
    setSelectedTools(getSelectedTools(agent ?? undefined))
  }, [agent?.id, agent?.name, agent?.description, agent?.prompt, agent?.tools, agent?.disallowedTools])

  useEffect(() => {
    if (isCreating) {
      setName("")
      setDescription("")
      setPrompt("")
      setToolMode("all")
      setSelectedTools([])
    }
  }, [isCreating])

  const toolPayload = useMemo(
    () => buildToolPayload(toolMode, selectedTools),
    [selectedTools, toolMode],
  )

  const normalizedName = slugifyAgentName(name)
  const hasPersistedChanges = agent
    ? normalizedName !== agent.name ||
      description !== agent.description ||
      prompt !== agent.prompt ||
      !arraysEqual(toolPayload.tools, agent.tools) ||
      !arraysEqual(toolPayload.disallowedTools, agent.disallowedTools)
    : false
  const hasChanges = isCreating
    ? name.trim().length > 0 || description.trim().length > 0 || prompt.trim().length > 0 || selectedTools.length > 0
    : hasPersistedChanges
  const canSave =
    normalizedName.length > 0 &&
    description.trim().length > 0 &&
    prompt.trim().length > 0 &&
    (isCreating || hasChanges)

  const resetForm = useCallback(() => {
    setName(agent?.name ?? "")
    setDescription(agent?.description ?? "")
    setPrompt(agent?.prompt ?? "")
    setToolMode(getToolMode(agent ?? undefined))
    setSelectedTools(getSelectedTools(agent ?? undefined))
  }, [agent])

  const handleSave = useCallback(async () => {
    if (!canSave) return
    await onSave({
      name: normalizedName,
      description: description.trim(),
      prompt: prompt.trim(),
      ...toolPayload,
    })
  }, [canSave, description, normalizedName, onSave, prompt, toolPayload])

  if (!agent && !isCreating) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <CustomAgentIconFilled className="mb-4 h-12 w-12 text-border" />
        <p className="text-sm text-muted-foreground">
          {t("settings.appAgents.selectToView")}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {isCreating ? t("settings.appAgents.newAgent") : agent?.name}
              </h3>
              {hasChanges && !isCreating && (
                <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                  {t("settings.appAgents.unsaved")}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("settings.appAgents.storage")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isCreating ? (
              <Button variant="outline" size="sm" onClick={onCancelCreate}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                onClick={resetForm}
                disabled={!hasChanges || isSaving}
                title={t("settings.appAgents.discardChanges")}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={!canSave || isSaving}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>
            {t("settings.appAgents.name")} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("settings.appAgents.namePlaceholder")}
          />
          <p className="text-[11px] text-muted-foreground">
            {normalizedName || t("settings.appAgents.nameHint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>
            {t("settings.appAgents.description")} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("settings.appAgents.descriptionPlaceholder")}
          />
        </div>

        <div className="space-y-3">
          <Label>{t("settings.appAgents.tools")}</Label>
          <div className="flex flex-wrap gap-2">
            {(["all", "allowlist", "denylist"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={toolMode === mode ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setToolMode(mode)
                  if (mode === "all") setSelectedTools([])
                }}
              >
                {mode === "all" && t("settings.appAgents.allTools")}
                {mode === "allowlist" && t("settings.appAgents.onlySelected")}
                {mode === "denylist" && t("settings.appAgents.exceptSelected")}
              </Button>
            ))}
          </div>
          {toolMode === "all" ? (
            <p className="text-xs text-muted-foreground">
              {t("settings.appAgents.allToolsHint")}
            </p>
          ) : (
            <ToolSelector
              selectedTools={selectedTools}
              onChange={setSelectedTools}
              mode={toolMode}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label>
            {t("settings.appAgents.prompt")} <span className="text-destructive">*</span>
          </Label>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={14}
            className="resize-y font-mono"
            placeholder={t("settings.appAgents.promptPlaceholder")}
          />
        </div>

        {!isCreating && agent && (
          <div className="border-t border-border pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:bg-red-500/10 hover:text-red-600"
              onClick={onDelete}
              disabled={isSaving}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("settings.appAgents.deleteAgent")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function RegistryAgentDetail({
  agentId,
  onImport,
  isImporting,
}: {
  agentId: string | null
  onImport: (agent: RegistryAppAgent) => void
  isImporting: boolean
}) {
  const { t } = useI18n()
  const { data: agent, isLoading, error } = trpc.appAgents.registryGet.useQuery(
    { id: agentId ?? "" },
    {
      enabled: !!agentId,
      staleTime: 10 * 60 * 1000,
    },
  )

  if (!agentId) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <PackageSearch className="mb-4 h-12 w-12 text-border" />
        <p className="text-sm text-muted-foreground">
          {t("settings.appAgents.registrySelectToView")}
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {t("settings.appAgents.registryFailedToLoad")}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {agent.name}
              </h3>
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {agent.category}
              </span>
              {agent.status === "installed" && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" />
                  {t("settings.appAgents.registryInstalled")}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {agent.sourceName} · {agent.upstreamPath}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              title={t("settings.appAgents.openSource")}
              onClick={() => {
                void window.desktopApi.openExternal(agent.sourceUrl)
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              onClick={() => onImport(agent)}
              disabled={isImporting || !agent.prompt.trim()}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {isImporting
                ? t("settings.appAgents.importing")
                : agent.status === "installed"
                  ? t("settings.appAgents.updateFromRegistry")
                  : t("settings.appAgents.importAgent")}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("settings.appAgents.description")}</Label>
          <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
            {agent.description || (
              <span className="text-muted-foreground">
                {t("settings.appAgents.noDescription")}
              </span>
            )}
          </p>
        </div>

        {(agent.tools.length > 0 || agent.disallowedTools.length > 0) && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-foreground">
              {t("settings.appAgents.tools")}
            </p>
            {agent.tools.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {t("settings.appAgents.allowedTools")}: {agent.tools.join(", ")}
              </div>
            )}
            {agent.disallowedTools.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {t("settings.appAgents.disallowedTools")}: {agent.disallowedTools.join(", ")}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t("settings.appAgents.prompt")}</Label>
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
            {agent.prompt || t("settings.appAgents.noPrompt")}
          </pre>
        </div>
      </div>
    </div>
  )
}

export function AgentsAppAgentsTab() {
  const { t } = useI18n()
  const utils = trpc.useUtils()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedRegistryAgentId, setSelectedRegistryAgentId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingAgent, setDeletingAgent] = useState<AppAgent | null>(null)
  const [viewMode, setViewMode] = useState<AgentViewMode>("local")

  const { data: agents = [], isLoading } = trpc.appAgents.list.useQuery()
  const { data: registryAgents = [], isLoading: isLoadingRegistry } =
    trpc.appAgents.registryList.useQuery(undefined, {
      enabled: viewMode === "registry",
      staleTime: 10 * 60 * 1000,
    })
  const createMutation = trpc.appAgents.create.useMutation()
  const updateMutation = trpc.appAgents.update.useMutation()
  const deleteMutation = trpc.appAgents.delete.useMutation()
  const registryImportMutation = trpc.appAgents.registryImport.useMutation()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return
      const tag = (event.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      event.preventDefault()
      searchInputRef.current?.focus()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  const filteredAgents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return agents
    return agents.filter((agent) =>
      agent.name.toLowerCase().includes(query) ||
      agent.description.toLowerCase().includes(query),
    )
  }, [agents, searchQuery])

  const filteredRegistryAgents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return registryAgents
    return registryAgents.filter((agent) =>
      agent.name.toLowerCase().includes(query) ||
      agent.sourceName.toLowerCase().includes(query) ||
      agent.category.toLowerCase().includes(query),
    )
  }, [registryAgents, searchQuery])

  const filteredIds = useMemo(
    () => viewMode === "registry"
      ? filteredRegistryAgents.map((agent) => agent.id)
      : filteredAgents.map((agent) => agent.id),
    [filteredAgents, filteredRegistryAgents, viewMode],
  )
  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: filteredIds,
    selectedItem: viewMode === "registry" ? selectedRegistryAgentId : selectedAgentId,
    onSelect: (id) => {
      setIsCreating(false)
      if (viewMode === "registry") {
        setSelectedRegistryAgentId(id)
      } else {
        setSelectedAgentId(id)
      }
    },
  })

  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? null

  useEffect(() => {
    if (isCreating || selectedAgentId || isLoading || agents.length === 0) return
    setSelectedAgentId(agents[0]!.id)
  }, [agents, isCreating, isLoading, selectedAgentId])

  useEffect(() => {
    if (viewMode !== "registry") return
    if (selectedRegistryAgentId || isLoadingRegistry || registryAgents.length === 0) return
    setSelectedRegistryAgentId(registryAgents[0]!.id)
  }, [isLoadingRegistry, registryAgents, selectedRegistryAgentId, viewMode])

  useEffect(() => {
    if (!selectedAgentId) return
    if (agents.some((agent) => agent.id === selectedAgentId)) return
    setSelectedAgentId(agents[0]?.id ?? null)
  }, [agents, selectedAgentId])

  const invalidateAgents = useCallback(async () => {
    await utils.appAgents.list.invalidate()
    await utils.appAgents.registryList.invalidate()
  }, [utils.appAgents.list, utils.appAgents.registryList])

  const handleCreate = useCallback(async (data: AppAgentFormData) => {
    try {
      const created = await createMutation.mutateAsync(data)
      toast.success(t("settings.appAgents.toast.created"), {
        description: created.name,
      })
      setIsCreating(false)
      setSelectedAgentId(created.id)
      await invalidateAgents()
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.appAgents.toast.failedToCreate")
      toast.error(t("settings.appAgents.toast.failedToCreate"), {
        description: message,
      })
    }
  }, [createMutation, invalidateAgents, t])

  const handleUpdate = useCallback(async (data: AppAgentFormData) => {
    if (!selectedAgent) return
    try {
      const updated = await updateMutation.mutateAsync({
        id: selectedAgent.id,
        ...data,
      })
      toast.success(t("settings.appAgents.toast.saved"), {
        description: updated.name,
      })
      setSelectedAgentId(updated.id)
      await invalidateAgents()
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.appAgents.toast.failedToSave")
      toast.error(t("settings.appAgents.toast.failedToSave"), {
        description: message,
      })
    }
  }, [invalidateAgents, selectedAgent, t, updateMutation])

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingAgent) return
    try {
      await deleteMutation.mutateAsync({ id: deletingAgent.id })
      toast.success(t("settings.appAgents.toast.deleted"), {
        description: deletingAgent.name,
      })
      setDeletingAgent(null)
      setSelectedAgentId(null)
      await invalidateAgents()
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.appAgents.toast.failedToDelete")
      toast.error(t("settings.appAgents.toast.failedToDelete"), {
        description: message,
      })
    }
  }, [deleteMutation, deletingAgent, invalidateAgents, t])

  const handleRegistryImport = useCallback(async (agent: RegistryAppAgent) => {
    try {
      const imported = await registryImportMutation.mutateAsync({ id: agent.id })
      toast.success(
        agent.status === "installed"
          ? t("settings.appAgents.toast.updatedFromRegistry")
          : t("settings.appAgents.toast.imported"),
        { description: imported.name },
      )
      setSelectedAgentId(imported.id)
      setSelectedRegistryAgentId(null)
      setViewMode("local")
      setIsCreating(false)
      setSearchQuery("")
      await invalidateAgents()
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.appAgents.toast.failedToImport")
      toast.error(t("settings.appAgents.toast.failedToImport"), {
        description: message,
      })
    }
  }, [invalidateAgents, registryImportMutation, t])

  return (
    <>
      <div className="flex h-full overflow-hidden">
        <ResizableSidebar
          isOpen={true}
          onClose={() => {}}
          widthAtom={settingsAgentsSidebarWidthAtom}
          minWidth={220}
          maxWidth={400}
          side="left"
          animationDuration={0}
          initialWidth={260}
          exitWidth={260}
          disableClickToClose={true}
        >
          <div className="flex h-full flex-col overflow-hidden border-r bg-background" style={{ borderRightWidth: "0.5px" }}>
            <div className="flex shrink-0 flex-col gap-1.5 px-2 pt-2">
              {viewMode === "registry" && (
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("local")
                    setIsCreating(false)
                    setSearchQuery("")
                    setSelectedRegistryAgentId(null)
                  }}
                  className="flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span className="truncate">{t("settings.appAgents.backToInstalled")}</span>
                </button>
              )}

              <div className="flex items-center gap-1.5">
                <input
                  ref={searchInputRef}
                  placeholder={
                    viewMode === "registry"
                      ? t("settings.appAgents.registrySearchPlaceholder")
                      : t("settings.appAgents.searchPlaceholder")
                  }
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={listKeyDown}
                  className="h-7 w-full rounded-lg border border-input bg-muted px-3 text-sm outline-none placeholder:text-muted-foreground/40"
                />
                <button
                  type="button"
                  onClick={() => {
                    setViewMode((current) => current === "registry" ? "local" : "registry")
                    setIsCreating(false)
                    setSearchQuery("")
                  }}
                  className={cn(
                    "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors",
                    viewMode === "registry"
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  )}
                  title={
                    viewMode === "registry"
                      ? t("settings.appAgents.showInstalled")
                      : t("settings.appAgents.browseRegistry")
                  }
                >
                  <PackageSearch className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("local")
                    setIsCreating(true)
                    setSelectedAgentId(null)
                  }}
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                  title={t("settings.appAgents.createNewAgent")}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              ref={listRef}
              onKeyDown={listKeyDown}
              tabIndex={-1}
              className="flex-1 overflow-y-auto px-2 pb-2 pt-2 outline-none"
            >
              {viewMode === "registry" ? (
                isLoadingRegistry ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
                  </div>
                ) : filteredRegistryAgents.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-xs text-muted-foreground">
                      {t("settings.appAgents.noRegistryResults")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filteredRegistryAgents.map((agent) => {
                      const isSelected = selectedRegistryAgentId === agent.id
                      return (
                        <button
                          key={agent.id}
                          data-item-id={agent.id}
                          type="button"
                          onClick={() => {
                            setIsCreating(false)
                            setSelectedRegistryAgentId(agent.id)
                          }}
                          className={cn(
                            "w-full cursor-pointer rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-150 focus-visible:-outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                            isSelected
                              ? "bg-foreground/5 text-foreground"
                              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex-1 truncate text-sm">
                              {agent.name}
                            </span>
                            {agent.status === "installed" && (
                              <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                                {t("settings.appAgents.registryInstalled")}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {agent.category} · {agent.sourceName}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              ) : isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
                </div>
              ) : agents.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                  <CustomAgentIconFilled className="mb-3 h-8 w-8 text-border" />
                  <p className="mb-3 text-sm text-muted-foreground">
                    {t("settings.appAgents.noAgents")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsCreating(true)
                      setSelectedAgentId(null)
                    }}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t("settings.appAgents.createAgent")}
                  </Button>
                </div>
              ) : filteredAgents.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-xs text-muted-foreground">
                    {t("settings.appAgents.noResults")}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredAgents.map((agent) => {
                    const isSelected = selectedAgentId === agent.id
                    return (
                      <button
                        key={agent.id}
                        data-item-id={agent.id}
                        type="button"
                        onClick={() => {
                          setIsCreating(false)
                          setSelectedAgentId(agent.id)
                        }}
                        className={cn(
                          "w-full cursor-pointer rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-150 focus-visible:-outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                          isSelected
                            ? "bg-foreground/5 text-foreground"
                            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex-1 truncate text-sm">
                            {agent.name}
                          </span>
                        </div>
                        {agent.description && (
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {agent.description}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </ResizableSidebar>

        <div className="h-full min-w-0 flex-1 overflow-hidden">
          {viewMode === "registry" ? (
            <RegistryAgentDetail
              agentId={selectedRegistryAgentId}
              onImport={handleRegistryImport}
              isImporting={registryImportMutation.isPending}
            />
          ) : (
            <AppAgentEditor
              agent={selectedAgent}
              isCreating={isCreating}
              isSaving={createMutation.isPending || updateMutation.isPending}
              onCancelCreate={() => {
                setIsCreating(false)
                setSelectedAgentId(agents[0]?.id ?? null)
              }}
              onSave={isCreating ? handleCreate : handleUpdate}
              onDelete={() => {
                if (selectedAgent) setDeletingAgent(selectedAgent)
              }}
            />
          )}
        </div>
      </div>

      <AlertDialog open={!!deletingAgent} onOpenChange={(open) => !open && setDeletingAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.appAgents.confirmDeleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.appAgents.confirmDeleteDescription", {
                name: deletingAgent?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("settings.appAgents.confirmDeleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
