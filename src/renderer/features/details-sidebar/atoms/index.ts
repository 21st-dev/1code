import { atom } from "jotai"
import { atomFamily, atomWithStorage } from "jotai/utils"
import { atomWithWindowStorage } from "../../../lib/window-storage"
import type { LucideIcon } from "lucide-react"
import { Box, FileText, Terminal, FileDiff, ListTodo, Gauge } from "lucide-react"

// ============================================================================
// Widget System Types & Registry
// ============================================================================

export type WidgetId = "info" | "usage" | "todo" | "plan" | "terminal" | "diff"

export interface WidgetConfig {
  id: WidgetId
  label: string
  icon: LucideIcon
  canExpand: boolean // true = can open as separate sidebar
  defaultVisible: boolean
}

export const WIDGET_REGISTRY: WidgetConfig[] = [
  { id: "info", label: "Workspace", icon: Box, canExpand: false, defaultVisible: true },
  { id: "usage", label: "Usage", icon: Gauge, canExpand: false, defaultVisible: true },
  { id: "todo", label: "To-dos", icon: ListTodo, canExpand: false, defaultVisible: true },
  { id: "plan", label: "Plan", icon: FileText, canExpand: true, defaultVisible: true },
  { id: "terminal", label: "Terminal", icon: Terminal, canExpand: true, defaultVisible: false },
  { id: "diff", label: "Changes", icon: FileDiff, canExpand: true, defaultVisible: true },
]

// Helper to get default visible widgets
const DEFAULT_VISIBLE_WIDGETS: WidgetId[] = WIDGET_REGISTRY
  .filter((w) => w.defaultVisible)
  .map((w) => w.id)

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
    (get) =>
      get(widgetOrderStorageAtom)[workspaceId] ?? DEFAULT_WIDGET_ORDER,
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
// Feature Flag & Sidebar State
// ============================================================================

// Feature flag for unified vs separate sidebars (for future toggle)
export const unifiedSidebarEnabledAtom = atomWithStorage<boolean>(
  "overview:unifiedEnabled",
  true, // Enable by default
  undefined,
  { getOnInit: true },
)

// Details sidebar open state (per-window, persisted)
export const detailsSidebarOpenAtom = atomWithWindowStorage<boolean>(
  "overview:sidebarOpen",
  false,
  { getOnInit: true },
)

// Section types for the overview sidebar
export type OverviewSection = "info" | "plan" | "terminal" | "diff"

// Default expanded sections
const DEFAULT_EXPANDED_SECTIONS: OverviewSection[] = ["info", "plan", "terminal"]

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
const planContentCacheStorageAtom = atom<Record<string, PlanContentCache | null>>({})

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
