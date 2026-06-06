import { CLAUDE_AGENT_SDK_DESKTOP_ADAPTER_METADATA } from "../agent-runtime/desktop-adapter-metadata"
import type {
  DesktopRuntimeAdapter,
} from "../agent-runtime/desktop-runner"
import type {
  DesktopRunRequest,
  DesktopRunResult,
} from "../agent-runtime/desktop-run-request"
import type { ClaudeAgentSdkQuery } from "./agent-sdk-query-loader"
import type { ClaudeAgentSdkQueryParams } from "./agent-sdk-query-options"

export type ClaudeAgentSdkStream = AsyncIterable<any>

export type ClaudeAgentSdkStreamConsumer = (input: {
  request: DesktopRunRequest
  stream: ClaudeAgentSdkStream
}) => Promise<DesktopRunResult>

export type CreateClaudeAgentSdkAdapterInput = {
  query: ClaudeAgentSdkQuery
  queryOptions: ClaudeAgentSdkQueryParams
  consumeStream: ClaudeAgentSdkStreamConsumer
}

export function createClaudeAgentSdkAdapter({
  query,
  queryOptions,
  consumeStream,
}: CreateClaudeAgentSdkAdapterInput): DesktopRuntimeAdapter {
  return {
    metadata: CLAUDE_AGENT_SDK_DESKTOP_ADAPTER_METADATA,

    async run(request: DesktopRunRequest): Promise<DesktopRunResult> {
      const stream = query(queryOptions) as ClaudeAgentSdkStream
      return consumeStream({ request, stream })
    },
  }
}
