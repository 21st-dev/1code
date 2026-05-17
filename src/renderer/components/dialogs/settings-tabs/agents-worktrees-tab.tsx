import { useState, useEffect } from "react"
import { useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { useI18n } from "../../../lib/i18n"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Plus, Trash2, ChevronDown } from "lucide-react"
import { AIPenIcon } from "../../ui/icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../../ui/select"
import { toast } from "sonner"
import { COMMAND_PROMPTS } from "../../../features/agents/commands"
import {
  agentsSettingsDialogOpenAtom,
  selectedAgentChatIdAtom,
} from "../../../lib/atoms"

function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

export function AgentsWorktreesTab() {
  const { t } = useI18n()
  const isNarrowScreen = useIsNarrowScreen()

  // Get projects list
  const { data: projects } = trpc.projects.list.useQuery()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  )

  // Get config for selected project
  const { data: configData, refetch: refetchConfig } =
    trpc.worktreeConfig.get.useQuery(
      { projectId: selectedProjectId! },
      { enabled: !!selectedProjectId },
    )

  // Save mutation
  const saveMutation = trpc.worktreeConfig.save.useMutation({
    onSuccess: () => {
      toast.success(t("settings.worktrees.toast.saved"))
      refetchConfig()
    },
    onError: (err) => {
      toast.error(t("settings.worktrees.toast.failedToSave", { message: err.message }))
    },
  })

  // For "Fill with AI" - create chat and close settings
  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const createChatMutation = trpc.chats.create.useMutation({
    onSuccess: (data) => {
      setSettingsDialogOpen(false)
      setSelectedChatId(data.id)
    },
  })

  // Local state
  const [saveTarget, setSaveTarget] = useState<"cursor" | "1code">("1code")
  const [commands, setCommands] = useState<string[]>([""])
  const [unixCommands, setUnixCommands] = useState<string[]>([])
  const [windowsCommands, setWindowsCommands] = useState<string[]>([])
  const [showPlatformSpecific, setShowPlatformSpecific] = useState(false)

  // Auto-select first project
  useEffect(() => {
    if (projects && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id)
    }
  }, [projects, selectedProjectId])

  // Sync from server data
  useEffect(() => {
    if (configData) {
      if (configData.source === "cursor") {
        setSaveTarget("cursor")
      } else {
        setSaveTarget("1code")
      }

      if (configData.config) {
        // Generic commands
        const generic = configData.config["setup-worktree"]
        setCommands(
          Array.isArray(generic)
            ? [...generic, ""]
            : generic
              ? [generic, ""]
              : [""],
        )

        // Platform-specific
        const unix = configData.config["setup-worktree-unix"]
        const win = configData.config["setup-worktree-windows"]

        setUnixCommands(
          Array.isArray(unix) ? unix : unix ? [unix] : [],
        )
        setWindowsCommands(
          Array.isArray(win) ? win : win ? [win] : [],
        )

        // Show platform section if any platform-specific commands exist
        if (unix || win) {
          setShowPlatformSpecific(true)
        }
      } else {
        setCommands([""])
        setUnixCommands([])
        setWindowsCommands([])
      }
    }
  }, [configData])

  const handleSave = () => {
    if (!selectedProjectId) return

    const config: Record<string, string[]> = {}
    const filteredCommands = commands.filter((c) => c.trim())
    const filteredUnix = unixCommands.filter((c) => c.trim())
    const filteredWin = windowsCommands.filter((c) => c.trim())

    if (filteredCommands.length > 0) {
      config["setup-worktree"] = filteredCommands
    }
    if (filteredUnix.length > 0) {
      config["setup-worktree-unix"] = filteredUnix
    }
    if (filteredWin.length > 0) {
      config["setup-worktree-windows"] = filteredWin
    }

    saveMutation.mutate({
      projectId: selectedProjectId,
      config,
      target: saveTarget,
    })
  }

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

  const removeCommand = (
    index: number,
    list: string[],
    setter: (v: string[]) => void,
  ) => {
    if (list.length <= 1) return
    setter(list.filter((_, i) => i !== index))
  }

  const addCommand = (list: string[], setter: (v: string[]) => void) => {
    setter([...list, ""])
  }

  const selectedProject = projects?.find((p) => p.id === selectedProjectId)
  const cursorExists = configData?.available?.cursor?.exists ?? false

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">
            {t("settings.worktrees.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("settings.worktrees.subtitle")}
          </p>
        </div>
      )}

      {/* Project Selection */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">
            {t("common.project")}
          </h4>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">
                {t("settings.worktrees.selectProject")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("settings.worktrees.selectProjectDescription")}
              </p>
            </div>
            <div className="flex-shrink-0 w-64">
              <Select
                value={selectedProjectId ?? ""}
                onValueChange={setSelectedProjectId}
              >
                <SelectTrigger className="w-full">
                  <span className="text-sm truncate">
                    {selectedProject?.name ?? t("settings.worktrees.selectPlaceholder")}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {selectedProjectId && (
        <>
          {/* Config Location */}
          <div className="space-y-2">
            <div className="pb-2">
              <h4 className="text-sm font-medium text-foreground">
                {t("settings.worktrees.configLocation")}
              </h4>
              {configData?.path && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("settings.worktrees.usingPath", { path: configData.path })}
                </p>
              )}
            </div>

            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-6">
                <div className="flex-1">
                  <Label className="text-sm font-medium">
                    {t("settings.worktrees.saveTo")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.worktrees.saveToDescription")}
                  </p>
                </div>
                <div className="flex-shrink-0 w-auto min-w-56 max-w-80">
                  <Select
                    value={saveTarget}
                    onValueChange={(v) => setSaveTarget(v as "cursor" | "1code")}
                  >
                    <SelectTrigger className="w-full">
                      <span className="text-sm font-mono truncate">
                        {saveTarget === "cursor"
                          ? ".cursor/worktrees.json"
                          : ".1code/worktree.json"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1code">
                        .1code/worktree.json
                      </SelectItem>
                      {cursorExists && (
                        <SelectItem value="cursor">
                          .cursor/worktrees.json
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Setup Commands - Main */}
          <div className="space-y-2">
            <div className="pb-2 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-foreground">
                  {t("settings.worktrees.setupCommands")}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("settings.worktrees.setupCommandsDescription")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const prompt = COMMAND_PROMPTS["worktree-setup"]
                  if (prompt && selectedProjectId) {
                    createChatMutation.mutate({
                      projectId: selectedProjectId,
                      name: "Worktree Setup",
                      initialMessageParts: [{ type: "text", text: prompt }],
                      useWorktree: false,
                      mode: "agent",
                    })
                  }
                }}
                disabled={!selectedProjectId || createChatMutation.isPending}
              >
                <AIPenIcon className="h-3.5 w-3.5" />
                {t("settings.projects.fillWithAI")}
              </Button>
            </div>

            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    {t("settings.worktrees.allPlatforms")}
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {t("settings.worktrees.useRootPathPrefix")}{" "}
                    <code className="font-mono bg-muted px-1 py-0.5 rounded">$ROOT_WORKTREE_PATH</code>{" "}
                    {t("settings.worktrees.useRootPathSuffix")}
                  </span>
                </div>
                <div className="space-y-2">
                  {commands.map((cmd, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={cmd}
                        onChange={(e) =>
                          updateCommand(i, e.target.value, commands, setCommands)
                        }
                        placeholder="bun install && cp $ROOT_WORKTREE_PATH/.env .env"
                        className="flex-1 font-mono text-sm"
                      />
                      {commands.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeCommand(i, commands, setCommands)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => addCommand(commands, setCommands)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("settings.projects.addCommand")}
                </Button>
              </div>

              {/* Platform-specific toggle */}
              <div className="border-t">
                <button
                  type="button"
                  className="w-full p-3 flex items-center justify-between text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => setShowPlatformSpecific(!showPlatformSpecific)}
                >
                  <span>{t("settings.projects.addPlatformOverrides")}</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      showPlatformSpecific ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {showPlatformSpecific && (
                  <div className="p-4 pt-0 space-y-4">
                    {/* Unix Commands */}
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        macOS / Linux
                      </span>
                      {unixCommands.length === 0 ? (
                        <p className="text-xs text-muted-foreground/60 italic">
                          {t("settings.worktrees.fallsBackAllPlatforms")}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {unixCommands.map((cmd, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                value={cmd}
                                onChange={(e) =>
                                  updateCommand(
                                    i,
                                    e.target.value,
                                    unixCommands,
                                    setUnixCommands,
                                  )
                                }
                                placeholder="bun install"
                                className="flex-1 font-mono text-sm"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  removeCommand(i, unixCommands, setUnixCommands)
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground h-7 text-xs"
                        onClick={() => addCommand(unixCommands, setUnixCommands)}
                      >
                        <Plus className="h-3 w-3" />
                        {t("common.add")}
                      </Button>
                    </div>

                    {/* Windows Commands */}
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Windows
                      </span>
                      {windowsCommands.length === 0 ? (
                        <p className="text-xs text-muted-foreground/60 italic">
                          {t("settings.worktrees.fallsBackAllPlatforms")}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {windowsCommands.map((cmd, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                value={cmd}
                                onChange={(e) =>
                                  updateCommand(
                                    i,
                                    e.target.value,
                                    windowsCommands,
                                    setWindowsCommands,
                                  )
                                }
                                placeholder="npm ci"
                                className="flex-1 font-mono text-sm"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  removeCommand(
                                    i,
                                    windowsCommands,
                                    setWindowsCommands,
                                  )
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground h-7 text-xs"
                        onClick={() =>
                          addCommand(windowsCommands, setWindowsCommands)
                        }
                      >
                        <Plus className="h-3 w-3" />
                        {t("common.add")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-muted p-3 flex justify-end gap-2 border-t">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
