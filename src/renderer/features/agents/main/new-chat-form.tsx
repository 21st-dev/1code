"use client"

import { useVirtualizer } from "@tanstack/react-virtual"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { AlignJustify, Plus, Zap } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "../../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import {
  AgentIcon,
  AttachIcon,
  BranchIcon,
  CheckIcon,
  ClaudeCodeIcon,
  CursorIcon,
  IconChevronDown,
  PlanIcon,
  SearchIcon,
} from "../../../components/ui/icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover"
import { cn } from "../../../lib/utils"
import {
  agentsDebugModeAtom,
  isPlanModeAtom,
  justCreatedIdsAtom,
  lastSelectedAgentIdAtom,
  lastSelectedBranchesAtom,
  lastSelectedModelIdAtom,
  lastSelectedRepoAtom,
  lastSelectedWorkModeAtom,
  selectedAgentChatIdAtom,
  selectedDraftIdAtom,
  selectedProjectAtom,
} from "../atoms"
import { ProjectSelector } from "../components/project-selector"
import { WorkModeSelector } from "../components/work-mode-selector"
// import { selectedTeamIdAtom } from "@/lib/atoms/team"
import { atom } from "jotai"
const selectedTeamIdAtom = atom<string | null>(null)
import {
  agentsSettingsDialogOpenAtom,
  agentsSettingsDialogActiveTabAtom,
  customClaudeConfigAtom,
  normalizeCustomClaudeConfig,
  showOfflineModeFeaturesAtom,
  selectedOllamaModelAtom,
} from "../../../lib/atoms"
// Desktop uses real tRPC
import { toast } from "sonner"
import { trpc } from "../../../lib/trpc"
import {
  AgentsSlashCommand,
  COMMAND_PROMPTS,
  BUILTIN_SLASH_COMMANDS,
  type SlashCommandOption,
} from "../commands"
import { useAgentsFileUpload } from "../hooks/use-agents-file-upload"
import { useFocusInputOnEnter } from "../hooks/use-focus-input-on-enter"
import { useToggleFocusOnCmdEsc } from "../hooks/use-toggle-focus-on-cmd-esc"
import {
  AgentsFileMention,
  AgentsMentionsEditor,
  type AgentsMentionsEditorHandle,
  type FileMentionOption,
} from "../mentions"
import { AgentImageItem } from "../ui/agent-image-item"
import { AgentsHeaderControls } from "../ui/agents-header-controls"
// import { CreateBranchDialog } from "@/app/(alpha)/agents/{components}/create-branch-dialog"
import {
  PromptInput,
  PromptInputActions,
  PromptInputContextItems,
} from "../../../components/ui/prompt-input"
import { agentsSidebarOpenAtom, agentsUnseenChangesAtom } from "../atoms"
import { AgentSendButton } from "../components/agent-send-button"
import { CreateBranchDialog } from "../components/create-branch-dialog"
import { formatTimeAgo } from "../utils/format-time-ago"
import { handlePasteEvent } from "../utils/paste-text"
import {
  loadGlobalDrafts,
  saveGlobalDrafts,
  generateDraftId,
  deleteNewChatDraft,
  markDraftVisible,
  type DraftProject,
} from "../lib/drafts"
import { CLAUDE_MODELS } from "../lib/models"
// import type { PlanType } from "@/lib/config/subscription-plans"
type PlanType = string

// Codex icon (OpenAI style)
const CodexIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
  </svg>
)

// Hook to get available models (including offline models if Ollama is available and debug enabled)
function useAvailableModels() {
  const { data: ollamaStatus } = trpc.ollama.getStatus.useQuery(undefined, {
    refetchInterval: 30000,
  })
  const showOfflineFeatures = useAtomValue(showOfflineModeFeaturesAtom)

  const baseModels = CLAUDE_MODELS

  const isOffline = ollamaStatus ? !ollamaStatus.internet.online : false
  const hasOllama = ollamaStatus?.ollama.available && (ollamaStatus.ollama.models?.length ?? 0) > 0
  const ollamaModels = ollamaStatus?.ollama.models || []
  const recommendedModel = ollamaStatus?.ollama.recommendedModel

  // Only show offline models if:
  // 1. Debug flag is enabled (showOfflineFeatures)
  // 2. Ollama is available with models
  // 3. User is actually offline
  if (showOfflineFeatures && hasOllama && isOffline) {
    return {
      models: baseModels,
      ollamaModels,
      recommendedModel,
      isOffline,
      hasOllama: true,
    }
  }

  return {
    models: baseModels,
    ollamaModels: [] as string[],
    recommendedModel: undefined as string | undefined,
    isOffline,
    hasOllama: false,
  }
}

// Agent providers
const agents = [
  { id: "claude-code", name: "Claude Code", hasModels: true },
  { id: "cursor", name: "Cursor CLI", disabled: true },
  { id: "codex", name: "OpenAI Codex", disabled: true },
]

interface NewChatFormProps {
  isMobileFullscreen?: boolean
  onBackToChats?: () => void
}

export function NewChatForm({
  isMobileFullscreen = false,
  onBackToChats,
}: NewChatFormProps = {}) {
  // UNCONTROLLED: just track if editor has content for send button
  const [hasContent, setHasContent] = useState(false)
  const [selectedTeamId] = useAtom(selectedTeamIdAtom)
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const [selectedDraftId, setSelectedDraftId] = useAtom(selectedDraftIdAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(agentsSidebarOpenAtom)

  // Current draft ID being edited (generated when user starts typing in empty form)
  const currentDraftIdRef = useRef<string | null>(null)
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)

  // Check if any chat has unseen changes
  const hasAnyUnseenChanges = unseenChanges.size > 0
  const [lastSelectedRepo, setLastSelectedRepo] = useAtom(lastSelectedRepoAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)

  // Fetch projects to validate selectedProject exists
  const { data: projectsList, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery()

  // Validate selected project exists in DB
  // While loading, trust the stored value to prevent flicker
  const validatedProject = useMemo(() => {
    if (!selectedProject) return null
    // While loading, trust localStorage value to prevent flicker
    if (isLoadingProjects) return selectedProject
    // After loading, validate against DB
    if (!projectsList) return null
    const exists = projectsList.some((p) => p.id === selectedProject.id)
    return exists ? selectedProject : null
  }, [selectedProject, projectsList, isLoadingProjects])

  // Clear invalid project from storage
  useEffect(() => {
    if (selectedProject && projectsList && !validatedProject) {
      setSelectedProject(null)
    }
  }, [selectedProject, projectsList, validatedProject, setSelectedProject])
  const [lastSelectedAgentId, setLastSelectedAgentId] = useAtom(
    lastSelectedAgentIdAtom,
  )
  const [lastSelectedModelId, setLastSelectedModelId] = useAtom(
    lastSelectedModelIdAtom,
  )
  const [isPlanMode, setIsPlanMode] = useAtom(isPlanModeAtom)
  const [workMode, setWorkMode] = useAtom(lastSelectedWorkModeAtom)
  const debugMode = useAtomValue(agentsDebugModeAtom)
  const customClaudeConfig = useAtomValue(customClaudeConfigAtom)
  const normalizedCustomClaudeConfig =
    normalizeCustomClaudeConfig(customClaudeConfig)
  const hasCustomClaudeConfig = Boolean(normalizedCustomClaudeConfig)
  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const setJustCreatedIds = useSetAtom(justCreatedIdsAtom)
  const [repoSearchQuery, setRepoSearchQuery] = useState("")
  const [createBranchDialogOpen, setCreateBranchDialogOpen] = useState(false)

  // Worktree config banner state
  const [worktreeBannerDismissed, setWorktreeBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem("worktree-banner-dismissed") === "true"
    } catch {
      return false
    }
  })

  // Check if project has worktree config
  const { data: worktreeConfigData } = trpc.worktreeConfig.get.useQuery(
    { projectId: validatedProject?.id ?? "" },
    { enabled: !!validatedProject?.id && workMode === "worktree" && !worktreeBannerDismissed },
  )

  const showWorktreeBanner =
    workMode === "worktree" &&
    validatedProject &&
    !worktreeBannerDismissed &&
    worktreeConfigData &&
    !worktreeConfigData.config

  const handleDismissWorktreeBanner = () => {
    setWorktreeBannerDismissed(true)
    try {
      localStorage.setItem("worktree-banner-dismissed", "true")
    } catch {}
  }

  const handleConfigureWorktree = () => {
    // Open the project-specific worktree settings tab
    if (validatedProject?.id) {
      setSettingsActiveTab(`project-${validatedProject.id}` as any)
      setSettingsDialogOpen(true)
    }
  }
  // Parse owner/repo from GitHub URL
  const parseGitHubUrl = (url: string) => {
    const match = url.match(/(?:github\.com\/)?([^\/]+)\/([^\/\s#?]+)/)
    if (!match) return null
    return `${match[1]}/${match[2].replace(/\.git$/, "")}`
  }
  const [selectedAgent, setSelectedAgent] = useState(
    () => agents.find((a) => a.id === lastSelectedAgentId) || agents[0],
  )

  // Get available models (with offline support)
  const availableModels = useAvailableModels()
  const [selectedOllamaModel, setSelectedOllamaModel] = useAtom(selectedOllamaModelAtom)

  const [selectedModel, setSelectedModel] = useState(
    () =>
      availableModels.models.find((m) => m.id === lastSelectedModelId) || availableModels.models[1],
  )

  // Determine current Ollama model (selected or recommended)
  const currentOllamaModel = selectedOllamaModel || availableModels.recommendedModel || availableModels.ollamaModels[0]
  const [repoPopoverOpen, setRepoPopoverOpen] = useState(false)
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false)
  const [lastSelectedBranches, setLastSelectedBranches] = useAtom(
    lastSelectedBranchesAtom,
  )
  const [branchSearch, setBranchSearch] = useState("")

  // Get/set selected branch for current project (persisted per project)
  const selectedBranch = validatedProject?.id
    ? lastSelectedBranches[validatedProject.id] || ""
    : ""
  const setSelectedBranch = useCallback(
    (branch: string) => {
      if (validatedProject?.id) {
        setLastSelectedBranches((prev) => ({
          ...prev,
          [validatedProject.id]: branch,
        }))
      }
    },
    [validatedProject?.id, setLastSelectedBranches],
  )
  const branchListRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<AgentsMentionsEditorHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Image upload hook
  const {
    images,
    handleAddAttachments,
    removeImage,
    clearImages,
    isUploading,
  } = useAgentsFileUpload()

  // Mention dropdown state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionSearchText, setMentionSearchText] = useState("")
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 })

  // Mention subpage navigation state
  const [showingFilesList, setShowingFilesList] = useState(false)
  const [showingSkillsList, setShowingSkillsList] = useState(false)
  const [showingAgentsList, setShowingAgentsList] = useState(false)
  const [showingToolsList, setShowingToolsList] = useState(false)

  // Slash command dropdown state
  const [showSlashDropdown, setShowSlashDropdown] = useState(false)
  const [slashSearchText, setSlashSearchText] = useState("")
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 })

  // Mode tooltip state (floating tooltip like canvas)
  const [modeTooltip, setModeTooltip] = useState<{
    visible: boolean
    position: { top: number; left: number }
    mode: "agent" | "plan"
  } | null>(null)
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasShownTooltipRef = useRef(false)
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false)
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false)

  // Shift+Tab handler for mode switching (now handled inside input component via onShiftTab prop)

  // Keyboard shortcut: Enter to focus input when not already focused
  useFocusInputOnEnter(editorRef)

  // Keyboard shortcut: Cmd+Esc to toggle focus/blur
  useToggleFocusOnCmdEsc(editorRef)

  // Fetch repos from team
  // Desktop: no remote repos, we use local projects
  const reposData = { repositories: [] }
  const isLoadingRepos = false

  // Memoize repos arrays to prevent useEffect from running on every keystroke
  // Apply debug mode simulations
  const repos = useMemo(() => {
    if (debugMode.enabled && debugMode.simulateNoRepos) {
      return []
    }
    return reposData?.repositories || []
  }, [reposData?.repositories, debugMode.enabled, debugMode.simulateNoRepos])

  const readyRepos = useMemo(() => {
    if (debugMode.enabled && debugMode.simulateNoReadyRepos) {
      return []
    }
    return repos.filter((r) => r.sandbox_status === "ready")
  }, [repos, debugMode.enabled, debugMode.simulateNoReadyRepos])

  const notReadyRepos = useMemo(
    () => repos.filter((r) => r.sandbox_status !== "ready"),
    [repos],
  )

  // Use state to avoid hydration mismatch
  const [resolvedRepo, setResolvedRepo] = useState<(typeof repos)[0] | null>(
    null,
  )

  // Derive selected repo from saved or first available (client-side only)
  // Now includes all repos, not just ready ones
  useEffect(() => {
    if (lastSelectedRepo) {
      // For public imports, use lastSelectedRepo directly (it won't be in repos list)
      if (lastSelectedRepo.isPublicImport) {
        setResolvedRepo({
          id: lastSelectedRepo.id,
          name: lastSelectedRepo.name,
          full_name: lastSelectedRepo.full_name,
          sandbox_status: lastSelectedRepo.sandbox_status || "not_setup",
        } as (typeof repos)[0])
        return
      }

      // Look in all repos by id or full_name
      // Only compare IDs when lastSelectedRepo.id is non-empty (old localStorage data might have empty id)
      const stillExists = repos.find(
        (r) =>
          (lastSelectedRepo.id && r.id === lastSelectedRepo.id) ||
          r.full_name === lastSelectedRepo.full_name,
      )
      if (stillExists) {
        setResolvedRepo(stillExists)
        return
      }
    }

    if (repos.length === 0) {
      setResolvedRepo(null)
      return
    }

    // Auto-save first repo if none saved (prefer ready repos, then any)
    if (!lastSelectedRepo && repos.length > 0) {
      const firstRepo = readyRepos[0] || repos[0]
      setLastSelectedRepo({
        id: firstRepo.id,
        name: firstRepo.name,
        full_name: firstRepo.full_name,
        sandbox_status: firstRepo.sandbox_status,
      })
    }

    setResolvedRepo(readyRepos[0] || repos[0] || null)
  }, [lastSelectedRepo, repos, readyRepos, setLastSelectedRepo])

  // Desktop: fetch branches from local git repository
  const branchesQuery = trpc.changes.getBranches.useQuery(
    { worktreePath: validatedProject?.path || "" },
    {
      enabled: !!validatedProject?.path,
      staleTime: 30_000, // Cache for 30 seconds
    },
  )

  // Transform branch data to match web app format
  const branches = useMemo(() => {
    if (!branchesQuery.data) return []

    const { local, remote, defaultBranch } = branchesQuery.data

    // Combine local and remote branches, preferring local info
    const branchMap = new Map<
      string,
      {
        name: string
        protected: boolean
        isDefault: boolean
        committedAt: string | null
        authorName: null
      }
    >()

    // Add remote branches first
    for (const name of remote) {
      branchMap.set(name, {
        name,
        protected: false,
        isDefault: name === defaultBranch,
        committedAt: null,
        authorName: null,
      })
    }

    // Override with local branches (they have commit dates)
    for (const { branch, lastCommitDate } of local) {
      branchMap.set(branch, {
        name: branch,
        protected: false,
        isDefault: branch === defaultBranch,
        committedAt: lastCommitDate
          ? new Date(lastCommitDate).toISOString()
          : null,
        authorName: null,
      })
    }

    // Sort: default first, then by commit date
    return Array.from(branchMap.values()).sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1
      if (!a.isDefault && b.isDefault) return 1
      // Sort by commit date (most recent first)
      if (a.committedAt && b.committedAt) {
        return (
          new Date(b.committedAt).getTime() - new Date(a.committedAt).getTime()
        )
      }
      if (a.committedAt) return -1
      if (b.committedAt) return 1
      return a.name.localeCompare(b.name)
    })
  }, [branchesQuery.data])

  // Filter branches based on search
  const filteredBranches = useMemo(() => {
    if (!branchSearch.trim()) return branches
    const search = branchSearch.toLowerCase()
    return branches.filter((b) => b.name.toLowerCase().includes(search))
  }, [branches, branchSearch])

  // Virtualizer for branch list - only active when popover is open
  const branchVirtualizer = useVirtualizer({
    count: filteredBranches.length,
    getScrollElement: () => branchListRef.current,
    estimateSize: () => 28, // Each item is h-7 (28px)
    overscan: 5,
    enabled: branchPopoverOpen, // Only virtualize when popover is open
  })

  // Force virtualizer to re-measure when popover opens
  useEffect(() => {
    if (branchPopoverOpen) {
      // Small delay to ensure ref is attached
      const timer = setTimeout(() => {
        branchVirtualizer.measure()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [branchPopoverOpen])

  // Format relative time for branches (reuse shared utility)
  const formatRelativeTime = (dateString: string | null): string => {
    if (!dateString) return ""
    return formatTimeAgo(dateString)
  }

  // Set default branch when project/branches change (only if no saved branch for this project)
  useEffect(() => {
    if (
      branchesQuery.data?.defaultBranch &&
      validatedProject?.id &&
      !selectedBranch
    ) {
      setSelectedBranch(branchesQuery.data.defaultBranch)
    }
  }, [
    branchesQuery.data?.defaultBranch,
    validatedProject?.id,
    selectedBranch,
    setSelectedBranch,
  ])

  // Auto-focus input when NewChatForm is shown (when clicking "New Chat")
  // Skip on mobile to prevent keyboard from opening automatically
  useEffect(() => {
    if (isMobileFullscreen) return // Don't autofocus on mobile

    // Small delay to ensure DOM is ready and animations complete
    const timeoutId = setTimeout(() => {
      editorRef.current?.focus()
    }, 150)

    return () => clearTimeout(timeoutId)
  }, [isMobileFullscreen]) // Run on mount and when mobile state changes

  // Track last saved text to avoid unnecessary updates
  const lastSavedTextRef = useRef<string>("")

  // Track previous draft ID to detect when switching away from a draft
  const prevSelectedDraftIdRef = useRef<string | null>(null)

  // Restore draft when a specific draft is selected from sidebar
  // Or clear editor when "New Workspace" is clicked (selectedDraftId becomes null)
  useEffect(() => {
    const hadDraftBefore = prevSelectedDraftIdRef.current !== null
    prevSelectedDraftIdRef.current = selectedDraftId

    if (!selectedDraftId) {
      // No draft selected - clear editor if we had a draft before (user clicked "New Workspace")
      currentDraftIdRef.current = null
      lastSavedTextRef.current = ""
      if (hadDraftBefore && editorRef.current) {
        editorRef.current.clear()
        setHasContent(false)
      }
      return
    }

    const globalDrafts = loadGlobalDrafts()
    const draft = globalDrafts[selectedDraftId]
    if (draft?.text) {
      currentDraftIdRef.current = selectedDraftId
      lastSavedTextRef.current = draft.text // Initialize to prevent immediate re-save

      // Try to set value immediately if editor is ready
      if (editorRef.current) {
        editorRef.current.setValue(draft.text)
        setHasContent(true)
      } else {
        // Fallback: wait for editor to initialize (rare case)
        const timeoutId = setTimeout(() => {
          editorRef.current?.setValue(draft.text)
          setHasContent(true)
        }, 50)
        return () => clearTimeout(timeoutId)
      }
    }
  }, [selectedDraftId])

  // Mark draft as visible when component unmounts (user navigates away)
  // This ensures the draft only appears in the sidebar after leaving the form
  useEffect(() => {
    return () => {
      // On unmount, mark current draft as visible so it appears in sidebar
      if (currentDraftIdRef.current) {
        markDraftVisible(currentDraftIdRef.current)
      }
    }
  }, [])

  // Filter all repos by search (combined list) and sort by preview status
  const filteredRepos = repos
    .filter(
      (repo) =>
        repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
        repo.full_name.toLowerCase().includes(repoSearchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      // 1. Repos with preview (sandbox_status === "ready") come first
      const aHasPreview = a.sandbox_status === "ready"
      const bHasPreview = b.sandbox_status === "ready"
      if (aHasPreview && !bHasPreview) return -1
      if (!aHasPreview && bHasPreview) return 1

      // 2. Sort by last commit date (pushed_at) - most recent first
      const aDate = a.pushed_at ? new Date(a.pushed_at).getTime() : 0
      const bDate = b.pushed_at ? new Date(b.pushed_at).getTime() : 0
      return bDate - aDate
    })

  // Create chat mutation (real tRPC)
  const utils = trpc.useUtils()
  const createChatMutation = trpc.chats.create.useMutation({
    onSuccess: (data) => {
      // Clear editor and images only on success
      editorRef.current?.clear()
      clearImages()
      clearCurrentDraft()
      utils.chats.list.invalidate()
      setSelectedChatId(data.id)
      // Track this chat and its first subchat as just created for typewriter effect
      const ids = [data.id]
      if (data.subChats?.[0]?.id) {
        ids.push(data.subChats[0].id)
      }
      setJustCreatedIds((prev) => new Set([...prev, ...ids]))
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  // Open folder mutation for selecting a project
  const openFolder = trpc.projects.openFolder.useMutation({
    onSuccess: (project) => {
      if (project) {
        // Optimistically update the projects list cache to prevent "Select repo" flash
        // This ensures validatedProject can find the new project immediately
        utils.projects.list.setData(undefined, (oldData) => {
          if (!oldData) return [project]
          // Check if project already exists (reopened existing project)
          const exists = oldData.some((p) => p.id === project.id)
          if (exists) {
            // Update existing project's timestamp
            return oldData.map((p) =>
              p.id === project.id ? { ...p, updatedAt: project.updatedAt } : p,
            )
          }
          // Add new project at the beginning
          return [project, ...oldData]
        })

        setSelectedProject({
          id: project.id,
          name: project.name,
          path: project.path,
          gitRemoteUrl: project.gitRemoteUrl,
          gitProvider: project.gitProvider as
            | "github"
            | "gitlab"
            | "bitbucket"
            | null,
          gitOwner: project.gitOwner,
          gitRepo: project.gitRepo,
        })
      }
    },
  })

  const handleOpenFolder = async () => {
    await openFolder.mutateAsync()
  }

  const getAgentIcon = (agentId: string, className?: string) => {
    switch (agentId) {
      case "claude-code":
        return <ClaudeCodeIcon className={className} />
      case "cursor":
        return <CursorIcon className={className} />
      case "codex":
        return <CodexIcon className={className} />
      default:
        return null
    }
  }

  const trpcUtils = trpc.useUtils()

  const handleSend = useCallback(async () => {
    // Get value from uncontrolled editor
    let message = editorRef.current?.getValue() || ""

    if (!message.trim() || !selectedProject) {
      return
    }

    // Check if message is a slash command with arguments (e.g. "/hello world")
    const slashMatch = message.match(/^\/(\S+)\s*(.*)$/)
    if (slashMatch) {
      const [, commandName, args] = slashMatch

      // Check if it's a builtin command - if so, don't process as custom command
      const builtinNames = new Set(
        BUILTIN_SLASH_COMMANDS.map((cmd) => cmd.name),
      )
      if (!builtinNames.has(commandName)) {
        // This is a custom command - load content and replace $ARGUMENTS
        try {
          const commands = await trpcUtils.commands.list.fetch({
            projectPath: validatedProject?.path,
          })
          const cmd = commands.find((c) => c.name === commandName)

          if (cmd) {
            const { content } = await trpcUtils.commands.getContent.fetch({
              path: cmd.path,
            })
            // Replace $ARGUMENTS with the provided args
            message = content.replace(/\$ARGUMENTS/g, args.trim())
          }
        } catch (error) {
          console.error("Failed to process custom command:", error)
          // Fall through with original message
        }
      }
    }

    // Build message parts array (images first, then text)
    type MessagePart =
      | { type: "text"; text: string }
      | {
          type: "data-image"
          data: {
            url: string
            mediaType?: string
            filename?: string
            base64Data?: string
          }
        }

    const parts: MessagePart[] = images
      .filter((img) => !img.isLoading && img.url)
      .map((img) => ({
        type: "data-image" as const,
        data: {
          url: img.url!,
          mediaType: img.mediaType,
          filename: img.filename,
          base64Data: img.base64Data,
        },
      }))

    if (message.trim()) {
      parts.push({ type: "text" as const, text: message.trim() })
    }

    // Create chat with selected project, branch, and initial message
    createChatMutation.mutate({
      projectId: selectedProject.id,
      name: message.trim().slice(0, 50), // Use first 50 chars as chat name
      initialMessageParts: parts.length > 0 ? parts : undefined,
      baseBranch:
        workMode === "worktree" ? selectedBranch || undefined : undefined,
      useWorktree: workMode === "worktree",
      mode: isPlanMode ? "plan" : "agent",
    })
    // Editor and images are cleared in onSuccess callback
  }, [
    selectedProject,
    validatedProject?.path,
    createChatMutation,
    hasContent,
    selectedBranch,
    workMode,
    images,
    isPlanMode,
    trpcUtils,
  ])

  const handleMentionSelect = useCallback((mention: FileMentionOption) => {
    // Category navigation - enter subpage instead of inserting mention
    if (mention.type === "category") {
      if (mention.id === "files") {
        setShowingFilesList(true)
        return
      }
      if (mention.id === "skills") {
        setShowingSkillsList(true)
        return
      }
      if (mention.id === "agents") {
        setShowingAgentsList(true)
        return
      }
      if (mention.id === "tools") {
        setShowingToolsList(true)
        return
      }
    }

    // Otherwise: insert mention as normal
    editorRef.current?.insertMention(mention)
    setShowMentionDropdown(false)
    // Reset subpage state
    setShowingFilesList(false)
    setShowingSkillsList(false)
    setShowingAgentsList(false)
    setShowingToolsList(false)
  }, [])

  // Save draft to localStorage when content changes
  const handleContentChange = useCallback(
    (hasContent: boolean) => {
      setHasContent(hasContent)
      const text = editorRef.current?.getValue() || ""

      // Skip if text hasn't changed
      if (text === lastSavedTextRef.current) {
        return
      }
      lastSavedTextRef.current = text

      const globalDrafts = loadGlobalDrafts()

      if (text.trim() && validatedProject) {
        // If no current draft ID, create a new one
        if (!currentDraftIdRef.current) {
          currentDraftIdRef.current = generateDraftId()
        }

        const key = currentDraftIdRef.current
        globalDrafts[key] = {
          text,
          updatedAt: Date.now(),
          project: {
            id: validatedProject.id,
            name: validatedProject.name,
            path: validatedProject.path,
            gitOwner: validatedProject.gitOwner,
            gitRepo: validatedProject.gitRepo,
            gitProvider: validatedProject.gitProvider,
          },
        }
        saveGlobalDrafts(globalDrafts)
      } else if (currentDraftIdRef.current) {
        // Text is empty - delete the current draft
        deleteNewChatDraft(currentDraftIdRef.current)
        currentDraftIdRef.current = null
      }
    },
    [validatedProject],
  )

  // Clear current draft when chat is created
  const clearCurrentDraft = useCallback(() => {
    if (!currentDraftIdRef.current) return

    deleteNewChatDraft(currentDraftIdRef.current)
    currentDraftIdRef.current = null
    setSelectedDraftId(null)
  }, [setSelectedDraftId])

  // Memoized callbacks to prevent re-renders
  const handleMentionTrigger = useCallback(
    ({ searchText, rect }: { searchText: string; rect: DOMRect }) => {
      if (validatedProject) {
        setMentionSearchText(searchText)
        setMentionPosition({ top: rect.top, left: rect.left })
        // Reset subpage state when opening dropdown
        setShowingFilesList(false)
        setShowingSkillsList(false)
        setShowingAgentsList(false)
        setShowingToolsList(false)
        setShowMentionDropdown(true)
      }
    },
    [validatedProject],
  )

  const handleCloseTrigger = useCallback(() => {
    setShowMentionDropdown(false)
    // Reset subpage state when closing
    setShowingFilesList(false)
    setShowingSkillsList(false)
    setShowingAgentsList(false)
    setShowingToolsList(false)
  }, [])

  // Slash command handlers
  const handleSlashTrigger = useCallback(
    ({ searchText, rect }: { searchText: string; rect: DOMRect }) => {
      setSlashSearchText(searchText)
      setSlashPosition({ top: rect.top, left: rect.left })
      setShowSlashDropdown(true)
    },
    [],
  )

  const handleCloseSlashTrigger = useCallback(() => {
    setShowSlashDropdown(false)
  }, [])

  const handleSlashSelect = useCallback(
    (command: SlashCommandOption) => {
      // Clear the slash command text from editor
      editorRef.current?.clearSlashCommand()
      setShowSlashDropdown(false)

      // Handle builtin commands
      if (command.category === "builtin") {
        switch (command.name) {
          case "clear":
            editorRef.current?.clear()
            break
          case "plan":
            if (!isPlanMode) {
              setIsPlanMode(true)
            }
            break
          case "agent":
            if (isPlanMode) {
              setIsPlanMode(false)
            }
            break
          // Prompt-based commands - auto-send to agent
          case "review":
          case "pr-comments":
          case "release-notes":
          case "security-review": {
            const prompt =
              COMMAND_PROMPTS[command.name as keyof typeof COMMAND_PROMPTS]
            if (prompt) {
              editorRef.current?.setValue(prompt)
              // Auto-send the prompt to agent
              setTimeout(() => handleSend(), 0)
            }
            break
          }
        }
        return
      }

      // Handle custom commands
      if (command.argumentHint) {
        // Command expects arguments - insert command and let user add args
        editorRef.current?.setValue(`/${command.name} `)
      } else if (command.prompt) {
        // Command without arguments - send immediately
        editorRef.current?.setValue(command.prompt)
        setTimeout(() => handleSend(), 0)
      }
    },
    [isPlanMode, setIsPlanMode, handleSend],
  )

  // Paste handler for images and plain text
  // Uses async text insertion to prevent UI freeze with large text
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => handlePasteEvent(e, handleAddAttachments),
    [handleAddAttachments],
  )

  // Drag and drop handlers
  const [isDragOver, setIsDragOver] = useState(false)

  // Focus state for ring
  const [isFocused, setIsFocused] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/"),
      )
      handleAddAttachments(files)
      // Focus after state update - use double rAF to wait for React render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          editorRef.current?.focus()
        })
      })
    },
    [handleAddAttachments],
  )

  // Context items for images
  const contextItems =
    images.length > 0 ? (
      <div className="flex flex-wrap gap-[6px]">
        {(() => {
          // Build allImages array for gallery navigation
          const allImages = images
            .filter((img) => img.url && !img.isLoading)
            .map((img) => ({
              id: img.id,
              filename: img.filename,
              url: img.url,
            }))

          return images.map((img, idx) => (
            <AgentImageItem
              key={img.id}
              id={img.id}
              filename={img.filename}
              url={img.url}
              isLoading={img.isLoading}
              onRemove={() => removeImage(img.id)}
              allImages={allImages}
              imageIndex={idx}
            />
          ))
        })()}
      </div>
    ) : null

  // Handle container click to focus editor
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (
      e.target === e.currentTarget ||
      !(e.target as HTMLElement).closest("button, [contenteditable]")
    ) {
      editorRef.current?.focus()
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Header - Simple burger on mobile, AgentsHeaderControls on desktop */}
      <div className="flex-shrink-0 flex items-center justify-between bg-background p-1.5">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {isMobileFullscreen ? (
            // Simple burger button for mobile - just opens chats list
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackToChats}
              className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md"
              aria-label="All projects"
            >
              <AlignJustify className="h-4 w-4" />
            </Button>
          ) : (
            <AgentsHeaderControls
              isSidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
              hasUnseenChanges={hasAnyUnseenChanges}
            />
          )}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto relative">
        <div className="w-full max-w-2xl space-y-4 md:space-y-6 relative z-10 px-4">
          {/* Title - only show when project is selected */}
          {validatedProject && (
            <div className="text-center">
              <h1 className="text-2xl md:text-4xl font-medium tracking-tight">
                What do you want to get done?
              </h1>
            </div>
          )}

          {/* Input Area or Select Repo State */}
          {!validatedProject ? (
            // No project selected - show select repo button (like Sign in button)
            <div className="flex justify-center">
              <button
                onClick={handleOpenFolder}
                disabled={openFolder.isPending}
                className="h-8 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {openFolder.isPending ? "Opening..." : "Select repo"}
              </button>
            </div>
          ) : (
            // Project selected - show input form
            <div
              className="relative w-full"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div
                className="relative w-full cursor-text"
                onClick={handleContainerClick}
              >
                <PromptInput
                  className={cn(
                    "border bg-input-background relative z-10 p-2 rounded-xl transition-[border-color,box-shadow] duration-150",
                    isDragOver && "ring-2 ring-primary/50 border-primary/50",
                    isFocused && !isDragOver && "ring-2 ring-primary/50",
                  )}
                  maxHeight={240}
                  onSubmit={handleSend}
                  contextItems={contextItems}
                >
                  <PromptInputContextItems />
                  <div className="relative">
                    <AgentsMentionsEditor
                      ref={editorRef}
                      onTrigger={handleMentionTrigger}
                      onCloseTrigger={handleCloseTrigger}
                      onSlashTrigger={handleSlashTrigger}
                      onCloseSlashTrigger={handleCloseSlashTrigger}
                      onContentChange={handleContentChange}
                      onSubmit={handleSend}
                      onShiftTab={() => setIsPlanMode((prev) => !prev)}
                      placeholder="Plan, @ for context, / for commands"
                      className={cn(
                        "bg-transparent max-h-[240px] overflow-y-auto p-1",
                        isMobileFullscreen ? "min-h-[56px]" : "min-h-[44px]",
                      )}
                      onPaste={handlePaste}
                      disabled={createChatMutation.isPending}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                    />
                  </div>
                  <PromptInputActions className="w-full">
                    <div className="flex items-center gap-0.5 flex-1 min-w-0">
                      {/* Mode toggle (Agent/Plan) */}
                      <DropdownMenu
                        open={modeDropdownOpen}
                        onOpenChange={(open) => {
                          setModeDropdownOpen(open)
                          if (!open) {
                            if (tooltipTimeoutRef.current) {
                              clearTimeout(tooltipTimeoutRef.current)
                              tooltipTimeoutRef.current = null
                            }
                            setModeTooltip(null)
                            hasShownTooltipRef.current = false
                          }
                        }}
                      >
                        <DropdownMenuTrigger className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70">
                          {isPlanMode ? (
                            <PlanIcon className="h-3.5 w-3.5" />
                          ) : (
                            <AgentIcon className="h-3.5 w-3.5" />
                          )}
                          <span>{isPlanMode ? "Plan" : "Agent"}</span>
                          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          sideOffset={6}
                          className="!min-w-[116px] !w-[116px]"
                          onCloseAutoFocus={(e) => e.preventDefault()}
                        >
                          <DropdownMenuItem
                            onClick={() => {
                              // Clear tooltip before closing dropdown (onMouseLeave won't fire)
                              if (tooltipTimeoutRef.current) {
                                clearTimeout(tooltipTimeoutRef.current)
                                tooltipTimeoutRef.current = null
                              }
                              setModeTooltip(null)
                              setIsPlanMode(false)
                              setModeDropdownOpen(false)
                            }}
                            className="justify-between gap-2"
                            onMouseEnter={(e) => {
                              if (tooltipTimeoutRef.current) {
                                clearTimeout(tooltipTimeoutRef.current)
                                tooltipTimeoutRef.current = null
                              }
                              const rect =
                                e.currentTarget.getBoundingClientRect()
                              const showTooltip = () => {
                                setModeTooltip({
                                  visible: true,
                                  position: {
                                    top: rect.top,
                                    left: rect.right + 8,
                                  },
                                  mode: "agent",
                                })
                                hasShownTooltipRef.current = true
                                tooltipTimeoutRef.current = null
                              }
                              if (hasShownTooltipRef.current) {
                                showTooltip()
                              } else {
                                tooltipTimeoutRef.current = setTimeout(
                                  showTooltip,
                                  1000,
                                )
                              }
                            }}
                            onMouseLeave={() => {
                              if (tooltipTimeoutRef.current) {
                                clearTimeout(tooltipTimeoutRef.current)
                                tooltipTimeoutRef.current = null
                              }
                              setModeTooltip(null)
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <AgentIcon className="w-4 h-4 text-muted-foreground" />
                              <span>Agent</span>
                            </div>
                            {!isPlanMode && (
                              <CheckIcon className="h-3.5 w-3.5 ml-auto shrink-0" />
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              // Clear tooltip before closing dropdown (onMouseLeave won't fire)
                              if (tooltipTimeoutRef.current) {
                                clearTimeout(tooltipTimeoutRef.current)
                                tooltipTimeoutRef.current = null
                              }
                              setModeTooltip(null)
                              setIsPlanMode(true)
                              setModeDropdownOpen(false)
                            }}
                            className="justify-between gap-2"
                            onMouseEnter={(e) => {
                              if (tooltipTimeoutRef.current) {
                                clearTimeout(tooltipTimeoutRef.current)
                                tooltipTimeoutRef.current = null
                              }
                              const rect = e.currentTarget.getBoundingClientRect()
                              const showTooltip = () => {
                                setModeTooltip({
                                  visible: true,
                                  position: {
                                    top: rect.top,
                                    left: rect.right + 8,
                                  },
                                  mode: "plan",
                                })
                                hasShownTooltipRef.current = true
                                tooltipTimeoutRef.current = null
                              }
                              if (hasShownTooltipRef.current) {
                                showTooltip()
                              } else {
                                tooltipTimeoutRef.current = setTimeout(
                                  showTooltip,
                                  1000,
                                )
                              }
                            }}
                            onMouseLeave={() => {
                              if (tooltipTimeoutRef.current) {
                                clearTimeout(tooltipTimeoutRef.current)
                                tooltipTimeoutRef.current = null
                              }
                              setModeTooltip(null)
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <PlanIcon className="w-4 h-4 text-muted-foreground" />
                              <span>Plan</span>
                            </div>
                            {isPlanMode && (
                              <CheckIcon className="h-3.5 w-3.5 ml-auto shrink-0" />
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                        {modeTooltip?.visible &&
                          createPortal(
                            <div
                              className="fixed z-[100000]"
                              style={{
                                top: modeTooltip.position.top + 14,
                                left: modeTooltip.position.left,
                                transform: "translateY(-50%)",
                              }}
                            >
                              <div
                                data-tooltip="true"
                                className="relative rounded-[12px] bg-popover px-2.5 py-1.5 text-xs text-popover-foreground dark max-w-[150px]"
                              >
                                <span>
                                  {modeTooltip.mode === "agent"
                                    ? "Apply changes directly without a plan"
                                    : "Create a plan before making changes"}
                                </span>
                              </div>
                            </div>,
                            document.body,
                          )}
                      </DropdownMenu>

                      {/* Model selector - shows Ollama models when offline, Claude models when online */}
                      {availableModels.isOffline && availableModels.hasOllama ? (
                        // Offline mode: show Ollama model selector
                        <DropdownMenu
                          open={isModelDropdownOpen}
                          onOpenChange={setIsModelDropdownOpen}
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 border border-border"
                            >
                              <Zap className="h-4 w-4" />
                              <span>{currentOllamaModel || "Select model"}</span>
                              <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-[240px]">
                            {availableModels.ollamaModels.map((model) => {
                              const isSelected = model === currentOllamaModel
                              const isRecommended = model === availableModels.recommendedModel
                              return (
                                <DropdownMenuItem
                                  key={model}
                                  onClick={() => setSelectedOllamaModel(model)}
                                  className="gap-2 justify-between"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span>
                                      {model}
                                      {isRecommended && (
                                        <span className="text-muted-foreground ml-1">(recommended)</span>
                                      )}
                                    </span>
                                  </div>
                                  {isSelected && (
                                    <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                                  )}
                                </DropdownMenuItem>
                              )
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        // Online mode: show Claude model selector
                        <DropdownMenu
                          open={hasCustomClaudeConfig ? false : isModelDropdownOpen}
                          onOpenChange={(open) => {
                            if (!hasCustomClaudeConfig) {
                              setIsModelDropdownOpen(open)
                            }
                          }}
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              disabled={hasCustomClaudeConfig}
                              className={cn(
                                "flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                                hasCustomClaudeConfig
                                  ? "opacity-70 cursor-not-allowed"
                                  : "hover:text-foreground hover:bg-muted/50",
                              )}
                            >
                              <ClaudeCodeIcon className="h-3.5 w-3.5" />
                              <span>
                                {hasCustomClaudeConfig ? (
                                  "Custom Model"
                                ) : (
                                  <>
                                    {selectedModel?.name}{" "}
                                    <span className="text-muted-foreground">4.5</span>
                                  </>
                                )}
                              </span>
                              <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-[200px]">
                            {availableModels.models.map((model) => {
                              const isSelected = selectedModel?.id === model.id
                              return (
                                <DropdownMenuItem
                                  key={model.id}
                                  onClick={() => {
                                    setSelectedModel(model)
                                    setLastSelectedModelId(model.id)
                                  }}
                                  className="gap-2 justify-between"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span>
                                      {model.name}{" "}
                                      <span className="text-muted-foreground">4.5</span>
                                    </span>
                                  </div>
                                  {isSelected && (
                                    <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                                  )}
                                </DropdownMenuItem>
                              )
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
                      {/* Hidden file input */}
                      <input
                        type="file"
                        ref={fileInputRef}
                        hidden
                        accept="image/jpeg,image/png"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          handleAddAttachments(files)
                          e.target.value = "" // Reset to allow same file selection
                        }}
                      />
                      {/* Attachment button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-sm outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={images.length >= 5}
                      >
                        <AttachIcon className="h-4 w-4" />
                      </Button>
                      <div className="ml-1">
                        <AgentSendButton
                          isStreaming={false}
                          isSubmitting={
                            createChatMutation.isPending || isUploading
                          }
                          disabled={Boolean(
                            !hasContent || !selectedProject || isUploading,
                          )}
                          onClick={handleSend}
                          isPlanMode={isPlanMode}
                        />
                      </div>
                    </div>
                  </PromptInputActions>
                </PromptInput>

                {/* Project, Work Mode, and Branch selectors - directly under input */}
                <div className="mt-1.5 md:mt-2 ml-[5px] flex items-center gap-2">
                  <ProjectSelector />

                  {/* Work mode selector - between project and branch */}
                  {validatedProject && (
                    <WorkModeSelector
                      value={workMode}
                      onChange={setWorkMode}
                      disabled={createChatMutation.isPending}
                    />
                  )}

                  {/* Branch selector - only visible when worktree mode is selected */}
                  {validatedProject && workMode === "worktree" && (
                    <Popover
                      open={branchPopoverOpen}
                      onOpenChange={(open) => {
                        if (!open) {
                          setBranchSearch("") // Clear search on close
                        }
                        setBranchPopoverOpen(open)
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                          disabled={branchesQuery.isLoading}
                        >
                          <BranchIcon className="w-4 h-4" />
                          <span className="truncate max-w-[100px]">
                            {selectedBranch ||
                              branchesQuery.data?.defaultBranch ||
                              "main"}
                          </span>
                          <IconChevronDown className="w-3 h-3 opacity-50" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
                        {/* Search input with Create button */}
                        <div className="flex items-center gap-1.5 h-7 px-1.5 mx-1 my-1 rounded-md bg-muted/50">
                          <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Search branches..."
                            value={branchSearch}
                            onChange={(e) => setBranchSearch(e.target.value)}
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 flex items-center gap-1 text-xs shrink-0"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setCreateBranchDialogOpen(true)
                              setBranchPopoverOpen(false)
                            }}
                          >
                            <Plus className="h-3 w-3" />
                            Create
                          </Button>
                        </div>

                        {/* Virtualized branch list */}
                        {filteredBranches.length === 0 ? (
                          <div className="py-6 text-center text-sm text-muted-foreground">
                            No branches found.
                          </div>
                        ) : (
                          <div
                            ref={branchListRef}
                            className="overflow-auto py-1 scrollbar-hide"
                            style={{
                              height: Math.min(
                                filteredBranches.length * 32 + 8,
                                300,
                              ),
                            }}
                          >
                            <div
                              style={{
                                height: `${branchVirtualizer.getTotalSize()}px`,
                                width: "100%",
                                position: "relative",
                              }}
                            >
                              {branchVirtualizer
                                .getVirtualItems()
                                .map((virtualItem) => {
                                  const branch =
                                    filteredBranches[virtualItem.index]
                                  const isSelected =
                                    selectedBranch === branch.name ||
                                    (!selectedBranch && branch.isDefault)
                                  return (
                                    <button
                                      key={branch.name}
                                      onClick={() => {
                                        setSelectedBranch(branch.name)
                                        setBranchPopoverOpen(false)
                                        setBranchSearch("")
                                      }}
                                      className={cn(
                                        "flex items-center gap-1.5 w-[calc(100%-8px)] mx-1 px-1.5 text-sm text-left absolute left-0 top-0 rounded-md cursor-default select-none outline-none transition-colors",
                                        isSelected
                                          ? "dark:bg-neutral-800 text-foreground"
                                          : "dark:hover:bg-neutral-800 hover:text-foreground",
                                      )}
                                      style={{
                                        height: `${virtualItem.size}px`,
                                        transform: `translateY(${virtualItem.start}px)`,
                                      }}
                                    >
                                      <BranchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                      <span className="truncate flex-1">
                                        {branch.name}
                                      </span>
                                      {branch.committedAt && (
                                        <span className="text-xs text-muted-foreground/70 shrink-0">
                                          {formatRelativeTime(
                                            branch.committedAt,
                                          )}
                                        </span>
                                      )}
                                      {branch.isDefault && (
                                        <span className="text-[10px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded shrink-0">
                                          default
                                        </span>
                                      )}
                                      {isSelected && (
                                        <CheckIcon className="h-4 w-4 shrink-0 ml-auto" />
                                      )}
                                    </button>
                                  )
                                })}
                            </div>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}

                  {/* Create Branch Dialog */}
                  {validatedProject && (
                    <CreateBranchDialog
                      open={createBranchDialogOpen}
                      onOpenChange={setCreateBranchDialogOpen}
                      projectPath={validatedProject.path}
                      branches={branches}
                      defaultBranch={
                        branchesQuery.data?.defaultBranch || "main"
                      }
                      onBranchCreated={(branchName) => {
                        setSelectedBranch(branchName)
                      }}
                    />
                  )}
                </div>

                {/* Worktree config banner - absolute positioned to avoid layout shift */}
                {showWorktreeBanner && (
                  <div className="absolute left-0 right-0 top-full mt-2 ml-[5px] mr-[5px] p-3 pb-4 bg-muted/50 rounded-lg border border-border space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Configure a worktree setup script to install dependencies or copy environment variables.
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleConfigureWorktree}
                      >
                        Settings
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          const prompt = COMMAND_PROMPTS["worktree-setup"]
                          if (prompt && validatedProject) {
                            createChatMutation.mutate({
                              projectId: validatedProject.id,
                              name: "Worktree Setup",
                              initialMessageParts: [{ type: "text", text: prompt }],
                              useWorktree: false,
                              mode: "agent",
                            })
                          }
                        }}
                      >
                        Fill with AI
                      </Button>
                    </div>
                  </div>
                )}

                {/* File mention dropdown */}
                {/* Desktop: use projectPath for local file search */}
                <AgentsFileMention
                  isOpen={showMentionDropdown && !!validatedProject}
                  onClose={() => {
                    setShowMentionDropdown(false)
                    // Reset subpage state when dropdown closes
                    setShowingFilesList(false)
                    setShowingSkillsList(false)
                    setShowingAgentsList(false)
                    setShowingToolsList(false)
                  }}
                  onSelect={handleMentionSelect}
                  searchText={mentionSearchText}
                  position={mentionPosition}
                  projectPath={validatedProject?.path}
                  showingFilesList={showingFilesList}
                  showingSkillsList={showingSkillsList}
                  showingAgentsList={showingAgentsList}
                  showingToolsList={showingToolsList}
                />

                {/* Slash command dropdown */}
                <AgentsSlashCommand
                  isOpen={showSlashDropdown}
                  onClose={handleCloseSlashTrigger}
                  onSelect={handleSlashSelect}
                  searchText={slashSearchText}
                  position={slashPosition}
                  projectPath={validatedProject?.path}
                  isPlanMode={isPlanMode}
                  disabledCommands={["clear"]}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
