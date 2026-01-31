import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronLeft } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  EyeOpenFilledIcon,
  ProfileIconFilled,
  SlidersFilledIcon,
} from "../../icons"
import {
  agentsSettingsDialogActiveTabAtom,
  devToolsUnlockedAtom,
  isDesktopAtom,
  type SettingsTab,
} from "../../lib/atoms"
import { cn } from "../../lib/utils"
import {
  BrainFilledIcon,
  BugFilledIcon,
  CustomAgentIconFilled,
  FlaskFilledIcon,
  FolderFilledIcon,
  KeyboardFilledIcon,
  OriginalMCPIcon,
  PluginFilledIcon,
  SkillIconFilled,
} from "../../components/ui/icons"
import { desktopViewAtom } from "../agents/atoms"

// Check if we're in development mode
const isDevelopment = import.meta.env.DEV

// Clicks required to unlock devtools in production
const DEVTOOLS_UNLOCK_CLICKS = 5

// General settings tabs
const MAIN_TABS = [
  {
    id: "preferences" as SettingsTab,
    label: "Preferences",
    icon: SlidersFilledIcon,
  },
  {
    id: "profile" as SettingsTab,
    label: "Account",
    icon: ProfileIconFilled,
  },
  {
    id: "appearance" as SettingsTab,
    label: "Appearance",
    icon: EyeOpenFilledIcon,
  },
  {
    id: "keyboard" as SettingsTab,
    label: "Keyboard",
    icon: KeyboardFilledIcon,
  },
  {
    id: "beta" as SettingsTab,
    label: "Beta",
    icon: FlaskFilledIcon,
  },
]

// Advanced tabs (base - without Debug)
const ADVANCED_TABS_BASE = [
  {
    id: "projects" as SettingsTab,
    label: "Projects",
    icon: FolderFilledIcon,
  },
  {
    id: "models" as SettingsTab,
    label: "Models",
    icon: BrainFilledIcon,
  },
  {
    id: "skills" as SettingsTab,
    label: "Skills",
    icon: SkillIconFilled,
  },
  {
    id: "agents" as SettingsTab,
    label: "Custom Agents",
    icon: CustomAgentIconFilled,
  },
  {
    id: "mcp" as SettingsTab,
    label: "MCP Servers",
    icon: OriginalMCPIcon,
  },
  {
    id: "plugins" as SettingsTab,
    label: "Plugins",
    icon: PluginFilledIcon,
  },
]

// Debug tab definition
const DEBUG_TAB = {
  id: "debug" as SettingsTab,
  label: "Debug",
  icon: BugFilledIcon,
}

interface TabButtonProps {
  tab: {
    id: SettingsTab
    label: string
    icon: React.ComponentType<{ className?: string }> | any
  }
  isActive: boolean
  onClick: () => void
}

function TabButton({ tab, isActive, onClick }: TabButtonProps) {
  const Icon = tab.icon
  const isProjectTab = "projectId" in tab

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center whitespace-nowrap transition-colors duration-75 cursor-pointer w-full justify-start gap-2 text-left px-3 py-1.5 text-sm h-7 rounded-md",
        "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
        isActive
          ? "bg-foreground/5 text-foreground font-medium"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground font-medium"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4",
          isProjectTab ? "opacity-100" : isActive ? "opacity-100" : "opacity-50"
        )}
      />
      <span className="flex-1 truncate">{tab.label}</span>
    </button>
  )
}

export function SettingsSidebar() {
  const [activeTab, setActiveTab] = useAtom(agentsSettingsDialogActiveTabAtom)
  const [devToolsUnlocked, setDevToolsUnlocked] = useAtom(devToolsUnlockedAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const isDesktop = useAtomValue(isDesktopAtom)

  // Hide native traffic lights when settings sidebar is shown
  useEffect(() => {
    if (!isDesktop) return
    if (typeof window === "undefined" || !window.desktopApi?.setTrafficLightVisibility) return
    window.desktopApi.setTrafficLightVisibility(false)
  }, [isDesktop])

  // Beta tab click counter for unlocking devtools
  const betaClickCountRef = useRef(0)
  const betaClickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Show debug tab if in development OR if devtools are unlocked
  const showDebugTab = isDevelopment || devToolsUnlocked

  const mainTabs = useMemo(() => {
    if (showDebugTab) return [...MAIN_TABS, DEBUG_TAB]
    return MAIN_TABS
  }, [showDebugTab])

  const handleTabClick = (tabId: SettingsTab) => {
    // Handle Beta tab clicks for devtools unlock
    if (tabId === "beta" && !devToolsUnlocked) {
      betaClickCountRef.current++
      if (betaClickTimeoutRef.current) {
        clearTimeout(betaClickTimeoutRef.current)
      }
      betaClickTimeoutRef.current = setTimeout(() => {
        betaClickCountRef.current = 0
      }, 2000)
      if (betaClickCountRef.current >= DEVTOOLS_UNLOCK_CLICKS) {
        setDevToolsUnlocked(true)
        betaClickCountRef.current = 0
        window.desktopApi?.unlockDevTools()
      }
    }
    setActiveTab(tabId)
  }

  const handleBack = useCallback(() => {
    setDesktopView(null)
  }, [setDesktopView])

  return (
    <div className="flex flex-col h-full bg-tl-background" data-sidebar-content>
      {/* Back button */}
      <div className="px-2 pt-3 pb-2">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm h-7 rounded-md text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
      </div>

      {/* Tab list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent px-2 pb-4 space-y-4">
        {/* Main Tabs */}
        <div className="space-y-1">
          {mainTabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              onClick={() => handleTabClick(tab.id)}
            />
          ))}
        </div>

        {/* Separator */}
        <div className="border-t border-border/50 mx-2" />

        {/* Advanced Tabs */}
        <div className="space-y-1">
          {ADVANCED_TABS_BASE.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              onClick={() => handleTabClick(tab.id)}
            />
          ))}
        </div>

      </div>
    </div>
  )
}
