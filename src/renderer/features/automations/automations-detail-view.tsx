"use client"

import "./automations-styles.css"
import { useAtomValue, useSetAtom, useAtom } from "jotai"
import { selectedTeamIdAtom } from "../../lib/atoms"
import {
  desktopViewAtom,
  automationDetailIdAtom,
  automationTemplateParamsAtom,
  agentsSidebarOpenAtom,
  agentsMobileViewModeAtom,
} from "../agents/atoms"
import { useIsMobile } from "../../lib/hooks/use-mobile"
import { IconSpinner, IconChevronDown, ExternalLinkIcon } from "../../components/ui/icons"
import { Logo } from "../../components/ui/logo"
import { useState, useEffect, useMemo, useCallback } from "react"
import {
  ArrowLeft,
  Plus,
  Trash2,
  MoreHorizontal,
} from "lucide-react"
import { Badge } from "../../components/ui/badge"
import { remoteTrpc } from "../../lib/remote-trpc"
import { cn } from "../../lib/utils"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Switch } from "../../components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog"

import {
  GITHUB_TRIGGER_OPTIONS,
  LINEAR_TRIGGER_OPTIONS,
  CLAUDE_MODELS,
  getTriggerLabel,
  PlatformIcon,
  type Platform,
  type TriggerType,
} from "./_components"

/** Shorten external_id for display: "owner/repo#123" → "repo#123", "owner/repo:push" → "repo:push" */
function formatExternalId(externalId: string | null | undefined): string {
  if (!externalId) return "Triggered run"
  const slashIdx = externalId.indexOf("/")
  if (slashIdx !== -1) {
    return externalId.slice(slashIdx + 1)
  }
  return externalId
}

function getStatusColor(status: string) {
  switch (status) {
    case "success":
      return "bg-green-500/10 text-green-600 border-green-500/20"
    case "failed":
      return "bg-red-500/10 text-red-600 border-red-500/20"
    case "pending":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
    case "skipped":
      return "bg-muted text-muted-foreground border-border"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function formatDistanceToNow(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)
  if (diffSec < 60) return "less than a minute ago"
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`
  const diffMonth = Math.floor(diffDay / 30)
  return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`
}

export function AutomationsDetailView() {
  const teamId = useAtomValue(selectedTeamIdAtom)
  const automationId = useAtomValue(automationDetailIdAtom)
  const templateParams = useAtomValue(automationTemplateParamsAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const setAutomationDetailId = useSetAtom(automationDetailIdAtom)
  const setTemplateParams = useSetAtom(automationTemplateParamsAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(agentsSidebarOpenAtom)
  const setMobileViewMode = useSetAtom(agentsMobileViewModeAtom)
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()

  const isCreateMode = automationId === "new"

  // ============================================================================
  // Local state for create mode
  // ============================================================================
  const [name, setName] = useState("")
  const [instructions, setInstructions] = useState("")
  const [selectedModel, setSelectedModel] = useState<string>(CLAUDE_MODELS[0].id)
  const [addToInbox, setAddToInbox] = useState(true)
  const [respondToTrigger, setRespondToTrigger] = useState(true)
  const [isEnabled, setIsEnabled] = useState(true)
  const [targetRepository, setTargetRepository] = useState("")

  // Triggers for create mode
  const [localTriggers, setLocalTriggers] = useState<
    Array<{
      id: string
      platform: Platform
      trigger_type: TriggerType
      filters: Array<{ field: string; operator: string; value: string }>
    }>
  >([])

  // Dirty tracking for instructions (auto-save in edit mode)
  const [instructionsDirty, setInstructionsDirty] = useState(false)

  // Exit confirmation (create mode only)
  const [showExitDialog, setShowExitDialog] = useState(false)

  // Delete confirmation
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Past Runs state
  const [pastRunsExpanded, setPastRunsExpanded] = useState(true)
  const [pastRunsOffset, setPastRunsOffset] = useState(0)
  const [additionalExecutions, setAdditionalExecutions] = useState<any[]>([])

  // ============================================================================
  // Fetch existing automation (edit mode)
  // ============================================================================
  const { data: automation, isLoading } = useQuery({
    queryKey: ["automations", "get", automationId],
    queryFn: () => remoteTrpc.automations.getAutomation.query({ automationId: automationId! }),
    enabled: !isCreateMode && !!automationId,
  })

  // Fetch additional executions for Past Runs pagination
  const { data: moreExecutionsData, isFetching: isFetchingMoreExecutions } = useQuery({
    queryKey: ["automations", "listExecutions", automationId, pastRunsOffset],
    queryFn: () => remoteTrpc.automations.listExecutions.query({
      automationId: automationId!,
      limit: 20,
      offset: pastRunsOffset,
    }),
    enabled: !isCreateMode && !!automationId && pastRunsOffset > 0,
  })

  // Accumulate additional executions when data arrives
  useEffect(() => {
    if (moreExecutionsData?.executions) {
      setAdditionalExecutions((prev) => [...prev, ...moreExecutionsData.executions])
    }
  }, [moreExecutionsData])

  // Combine initial executions (from getAutomation) with paginated ones
  const allExecutions = useMemo(() => {
    const initial = (automation as any)?.executions || []
    if (additionalExecutions.length === 0) return initial
    const ids = new Set(initial.map((e: any) => e.id))
    const extra = additionalExecutions.filter((e: any) => !ids.has(e.id))
    return [...initial, ...extra]
  }, [(automation as any)?.executions, additionalExecutions])

  const totalExecutions = moreExecutionsData?.total ?? allExecutions.length
  const hasMoreExecutions = allExecutions.length < totalExecutions

  // ============================================================================
  // Fetch GitHub connection status
  // ============================================================================
  const { data: githubStatus } = useQuery({
    queryKey: ["github", "connectionStatus", teamId],
    queryFn: () => remoteTrpc.github.getConnectionStatus.query({ teamId: teamId! }),
    enabled: !!teamId,
  })

  // ============================================================================
  // Fetch Linear integration status
  // ============================================================================
  const { data: linearStatus } = useQuery({
    queryKey: ["linear", "integration", teamId],
    queryFn: () => remoteTrpc.linear.getIntegration.query({ teamId: teamId! }),
    enabled: !!teamId,
  })

  // ============================================================================
  // Initialize from template params or existing automation
  // ============================================================================
  useEffect(() => {
    if (isCreateMode && templateParams) {
      setName(templateParams.name)
      setInstructions(templateParams.instructions)
      if (templateParams.platform && templateParams.trigger) {
        setLocalTriggers([
          {
            id: crypto.randomUUID(),
            platform: templateParams.platform as Platform,
            trigger_type: templateParams.trigger as TriggerType,
            filters: [],
          },
        ])
      }
      // Clear template params after initialization
      setTemplateParams(null)
    }
  }, [isCreateMode, templateParams, setTemplateParams])

  // Populate fields from existing automation (edit mode)
  useEffect(() => {
    if (!isCreateMode && automation) {
      setName(automation.name || "")
      setInstructions(automation.agent_prompt || "")
      setAddToInbox(automation.add_to_inbox ?? true)
      setRespondToTrigger(automation.respond_to_trigger ?? true)
      setIsEnabled(automation.is_enabled ?? true)
      setTargetRepository(automation.target_repository || "")
      setLocalTriggers(
        (automation.triggers || []).map((t: any) => ({
          id: t.id || crypto.randomUUID(),
          platform: t.platform || "github",
          trigger_type: t.trigger_type,
          filters: t.filters || [],
        }))
      )
    }
  }, [isCreateMode, automation])

  // ============================================================================
  // Mutations
  // ============================================================================
  const createMutation = useMutation({
    mutationFn: (data: any) => remoteTrpc.automations.createAutomation.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "list"] })
      doNavigateBack()
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => remoteTrpc.automations.updateAutomation.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "list"] })
      queryClient.invalidateQueries({ queryKey: ["automations", "get", automationId] })
      setInstructionsDirty(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => remoteTrpc.automations.deleteAutomation.mutate({ automationId: automationId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "list"] })
      doNavigateBack()
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      remoteTrpc.automations.updateAutomation.mutate({
        automationId: automationId!,
        isEnabled: enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "get", automationId] })
    },
  })

  // ============================================================================
  // Handlers
  // ============================================================================
  const doNavigateBack = useCallback(() => {
    setAutomationDetailId(null)
    setTemplateParams(null)
    setDesktopView("automations")
  }, [setAutomationDetailId, setTemplateParams, setDesktopView])

  const handleBack = useCallback(() => {
    // In create mode, warn about unsaved changes if there's any content
    if (isCreateMode && (name || instructions || localTriggers.length > 0)) {
      setShowExitDialog(true)
      return
    }
    doNavigateBack()
  }, [isCreateMode, name, instructions, localTriggers, doNavigateBack])

  const handleSave = useCallback(() => {
    if (isCreateMode) {
      createMutation.mutate({
        teamId: teamId!,
        name: name || "Untitled Automation",
        agentPrompt: instructions,
        addToInbox,
        respondToTrigger,
        triggers: localTriggers.map((t) => ({
          platform: t.platform,
          trigger_type: t.trigger_type,
          filters: t.filters,
        })),
        targetRepository: targetRepository || undefined,
      })
    } else {
      updateMutation.mutate({
        automationId: automationId!,
        name,
        agentPrompt: instructions,
        addToInbox,
        respondToTrigger,
        isEnabled,
        triggers: localTriggers.map((t) => ({
          id: t.id,
          platform: t.platform,
          trigger_type: t.trigger_type,
          filters: t.filters,
        })),
        targetRepository: targetRepository || null,
      })
    }
  }, [
    isCreateMode, teamId, name, instructions, addToInbox, respondToTrigger, isEnabled,
    localTriggers, targetRepository, automationId,
    createMutation, updateMutation,
  ])

  const handleAddTrigger = useCallback((platform: Platform) => {
    const defaultTrigger = platform === "github" ? "pr_opened" : "linear_issue_created"
    setLocalTriggers((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        platform,
        trigger_type: defaultTrigger as TriggerType,
        filters: [],
      },
    ])
  }, [])

  const handleRemoveTrigger = useCallback((triggerId: string) => {
    setLocalTriggers((prev) => prev.filter((t) => t.id !== triggerId))
  }, [])

  const handleUpdateTriggerType = useCallback((triggerId: string, triggerType: TriggerType) => {
    setLocalTriggers((prev) =>
      prev.map((t) => (t.id === triggerId ? { ...t, trigger_type: triggerType } : t))
    )
  }, [])

  const isSaving = createMutation.isPending || updateMutation.isPending

  // Determine where comments can be posted based on configured triggers
  const commentTargetDescription = useMemo(() => {
    const hasLinear = localTriggers.some((t) => t.platform === "linear")
    const githubCommentTriggers = ["pr_opened", "pr_closed", "pr_merged", "pr_commits_pushed", "issue_opened", "issue_closed", "issue_comment_created"]
    const hasGithubCommentable = localTriggers.some(
      (t) => t.platform === "github" && githubCommentTriggers.includes(t.trigger_type)
    )
    const hasGithubNonCommentable = localTriggers.some(
      (t) => t.platform === "github" && !githubCommentTriggers.includes(t.trigger_type)
    )

    if (hasGithubCommentable && hasLinear) return "Post comments on GitHub issues/PRs and Linear issues"
    if (hasGithubCommentable) return "Post comments on GitHub issues/PRs"
    if (hasLinear) return "Post comments on Linear issues"
    if (hasGithubNonCommentable) return "No commentable triggers configured (push, branch, workflow triggers don't support comments)"
    return "Post comments on the source issue/PR with progress and results"
  }, [localTriggers])

  // ============================================================================
  // Render
  // ============================================================================
  if (!teamId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Logo className="h-8 w-8 animate-pulse text-muted-foreground" />
      </div>
    )
  }

  if (!isCreateMode && isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" data-automations-page>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={handleBack}
          className="h-7 w-7 p-0 flex items-center justify-center hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2">
          {!isCreateMode && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-7 w-7 p-0 flex items-center justify-center hover:bg-foreground/10 transition-colors rounded-md text-muted-foreground hover:text-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400 focus:bg-red-500/15 focus:text-red-400"
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => {
                    setIsEnabled(checked)
                    if (!isCreateMode) {
                      toggleMutation.mutate(checked)
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">Active</span>
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving || !instructionsDirty}
                className="h-7 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSaving ? <IconSpinner className="h-3 w-3 mr-1" /> : null}
                Save
              </button>
            </>
          )}

          {isCreateMode && (
            <button
              onClick={handleSave}
              disabled={isSaving || localTriggers.length === 0}
              className="h-7 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSaving ? <IconSpinner className="h-3 w-3 mr-1" /> : null}
              Enable
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-xl mx-auto px-4 pb-6 flex flex-col h-full">
          {/* Name input */}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled automation"
            className="text-lg font-medium bg-transparent border-0 outline-none placeholder:text-muted-foreground/50 mb-6"
          />

          {/* Flow builder */}
          <div className="flex-1 flex flex-col items-center">
            {/* When section */}
            <section className="w-full">
              <div className="text-xs font-medium text-muted-foreground mb-2">When</div>

              {/* Existing triggers */}
              <div className="space-y-2">
                {localTriggers.map((trigger) => (
                  <div
                    key={trigger.id}
                    className="border border-border rounded-xl p-3 flex items-center gap-3"
                  >
                    <PlatformIcon platform={trigger.platform} className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Select
                      value={trigger.trigger_type}
                      onValueChange={(v) => handleUpdateTriggerType(trigger.id, v as TriggerType)}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(trigger.platform === "github"
                          ? GITHUB_TRIGGER_OPTIONS
                          : LINEAR_TRIGGER_OPTIONS
                        ).map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => handleRemoveTrigger(trigger.id)}
                      className="h-6 w-6 p-0 flex items-center justify-center hover:bg-red-500/10 transition-colors rounded-md text-muted-foreground hover:text-red-500 flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {/* Add trigger button */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 h-[46px] px-3 w-full border border-border rounded-xl text-muted-foreground hover:bg-muted/30 transition-colors">
                      <Plus className="h-5 w-5" />
                      <span className="text-sm">Add trigger</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[260px]" sideOffset={8}>
                    {githubStatus?.isConnected && (
                      <DropdownMenuItem onClick={() => handleAddTrigger("github")}>
                        <PlatformIcon platform="github" className="h-4 w-4 mr-2" />
                        GitHub
                      </DropdownMenuItem>
                    )}
                    {linearStatus?.isConnected && (
                      <DropdownMenuItem onClick={() => handleAddTrigger("linear")}>
                        <PlatformIcon platform="linear" className="h-4 w-4 mr-2" />
                        Linear
                      </DropdownMenuItem>
                    )}
                    {!githubStatus?.isConnected && !linearStatus?.isConnected && (
                      <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                        Connect GitHub or Linear in Settings to add triggers
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </section>

            {/* Connector line */}
            <div className="w-0.5 h-14 bg-border rounded-full my-4" />

            {/* Do section */}
            <section className="w-full flex flex-col gap-1">
              <div className="text-xs font-medium text-muted-foreground h-6 flex items-center">Do</div>

              {/* Action card */}
              <div className="rounded-xl bg-background border border-border overflow-hidden">
                <div className="relative p-3">
                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-accent/50 shrink-0">
                      <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1 text-sm leading-5">
                      <span>Run</span>
                      <Select value={selectedModel} onValueChange={setSelectedModel}>
                        <SelectTrigger className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded bg-accent/50 hover:bg-accent text-sm border-0 w-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLAUDE_MODELS.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span>in</span>
                      <span className="inline-flex items-center gap-0.5 px-1 h-5 rounded bg-accent/50 text-sm opacity-70">
                        Agent
                      </span>
                      <span>mode</span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="absolute left-0 right-0 mt-3 border-t border-border" />

                  {/* Target repository */}
                  <div className="mt-6">
                    <label className="text-sm text-muted-foreground mb-1.5 block">
                      Target repository
                    </label>
                    <input
                      value={targetRepository}
                      onChange={(e) => setTargetRepository(e.target.value)}
                      placeholder="owner/repo (optional)"
                      className="w-full h-9 rounded-md text-sm bg-muted/50 border border-border px-3 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Repository where Claude Code will make changes
                    </p>
                  </div>

                  {/* Instructions */}
                  <div className="mt-4">
                    <label className="text-sm text-muted-foreground mb-1.5 block">
                      Instructions
                    </label>
                    <textarea
                      value={instructions}
                      onChange={(e) => {
                        setInstructions(e.target.value)
                        if (!isCreateMode) setInstructionsDirty(true)
                      }}
                      placeholder="Add instructions for the agent..."
                      rows={6}
                      className="w-full min-h-[100px] rounded-md text-sm bg-muted/50 border border-border p-3 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    />
                  </div>

                  {/* Add to inbox toggle */}
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm text-foreground">Add to inbox</span>
                      <span className="text-xs text-muted-foreground">Show results in your inbox for review</span>
                    </div>
                    <Switch checked={addToInbox} onCheckedChange={setAddToInbox} />
                  </div>

                  {/* Respond to trigger toggle */}
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm text-foreground">Post comments</span>
                      <span className="text-xs text-muted-foreground">{commentTargetDescription}</span>
                    </div>
                    <Switch checked={respondToTrigger} onCheckedChange={setRespondToTrigger} />
                  </div>
                </div>
              </div>

              {/* Add action button - disabled */}
              <button
                disabled
                className="flex items-center gap-2 p-3 w-full border border-border rounded-[10px] text-muted-foreground/50 cursor-not-allowed"
              >
                <Plus className="h-5 w-5" />
                <span className="text-sm">Add action</span>
                <span className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">Soon</span>
              </button>
            </section>

            {/* Past Runs section - only for existing automations */}
            {!isCreateMode && (
              <>
                <div className="w-0.5 h-14 bg-border rounded-full my-4" />

                <section className="w-full mb-8">
                  <button
                    onClick={() => setPastRunsExpanded(!pastRunsExpanded)}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2 hover:text-foreground transition-colors"
                  >
                    <IconChevronDown className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      !pastRunsExpanded && "-rotate-90"
                    )} />
                    <span>Past Runs</span>
                    {allExecutions.length > 0 && (
                      <span className="text-muted-foreground/60 ml-1">
                        ({totalExecutions})
                      </span>
                    )}
                  </button>

                  {pastRunsExpanded && (
                    <div className="rounded-xl bg-background border border-border overflow-hidden">
                      {allExecutions.length === 0 ? (
                        <div className="p-6 text-center">
                          <p className="text-sm text-muted-foreground">
                            No runs yet. This automation will appear here once triggered.
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {allExecutions.map((execution: any) => (
                            <div key={execution.id} className="flex items-center gap-3 px-3 py-2.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] px-1.5 py-0 h-5 flex-shrink-0 capitalize",
                                  getStatusColor(execution.status)
                                )}
                              >
                                {execution.status}
                              </Badge>

                              <div className="flex-1 min-w-0">
                                {execution.external_url ? (
                                  <button
                                    onClick={() => {
                                      if (window.desktopApi?.openExternal) {
                                        window.desktopApi.openExternal(execution.external_url)
                                      } else {
                                        window.open(execution.external_url, "_blank")
                                      }
                                    }}
                                    className="text-sm text-foreground hover:underline truncate inline-flex items-center gap-1 text-left"
                                  >
                                    <span className="truncate">
                                      {formatExternalId(execution.external_id)}
                                    </span>
                                    <ExternalLinkIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                  </button>
                                ) : (
                                  <span className="text-sm text-muted-foreground truncate block">
                                    {formatExternalId(execution.external_id)}
                                  </span>
                                )}
                                {execution.status === "failed" && execution.error_message && (
                                  <p className="text-xs text-red-500 mt-0.5 truncate">
                                    {execution.error_message}
                                  </p>
                                )}
                              </div>

                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {formatDistanceToNow(new Date(execution.created_at))}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {hasMoreExecutions && (
                        <div className="border-t border-border px-3 py-2">
                          <button
                            onClick={() => setPastRunsOffset((prev) => prev === 0 ? 10 : prev + 20)}
                            disabled={isFetchingMoreExecutions}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center py-1"
                          >
                            {isFetchingMoreExecutions ? (
                              <IconSpinner className="h-3 w-3 mx-auto" />
                            ) : (
                              "Show more"
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Automation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this automation? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? <IconSpinner className="h-4 w-4 mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Exit confirmation dialog (create mode) */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doNavigateBack}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
