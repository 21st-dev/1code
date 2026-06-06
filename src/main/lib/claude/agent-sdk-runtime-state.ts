import { createTransformer } from "./transform"
import {
  createClaudeAgentSdkInitialGuardMetadata,
  type ClaudeAgentSdkGuardedContract,
} from "./agent-sdk-guard-metadata"
import {
  createClaudeAgentSdkStreamConsumerMutableState,
  type ClaudeAgentSdkStreamConsumerMutableState,
} from "./agent-sdk-stream-consumer"

export type ClaudeAgentSdkRuntimeStreamSetup = {
  transform: ReturnType<typeof createTransformer>
  parts: any[]
  stderrLines: string[]
  metadata: Record<string, any>
}

export function createClaudeAgentSdkRuntimeStreamState(): ClaudeAgentSdkStreamConsumerMutableState {
  return createClaudeAgentSdkStreamConsumerMutableState()
}

export function createClaudeAgentSdkRuntimeStreamSetup(input: {
  historyEnabled: boolean
  isUsingOllama: boolean
  guardedContract: ClaudeAgentSdkGuardedContract | null
}): ClaudeAgentSdkRuntimeStreamSetup {
  return {
    transform: createTransformer({
      emitSdkMessageUuid: input.historyEnabled,
      isUsingOllama: input.isUsingOllama,
    }),
    parts: [],
    stderrLines: [],
    metadata: createClaudeAgentSdkInitialGuardMetadata(input.guardedContract),
  }
}
