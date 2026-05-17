import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useListKeyboardNav } from "./use-list-keyboard-nav"
import { useAtomValue } from "jotai"
import { selectedProjectAtom, settingsAgentsSidebarWidthAtom } from "../../../features/agents/atoms"
import { CLAUDE_MODELS } from "../../../features/agents/lib/models"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { useI18n } from "../../../lib/i18n"
import { Copy, FileText, FolderOpen, Plus, RotateCcw, Trash2 } from "lucide-react"
import { CustomAgentIconFilled } from "../../ui/icons"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select"
import { Textarea } from "../../ui/textarea"
import { Button } from "../../ui/button"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import { ToolSelector } from "./tool-selector"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog"
import { toast } from "sonner"
import {
  isCustomAgentModelId,
  type CustomAgentModel as AgentModel,
} from "../../../../shared/custom-agent-models"

type WritableAgentSource = "user" | "project"
type ToolMode = "all" | "allowlist" | "denylist"
type ClaudeModel = (typeof CLAUDE_MODELS)[number]
type CustomAgentModelOption = ClaudeModel & { id: Exclude<AgentModel, "inherit"> }

const CUSTOM_AGENT_MODEL_OPTIONS = CLAUDE_MODELS.filter(
  (model): model is CustomAgentModelOption => isCustomAgentModelId(model.id),
)

interface FileAgent {
  name: string
  description: string
  prompt: string
  tools?: string[]
  disallowedTools?: string[]
  model?: AgentModel
  source: "user" | "project" | "plugin"
  pluginName?: string
  path: string
}

type AgentFormData = {
  description: string
  prompt: string
  model?: AgentModel
  tools?: string[]
  disallowedTools?: string[]
}

function arraysEqual(a: string[] = [], b: string[] = []) {
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}

function getAgentId(agent: FileAgent) {
  return `${agent.source}:${agent.pluginName || ""}:${agent.name}`
}

function getAgentSourceLabel(source: FileAgent["source"], t: ReturnType<typeof useI18n>["t"]) {
  if (source === "plugin") return t("common.plugin")
  if (source === "project") return t("common.project")
  return t("common.user")
}

function getToolMode(agent: Pick<FileAgent, "tools" | "disallowedTools">): ToolMode {
  if (agent.tools && agent.tools.length > 0) return "allowlist"
  if (agent.disallowedTools && agent.disallowedTools.length > 0) return "denylist"
  return "all"
}

function getSelectedTools(agent: Pick<FileAgent, "tools" | "disallowedTools">) {
  if (agent.tools && agent.tools.length > 0) return agent.tools
  if (agent.disallowedTools && agent.disallowedTools.length > 0) return agent.disallowedTools
  return []
}

function buildToolPayload(toolMode: ToolMode, selectedTools: string[]) {
  return {
    tools: toolMode === "allowlist" ? selectedTools : undefined,
    disallowedTools: toolMode === "denylist" ? selectedTools : undefined,
  }
}

function getSourceHintKey(source: FileAgent["source"]) {
  if (source === "plugin") return "settings.customAgents.sourceHintPlugin" as const
  if (source === "project") return "settings.customAgents.sourceHintProject" as const
  return "settings.customAgents.sourceHintUser" as const
}

function formatClaudeModelLabel(model: Pick<ClaudeModel, "name" | "version">) {
  return `${model.name} ${model.version}`
}

function getAgentModelLabel(model?: AgentModel) {
  if (!model || model === "inherit") return null
  const option = CUSTOM_AGENT_MODEL_OPTIONS.find((item) => item.id === model)
  return option ? formatClaudeModelLabel(option) : model
}

function AgentModelSelectItems({ t }: { t: ReturnType<typeof useI18n>["t"] }) {
  return (
    <>
      <SelectItem value="inherit">
        {t("settings.customAgents.inheritFromParent")}
      </SelectItem>
      {CUSTOM_AGENT_MODEL_OPTIONS.map((model) => (
        <SelectItem key={model.id} value={model.id}>
          {formatClaudeModelLabel(model)}
        </SelectItem>
      ))}
    </>
  )
}

function AgentModelBadge({ model }: { model?: AgentModel }) {
  const label = getAgentModelLabel(model)
  if (!label) return null

  return (
    <span className="text-[10px] text-muted-foreground shrink-0">
      {label}
    </span>
  )
}

function slugifyAgentName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

function createDuplicateName(name: string, targetSource: WritableAgentSource, agents: FileAgent[]) {
  const base = slugifyAgentName(name) || "agent"
  const existingNames = new Set(
    agents
      .filter((agent) => agent.source === targetSource)
      .map((agent) => slugifyAgentName(agent.name)),
  )

  if (!existingNames.has(base)) return base

  let index = 2
  let candidate = `${base}-copy`
  while (existingNames.has(candidate)) {
    candidate = `${base}-copy-${index}`
    index += 1
  }
  return candidate
}

// --- Detail Panel (Editable) ---
function AgentDetail({
  agent,
  onSave,
  onDelete,
  onDuplicate,
  onOpenFile,
  onRevealInFinder,
  isSaving,
  isDeleting,
  isDuplicating,
  hasProject,
}: {
  agent: FileAgent
  onSave: (data: AgentFormData) => void
  onDelete: () => void
  onDuplicate: (targetSource: WritableAgentSource) => void
  onOpenFile: () => void
  onRevealInFinder: () => void
  isSaving: boolean
  isDeleting: boolean
  isDuplicating: boolean
  hasProject: boolean
}) {
  const { t } = useI18n()
  const [description, setDescription] = useState(agent.description)
  const [prompt, setPrompt] = useState(agent.prompt)
  const [model, setModel] = useState<string>(agent.model || "inherit")
  const [toolMode, setToolMode] = useState<ToolMode>(getToolMode(agent))
  const [selectedTools, setSelectedTools] = useState<string[]>(getSelectedTools(agent))
  const isReadOnly = agent.source === "plugin"

  // Reset local state when agent changes
  useEffect(() => {
    setDescription(agent.description)
    setPrompt(agent.prompt)
    setModel(agent.model || "inherit")
    setToolMode(getToolMode(agent))
    setSelectedTools(getSelectedTools(agent))
  }, [agent.name, agent.description, agent.prompt, agent.model, agent.tools, agent.disallowedTools])

  const toolPayload = useMemo(
    () => buildToolPayload(toolMode, selectedTools),
    [toolMode, selectedTools],
  )
  const hasChanges =
    description !== agent.description ||
    prompt !== agent.prompt ||
    model !== (agent.model || "inherit") ||
    !arraysEqual(toolPayload.tools, agent.tools) ||
    !arraysEqual(toolPayload.disallowedTools, agent.disallowedTools)
  const canSave = !isReadOnly && description.trim().length > 0 && prompt.trim().length > 0

  const handleSave = useCallback(() => {
    if (!canSave || !hasChanges) return
    onSave({
      description,
      prompt,
      model: model as AgentModel,
      ...toolPayload,
    })
  }, [canSave, hasChanges, description, prompt, model, toolPayload, onSave])

  const handleReset = useCallback(() => {
    setDescription(agent.description)
    setPrompt(agent.prompt)
    setModel(agent.model || "inherit")
    setToolMode(getToolMode(agent))
    setSelectedTools(getSelectedTools(agent))
  }, [agent])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground truncate">{agent.name}</h3>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                  {getAgentSourceLabel(agent.source, t)}
                </span>
                {hasChanges && !isReadOnly && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                    {t("settings.customAgents.unsaved")}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{agent.path}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isReadOnly && hasChanges && (
                <Button variant="ghost" size="sm" onClick={handleReset} disabled={isSaving}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  {t("settings.customAgents.discardChanges")}
                </Button>
              )}
              {!isReadOnly && (
                <Button size="sm" onClick={handleSave} disabled={!hasChanges || !canSave || isSaving}>
                  {isSaving ? t("common.saving") : t("common.save")}
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {t(getSourceHintKey(agent.source))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onOpenFile}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              {t("settings.customAgents.openFile")}
            </Button>
            <Button variant="outline" size="sm" onClick={onRevealInFinder}>
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              {t("settings.customAgents.revealInFinder")}
            </Button>
            {isReadOnly && (
              <Button variant="outline" size="sm" onClick={() => onDuplicate("user")} disabled={isDuplicating}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {t("settings.customAgents.duplicateToUser")}
              </Button>
            )}
            {isReadOnly && hasProject && (
              <Button variant="outline" size="sm" onClick={() => onDuplicate("project")} disabled={isDuplicating}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {t("settings.customAgents.duplicateToProject")}
              </Button>
            )}
            {!isReadOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={isDeleting}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {isDeleting ? t("common.deleting") : t("common.delete")}
              </Button>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label>{t("settings.customAgents.description")}</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            readOnly={isReadOnly}
            placeholder={t("settings.customAgents.descriptionPlaceholder")}
          />
          {!description.trim() && !isReadOnly && (
            <p className="text-[11px] text-destructive">
              {t("settings.customAgents.requiredField")}
            </p>
          )}
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <Label>{t("settings.customAgents.model")}</Label>
          <Select value={model} onValueChange={setModel} disabled={isReadOnly}>
            <SelectTrigger disabled={isReadOnly}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <AgentModelSelectItems t={t} />
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("settings.customAgents.modelScopeHint")}
          </p>
        </div>

        {/* Tools */}
        <div className="space-y-3">
          <Label>{t("settings.customAgents.tools")}</Label>
          <div className="flex flex-wrap gap-2">
            {(["all", "allowlist", "denylist"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={toolMode === mode ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  if (isReadOnly) return
                  setToolMode(mode)
                  if (mode === "all") setSelectedTools([])
                }}
                disabled={isReadOnly}
              >
                {mode === "all" && t("settings.customAgents.allTools")}
                {mode === "allowlist" && t("settings.customAgents.onlySelected")}
                {mode === "denylist" && t("settings.customAgents.exceptSelected")}
              </Button>
            ))}
          </div>
          {toolMode === "all" ? (
            <p className="text-xs text-muted-foreground">
              {t("settings.customAgents.allToolsHint")}
            </p>
          ) : isReadOnly ? (
            <div className="flex flex-wrap gap-1">
              {selectedTools.map((tool) => (
                <span
                  key={tool}
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-medium rounded font-mono",
                    toolMode === "denylist"
                      ? "bg-red-500/10 text-red-500"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {tool}
                </span>
              ))}
            </div>
          ) : (
            <ToolSelector
              selectedTools={selectedTools}
              onChange={setSelectedTools}
              mode={toolMode}
            />
          )}
        </div>

        {/* System Prompt */}
        <div className="space-y-1.5">
          <Label>{t("settings.customAgents.systemPrompt")}</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            readOnly={isReadOnly}
            rows={16}
            className="font-mono resize-y"
            placeholder={t("settings.customAgents.systemPromptPlaceholder")}
          />
          {!prompt.trim() && !isReadOnly && (
            <p className="text-[11px] text-destructive">
              {t("settings.customAgents.requiredField")}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Create Form ---
function CreateAgentForm({
  onCreated,
  onCancel,
  isSaving,
  hasProject,
}: {
  onCreated: (data: { name: string; source: WritableAgentSource } & AgentFormData) => void
  onCancel: () => void
  isSaving: boolean
  hasProject: boolean
}) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState("inherit")
  const [source, setSource] = useState<WritableAgentSource>("user")
  const [toolMode, setToolMode] = useState<ToolMode>("all")
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const toolPayload = useMemo(
    () => buildToolPayload(toolMode, selectedTools),
    [toolMode, selectedTools],
  )

  const canSave =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    prompt.trim().length > 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {t("settings.customAgents.newAgent")}
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => onCreated({
                name,
                description,
                prompt,
                model: model as AgentModel,
                source,
                ...toolPayload,
              })}
              disabled={!canSave || isSaving}
            >
              {isSaving ? t("common.creating") : t("common.create")}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>
            {t("settings.customAgents.name")} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-agent"
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            {t("settings.customAgents.nameHint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>
            {t("settings.customAgents.description")} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("settings.customAgents.whatAgentDoes")}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("settings.customAgents.model")}</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <AgentModelSelectItems t={t} />
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("settings.customAgents.modelScopeHint")}
          </p>
        </div>

        {hasProject && (
          <div className="space-y-1.5">
            <Label>{t("settings.customAgents.scope")}</Label>
            <Select value={source} onValueChange={(v) => setSource(v as WritableAgentSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">
                  {t("settings.customAgents.scopeUser")}
                </SelectItem>
                <SelectItem value="project">
                  {t("settings.customAgents.scopeProject")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {t(source === "project"
                ? "settings.customAgents.sourceHintProject"
                : "settings.customAgents.sourceHintUser")}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <Label>{t("settings.customAgents.tools")}</Label>
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
                {mode === "all" && t("settings.customAgents.allTools")}
                {mode === "allowlist" && t("settings.customAgents.onlySelected")}
                {mode === "denylist" && t("settings.customAgents.exceptSelected")}
              </Button>
            ))}
          </div>
          {toolMode === "all" ? (
            <p className="text-xs text-muted-foreground">
              {t("settings.customAgents.allToolsHint")}
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
            {t("settings.customAgents.systemPrompt")} <span className="text-destructive">*</span>
          </Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={12}
            className="font-mono resize-y"
            placeholder={t("settings.customAgents.newSystemPromptPlaceholder")}
          />
        </div>
      </div>
    </div>
  )
}

// --- Main Component ---
export function AgentsCustomAgentsTab() {
  const { t } = useI18n()
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [deletingAgent, setDeletingAgent] = useState<FileAgent | null>(null)
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

  const { data: agents = [], isLoading, refetch } = trpc.agents.list.useQuery(
    selectedProject?.path ? { cwd: selectedProject.path } : undefined,
  )

  const updateMutation = trpc.agents.update.useMutation()
  const createMutation = trpc.agents.create.useMutation()
  const duplicateMutation = trpc.agents.create.useMutation()
  const deleteMutation = trpc.agents.delete.useMutation()
  const openFileMutation = trpc.external.openFileInEditor.useMutation()
  const revealInFinderMutation = trpc.external.openInFinder.useMutation()

  const resolveAgentPath = useCallback((agent: FileAgent) => {
    if (
      agent.source === "project" &&
      selectedProject?.path &&
      !agent.path.startsWith("/") &&
      !agent.path.startsWith("~")
    ) {
      return `${selectedProject.path}/${agent.path}`
    }
    return agent.path
  }, [selectedProject?.path])

  const handleCreate = useCallback(async (data: { name: string; source: WritableAgentSource } & AgentFormData) => {
    try {
      const result = await createMutation.mutateAsync({
        name: data.name,
        description: data.description,
        prompt: data.prompt,
        model: data.model && data.model !== "inherit" ? data.model : undefined,
        tools: data.tools,
        disallowedTools: data.disallowedTools,
        source: data.source,
        cwd: selectedProject?.path,
      })
      toast.success(t("settings.customAgents.toast.created"), { description: result.name })
      setShowAddForm(false)
      await refetch()
      setSelectedAgentId(`${result.source}::${result.name}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.customAgents.toast.failedToCreate")
      toast.error(t("settings.customAgents.toast.failedToCreate"), { description: message })
    }
  }, [createMutation, selectedProject?.path, refetch, t])

  const handleOpenFile = useCallback(async (agent: FileAgent) => {
    try {
      await openFileMutation.mutateAsync({
        path: resolveAgentPath(agent),
        cwd: selectedProject?.path,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.customAgents.toast.failedToOpenFile")
      toast.error(t("settings.customAgents.toast.failedToOpenFile"), { description: message })
    }
  }, [openFileMutation, resolveAgentPath, selectedProject?.path, t])

  const handleRevealInFinder = useCallback(async (agent: FileAgent) => {
    try {
      await revealInFinderMutation.mutateAsync(resolveAgentPath(agent))
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.customAgents.toast.failedToReveal")
      toast.error(t("settings.customAgents.toast.failedToReveal"), { description: message })
    }
  }, [revealInFinderMutation, resolveAgentPath, t])

  const handleDuplicate = useCallback(async (agent: FileAgent, targetSource: WritableAgentSource) => {
    try {
      const name = createDuplicateName(agent.name, targetSource, agents)
      const result = await duplicateMutation.mutateAsync({
        name,
        description: agent.description,
        prompt: agent.prompt,
        model: agent.model && agent.model !== "inherit" ? agent.model : undefined,
        tools: agent.tools,
        disallowedTools: agent.disallowedTools,
        source: targetSource,
        cwd: selectedProject?.path,
      })
      toast.success(t("settings.customAgents.toast.duplicated"), { description: result.name })
      setShowAddForm(false)
      await refetch()
      setSelectedAgentId(`${result.source}::${result.name}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.customAgents.toast.failedToDuplicate")
      toast.error(t("settings.customAgents.toast.failedToDuplicate"), { description: message })
    }
  }, [agents, duplicateMutation, selectedProject?.path, refetch, t])

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents
    const q = searchQuery.toLowerCase()
    return agents.filter((a) =>
      a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    )
  }, [agents, searchQuery])

  const userAgents = filteredAgents.filter((a) => a.source === "user")
  const projectAgents = filteredAgents.filter((a) => a.source === "project")
  const pluginAgents = filteredAgents.filter((a) => a.source === "plugin")

  const allAgentIds = useMemo(
    () => [...userAgents, ...projectAgents, ...pluginAgents].map(getAgentId),
    [userAgents, projectAgents, pluginAgents]
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: allAgentIds,
    selectedItem: selectedAgentId,
    onSelect: setSelectedAgentId,
  })

  const selectedAgent = agents.find((a) => getAgentId(a) === selectedAgentId) || null

  // Auto-select first agent when data loads
  useEffect(() => {
    if (selectedAgentId || isLoading || agents.length === 0) return
    setSelectedAgentId(getAgentId(agents[0]!))
  }, [agents, selectedAgentId, isLoading])

  const handleSave = useCallback(async (
    agent: FileAgent,
    data: AgentFormData,
  ) => {
    try {
      if (agent.source === "plugin") {
        toast.error(t("settings.customAgents.toast.pluginReadOnly"), { description: agent.name })
        return
      }
      await updateMutation.mutateAsync({
        originalName: agent.name,
        name: agent.name,
        description: data.description,
        prompt: data.prompt,
        model: data.model,
        tools: data.tools,
        disallowedTools: data.disallowedTools,
        source: agent.source,
        cwd: selectedProject?.path,
      })
      toast.success(t("settings.customAgents.toast.saved"), { description: agent.name })
      await refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.customAgents.toast.failedToSave")
      toast.error(t("settings.customAgents.toast.failedToSave"), { description: message })
    }
  }, [updateMutation, selectedProject?.path, refetch, t])

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingAgent || deletingAgent.source === "plugin") return
    try {
      await deleteMutation.mutateAsync({
        name: deletingAgent.name,
        source: deletingAgent.source,
        cwd: selectedProject?.path,
      })
      toast.success(t("settings.customAgents.toast.deleted"), { description: deletingAgent.name })
      setDeletingAgent(null)
      setSelectedAgentId(null)
      await refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.customAgents.toast.failedToDelete")
      toast.error(t("settings.customAgents.toast.failedToDelete"), { description: message })
    }
  }, [deleteMutation, deletingAgent, selectedProject?.path, refetch, t])

  return (
    <>
      <div className="flex h-full overflow-hidden">
        {/* Left sidebar - agent list */}
        <ResizableSidebar
          isOpen={true}
          onClose={() => {}}
          widthAtom={settingsAgentsSidebarWidthAtom}
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
              placeholder={t("settings.customAgents.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={listKeyDown}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none"
            />
            <button
              onClick={() => { setShowAddForm(true); setSelectedAgentId(null) }}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title={t("settings.customAgents.createNewAgent")}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {/* Agent list */}
          <div ref={listRef} onKeyDown={listKeyDown} tabIndex={-1} className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
              </div>
            ) : agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <CustomAgentIconFilled className="h-8 w-8 text-border mb-3" />
                <p className="text-sm text-muted-foreground mb-1">
                  {t("settings.customAgents.noAgents")}
                </p>
                <p className="text-[11px] text-muted-foreground/70 mb-2">
                  {t("settings.customAgents.emptyHint")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {t("settings.customAgents.createAgent")}
                </Button>
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-muted-foreground">
                  {t("settings.customAgents.noResults")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* User Agents */}
                {userAgents.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      {t("common.user")}
                    </p>
                    <div className="space-y-0.5">
                      {userAgents.map((agent) => {
                        const agentId = getAgentId(agent)
                        const isSelected = selectedAgentId === agentId
                        return (
                          <button
                            key={agentId}
                            data-item-id={agentId}
                            onClick={() => setSelectedAgentId(agentId)}
                            className={cn(
                              "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
                              isSelected
                                ? "bg-foreground/5 text-foreground"
                                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm truncate flex-1">
                                {agent.name}
                              </span>
                              <AgentModelBadge model={agent.model} />
                            </div>
                            {agent.description && (
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {agent.description}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Project Agents */}
                {projectAgents.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      {t("common.project")}
                    </p>
                    <div className="space-y-0.5">
                      {projectAgents.map((agent) => {
                        const agentId = getAgentId(agent)
                        const isSelected = selectedAgentId === agentId
                        return (
                          <button
                            key={agentId}
                            data-item-id={agentId}
                            onClick={() => setSelectedAgentId(agentId)}
                            className={cn(
                              "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
                              isSelected
                                ? "bg-foreground/5 text-foreground"
                                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm truncate flex-1">
                                {agent.name}
                              </span>
                              <AgentModelBadge model={agent.model} />
                            </div>
                            {agent.description && (
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {agent.description}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Plugin Agents */}
                {pluginAgents.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      {t("common.plugin")}
                    </p>
                    <div className="space-y-0.5">
                      {pluginAgents.map((agent) => {
                        const agentId = getAgentId(agent)
                        const isSelected = selectedAgentId === agentId
                        return (
                          <button
                            key={agentId}
                            data-item-id={agentId}
                            onClick={() => setSelectedAgentId(agentId)}
                            className={cn(
                              "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
                              isSelected
                                ? "bg-foreground/5 text-foreground"
                                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm truncate flex-1">
                                {agent.name}
                              </span>
                              <AgentModelBadge model={agent.model} />
                            </div>
                            {agent.description && (
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {agent.description}
                              </div>
                            )}
                          </button>
                        )
                      })}
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
          <CreateAgentForm
            onCreated={handleCreate}
            onCancel={() => setShowAddForm(false)}
            isSaving={createMutation.isPending}
            hasProject={!!selectedProject?.path}
          />
        ) : selectedAgent ? (
          <AgentDetail
            agent={selectedAgent}
            onSave={(data) => handleSave(selectedAgent, data)}
            onDelete={() => setDeletingAgent(selectedAgent)}
            onDuplicate={(targetSource) => handleDuplicate(selectedAgent, targetSource)}
            onOpenFile={() => handleOpenFile(selectedAgent)}
            onRevealInFinder={() => handleRevealInFinder(selectedAgent)}
            isSaving={updateMutation.isPending}
            isDeleting={deleteMutation.isPending}
            isDuplicating={duplicateMutation.isPending}
            hasProject={!!selectedProject?.path}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <CustomAgentIconFilled className="h-12 w-12 text-border mb-4" />
            <p className="text-sm text-muted-foreground">
              {agents.length > 0
                ? t("settings.customAgents.selectToView")
                : t("settings.customAgents.noneFound")}
            </p>
            {agents.length === 0 && (
              <>
                <p className="text-xs text-muted-foreground/70 mt-2 max-w-sm">
                  {t("settings.customAgents.emptyHint")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {t("settings.customAgents.createFirstAgent")}
                </Button>
              </>
            )}
          </div>
        )}
        </div>
      </div>
      <AlertDialog open={!!deletingAgent} onOpenChange={(open) => !open && setDeletingAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.customAgents.confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.customAgents.confirmDeleteDescription", {
                name: deletingAgent?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmDelete()
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending
                ? t("common.deleting")
                : t("settings.customAgents.confirmDeleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
