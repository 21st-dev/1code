import { useAtom } from "jotai"
import { ChevronLeft, ChevronRight, FolderOpen, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  EyeOpenFilledIcon,
  ProfileIconFilled,
  SlidersFilledIcon
} from "../../icons"
import { agentsSettingsDialogActiveTabAtom, devToolsUnlockedAtom, type SettingsTab } from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"
import { BrainFilledIcon, BugFilledIcon, CustomAgentIconFilled, FlaskFilledIcon, KeyboardFilledIcon, OriginalMCPIcon, SkillIconFilled } from "../ui/icons"
import { AgentsAppearanceTab } from "./settings-tabs/agents-appearance-tab"
import { AgentsBetaTab } from "./settings-tabs/agents-beta-tab"
import { AgentsCustomAgentsTab } from "./settings-tabs/agents-custom-agents-tab"
import { AgentsDebugTab } from "./settings-tabs/agents-debug-tab"
import { AgentsKeyboardTab } from "./settings-tabs/agents-keyboard-tab"
import { AgentsMcpTab } from "./settings-tabs/agents-mcp-tab"
import { AgentsModelsTab } from "./settings-tabs/agents-models-tab"
import { AgentsPreferencesTab } from "./settings-tabs/agents-preferences-tab"
import { AgentsProfileTab } from "./settings-tabs/agents-profile-tab"
import { AgentsProjectWorktreeTab } from "./settings-tabs/agents-project-worktree-tab"
import { AgentsSkillsTab } from "./settings-tabs/agents-skills-tab"

// GitHub avatar icon with loading placeholder
function GitHubAvatarIcon({ gitOwner, className }: { gitOwner: string; className?: string }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  const handleLoad = useCallback(() => setIsLoaded(true), [])
  const handleError = useCallback(() => setHasError(true), [])

  if (hasError) {
    return <FolderOpen className={cn("text-muted-foreground flex-shrink-0", className)} />
  }

  return (
    <div className={cn("relative flex-shrink-0", className)}>
      {/* Placeholder background while loading */}
      {!isLoaded && (
        <div className="absolute inset-0 rounded-sm bg-muted" />
      )}
      <img
        src={`https://github.com/${gitOwner}.png?size=64`}
        alt={gitOwner}
        className={cn("rounded-sm flex-shrink-0", className, isLoaded ? 'opacity-100' : 'opacity-0')}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
}

// Hook to detect narrow screen
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

// Check if we're in development mode (use import.meta.env.DEV for Vite)
const isDevelopment = import.meta.env.DEV

// Clicks required to unlock devtools in production
const DEVTOOLS_UNLOCK_CLICKS = 5

interface AgentsSettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

// Main settings tabs
const MAIN_TABS = [
  {
    id: "profile" as SettingsTab,
    label: "Account",
    icon: ProfileIconFilled,
    description: "Manage your account settings",
  },
  {
    id: "appearance" as SettingsTab,
    label: "Appearance",
    icon: EyeOpenFilledIcon,
    description: "Theme settings",
  },
  {
    id: "keyboard" as SettingsTab,
    label: "Keyboard",
    icon: KeyboardFilledIcon,
    description: "Customize keyboard shortcuts",
  },
  {
    id: "preferences" as SettingsTab,
    label: "Preferences",
    icon: SlidersFilledIcon,
    description: "Claude behavior settings",
  },
  {
    id: "models" as SettingsTab,
    label: "Models",
    icon: BrainFilledIcon,
    description: "Model overrides and Claude Code auth",
  },
]

// Advanced/experimental tabs (base - without Debug)
const ADVANCED_TABS_BASE = [
  {
    id: "skills" as SettingsTab,
    label: "Skills",
    icon: SkillIconFilled,
    description: "Custom Claude skills",
  },
  {
    id: "agents" as SettingsTab,
    label: "Custom Agents",
    icon: CustomAgentIconFilled,
    description: "Manage custom Claude agents",
  },
  {
    id: "mcp" as SettingsTab,
    label: "MCP Servers",
    icon: OriginalMCPIcon,
    description: "Model Context Protocol servers",
  },
  {
    id: "beta" as SettingsTab,
    label: "Beta",
    icon: FlaskFilledIcon,
    description: "Experimental features",
  },
]

// Debug tab definition
const DEBUG_TAB = {
  id: "debug" as SettingsTab,
  label: "Debug",
  icon: BugFilledIcon,
  description: "Test first-time user experience",
}

interface TabButtonProps {
  tab: {
    id: SettingsTab
    label: string
    icon: React.ComponentType<{ className?: string }> | any
    description?: string
    beta?: boolean
  }
  isActive: boolean
  onClick: () => void
  isNarrow?: boolean
}

function TabButton({ tab, isActive, onClick, isNarrow }: TabButtonProps) {
  const Icon = tab.icon
  const isBeta = "beta" in tab && tab.beta
  // Check if this is a project tab (has projectId property)
  const isProjectTab = "projectId" in tab

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center whitespace-nowrap ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 cursor-pointer shadow-none w-full justify-start gap-2 text-left px-3 py-1.5 text-sm",
        isNarrow
          ? "h-12 rounded-lg bg-foreground/5 hover:bg-foreground/10"
          : "h-7 rounded-md",
        !isNarrow && isActive
          ? "bg-foreground/10 text-foreground font-medium hover:bg-foreground/15 hover:text-foreground"
          : !isNarrow
            ? "text-muted-foreground hover:bg-foreground/5 hover:text-foreground font-medium"
            : "text-foreground font-medium",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4",
          // For project tabs, always keep full opacity (especially for GitHub avatars)
          isProjectTab
            ? "opacity-100"
            : isNarrow
              ? "opacity-70"
              : isActive
                ? "opacity-100"
                : "opacity-50",
        )}
      />
      <span className="flex-1">{tab.label}</span>
      {isBeta && (
        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground">
          Beta
        </span>
      )}
      {isNarrow && (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  )
}

export function AgentsSettingsDialog({
  isOpen,
  onClose,
}: AgentsSettingsDialogProps) {
  const [activeTab, setActiveTab] = useAtom(agentsSettingsDialogActiveTabAtom)
  const [devToolsUnlocked, setDevToolsUnlocked] = useAtom(devToolsUnlockedAtom)
  const [mounted, setMounted] = useState(false)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const isNarrowScreen = useIsNarrowScreen()

  // Beta tab click counter for unlocking devtools
  const betaClickCountRef = useRef(0)
  const betaClickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get projects list for dynamic tabs
  const { data: projects } = trpc.projects.list.useQuery()

  // Generate dynamic project tabs
  const projectTabs = useMemo(() => {
    if (!projects || projects.length === 0) {
      return []
    }

    return projects.map((project) => ({
      id: `project-${project.id}` as SettingsTab,
      label: project.name,
      icon: (project.gitOwner && project.gitProvider === 'github')
        ? ({ className }: { className?: string }) => (
            <GitHubAvatarIcon gitOwner={project.gitOwner!} className={className} />
          )
        : FolderOpen,
      description: `Worktree setup for ${project.name}`,
      projectId: project.id,
    }))
  }, [projects])

  // Show debug tab if in development OR if devtools are unlocked
  const showDebugTab = isDevelopment || devToolsUnlocked

  // Build advanced tabs with optional debug tab
  const ADVANCED_TABS = useMemo(() => {
    if (showDebugTab) {
      return [...ADVANCED_TABS_BASE, DEBUG_TAB]
    }
    return ADVANCED_TABS_BASE
  }, [showDebugTab])

  // All tabs combined for lookups
  const ALL_TABS = useMemo(
    () => [...MAIN_TABS, ...ADVANCED_TABS, ...projectTabs],
    [ADVANCED_TABS, projectTabs]
  )

  // Helper to get tab label from tab id
  const getTabLabel = (tabId: SettingsTab): string => {
    return ALL_TABS.find((t) => t.id === tabId)?.label ?? "Settings"
  }

  // Narrow screen: track whether we're showing tab list or content
  const [showContent, setShowContent] = useState(false)

  // Reset content view when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setShowContent(false)
    }
  }, [isOpen])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        if (isNarrowScreen && showContent) {
          setShowContent(false)
        } else {
          onClose()
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose, isNarrowScreen, showContent])

  // Ensure portal target only accessed on client
  useEffect(() => {
    setMounted(true)
    if (typeof document !== "undefined") {
      setPortalTarget(document.body)
    }
  }, [])

  const handleTabClick = (tabId: SettingsTab) => {
    // Handle Beta tab clicks for devtools unlock
    // Works in both dev and production - the unlock just reveals the Debug tab
    if (tabId === "beta" && !devToolsUnlocked) {
      betaClickCountRef.current++
      console.log(`[Settings] Beta click ${betaClickCountRef.current}/${DEVTOOLS_UNLOCK_CLICKS}`)

      // Reset counter after 2 seconds of no clicks
      if (betaClickTimeoutRef.current) {
        clearTimeout(betaClickTimeoutRef.current)
      }
      betaClickTimeoutRef.current = setTimeout(() => {
        betaClickCountRef.current = 0
      }, 2000)

      // Unlock devtools after required clicks
      if (betaClickCountRef.current >= DEVTOOLS_UNLOCK_CLICKS) {
        setDevToolsUnlocked(true)
        betaClickCountRef.current = 0
        // Notify main process to rebuild menu with DevTools option
        window.desktopApi?.unlockDevTools()
        console.log("[Settings] DevTools unlocked!")
      }
    }

    setActiveTab(tabId)
    if (isNarrowScreen) {
      setShowContent(true)
    }
  }

  const renderTabContent = () => {
    // Handle dynamic project tabs
    if (activeTab.startsWith('project-')) {
      const projectId = activeTab.replace('project-', '')
      return <AgentsProjectWorktreeTab projectId={projectId} />
    }

    // Handle static tabs
    switch (activeTab) {
      case "profile":
        return <AgentsProfileTab />
      case "appearance":
        return <AgentsAppearanceTab />
      case "keyboard":
        return <AgentsKeyboardTab />
      case "preferences":
        return <AgentsPreferencesTab />
      case "models":
        return <AgentsModelsTab />
      case "skills":
        return <AgentsSkillsTab />
      case "agents":
        return <AgentsCustomAgentsTab />
      case "mcp":
        return <AgentsMcpTab />
      case "beta":
        return <AgentsBetaTab />
      case "debug":
        return showDebugTab ? <AgentsDebugTab /> : null
      default:
        return null
    }
  }

  const renderTabList = () => (
    <div className="space-y-4 px-1">
      {/* Main tabs */}
      <div className="space-y-1">
        {MAIN_TABS.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onClick={() => handleTabClick(tab.id)}
            isNarrow={isNarrowScreen}
          />
        ))}
      </div>

      {/* Separator */}
      <div className="border-t border-border/50 mx-2" />

      {/* Advanced tabs */}
      <div className="space-y-1">
        {ADVANCED_TABS.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onClick={() => handleTabClick(tab.id)}
            isNarrow={isNarrowScreen}
          />
        ))}
      </div>

      {/* Project tabs */}
      {projectTabs.length > 0 && (
        <>
          {/* Separator */}
          <div className="border-t border-border/50 mx-2" />

          <div className="space-y-1">
            {projectTabs.map((tab) => (
              <TabButton
                key={tab.id}
                tab={tab}
                isActive={activeTab === tab.id}
                onClick={() => handleTabClick(tab.id)}
                isNarrow={isNarrowScreen}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )

  if (!mounted || !portalTarget) return null

  // Narrow screen: Full-screen overlay with two-screen navigation
  if (isNarrowScreen) {
    if (!isOpen) return null

    return createPortal(
      <>
        {/* Full-screen settings panel */}
        <div
          className="fixed inset-0 z-[45] flex flex-col bg-background overflow-hidden select-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agents-settings-dialog-title-narrow"
          data-modal="agents-settings"
          data-canvas-dialog
          data-agents-page
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            {showContent && (
              <button
                onClick={() => setShowContent(false)}
                className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-foreground/5 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h2
              id="agents-settings-dialog-title-narrow"
              className="text-lg font-semibold flex-1"
            >
              {showContent ? getTabLabel(activeTab) : "Settings"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-foreground/5 transition-colors"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {showContent ? (
              <div className="bg-tl-background min-h-full">
                {renderTabContent()}
              </div>
            ) : (
              <div className="p-4">
                {renderTabList()}
              </div>
            )}
          </div>
        </div>
      </>,
      portalTarget,
    )
  }

  // Wide screen: Centered modal with sidebar
  return createPortal(
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          {/* Custom Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/25"
            onClick={onClose}
            style={{ pointerEvents: isOpen ? "auto" : "none" }}
            data-modal="agents-settings"
          />

          {/* Settings Dialog */}
          <div className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[45]">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-[90vw] h-[80vh] max-w-[900px] p-0 flex flex-col rounded-[20px] bg-background border-none bg-clip-padding shadow-2xl overflow-hidden select-none"
              role="dialog"
              aria-modal="true"
              aria-labelledby="agents-settings-dialog-title"
              data-modal="agents-settings"
              data-canvas-dialog
              data-agents-page
            >
              <h2 id="agents-settings-dialog-title" className="sr-only">
                Settings
              </h2>

              <div className="flex h-full p-2">
                {/* Left Sidebar - Tabs */}
                <div className="w-52 px-1 py-5 space-y-4">
                  <h2 className="text-lg font-semibold px-2 pb-3 text-foreground">
                    Settings
                  </h2>

                  {/* Main Tabs */}
                  <div className="space-y-1">
                    {MAIN_TABS.map((tab) => (
                      <TabButton
                        key={tab.id}
                        tab={tab}
                        isActive={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                      />
                    ))}
                  </div>

                  {/* Separator */}
                  <div className="border-t border-border/50 mx-2" />

                  {/* Advanced Tabs */}
                  <div className="space-y-1">
                    {ADVANCED_TABS.map((tab) => (
                      <TabButton
                        key={tab.id}
                        tab={tab}
                        isActive={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                      />
                    ))}
                  </div>

                  {/* Project Tabs */}
                  {projectTabs.length > 0 && (
                    <>
                      {/* Separator */}
                      <div className="border-t border-border/50 mx-2" />

                      <div className="space-y-1">
                        {projectTabs.map((tab) => (
                          <TabButton
                            key={tab.id}
                            tab={tab}
                            isActive={activeTab === tab.id}
                            onClick={() => setActiveTab(tab.id)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Right Content Area */}
                <div className="flex-1 h-full overflow-hidden">
                  <div className="flex flex-col relative h-full bg-tl-background rounded-xl w-full transition-all duration-300 overflow-y-auto scrollbar-thin">
                    {renderTabContent()}
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="absolute appearance-none outline-none select-none top-5 right-5 rounded-full cursor-pointer flex items-center justify-center ring-offset-background focus:ring-ring bg-secondary h-7 w-7 text-foreground/70 hover:text-foreground focus:outline-hidden disabled:pointer-events-none active:scale-95 transition-all duration-200 ease-in-out z-[60] focus:outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    portalTarget,
  )
}
