import {
  TERMINAL_INITIAL_COMMAND_INTENTS,
  type TerminalInitialCommandIntent,
} from "../../../shared/terminal-initial-command-intents"

export { TERMINAL_INITIAL_COMMAND_INTENTS }
export type { TerminalInitialCommandIntent }

const INITIAL_COMMAND_BY_INTENT: Record<TerminalInitialCommandIntent, string> = {
  "github-cli-auth-login": "gh auth login",
}

export function resolveInitialCommandIntents(
  intents: TerminalInitialCommandIntent[] | undefined,
): string[] | undefined {
  if (!intents || intents.length === 0) {
    return undefined
  }

  return intents.map((intent) => INITIAL_COMMAND_BY_INTENT[intent])
}

