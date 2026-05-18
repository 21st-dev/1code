import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronLeft, Info } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  EyeOpenFilledIcon,
  SlidersFilledIcon,
} from "../../icons"
import {
  agentsSettingsDialogActiveTabAtom,
  devToolsUnlockedAtom,
  isDesktopAtom,
  type SettingsTab,
} from "../../lib/atoms"
import { useI18n, type TranslationKey } from "../../lib/i18n"
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

const GENERAL_TABS: SettingsTabDefinition[] = [
  {
    id: "preferences" as SettingsTab,
    labelKey: "settings.sidebar.preferences",
    icon: SlidersFilledIcon,
  },
  {
    id: "appearance" as SettingsTab,
    labelKey: "settings.sidebar.appearance",
    icon: EyeOpenFilledIcon,
  },
  {
    id: "keyboard" as SettingsTab,
    labelKey: "settings.sidebar.keyboard",
    icon: KeyboardFilledIcon,
  },
  {
    id: "about" as SettingsTab,
    labelKey: "settings.sidebar.about",
    icon: Info,
  },
]

const WORKSPACE_TABS: SettingsTabDefinition[] = [
  {
    id: "projects" as SettingsTab,
    labelKey: "settings.sidebar.projects",
    icon: FolderFilledIcon,
  },
  {
    id: "models" as SettingsTab,
    labelKey: "settings.sidebar.models",
    icon: BrainFilledIcon,
  },
]

const AGENT_CAPABILITY_TABS: SettingsTabDefinition[] = [
  {
    id: "skills" as SettingsTab,
    labelKey: "settings.sidebar.skills",
    icon: SkillIconFilled,
  },
  {
    id: "agents" as SettingsTab,
    labelKey: "settings.sidebar.customAgents",
    icon: CustomAgentIconFilled,
  },
  {
    id: "mcp" as SettingsTab,
    labelKey: "settings.sidebar.mcpServers",
    icon: OriginalMCPIcon,
  },
  {
    id: "plugins" as SettingsTab,
    labelKey: "settings.sidebar.plugins",
    icon: PluginFilledIcon,
  },
]

const ADVANCED_TABS_BASE: SettingsTabDefinition[] = [
  {
    id: "beta" as SettingsTab,
    labelKey: "settings.sidebar.beta",
    icon: FlaskFilledIcon,
  },
]

// Debug tab definition
const DEBUG_TAB: SettingsTabDefinition = {
  id: "debug" as SettingsTab,
  labelKey: "settings.sidebar.debug",
  icon: BugFilledIcon,
}

type SettingsTabDefinition = {
  id: SettingsTab
  labelKey: TranslationKey
  icon: React.ComponentType<{ className?: string }> | any
}

type SettingsTabGroup = {
  labelKey: TranslationKey
  tabs: SettingsTabDefinition[]
}

interface TabButtonProps {
  tab: SettingsTabDefinition
  isActive: boolean
  onClick: () => void
}

function TabButton({ tab, isActive, onClick }: TabButtonProps) {
  const { t } = useI18n()
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
      <span className="flex-1 truncate">{t(tab.labelKey)}</span>
    </button>
  )
}

interface TabSectionProps {
  group: SettingsTabGroup
  activeTab: SettingsTab
  onTabClick: (tabId: SettingsTab) => void
  showDivider?: boolean
}

function TabSection({
  group,
  activeTab,
  onTabClick,
  showDivider = false,
}: TabSectionProps) {
  const { t } = useI18n()

  return (
    <div
      className={cn(
        "space-y-1",
        showDivider && "border-t border-border/50 pt-3",
      )}
    >
      <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {t(group.labelKey)}
      </div>
      {group.tabs.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          isActive={activeTab === tab.id}
          onClick={() => onTabClick(tab.id)}
        />
      ))}
    </div>
  )
}

export function SettingsSidebar() {
  const { t } = useI18n()
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

  const tabGroups = useMemo<SettingsTabGroup[]>(() => {
    const advancedTabs = showDebugTab
      ? [...ADVANCED_TABS_BASE, DEBUG_TAB]
      : ADVANCED_TABS_BASE

    return [
      {
        labelKey: "settings.sidebar.group.general",
        tabs: GENERAL_TABS,
      },
      {
        labelKey: "settings.sidebar.group.workspace",
        tabs: WORKSPACE_TABS,
      },
      {
        labelKey: "settings.sidebar.group.agentCapabilities",
        tabs: AGENT_CAPABILITY_TABS,
      },
      {
        labelKey: "settings.sidebar.group.advanced",
        tabs: advancedTabs,
      },
    ]
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
          <span>{t("common.back")}</span>
        </button>
      </div>

      {/* Tab list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent px-2 pb-4 space-y-3">
        {tabGroups.map((group, index) => (
          <TabSection
            key={group.labelKey}
            group={group}
            activeTab={activeTab}
            onTabClick={handleTabClick}
            showDivider={index > 0}
          />
        ))}
      </div>
    </div>
  )
}
