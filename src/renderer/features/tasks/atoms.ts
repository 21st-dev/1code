import { atomWithStorage } from "jotai/utils"

export interface Task {
  id: string
  name: string
  description: string
  createdAt: number
}

// Tasks panel open state - stored as Record<chatId, boolean>
export const tasksPanelOpenAtom = atomWithStorage<Record<string, boolean>>(
  "tasks:panelOpen",
  {},
  undefined,
  { getOnInit: true },
)

// Tasks panel width
export const tasksPanelWidthAtom = atomWithStorage<number>(
  "tasks:panelWidth",
  400,
  undefined,
  { getOnInit: true },
)

// Tasks list per chat - stored as Record<chatId, Task[]>
export const tasksAtom = atomWithStorage<Record<string, Task[]>>(
  "tasks:all",
  {},
  undefined,
  { getOnInit: true },
)
