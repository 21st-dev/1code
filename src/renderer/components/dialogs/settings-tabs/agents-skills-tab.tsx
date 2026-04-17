import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useListKeyboardNav } from "./use-list-keyboard-nav"
import { useAtomValue } from "jotai"
import { selectedProjectAtom, settingsSkillsSidebarWidthAtom } from "../../../features/agents/atoms"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { Plus, Trash2 } from "lucide-react"
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
  kind: "skill" | "command"
  name: string
  description: string
  source: "user" | "project" | "plugin"
  pluginName?: string
  path: string
  content: string
  argumentHint?: string
}

// --- Detail Panel (Editable) ---
function ItemDetail({
  item,
  onSave,
  onDelete,
  isSaving,
}: {
  item: UnifiedItem
  onSave: (data: { description: string; content: string }) => void
  onDelete?: () => void
  isSaving: boolean
}) {
  const [description, setDescription] = useState(item.description)
  const [content, setContent] = useState(item.content)
  const [viewMode, setViewMode] = useState<"rendered" | "editor">("rendered")

  const isReadOnly = item.source === "plugin"

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
                item.kind === "skill"
                  ? "bg-blue-500/10 text-blue-500"
                  : "bg-orange-500/10 text-orange-500"
              )}>
                {item.kind === "skill" ? "Skill" : "Command"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{item.path}</p>
          </div>
          {!isReadOnly && hasChanges && (
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label>Description</Label>
          {isReadOnly ? (
            <p className="text-sm text-foreground px-3 py-2 bg-muted/50 border border-border rounded-lg">
              {item.description || <span className="text-muted-foreground">No description</span>}
            </p>
          ) : (
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleBlur}
              placeholder={item.kind === "skill" ? "Skill description..." : "Command description..."}
            />
          )}
        </div>

        {/* Usage */}
        <div className="space-y-1.5">
          <Label>Usage</Label>
          <div className="px-3 py-2 text-sm bg-muted/50 border border-border rounded-lg">
            <code className="text-xs text-foreground">
              {item.kind === "skill" ? `@${item.name}` : `/${item.name}`}
            </code>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Instructions</Label>
            {!isReadOnly && (
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
              placeholder={item.kind === "skill" ? "Skill instructions (markdown)..." : "Command prompt (markdown)..."}
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
              Delete {item.kind === "skill" ? "Skill" : "Command"}
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
            {kind === "skill" ? "New Skill" : "New Command"}
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={() => onCreated({ name, description, content, source, kind })} disabled={!canSave || isSaving}>
              {isSaving ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as "skill" | "command")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="skill">Skill (referenced inside OpenCodex)</SelectItem>
              <SelectItem value="command">Command (triggered with /slash)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "skill" ? "my-skill" : "my-command"}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">Will be converted to kebab-case (lowercase letters, numbers, hyphens)</p>
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={kind === "skill" ? "What this skill does..." : "What this command does..."}
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
                <SelectItem value="user">
                  {kind === "skill" ? "Available on this device" : "Available on this device"}
                </SelectItem>
                <SelectItem value="project">
                  {projectName ? `Current project: ${projectName}` : "Current project"} ({kind === "skill" ? "current project skill library" : "current project command library"})
                </SelectItem>
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
            placeholder={kind === "skill" ? "Skill instructions (markdown)..." : "Command prompt (markdown)..."}
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
          item.kind === "command" ? "text-orange-500/70" : "text-blue-500/70"
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

  const isLoading = isLoadingSkills || isLoadingCommands

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchSkills(), refetchCommands()])
  }, [refetchSkills, refetchCommands])

  // Delete confirmation dialog state
  const [deletingItem, setDeletingItem] = useState<UnifiedItem | null>(null)

  // Mutations
  const updateSkillMutation = trpc.skills.update.useMutation()
  const createSkillMutation = trpc.skills.create.useMutation()
  const deleteSkillMutation = trpc.skills.delete.useMutation()
  const updateCommandMutation = trpc.commands.update.useMutation()
  const createCommandMutation = trpc.commands.create.useMutation()
  const deleteCommandMutation = trpc.commands.delete.useMutation()

  // Build unified items
  const allItems = useMemo<UnifiedItem[]>(() => {
    const skillItems: UnifiedItem[] = skills.map((s) => ({
      id: `skill:${s.source}:${s.name}`,
      kind: "skill" as const,
      name: s.name,
      description: s.description,
      source: s.source,
      pluginName: s.pluginName,
      path: s.path,
      content: s.content,
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
    return [...skillItems, ...cmdItems]
  }, [skills, commands])

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
  const pluginItems = filteredItems.filter((i) => i.source === "plugin")

  const allItemIds = useMemo(
    () => [...userItems, ...projectItems, ...pluginItems].map((i) => i.id),
    [userItems, projectItems, pluginItems]
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
        toast.success("Skill created", { description: result.name })
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
        toast.success("Command created", { description: result.name })
        setShowAddForm(false)
        await refetchAll()
        setSelectedItemId(`cmd:${data.source}:${result.name}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create"
      toast.error("Failed to create", { description: message })
    }
  }, [createSkillMutation, createCommandMutation, selectedProject?.path, refetchAll])

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
      toast.success(`${item.kind === "skill" ? "Skill" : "Command"} saved`, { description: item.name })
      await refetchAll()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save"
      toast.error("Failed to save", { description: message })
    }
  }, [updateSkillMutation, updateCommandMutation, selectedProject?.path, refetchAll])

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
      toast.success(`${deletingItem.kind === "skill" ? "Skill" : "Command"} deleted`, { description: deletingItem.name })
      setDeletingItem(null)
      setSelectedItemId(null)
      await refetchAll()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete"
      toast.error("Failed to delete", { description: message })
    }
  }, [deletingItem, deleteSkillMutation, deleteCommandMutation, selectedProject?.path, refetchAll])

  const isSaving = updateSkillMutation.isPending || updateCommandMutation.isPending
  const isCreating = createSkillMutation.isPending || createCommandMutation.isPending
  const isDeleting = deleteSkillMutation.isPending || deleteCommandMutation.isPending
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
              placeholder="Search skills & commands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={listKeyDown}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none"
            />
            <button
              onClick={() => { setShowAddForm(true); setSelectedItemId(null) }}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title="Create new skill or command"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {/* Item list */}
          <div ref={listRef} onKeyDown={listKeyDown} tabIndex={-1} className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            ) : totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <SkillIcon className="h-8 w-8 text-border mb-3" />
                <p className="text-sm text-muted-foreground mb-1">No skills or commands</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create
                </Button>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-muted-foreground">No results found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* User */}
                {userItems.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      User
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
                      Project
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
                      Plugin
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
            onDelete={selectedItem.source !== "plugin" ? () => setDeletingItem(selectedItem) : undefined}
            isSaving={isSaving}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <SkillIcon className="h-12 w-12 text-border mb-4" />
            <p className="text-sm text-muted-foreground">
              {totalCount > 0
                ? "Select an item to view details"
                : "No skills or commands found"}
            </p>
            {totalCount === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create your first local skill or command
              </Button>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingItem} onOpenChange={(open) => { if (!open) setDeletingItem(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deletingItem?.kind === "skill" ? "Skill" : "Command"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingItem?.name}</strong>?
              This will remove the file from disk and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
