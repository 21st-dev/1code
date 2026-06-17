import { atom } from "jotai"
import { atomFamily, atomWithStorage } from "jotai/utils"
import type { LucideIcon } from "lucide-react"
import {
  Activity,
  AlertCircle,
  BarChart3,
  Box,
  FileDiff,
  FileText,
  Globe2,
  ListTodo,
  Terminal,
} from "lucide-react"
import { OriginalMCPIcon } from "../../../components/ui/icons"
import type { TranslationKey } from "../../../lib/i18n"
import { atomWithWindowStorage } from "../../../lib/window-storage"

// ============================================================================
// Widget System Types & Registry
// ============================================================================

export type WidgetId =
  | "info"
  | "todo"
  | "plan"
  | "terminal"
  | "diff"
  | "browser"
  | "mcp"
  | "trace"
  | "usage"
  | "error"

export interface WidgetConfig {
  id: WidgetId
  label: string
  labelKey: TranslationKey
  icon: LucideIcon
  canExpand: boolean // true = can open as separate sidebar
  defaultVisible: boolean
}

export const WIDGET_REGISTRY: WidgetConfig[] = [
  {
    id: "info",
    label: "Workspace",
    labelKey: "details.workspace",
    icon: Box,
    canExpand: false,
    defaultVisible: true,
  },
  {
    id: "todo",
    label: "To-dos",
    labelKey: "details.todoList",
    icon: ListTodo,
    canExpand: false,
    defaultVisible: true,
  },
  {
    id: "trace",
    label: "Trace",
    labelKey: "details.trace",
    icon: Activity,
    canExpand: false,
    defaultVisible: true,
  },
  {
    id: "usage",
    label: "Usage",
    labelKey: "details.usage",
    icon: BarChart3,
    canExpand: false,
    defaultVisible: true,
  },
  {
    id: "error",
    label: "Errors",
    labelKey: "details.error",
    icon: AlertCircle,
    canExpand: false,
    defaultVisible: true,
  },
  {
    id: "plan",
    label: "Plan",
    labelKey: "details.plan",
    icon: FileText,
    canExpand: true,
    defaultVisible: true,
  },
  {
    id: "terminal",
    label: "Terminal",
    labelKey: "details.terminal",
    icon: Terminal,
    canExpand: true,
    defaultVisible: false,
  },
  {
    id: "diff",
    label: "Changes",
    labelKey: "changes.title",
    icon: FileDiff,
    canExpand: true,
    defaultVisible: true,
  },
  {
    id: "browser",
    label: "Local Browser",
    labelKey: "localBrowser.title",
    icon: Globe2,
    canExpand: true,
    defaultVisible: true,
  },
  {
    id: "mcp",
    label: "MCP Servers",
    labelKey: "details.mcpServers",
    icon: OriginalMCPIcon as unknown as LucideIcon,
    canExpand: false,
    defaultVisible: true,
  },
]

// Helper to get default visible widgets
const DEFAULT_VISIBLE_WIDGETS: WidgetId[] = WIDGET_REGISTRY.filter(
  (w) => w.defaultVisible,
).map((w) => w.id)

// Default widget order (all widgets)
const DEFAULT_WIDGET_ORDER: WidgetId[] = WIDGET_REGISTRY.map((w) => w.id)

// ============================================================================
// Widget Visibility (per workspace)
// ============================================================================

const widgetVisibilityStorageAtom = atomWithStorage<Record<string, WidgetId[]>>(
  "overview:widgetVisibility",
  {},
  undefined,
  { getOnInit: true },
)

export const widgetVisibilityAtomFamily = atomFamily((workspaceId: string) =>
  atom(
    (get) =>
      get(widgetVisibilityStorageAtom)[workspaceId] ?? DEFAULT_VISIBLE_WIDGETS,
    (get, set, visibleWidgets: WidgetId[]) => {
      const current = get(widgetVisibilityStorageAtom)
      set(widgetVisibilityStorageAtom, {
        ...current,
        [workspaceId]: visibleWidgets,
      })
    },
  ),
)

// ============================================================================
// Widget Order (per workspace) - controls display order of all widgets
// ============================================================================

const widgetOrderStorageAtom = atomWithStorage<Record<string, WidgetId[]>>(
  "overview:widgetOrder",
  {},
  undefined,
  { getOnInit: true },
)

export const widgetOrderAtomFamily = atomFamily((workspaceId: string) =>
  atom(
    (get) => get(widgetOrderStorageAtom)[workspaceId] ?? DEFAULT_WIDGET_ORDER,
    (get, set, widgetOrder: WidgetId[]) => {
      const current = get(widgetOrderStorageAtom)
      set(widgetOrderStorageAtom, {
        ...current,
        [workspaceId]: widgetOrder,
      })
    },
  ),
)

// ============================================================================
// Expanded Widget State (per workspace, runtime only - not persisted)
// ============================================================================

// Which widget is currently expanded as a separate sidebar
// null = no widget expanded
const expandedWidgetStorageAtom = atom<Record<string, WidgetId | null>>({})

export const expandedWidgetAtomFamily = atomFamily((workspaceId: string) =>
  atom(
    (get) => get(expandedWidgetStorageAtom)[workspaceId] ?? null,
    (get, set, expandedWidget: WidgetId | null) => {
      const current = get(expandedWidgetStorageAtom)
      set(expandedWidgetStorageAtom, {
        ...current,
        [workspaceId]: expandedWidget,
      })
    },
  ),
)

// Expanded widget sidebar width
export const expandedWidgetSidebarWidthAtom = atomWithStorage<number>(
  "overview:expandedWidgetWidth",
  500,
  undefined,
  { getOnInit: true },
)

// ============================================================================
// Sidebar State
// ============================================================================

// Details sidebar open state (per-window, persisted)
export const detailsSidebarOpenAtom = atomWithWindowStorage<boolean>(
  "overview:sidebarOpen",
  false,
  { getOnInit: true },
)

// Details sidebar active tab (per-window, persisted)
export type DetailsSidebarTab = "details" | "files"

export const detailsSidebarTabAtom = atomWithWindowStorage<DetailsSidebarTab>(
  "overview:sidebarTab",
  "details",
  { getOnInit: true },
)

// Section types for the overview sidebar
export type OverviewSection = "info" | "plan" | "terminal" | "diff"

// Default expanded sections
const DEFAULT_EXPANDED_SECTIONS: OverviewSection[] = [
  "info",
  "plan",
  "terminal",
]

// Section expand states (per workspace) - stores array of expanded section IDs
const sectionExpandStorageAtom = atomWithStorage<
  Record<string, OverviewSection[]>
>("overview:expandedSections", {}, undefined, { getOnInit: true })

export const expandedSectionsAtomFamily = atomFamily((workspaceId: string) =>
  atom(
    (get) =>
      get(sectionExpandStorageAtom)[workspaceId] ?? DEFAULT_EXPANDED_SECTIONS,
    (get, set, expandedSections: OverviewSection[]) => {
      const current = get(sectionExpandStorageAtom)
      set(sectionExpandStorageAtom, {
        ...current,
        [workspaceId]: expandedSections,
      })
    },
  ),
)

// Unified sidebar width (persisted)
export const detailsSidebarWidthAtom = atomWithStorage<number>(
  "overview:sidebarWidth",
  500,
  undefined,
  { getOnInit: true },
)

// Focused section for "focus mode" (when a section needs more space like Diff)
// null = normal mode, section name = focused mode
export const focusedSectionAtom = atom<OverviewSection | null>(null)

// ============================================================================
// Plan Content Cache (per workspace) - prevents flashing loading states
// ============================================================================

export interface PlanContentCache {
  content: string
  planPath: string
  // Track if content is ready (file loaded successfully)
  isReady: boolean
}

// Runtime cache for plan content per workspace (not persisted)
const planContentCacheStorageAtom = atom<
  Record<string, PlanContentCache | null>
>({})

export const planContentCacheAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(planContentCacheStorageAtom)[chatId] ?? null,
    (get, set, cache: PlanContentCache | null) => {
      const current = get(planContentCacheStorageAtom)
      set(planContentCacheStorageAtom, {
        ...current,
        [chatId]: cache,
      })
    },
  ),
)

// ============================================================================
// File Tree Expanded Paths (per worktree, persisted across reloads)
// ============================================================================

const fileTreeExpandedStorageAtom = atomWithStorage<Record<string, string[]>>(
  "overview:fileTreeExpanded",
  {},
  undefined,
  { getOnInit: true },
)

/** null sentinel: first mount for this worktree (no user action yet → auto-expand roots) */
export const fileTreeExpandedAtomFamily = atomFamily((worktreePath: string) =>
  atom(
    (get): string[] | null => {
      const stored = get(fileTreeExpandedStorageAtom)[worktreePath]
      return stored ?? null // null = never initialised
    },
    (get, set, paths: string[]) => {
      const current = get(fileTreeExpandedStorageAtom)
      set(fileTreeExpandedStorageAtom, {
        ...current,
        [worktreePath]: paths,
      })
    },
  ),
)
