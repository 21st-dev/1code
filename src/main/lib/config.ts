/**
 * Shared configuration for the desktop app
 */
import { app } from "electron"

const IS_DEV = !!process.env.ELECTRON_RENDERER_URL
export type ContinuityMode = "off" | "passive" | "active"
export type ContinuityGovernorCapabilities = {
  snapshotEnabled: boolean
  rehydrateEnabled: boolean
}

/**
 * Get the API base URL
 * In packaged app, ALWAYS use production URL to prevent localhost leaking into releases
 * In dev mode, allow override via MAIN_VITE_API_URL env variable
 */
export function getApiUrl(): string {
  if (app.isPackaged) {
    return "https://21st.dev"
  }
  return import.meta.env.MAIN_VITE_API_URL || "https://21st.dev"
}

/**
 * Check if running in development mode
 */
export function isDev(): boolean {
  return IS_DEV
}

/**
 * Feature flag for automatic continuity context injection.
 * Disabled by default while rolling out incrementally.
 */
export function isContinuityEnabled(): boolean {
  return getContinuityMode() !== "off"
}

export function getContinuityMode(): ContinuityMode {
  const rawMode = process.env.ONECODE_CONTINUITY_MODE
  if (rawMode === "active" || rawMode === "passive" || rawMode === "off") {
    return rawMode
  }
  // Backward compatibility for existing boolean flag.
  return process.env.ONECODE_CONTINUITY_ENABLED === "1" ? "active" : "off"
}

export type ContinuityArtifactPolicy = "auto-write-manual-commit" | "auto-write-memory-branch"

export function getDefaultContinuityArtifactPolicy(): ContinuityArtifactPolicy {
  const raw = process.env.ONECODE_CONTINUITY_ARTIFACT_POLICY
  return raw === "auto-write-memory-branch"
    ? "auto-write-memory-branch"
    : "auto-write-manual-commit"
}

export function getDefaultContinuityMemoryBranch(): string {
  return process.env.ONECODE_CONTINUITY_MEMORY_BRANCH || "memory/continuity"
}

export function getContinuityGovernorCapabilities(): ContinuityGovernorCapabilities {
  return {
    snapshotEnabled: process.env.ONECODE_CONTINUITY_ENABLE_SNAPSHOT !== "0",
    // Staged rollout: keep disabled by default until explicitly enabled.
    rehydrateEnabled: process.env.ONECODE_CONTINUITY_ENABLE_REHYDRATE === "1",
  }
}
