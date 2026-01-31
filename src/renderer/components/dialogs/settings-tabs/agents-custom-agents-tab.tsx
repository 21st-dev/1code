import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useListKeyboardNav } from "./use-list-keyboard-nav"
import { useAtomValue } from "jotai"
import { selectedProjectAtom, settingsAgentsSidebarWidthAtom } from "../../../features/agents/atoms"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { Plus } from "lucide-react"
import { CustomAgentIconFilled } from "../../ui/icons"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select"
import { Textarea } from "../../ui/textarea"
import { Button } from "../../ui/button"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import { toast } from "sonner"

interface FileAgent {
  name: string
  description: string
  prompt: string
  tools?: string[]
  disallowedTools?: string[]
  model?: "sonnet" | "opus" | "haiku" | "inherit"
  source: "user" | "project"
  path: string
}

// --- Detail Panel (Editable) ---
function AgentDetail({
  agent,
  onSave,
  isSaving,
}: {
  agent: FileAgent
  onSave: (data: { description: string; prompt: string; model?: "sonnet" | "opus" | "haiku" | "inherit" }) => void
  isSaving: boolean
}) {
  const [description, setDescription] = useState(agent.description)
  const [prompt, setPrompt] = useState(agent.prompt)
  const [model, setModel] = useState<string>(agent.model || "inherit")

  // Reset local state when agent changes
  useEffect(() => {
    setDescription(agent.description)
    setPrompt(agent.prompt)
    setModel(agent.model || "inherit")
  }, [agent.name, agent.description, agent.prompt, agent.model])

  const hasChanges =
    description !== agent.description ||
    prompt !== agent.prompt ||
    model !== (agent.model || "inherit")

  const handleSave = useCallback(() => {
    if (
      description !== agent.description ||
      prompt !== agent.prompt ||
      model !== (agent.model || "inherit")
    ) {
      onSave({
        description,
        prompt,
        model: model as FileAgent["model"],
      })
    }
  }, [description, prompt, model, agent.description, agent.prompt, agent.model, onSave])

  const handleBlur = useCallback(() => {
    if (
      description !== agent.description ||
      prompt !== agent.prompt ||
      model !== (agent.model || "inherit")
    ) {
      onSave({
        description,
        prompt,
        model: model as FileAgent["model"],
      })
    }
  }, [description, prompt, model, agent.description, agent.prompt, agent.model, onSave])

  const handleModelChange = useCallback((value: string) => {
    setModel(value)
    // Auto-save with new model value
    if (
      description !== agent.description ||
      prompt !== agent.prompt ||
      value !== (agent.model || "inherit")
    ) {
      onSave({
        description,
        prompt,
        model: value as FileAgent["model"],
      })
    }
  }, [description, prompt, agent.description, agent.prompt, agent.model, onSave])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{agent.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{agent.path}</p>
          </div>
          {hasChanges && (
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleBlur}
            placeholder="Agent description..."
          />
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <Label>Model</Label>
          <Select value={model} onValueChange={handleModelChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Inherit from parent</SelectItem>
              <SelectItem value="sonnet">Sonnet</SelectItem>
              <SelectItem value="opus">Opus</SelectItem>
              <SelectItem value="haiku">Haiku</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tools (read-only) */}
        {agent.tools && agent.tools.length > 0 && (
          <div className="space-y-1.5">
            <Label>Allowed Tools</Label>
            <div className="flex flex-wrap gap-1">
              {agent.tools.map((tool) => (
                <span
                  key={tool}
                  className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground font-mono"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Disallowed Tools (read-only) */}
        {agent.disallowedTools && agent.disallowedTools.length > 0 && (
          <div className="space-y-1.5">
            <Label>Disallowed Tools</Label>
            <div className="flex flex-wrap gap-1">
              {agent.disallowedTools.map((tool) => (
                <span
                  key={tool}
                  className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-500/10 text-red-500 font-mono"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* System Prompt */}
        <div className="space-y-1.5">
          <Label>System Prompt</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={handleBlur}
            rows={16}
            className="font-mono resize-y"
            placeholder="System prompt for this agent..."
          />
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
  onCreated: (data: { name: string; description: string; prompt: string; model?: string; source: "user" | "project" }) => void
  onCancel: () => void
  isSaving: boolean
  hasProject: boolean
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState("inherit")
  const [source, setSource] = useState<"user" | "project">("user")

  const canSave = name.trim().length > 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">New Agent</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={() => onCreated({ name, description, prompt, model, source })} disabled={!canSave || isSaving}>
              {isSaving ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-agent"
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">Lowercase letters, numbers, and hyphens</p>
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this agent does..."
          />
        </div>

        <div className="space-y-1.5">
          <Label>Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Inherit from parent</SelectItem>
              <SelectItem value="sonnet">Sonnet</SelectItem>
              <SelectItem value="opus">Opus</SelectItem>
              <SelectItem value="haiku">Haiku</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasProject && (
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select value={source} onValueChange={(v) => setSource(v as "user" | "project")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User (~/.claude/agents/)</SelectItem>
                <SelectItem value="project">Project (.claude/agents/)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>System Prompt</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={12}
            className="font-mono resize-y"
            placeholder="You are a specialized agent that..."
          />
        </div>
      </div>
    </div>
  )
}

// --- Main Component ---
export function AgentsCustomAgentsTab() {
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null)
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

  const { data: agents = [], isLoading, refetch } = trpc.agents.list.useQuery(
    selectedProject?.path ? { cwd: selectedProject.path } : undefined,
  )

  const updateMutation = trpc.agents.update.useMutation()
  const createMutation = trpc.agents.create.useMutation()

  const handleCreate = useCallback(async (data: {
    name: string; description: string; prompt: string; model?: string; source: "user" | "project"
  }) => {
    try {
      const result = await createMutation.mutateAsync({
        name: data.name,
        description: data.description,
        prompt: data.prompt,
        model: (data.model && data.model !== "inherit" ? data.model : undefined) as FileAgent["model"],
        source: data.source,
        cwd: selectedProject?.path,
      })
      toast.success("Agent created", { description: result.name })
      setShowAddForm(false)
      await refetch()
      setSelectedAgentName(result.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create"
      toast.error("Failed to create", { description: message })
    }
  }, [createMutation, selectedProject?.path, refetch])

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents
    const q = searchQuery.toLowerCase()
    return agents.filter((a) =>
      a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    )
  }, [agents, searchQuery])

  const userAgents = filteredAgents.filter((a) => a.source === "user")
  const projectAgents = filteredAgents.filter((a) => a.source === "project")

  const allAgentNames = useMemo(
    () => [...userAgents, ...projectAgents].map((a) => a.name),
    [userAgents, projectAgents]
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: allAgentNames,
    selectedItem: selectedAgentName,
    onSelect: setSelectedAgentName,
  })

  const selectedAgent = agents.find((a) => a.name === selectedAgentName) || null

  // Auto-select first agent when data loads
  useEffect(() => {
    if (selectedAgentName || isLoading || agents.length === 0) return
    setSelectedAgentName(agents[0]!.name)
  }, [agents, selectedAgentName, isLoading])

  const handleSave = useCallback(async (
    agent: FileAgent,
    data: { description: string; prompt: string; model?: FileAgent["model"] },
  ) => {
    try {
      await updateMutation.mutateAsync({
        originalName: agent.name,
        name: agent.name,
        description: data.description,
        prompt: data.prompt,
        model: data.model,
        tools: agent.tools,
        disallowedTools: agent.disallowedTools,
        source: agent.source,
        cwd: selectedProject?.path,
      })
      toast.success("Agent saved", { description: agent.name })
      await refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save"
      toast.error("Failed to save", { description: message })
    }
  }, [updateMutation, selectedProject?.path, refetch])

  return (
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
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={listKeyDown}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none"
            />
            <button
              onClick={() => { setShowAddForm(true); setSelectedAgentName(null) }}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title="Create new agent"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {/* Agent list */}
          <div ref={listRef} onKeyDown={listKeyDown} tabIndex={-1} className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            ) : agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <CustomAgentIconFilled className="h-8 w-8 text-border mb-3" />
                <p className="text-sm text-muted-foreground mb-1">No agents</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create agent
                </Button>
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-muted-foreground">No results found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* User Agents */}
                {userAgents.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      User
                    </p>
                    <div className="space-y-0.5">
                      {userAgents.map((agent) => {
                        const isSelected = selectedAgentName === agent.name
                        return (
                          <button
                            key={agent.name}
                            data-item-id={agent.name}
                            onClick={() => setSelectedAgentName(agent.name)}
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
                              {agent.model && agent.model !== "inherit" && (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {agent.model}
                                </span>
                              )}
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
                      Project
                    </p>
                    <div className="space-y-0.5">
                      {projectAgents.map((agent) => {
                        const isSelected = selectedAgentName === agent.name
                        return (
                          <button
                            key={agent.name}
                            data-item-id={agent.name}
                            onClick={() => setSelectedAgentName(agent.name)}
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
                              {agent.model && agent.model !== "inherit" && (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {agent.model}
                                </span>
                              )}
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
            isSaving={updateMutation.isPending}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <CustomAgentIconFilled className="h-12 w-12 text-border mb-4" />
            <p className="text-sm text-muted-foreground">
              {agents.length > 0
                ? "Select an agent to view details"
                : "No custom agents found"}
            </p>
            {agents.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create your first agent
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
