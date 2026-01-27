import { atomWithStorage } from "jotai/utils"

// Which panel is currently open in the right sidebar drawer
// null = drawer is closed
export type RightSidebarPanel = "documents" | "tasks" | null

// Per-chat state for which panel is open
export const rightSidebarPanelAtom = atomWithStorage<Record<string, RightSidebarPanel>>(
  "agents:right-sidebar-panel",
  {},
  undefined,
  { getOnInit: true }
)

// Width of the right sidebar drawer
export const rightSidebarDrawerWidthAtom = atomWithStorage<number>(
  "agents:right-sidebar-drawer-width",
  500,
  undefined,
  { getOnInit: true }
)

// Width of the action bar (constant)
export const RIGHT_ACTION_BAR_WIDTH = 40
