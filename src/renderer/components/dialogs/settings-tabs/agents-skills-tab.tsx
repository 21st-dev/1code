import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useListKeyboardNav } from "./use-list-keyboard-nav"
import { useAtomValue } from "jotai"
import { selectedProjectAtom, settingsSkillsSidebarWidthAtom } from "../../../features/agents/atoms"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { Plus } from "lucide-react"
import { SkillIcon, MarkdownIcon, CodeIcon } from "../../ui/icons"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select"
import { Textarea } from "../../ui/textarea"
import { Button } from "../../ui/button"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import { ChatMarkdownRenderer } from "../../chat-markdown-renderer"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip"
import { toast } from "sonner"

// --- Detail Panel (Editable) ---
function SkillDetail({
  skill,
  onSave,
  isSaving,
}: {
  skill: { name: string; description: string; source: "user" | "project"; path: string; content: string }
  onSave: (data: { description: string; content: string }) => void
  isSaving: boolean
}) {
  const [description, setDescription] = useState(skill.description)
  const [content, setContent] = useState(skill.content)
  const [viewMode, setViewMode] = useState<"rendered" | "editor">("rendered")

  // Reset local state when skill changes
  useEffect(() => {
    setDescription(skill.description)
    setContent(skill.content)
    setViewMode("rendered")
  }, [skill.name, skill.description, skill.content])

  const hasChanges =
    description !== skill.description ||
    content !== skill.content

  const handleSave = useCallback(() => {
    if (description !== skill.description || content !== skill.content) {
      onSave({ description, content })
    }
  }, [description, content, skill.description, skill.content, onSave])

  const handleBlur = useCallback(() => {
    if (description !== skill.description || content !== skill.content) {
      onSave({ description, content })
    }
  }, [description, content, skill.description, skill.content, onSave])

  const handleToggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      if (prev === "editor") {
        // Switching from editor to preview — auto-save
        if (description !== skill.description || content !== skill.content) {
          onSave({ description, content })
        }
      }
      return prev === "rendered" ? "editor" : "rendered"
    })
  }, [description, content, skill.description, skill.content, onSave])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{skill.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{skill.path}</p>
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
            placeholder="Skill description..."
          />
        </div>

        {/* Usage */}
        <div className="space-y-1.5">
          <Label>Usage</Label>
          <div className="px-3 py-2 text-sm bg-muted/50 border border-border rounded-lg">
            <code className="text-xs text-foreground">@{skill.name}</code>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Instructions</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleViewMode}
                  className="h-6 w-6 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
                  aria-label={viewMode === "rendered" ? "Edit markdown" : "Preview markdown"}
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
                {viewMode === "rendered" ? "Edit markdown" : "Preview markdown"}
              </TooltipContent>
            </Tooltip>
          </div>

          {viewMode === "rendered" ? (
            <div
              className="rounded-lg border border-border bg-background overflow-hidden px-4 py-3 min-h-[120px] cursor-pointer hover:border-foreground/20 transition-colors"
              onClick={handleToggleViewMode}
            >
              {content ? (
                <ChatMarkdownRenderer content={content} size="sm" />
              ) : (
                <p className="text-sm text-muted-foreground">No instructions</p>
              )}
            </div>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={handleBlur}
              rows={16}
              className="font-mono resize-y"
              placeholder="Skill instructions (markdown)..."
              autoFocus
            />
          )}
        </div>
      </div>
    </div>
  )
}

// --- Create Form ---
function CreateSkillForm({
  onCreated,
  onCancel,
  isSaving,
  hasProject,
}: {
  onCreated: (data: { name: string; description: string; content: string; source: "user" | "project" }) => void
  onCancel: () => void
  isSaving: boolean
  hasProject: boolean
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [source, setSource] = useState<"user" | "project">("user")

  const canSave = name.trim().length > 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">New Skill</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={() => onCreated({ name, description, content, source })} disabled={!canSave || isSaving}>
              {isSaving ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-skill"
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">Lowercase letters, numbers, and hyphens</p>
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this skill does..."
          />
        </div>

        {hasProject && (
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select value={source} onValueChange={(v) => setSource(v as "user" | "project")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User (~/.claude/skills/)</SelectItem>
                <SelectItem value="project">Project (.claude/skills/)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Instructions</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className="font-mono resize-y"
            placeholder="Skill instructions (markdown)..."
          />
        </div>
      </div>
    </div>
  )
}

// --- Main Component ---
export function AgentsSkillsTab() {
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null)
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

  const { data: skills = [], isLoading, refetch } = trpc.skills.list.useQuery(
    selectedProject?.path ? { cwd: selectedProject.path } : undefined,
  )

  const updateMutation = trpc.skills.update.useMutation()
  const createMutation = trpc.skills.create.useMutation()

  const handleCreate = useCallback(async (data: {
    name: string; description: string; content: string; source: "user" | "project"
  }) => {
    try {
      const result = await createMutation.mutateAsync({
        name: data.name,
        description: data.description,
        content: data.content,
        source: data.source,
        cwd: selectedProject?.path,
      })
      toast.success("Skill created", { description: result.name })
      setShowAddForm(false)
      await refetch()
      setSelectedSkillName(result.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create"
      toast.error("Failed to create", { description: message })
    }
  }, [createMutation, selectedProject?.path, refetch])

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return skills
    const q = searchQuery.toLowerCase()
    return skills.filter((s) =>
      s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    )
  }, [skills, searchQuery])

  const userSkills = filteredSkills.filter((s) => s.source === "user")
  const projectSkills = filteredSkills.filter((s) => s.source === "project")

  const allSkillNames = useMemo(
    () => [...userSkills, ...projectSkills].map((s) => s.name),
    [userSkills, projectSkills]
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: allSkillNames,
    selectedItem: selectedSkillName,
    onSelect: setSelectedSkillName,
  })

  const selectedSkill = skills.find((s) => s.name === selectedSkillName) || null

  // Auto-select first skill when data loads
  useEffect(() => {
    if (selectedSkillName || isLoading || skills.length === 0) return
    setSelectedSkillName(skills[0]!.name)
  }, [skills, selectedSkillName, isLoading])

  const handleSave = useCallback(async (
    skill: { name: string; path: string },
    data: { description: string; content: string },
  ) => {
    try {
      await updateMutation.mutateAsync({
        path: skill.path,
        name: skill.name,
        description: data.description,
        content: data.content,
        cwd: selectedProject?.path,
      })
      toast.success("Skill saved", { description: skill.name })
      await refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save"
      toast.error("Failed to save", { description: message })
    }
  }, [updateMutation, selectedProject?.path, refetch])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar - skill list */}
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
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={listKeyDown}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none"
            />
            <button
              onClick={() => { setShowAddForm(true); setSelectedSkillName(null) }}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title="Create new skill"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {/* Skill list */}
          <div ref={listRef} onKeyDown={listKeyDown} tabIndex={-1} className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            ) : skills.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <SkillIcon className="h-8 w-8 text-border mb-3" />
                <p className="text-sm text-muted-foreground mb-1">No skills</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create skill
                </Button>
              </div>
            ) : filteredSkills.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-muted-foreground">No results found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* User Skills */}
                {userSkills.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      User
                    </p>
                    <div className="space-y-0.5">
                      {userSkills.map((skill) => {
                        const isSelected = selectedSkillName === skill.name
                        return (
                          <button
                            key={skill.name}
                            data-item-id={skill.name}
                            onClick={() => setSelectedSkillName(skill.name)}
                            className={cn(
                              "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
                              isSelected
                                ? "bg-foreground/5 text-foreground"
                                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                            )}
                          >
                            <div className="text-sm truncate">
                              {skill.name}
                            </div>
                            {skill.description && (
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {skill.description}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Project Skills */}
                {projectSkills.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      Project
                    </p>
                    <div className="space-y-0.5">
                      {projectSkills.map((skill) => {
                        const isSelected = selectedSkillName === skill.name
                        return (
                          <button
                            key={skill.name}
                            data-item-id={skill.name}
                            onClick={() => setSelectedSkillName(skill.name)}
                            className={cn(
                              "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
                              isSelected
                                ? "bg-foreground/5 text-foreground"
                                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                            )}
                          >
                            <div className="text-sm truncate">
                              {skill.name}
                            </div>
                            {skill.description && (
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {skill.description}
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
          <CreateSkillForm
            onCreated={handleCreate}
            onCancel={() => setShowAddForm(false)}
            isSaving={createMutation.isPending}
            hasProject={!!selectedProject?.path}
          />
        ) : selectedSkill ? (
          <SkillDetail
            skill={selectedSkill}
            onSave={(data) => handleSave(selectedSkill, data)}
            isSaving={updateMutation.isPending}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <SkillIcon className="h-12 w-12 text-border mb-4" />
            <p className="text-sm text-muted-foreground">
              {skills.length > 0
                ? "Select a skill to view details"
                : "No skills found"}
            </p>
            {skills.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create your first skill
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
