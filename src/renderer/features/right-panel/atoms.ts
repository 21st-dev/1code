import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// Panel state
export const rightPanelOpenAtom = atomWithStorage("rightPanelOpen", true)
export const rightPanelWidthAtom = atomWithStorage("rightPanelWidth", 400)

// Dev terminals (per-workspace)
export interface DevTerminalInstance {
    id: string
    paneId: string  // format: `${projectId}:devterm:${id}`
    name: string
    cwd?: string
}

// Map<projectId, terminals[]>
export const devTerminalsAtom = atom<Map<string, DevTerminalInstance[]>>(new Map())

// Map<projectId, activeTerminalId>
export const activeDevTerminalIdAtom = atom<Map<string, string>>(new Map())
