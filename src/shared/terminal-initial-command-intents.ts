export const TERMINAL_INITIAL_COMMAND_INTENTS = [
  "github-cli-auth-login",
] as const

export type TerminalInitialCommandIntent =
  (typeof TERMINAL_INITIAL_COMMAND_INTENTS)[number]

