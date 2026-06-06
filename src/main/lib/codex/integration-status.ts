import { runCodexCli } from "./cli-runner"
import {
  isCodexIntegrationConnected,
  normalizeCodexIntegrationState,
  type CodexIntegrationState,
} from "./integration-state"

export {
  isCodexIntegrationConnected,
  normalizeCodexIntegrationState,
  type CodexIntegrationState,
} from "./integration-state"

export type CodexIntegrationStatus = {
  state: CodexIntegrationState
  isConnected: boolean
  rawOutput: string
  exitCode: number | null
}

export async function getCodexIntegrationStatus(): Promise<CodexIntegrationStatus> {
  const result = await runCodexCli(["login", "status"])
  const combinedOutput = [result.stdout, result.stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join("\n")
    .trim()

  const state = normalizeCodexIntegrationState(combinedOutput)

  return {
    state,
    isConnected: isCodexIntegrationConnected(state),
    rawOutput: combinedOutput,
    exitCode: result.exitCode,
  }
}
