import {
  type OpenCodexStartupState,
  evaluateOpenCodexStartupState,
} from "./preflight"

let startupState: OpenCodexStartupState = { status: "ready" }

export function getOpenCodexStartupState(): OpenCodexStartupState {
  return startupState
}

export function setOpenCodexStartupState(state: OpenCodexStartupState): OpenCodexStartupState {
  startupState = state
  return startupState
}

export function refreshOpenCodexStartupState({
  userDataPath,
  appVersion,
}: {
  userDataPath: string
  appVersion: string
}): OpenCodexStartupState {
  startupState = evaluateOpenCodexStartupState({ userDataPath, appVersion })
  return startupState
}
