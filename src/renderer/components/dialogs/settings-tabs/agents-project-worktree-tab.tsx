import { useAtomValue, useSetAtom } from "jotai"
import { FolderOpen, Info, Plus, RotateCcw, Trash2 } from "lucide-react"
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import finderIcon from "../../../assets/app-icons/finder.png"
import { settingsProjectsSidebarWidthAtom } from "../../../features/agents/atoms"
import { COMMAND_PROMPTS } from "../../../features/agents/commands"
import {
  agentsSettingsDialogOpenAtom,
  selectedAgentChatIdAtom,
  selectedProjectAtom,
} from "../../../lib/atoms"
import {
  invalidateProjectIcon,
  useProjectIcon,
} from "../../../lib/hooks/use-project-icon"
import { useI18n } from "../../../lib/i18n"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../ui/alert-dialog"
import { Button, buttonVariants } from "../../ui/button"
import {
  AIPenIcon,
  ExternalLinkIcon,
  FolderFilledIcon,
  ImageIcon,
} from "../../ui/icons"
import { Input } from "../../ui/input"
import { ProjectIcon } from "../../ui/project-icon"
import { ResizableSidebar } from "../../ui/resizable-sidebar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../../ui/select"
import { Textarea } from "../../ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip"
import { useListKeyboardNav } from "./use-list-keyboard-nav"

type ProjectListProject = {
  id: string
  name: string
  path: string
  iconPath?: string | null
  updatedAt?: string | Date | null
  removedAt?: string | Date | null
  gitOwner?: string | null
  gitProvider?: string | null
}

type ProjectSelection =
  | {
      kind: "active" | "removed"
      id: string
    }
  | null

function projectSelectionKey(selection: ProjectSelection): string | null {
  return selection ? `${selection.kind}:${selection.id}` : null
}

function parseProjectSelectionKey(key: string): ProjectSelection {
  const [kind, id] = key.split(":")
  if ((kind === "active" || kind === "removed") && id) {
    return { kind, id }
  }
  return null
}

function formatProjectDate(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function CommandTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  ariaLabel,
}: {
  value: string
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onBlur: () => void
  placeholder: string
  ariaLabel: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`
    textarea.style.overflowY = textarea.scrollHeight > 128 ? "auto" : "hidden"
  }, [])

  useEffect(() => {
    resize()
  }, [value, resize])

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      onInput={resize}
      onFocus={resize}
      onBlur={onBlur}
      rows={1}
      placeholder={placeholder}
      title={value || placeholder}
      aria-label={ariaLabel}
      spellCheck={false}
      wrap="soft"
      className="min-h-10 flex-1 resize-none overflow-hidden py-2 font-mono text-[13px] leading-5"
    />
  )
}

// --- Detail Panel ---
function ProjectDetail({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const trpcUtils = trpc.useUtils()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Get config for selected project
  const { data: configData, refetch: refetchConfig } =
    trpc.worktreeConfig.get.useQuery({ projectId }, { enabled: !!projectId })

  // Save mutation (auto-save, no toast on success — only on error)
  const saveMutation = trpc.worktreeConfig.save.useMutation({
    onError: (err) => {
      toast.error(
        t("settings.projects.toast.failedToSave", { message: err.message }),
      )
    },
  })

  // For "Fill with AI" - create chat and close settings
  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedProject = useSetAtom(selectedProjectAtom)
  const createChatMutation = trpc.chats.create.useMutation({
    onSuccess: (data) => {
      setSettingsDialogOpen(false)
      setSelectedChatId(data.id)
    },
  })

  // Get project info
  const { data: project, refetch: refetchProject } = trpc.projects.get.useQuery(
    { id: projectId },
    { enabled: !!projectId },
  )
  const { data: deletionPreview, isFetching: isDeletionPreviewLoading } =
    trpc.projects.deletionPreview.useQuery(
      { id: projectId },
      { enabled: !!projectId && showDeleteDialog },
    )

  // Cached project icon
  const { src: iconSrc } = useProjectIcon(project)

  // Rename mutation
  const renameMutation = trpc.projects.rename.useMutation({
    onSuccess: () => {
      refetchProject()
      toast.success(t("settings.projects.toast.renamed"))
    },
    onError: (err) => {
      toast.error(
        t("settings.projects.toast.failedToRename", { message: err.message }),
      )
    },
  })

  // Delete project mutation
  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: async () => {
      setShowDeleteDialog(false)
      await Promise.all([
        trpcUtils.projects.list.invalidate(),
        trpcUtils.projects.listRemoved.invalidate(),
        trpcUtils.projects.get.invalidate({ id: projectId }),
        trpcUtils.chats.list.invalidate(),
        trpcUtils.chats.listArchived.invalidate(),
      ])
      toast.success(t("settings.projects.toast.removed"))
      setSelectedProject((current) => {
        if (current?.id === projectId) {
          return null
        }
        return current
      })
    },
    onError: (err) => {
      toast.error(
        t("settings.projects.toast.failedToDelete", { message: err.message }),
      )
    },
  })

  // Icon mutations
  const uploadIconMutation = trpc.projects.uploadIcon.useMutation({
    onSuccess: (data) => {
      if (!data) return // User cancelled file picker
      invalidateProjectIcon(projectId)
      refetchProject()
      toast.success(t("settings.projects.toast.iconUpdated"))
    },
    onError: (err) => {
      toast.error(
        t("settings.projects.toast.failedToUploadIcon", {
          message: err.message,
        }),
      )
    },
  })

  const removeIconMutation = trpc.projects.removeIcon.useMutation({
    onSuccess: () => {
      invalidateProjectIcon(projectId)
      refetchProject()
      toast.success(t("settings.projects.toast.iconRemoved"))
    },
  })

  const activeJobCount = deletionPreview?.activeJobs.length ?? 0
  const isDeleteBlocked = activeJobCount > 0

  // Project name editing
  const [projectName, setProjectName] = useState("")
  const savedNameRef = useRef("")

  useEffect(() => {
    if (project?.name) {
      setProjectName(project.name)
      savedNameRef.current = project.name
    }
  }, [project?.name])

  const handleNameBlur = useCallback(async () => {
    const trimmed = projectName.trim()
    if (!trimmed || trimmed === savedNameRef.current) {
      setProjectName(savedNameRef.current)
      return
    }
    renameMutation.mutate({ id: projectId, name: trimmed })
    savedNameRef.current = trimmed
  }, [projectName, projectId, renameMutation])

  // Local state
  const [saveTarget, setSaveTarget] = useState<"locus" | "cursor" | "1code">(
    "locus",
  )
  const [commands, setCommands] = useState<string[]>([""])
  const [unixCommands, setUnixCommands] = useState<string[]>([])
  const [windowsCommands, setWindowsCommands] = useState<string[]>([])
  const [showPlatformSpecific, setShowPlatformSpecific] = useState(false)

  // Ref to track last saved state for dirty checking
  const savedConfigRef = useRef<string>("")
  const configReadyRef = useRef(false)

  // Sync from server data
  useEffect(() => {
    if (configData) {
      const newSaveTarget =
        configData.source === "cursor"
          ? "cursor"
          : configData.source === "1code"
            ? "1code"
            : "locus"
      setSaveTarget(newSaveTarget)

      let newCommands: string[] = [""]
      let newUnix: string[] = []
      let newWin: string[] = []

      if (configData.config) {
        const isComment = (s: string) => s.trimStart().startsWith("#")
        const filterComments = (arr: string[]) =>
          arr.filter((s) => !isComment(s))

        const generic = configData.config["setup-worktree"]
        const genericArr = Array.isArray(generic)
          ? filterComments(generic)
          : generic && !isComment(generic)
            ? [generic]
            : []
        newCommands = genericArr.length > 0 ? [...genericArr, ""] : [""]

        const unix = configData.config["setup-worktree-unix"]
        const win = configData.config["setup-worktree-windows"]

        newUnix = Array.isArray(unix)
          ? filterComments(unix)
          : unix && !isComment(unix)
            ? [unix]
            : []
        newWin = Array.isArray(win)
          ? filterComments(win)
          : win && !isComment(win)
            ? [win]
            : []

        if (unix || win) {
          setShowPlatformSpecific(true)
        }
      }

      setCommands(newCommands)
      setUnixCommands(newUnix)
      setWindowsCommands(newWin)

      // Snapshot the initial state so doSave won't fire on first render
      savedConfigRef.current = JSON.stringify({
        commands: newCommands,
        unixCommands: newUnix,
        windowsCommands: newWin,
        saveTarget: newSaveTarget,
      })
      configReadyRef.current = true
    }
  }, [configData])

  const doSave = useCallback(() => {
    if (!projectId || !configReadyRef.current) return

    const currentState = JSON.stringify({
      commands,
      unixCommands,
      windowsCommands,
      saveTarget,
    })
    if (currentState === savedConfigRef.current) return

    const config: Record<string, string[]> = {}
    const filteredCommands = commands.filter((c) => c.trim())
    const filteredUnix = unixCommands.filter((c) => c.trim())
    const filteredWin = windowsCommands.filter((c) => c.trim())

    if (filteredCommands.length > 0) config["setup-worktree"] = filteredCommands
    if (filteredUnix.length > 0) config["setup-worktree-unix"] = filteredUnix
    if (filteredWin.length > 0) config["setup-worktree-windows"] = filteredWin

    saveMutation.mutate({ projectId, config, target: saveTarget })
    savedConfigRef.current = currentState
  }, [
    projectId,
    commands,
    unixCommands,
    windowsCommands,
    saveTarget,
    saveMutation,
  ])

  const updateCommand = (
    index: number,
    value: string,
    list: string[],
    setter: (v: string[]) => void,
  ) => {
    const newList = [...list]
    newList[index] = value
    setter(newList)
  }

  const pendingSaveRef = useRef(false)

  const removeCommand = (
    index: number,
    list: string[],
    setter: (v: string[]) => void,
    allowEmpty = false,
  ) => {
    if (!allowEmpty && list.length <= 1) return
    setter(list.filter((_, i) => i !== index))
    pendingSaveRef.current = true
  }

  // Save after state updates from remove or saveTarget change
  useEffect(() => {
    if (pendingSaveRef.current) {
      pendingSaveRef.current = false
      doSave()
    }
  }, [commands, unixCommands, windowsCommands, saveTarget, doSave])

  const addCommand = (list: string[], setter: (v: string[]) => void) => {
    setter([...list, ""])
  }

  const cursorExists = configData?.available?.cursor?.exists ?? false
  const legacyOnecodeExists = configData?.available?.onecode?.exists ?? false
  const selectedConfigPath =
    saveTarget === "locus"
      ? ".locus/worktree.json"
      : saveTarget === "cursor"
        ? ".cursor/worktrees.json"
        : ".1code/worktree.json"
  const selectedConfigLabel =
    saveTarget === "locus"
      ? t("settings.projects.configFileAppDefaultLabel")
      : saveTarget === "cursor"
        ? t("settings.projects.configFileCursorLabel")
        : t("settings.projects.configFileLegacyOnecodeLabel")
  const currentConfigState = JSON.stringify({
    commands,
    unixCommands,
    windowsCommands,
    saveTarget,
  })
  const hasUnsavedConfigChanges =
    configReadyRef.current && currentConfigState !== savedConfigRef.current
  const saveStatusLabel = saveMutation.isPending
    ? t("settings.projects.saveStatusSaving")
    : hasUnsavedConfigChanges
      ? t("settings.projects.saveStatusUnsaved")
      : saveMutation.isError
        ? t("settings.projects.saveStatusFailed")
        : t("settings.projects.saveStatusSavedTo", {
            target: selectedConfigLabel,
          })

  const openInFinderMutation = trpc.external.openInFinder.useMutation()

  const handleOpenInFinder = () => {
    if (project?.path) {
      openInFinderMutation.mutate(project.path)
    }
  }

  // Helper to render a command list with add/remove
  const renderCommandList = (
    list: string[],
    setter: (v: string[]) => void,
    placeholder: string,
    allowEmpty = false,
  ) => (
    <div className="space-y-2">
      {list.map((cmd, i) => (
        <div key={i} className="group flex min-w-0 items-start gap-2">
          <div className="flex h-10 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 font-mono text-[11px] text-muted-foreground">
            {i + 1}
          </div>
          <CommandTextarea
            value={cmd}
            onChange={(e) => updateCommand(i, e.target.value, list, setter)}
            onBlur={doSave}
            placeholder={placeholder}
            ariaLabel={t("settings.projects.commandInputAriaLabel", {
              index: i + 1,
            })}
          />
          {(allowEmpty || list.length > 1) && (
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={() => removeCommand(i, list, setter, allowEmpty)}
              aria-label={t("settings.projects.removeCommand", {
                index: i + 1,
              })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => addCommand(list, setter)}
      >
        <Plus className="h-3.5 w-3.5" />
        {t("settings.projects.addCommand")}
      </button>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* ── General ── */}
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">
            {t("settings.projects.general")}
          </h4>
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            {/* Name */}
            <div className="flex items-center justify-between p-4">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">
                  {t("settings.projects.name")}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t("settings.projects.displayNameDescription")}
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onBlur={handleNameBlur}
                  className="w-full"
                  placeholder={t("settings.projects.projectNamePlaceholder")}
                />
              </div>
            </div>

            {/* Icon */}
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">
                  {t("settings.projects.icon")}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t("settings.projects.iconDescription")}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  className="relative h-10 w-10 rounded-lg border border-border overflow-hidden flex items-center justify-center cursor-pointer bg-muted group/icon"
                  onClick={() => uploadIconMutation.mutate({ id: projectId })}
                  title={t("settings.projects.changeIcon")}
                >
                  {iconSrc ? (
                    <img
                      src={iconSrc}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/icon:opacity-100 transition-opacity duration-150">
                    <ImageIcon className="h-4 w-4 text-white" />
                  </div>
                </button>
                {project?.iconPath && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => removeIconMutation.mutate({ id: projectId })}
                  >
                    {t("common.reset")}
                  </Button>
                )}
              </div>
            </div>

            {/* Path */}
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="flex-1 min-w-0 mr-4">
                <span className="text-sm font-medium text-foreground">
                  {t("settings.projects.path")}
                </span>
                <p className="text-sm text-muted-foreground truncate">
                  {project?.path || "—"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 flex-shrink-0 pl-2"
                onClick={handleOpenInFinder}
                disabled={!project?.path}
              >
                <img src={finderIcon} alt="" className="h-3.5 w-3.5" />
                Finder
              </Button>
            </div>

            {/* Repository */}
            {project?.gitOwner && project?.gitRepo && (
              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">
                    {t("settings.projects.repository")}
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {project.gitOwner}/{project.gitRepo}
                  </p>
                </div>
                {project.gitProvider === "github" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 flex-shrink-0 pl-2"
                    onClick={() => {
                      window.open(
                        `https://github.com/${project.gitOwner}/${project.gitRepo}`,
                        "_blank",
                      )
                    }}
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                    GitHub
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Worktree Setup ── */}
        <div>
          <div className="mb-3 space-y-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-medium text-foreground">
                  {t("settings.projects.worktreeSetup")}
                </h4>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={t("settings.projects.worktreeHelpLabel")}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-80 text-left leading-relaxed"
                  >
                    {t("settings.projects.worktreeHelpBody")}
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("settings.projects.worktreeSetupDescription")}
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              <span
                className={cn(
                  "min-w-0 max-w-full truncate text-sm text-muted-foreground",
                  saveMutation.isError && "text-destructive",
                )}
                title={`${saveStatusLabel} (${selectedConfigPath})`}
              >
                {saveStatusLabel}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const prompt = COMMAND_PROMPTS["worktree-setup"]
                  if (prompt && projectId) {
                    createChatMutation.mutate({
                      projectId,
                      name: "Worktree Setup",
                      initialMessageParts: [{ type: "text", text: prompt }],
                      useWorktree: false,
                      mode: "agent",
                    })
                  }
                }}
                disabled={!projectId || createChatMutation.isPending}
              >
                <AIPenIcon className="h-3.5 w-3.5" />
                {t("settings.projects.fillWithAI")}
              </Button>
            </div>
          </div>
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            {/* Config file */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground">
                  {t("settings.projects.configFile")}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t("settings.projects.configFileDescription")}
                </p>
              </div>
              <Select
                value={saveTarget}
                onValueChange={(v) => {
                  setSaveTarget(v as "locus" | "cursor" | "1code")
                  pendingSaveRef.current = true
                }}
              >
                <SelectTrigger className="w-auto max-w-72 px-3">
                  <span className="truncate text-sm">
                    {selectedConfigLabel}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="locus">
                    <span>
                      {t("settings.projects.configFileAppDefaultLabel")}
                    </span>
                    <span
                      data-desc
                      className="font-mono text-xs text-muted-foreground"
                    >
                      .locus/worktree.json
                    </span>
                  </SelectItem>
                  {cursorExists && (
                    <SelectItem value="cursor">
                      <span>
                        {t("settings.projects.configFileCursorLabel")}
                      </span>
                      <span
                        data-desc
                        className="font-mono text-xs text-muted-foreground"
                      >
                        .cursor/worktrees.json
                      </span>
                    </SelectItem>
                  )}
                  {(legacyOnecodeExists || saveTarget === "1code") && (
                    <SelectItem value="1code">
                      <span>
                        {t("settings.projects.configFileLegacyOnecodeLabel")}
                      </span>
                      <span
                        data-desc
                        className="font-mono text-xs text-muted-foreground"
                      >
                        .1code/worktree.json
                      </span>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Setup commands */}
            <div className="space-y-3 border-t border-border p-4">
              <div>
                <span className="text-sm font-medium text-foreground">
                  {t("settings.projects.setupCommands")}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t("settings.projects.setupCommandsDescription")}{" "}
                  <button
                    type="button"
                    className="font-mono text-xs bg-muted px-1 py-0.5 rounded hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText("$ROOT_WORKTREE_PATH")
                      toast.success(t("settings.projects.toast.copied"))
                    }}
                    title={t("settings.projects.clickToCopy")}
                  >
                    $ROOT_WORKTREE_PATH
                  </button>{" "}
                  {t("settings.projects.forMainRepo")}
                </p>
              </div>
              {renderCommandList(
                commands,
                setCommands,
                "bun install && cp $ROOT_WORKTREE_PATH/.env .env",
              )}
            </div>

            {/* Platform overrides — macOS/Linux */}
            {(unixCommands.length > 0 || showPlatformSpecific) && (
              <div className="p-4 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    macOS / Linux
                  </span>
                  {unixCommands.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      {t("settings.projects.fallsBack")}
                    </span>
                  )}
                </div>
                {renderCommandList(
                  unixCommands,
                  setUnixCommands,
                  "brew install deps",
                  true,
                )}
              </div>
            )}

            {/* Platform overrides — Windows */}
            {(windowsCommands.length > 0 || showPlatformSpecific) && (
              <div className="p-4 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    Windows
                  </span>
                  {windowsCommands.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      {t("settings.projects.fallsBack")}
                    </span>
                  )}
                </div>
                {renderCommandList(
                  windowsCommands,
                  setWindowsCommands,
                  "npm ci",
                  true,
                )}
              </div>
            )}

            {/* Add platform overrides link */}
            {!showPlatformSpecific &&
              unixCommands.length === 0 &&
              windowsCommands.length === 0 && (
                <div className="p-4 border-t border-border">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPlatformSpecific(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("settings.projects.addPlatformOverrides")}
                  </button>
                </div>
              )}
          </div>
        </div>

        {/* ── Danger Zone ── */}
        <div className="pt-2">
          <h4 className="text-sm font-medium text-foreground mb-2">
            {t("settings.projects.dangerZone")}
          </h4>
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">
                  {t("settings.projects.removeProject")}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t("settings.projects.removeDescription")}
                </p>
              </div>
              <AlertDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("common.remove")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("settings.projects.removeProjectTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <span className="block">
                        {deletionPreview
                          ? t(
                              "settings.projects.removeProjectConfirmWithCounts",
                              {
                                name: project?.name || "",
                                chatCount: deletionPreview.chatCount,
                                subChatCount: deletionPreview.subChatCount,
                                worktreeCount: deletionPreview.worktreeCount,
                              },
                            )
                          : isDeletionPreviewLoading
                            ? t("settings.projects.removeProjectConfirmLoading")
                            : t(
                                "settings.projects.removeProjectConfirmUnavailable",
                              )}
                      </span>
                      {isDeleteBlocked && (
                        <span className="block text-destructive">
                          {t("settings.projects.removeProjectBlockedByJobs", {
                            count: activeJobCount,
                          })}
                        </span>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate({ id: projectId })}
                      disabled={
                        deleteMutation.isPending ||
                        !deletionPreview ||
                        isDeleteBlocked
                      }
                      className={buttonVariants({ variant: "destructive" })}
                    >
                      {deleteMutation.isPending
                        ? t("settings.projects.removing")
                        : t("common.remove")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RemovedProjectDetail({
  project,
  onRestored,
  onDeleted,
}: {
  project: ProjectListProject
  onRestored: (projectId: string) => void
  onDeleted: () => void
}) {
  const { t } = useI18n()
  const trpcUtils = trpc.useUtils()
  const [showDeleteHistoryDialog, setShowDeleteHistoryDialog] = useState(false)

  const { data: deletionPreview, isFetching: isDeletionPreviewLoading } =
    trpc.projects.deletionPreview.useQuery(
      { id: project.id },
      { enabled: !!project.id },
    )

  const activeJobCount = deletionPreview?.activeJobs.length ?? 0
  const isDeleteBlocked = activeJobCount > 0

  const restoreMutation = trpc.projects.restore.useMutation({
    onSuccess: async (restoredProject) => {
      await Promise.all([
        trpcUtils.projects.list.invalidate(),
        trpcUtils.projects.listRemoved.invalidate(),
        trpcUtils.projects.get.invalidate({ id: project.id }),
        trpcUtils.chats.list.invalidate(),
        trpcUtils.chats.listArchived.invalidate(),
      ])

      if (!restoredProject) {
        toast.error(t("settings.projects.toast.failedToRestoreNotFound"))
        return
      }

      toast.success(t("settings.projects.toast.restored"))
      onRestored(restoredProject.id)
    },
    onError: (err) => {
      toast.error(
        t("settings.projects.toast.failedToRestore", {
          message: err.message,
        }),
      )
    },
  })

  const deleteHistoryMutation = trpc.projects.deleteHistory.useMutation({
    onSuccess: async () => {
      setShowDeleteHistoryDialog(false)
      await Promise.all([
        trpcUtils.projects.listRemoved.invalidate(),
        trpcUtils.projects.get.invalidate({ id: project.id }),
        trpcUtils.chats.list.invalidate(),
        trpcUtils.chats.listArchived.invalidate(),
      ])
      toast.success(t("settings.projects.toast.historyDeleted"))
      onDeleted()
    },
    onError: (err) => {
      toast.error(
        t("settings.projects.toast.failedToDeleteHistory", {
          message: err.message,
        }),
      )
    },
  })

  const openInFinderMutation = trpc.external.openInFinder.useMutation()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div>
          <h4 className="mb-2 text-sm font-medium text-foreground">
            {t("settings.projects.removedProject")}
          </h4>
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <ProjectIcon project={project} className="h-8 w-8" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {project.name}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {project.path}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 pl-2"
                onClick={() => openInFinderMutation.mutate(project.path)}
                disabled={!project.path}
              >
                <img src={finderIcon} alt="" className="h-3.5 w-3.5" />
                Finder
              </Button>
            </div>
            <div className="border-t border-border p-4">
              <span className="text-sm font-medium text-foreground">
                {t("settings.projects.removedOn")}
              </span>
              <p className="text-sm text-muted-foreground">
                {formatProjectDate(project.removedAt)}
              </p>
            </div>
            <div className="border-t border-border p-4">
              <span className="text-sm font-medium text-foreground">
                {t("settings.projects.savedHistory")}
              </span>
              <p className="text-sm text-muted-foreground">
                {deletionPreview
                  ? t("settings.projects.savedHistoryWithCounts", {
                      chatCount: deletionPreview.chatCount,
                      subChatCount: deletionPreview.subChatCount,
                      worktreeCount: deletionPreview.worktreeCount,
                    })
                  : isDeletionPreviewLoading
                    ? t("settings.projects.savedHistoryLoading")
                    : t("settings.projects.savedHistoryUnavailable")}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium text-foreground">
            {t("settings.projects.recovery")}
          </h4>
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground">
                  {t("settings.projects.restoreProject")}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t("settings.projects.restoreDescription")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => restoreMutation.mutate({ id: project.id })}
                disabled={restoreMutation.isPending}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {restoreMutation.isPending
                  ? t("settings.projects.restoring")
                  : t("settings.projects.restoreProject")}
              </Button>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <h4 className="mb-2 text-sm font-medium text-foreground">
            {t("settings.projects.dangerZone")}
          </h4>
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground">
                  {t("settings.projects.deleteProjectHistory")}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t("settings.projects.deleteProjectHistoryDescription")}
                </p>
              </div>
              <AlertDialog
                open={showDeleteHistoryDialog}
                onOpenChange={setShowDeleteHistoryDialog}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("settings.projects.deleteProjectHistory")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("settings.projects.deleteProjectHistoryTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <span className="block">
                        {deletionPreview
                          ? t(
                              "settings.projects.deleteProjectHistoryConfirmWithCounts",
                              {
                                name: project.name,
                                chatCount: deletionPreview.chatCount,
                                subChatCount: deletionPreview.subChatCount,
                                worktreeCount: deletionPreview.worktreeCount,
                              },
                            )
                          : isDeletionPreviewLoading
                            ? t(
                                "settings.projects.deleteProjectHistoryConfirmLoading",
                              )
                            : t(
                                "settings.projects.deleteProjectHistoryConfirmUnavailable",
                              )}
                      </span>
                      {isDeleteBlocked && (
                        <span className="block text-destructive">
                          {t(
                            "settings.projects.deleteProjectHistoryBlockedByJobs",
                            {
                              count: activeJobCount,
                            },
                          )}
                        </span>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        deleteHistoryMutation.mutate({ id: project.id })
                      }
                      disabled={
                        deleteHistoryMutation.isPending ||
                        !deletionPreview ||
                        isDeleteBlocked
                      }
                      className={buttonVariants({ variant: "destructive" })}
                    >
                      {deleteHistoryMutation.isPending
                        ? t("settings.projects.deletingHistory")
                        : t("common.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Main Two-Panel Component ---
export function AgentsProjectsTab() {
  const { t } = useI18n()
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [selectedProjectSelection, setSelectedProjectSelection] =
    useState<ProjectSelection>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const selectedProjectKey = projectSelectionKey(selectedProjectSelection)

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

  const { data: projects, isLoading } = trpc.projects.list.useQuery()
  const { data: removedProjects, isLoading: isRemovedLoading } =
    trpc.projects.listRemoved.useQuery()

  const openFolderMutation = trpc.projects.openFolder.useMutation({
    onSuccess: (project) => {
      if (project) {
        setSelectedProjectSelection({ kind: "active", id: project.id })
      }
    },
  })

  // Filter projects by search
  const filteredProjects = useMemo(() => {
    if (!projects) return []
    if (!searchQuery.trim()) return projects
    const q = searchQuery.toLowerCase()
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.path?.toLowerCase().includes(q) ||
        p.gitRepo?.toLowerCase().includes(q),
    )
  }, [projects, searchQuery])

  const filteredRemovedProjects = useMemo(() => {
    if (!removedProjects) return []
    if (!searchQuery.trim()) return removedProjects
    const q = searchQuery.toLowerCase()
    return removedProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.path?.toLowerCase().includes(q) ||
        p.gitRepo?.toLowerCase().includes(q),
    )
  }, [removedProjects, searchQuery])

  const allProjectIds = useMemo(
    () => [
      ...filteredProjects.map((p) => `active:${p.id}`),
      ...filteredRemovedProjects.map((p) => `removed:${p.id}`),
    ],
    [filteredProjects, filteredRemovedProjects],
  )

  const { containerRef: listRef, onKeyDown: listKeyDown } = useListKeyboardNav({
    items: allProjectIds,
    selectedItem: selectedProjectKey,
    onSelect: (key) => setSelectedProjectSelection(parseProjectSelectionKey(key)),
  })

  const firstAvailableSelection = useMemo<ProjectSelection>(() => {
    const firstActiveProject = projects?.[0]
    if (firstActiveProject) return { kind: "active", id: firstActiveProject.id }
    const firstRemovedProject = removedProjects?.[0]
    if (firstRemovedProject) {
      return { kind: "removed", id: firstRemovedProject.id }
    }
    return null
  }, [projects, removedProjects])

  // Auto-select first project
  useEffect(() => {
    if (selectedProjectSelection || isLoading || isRemovedLoading) return
    if (firstAvailableSelection?.id) {
      setSelectedProjectSelection(firstAvailableSelection)
    }
  }, [
    firstAvailableSelection,
    selectedProjectSelection,
    isLoading,
    isRemovedLoading,
  ])

  // Clear stale selection after a project is removed from the active list.
  useEffect(() => {
    if (
      !selectedProjectSelection ||
      isLoading ||
      isRemovedLoading ||
      !projects ||
      !removedProjects
    ) {
      return
    }
    const selectionStillExists =
      selectedProjectSelection.kind === "active"
        ? projects.some((project) => project.id === selectedProjectSelection.id)
        : removedProjects.some(
            (project) => project.id === selectedProjectSelection.id,
          )
    if (!selectionStillExists) {
      setSelectedProjectSelection(firstAvailableSelection?.id ? firstAvailableSelection : null)
    }
  }, [
    projects,
    removedProjects,
    selectedProjectSelection,
    firstAvailableSelection,
    isLoading,
    isRemovedLoading,
  ])

  // Sync selection from global selectedProject (e.g., toast action)
  useEffect(() => {
    if (!selectedProject?.id) return
    setSelectedProjectSelection({ kind: "active", id: selectedProject.id })
  }, [selectedProject?.id])

  const selectedRemovedProject = useMemo(
    () =>
      selectedProjectSelection?.kind === "removed"
        ? removedProjects?.find(
            (project) => project.id === selectedProjectSelection.id,
          )
        : null,
    [removedProjects, selectedProjectSelection],
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar - project list */}
      <ResizableSidebar
        isOpen={true}
        onClose={() => {}}
        widthAtom={settingsProjectsSidebarWidthAtom}
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
          {/* Search + Add */}
          <div className="px-2 pt-2 flex-shrink-0 flex items-center gap-1.5">
            <input
              ref={searchInputRef}
              placeholder={t("settings.projects.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={listKeyDown}
              className="h-7 w-full rounded-lg text-sm bg-muted border border-input px-3 placeholder:text-muted-foreground/40 outline-none"
            />
            <button
              onClick={() => openFolderMutation.mutate()}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title={t("settings.projects.addProjectFolder")}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Project list */}
          <div
            ref={listRef}
            onKeyDown={listKeyDown}
            tabIndex={-1}
            role="listbox"
            aria-label={t("settings.projects.projectListLabel")}
            className="flex-1 overflow-y-auto px-2 pt-2 pb-2 outline-none"
          >
            {isLoading || isRemovedLoading ? (
              <div className="flex items-center justify-center h-full">
                <FolderFilledIcon className="h-5 w-5 text-muted-foreground animate-pulse" />
              </div>
            ) : (projects?.length ?? 0) + (removedProjects?.length ?? 0) ===
              0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <FolderFilledIcon className="h-8 w-8 text-border mb-3" />
                <p className="text-sm text-muted-foreground mb-1">
                  {t("settings.projects.noProjects")}
                </p>
                <button
                  onClick={() => openFolderMutation.mutate()}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {t("settings.projects.addFirstProject")}
                </button>
              </div>
            ) : filteredProjects.length === 0 &&
              filteredRemovedProjects.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-muted-foreground">
                  {t("settings.projects.noResults")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredProjects.length > 0 && (
                  <div className="space-y-0.5">
                    {filteredRemovedProjects.length > 0 && (
                      <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                        {t("settings.projects.activeProjects")}
                      </div>
                    )}
                    {filteredProjects.map((project) => {
                      const key = `active:${project.id}`
                      const isSelected = selectedProjectKey === key
                      return (
                        <button
                          key={project.id}
                          type="button"
                          data-item-id={key}
                          onClick={() =>
                            setSelectedProjectSelection({
                              kind: "active",
                              id: project.id,
                            })
                          }
                          className={cn(
                            "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
                            isSelected
                              ? "bg-foreground/5 text-foreground"
                              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <ProjectIcon
                              project={project}
                              className="h-4 w-4"
                            />
                            <span className="text-sm truncate flex-1">
                              {project.name}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {filteredRemovedProjects.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                      {t("settings.projects.removedProjects")}
                    </div>
                    {filteredRemovedProjects.map((project) => {
                      const key = `removed:${project.id}`
                      const isSelected = selectedProjectKey === key
                      return (
                        <button
                          key={project.id}
                          type="button"
                          data-item-id={key}
                          onClick={() =>
                            setSelectedProjectSelection({
                              kind: "removed",
                              id: project.id,
                            })
                          }
                          className={cn(
                            "w-full text-left py-1.5 px-2 rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 focus-visible:-outline-offset-2",
                            isSelected
                              ? "bg-foreground/5 text-foreground"
                              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <ProjectIcon
                              project={project}
                              className="h-4 w-4 opacity-60"
                            />
                            <span className="flex-1 truncate text-sm">
                              {project.name}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </ResizableSidebar>

      {/* Right content - detail panel */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {selectedProjectSelection?.kind === "active" ? (
          <ProjectDetail projectId={selectedProjectSelection.id} />
        ) : selectedProjectSelection?.kind === "removed" &&
          selectedRemovedProject ? (
          <RemovedProjectDetail
            project={selectedRemovedProject}
            onRestored={(projectId) =>
              setSelectedProjectSelection({ kind: "active", id: projectId })
            }
            onDeleted={() => setSelectedProjectSelection(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <FolderFilledIcon className="h-12 w-12 text-border mb-4" />
            <p className="text-sm text-muted-foreground">
              {(projects?.length ?? 0) + (removedProjects?.length ?? 0) > 0
                ? t("settings.projects.selectToView")
                : t("settings.projects.noneAdded")}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Keep legacy export for backward compatibility
export const AgentsProjectWorktreeTab = AgentsProjectsTab
