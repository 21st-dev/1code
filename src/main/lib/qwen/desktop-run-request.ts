import type { AgentJobMode } from "../../../shared/agent-jobs"
import {
  createDesktopRunContextFromPreflight,
  type DesktopRunMcpSessionServer,
  type DesktopRunProviderBinding,
  type DesktopRunRequest,
  getDesktopRunRequestedCapabilities,
} from "../agent-runtime/desktop-run-request"
import type { DesktopPermissionPolicy } from "../agent-runtime/permission-policy"
import type { DesktopRunPreflightResult } from "../agent-runtime/preflight"
import type { RunEvent } from "../agent-runtime/runtime-events"

export type CreateQwenDesktopRunRequestInput = {
  runId: string
  jobId: string
  mode: AgentJobMode
  preflight: DesktopRunPreflightResult
  prompt: string
  permissionPolicy: DesktopPermissionPolicy
  providerBinding?: Omit<DesktopRunProviderBinding, "diagnostics">
  mcpServers?: DesktopRunMcpSessionServer[]
  signal: AbortSignal
  resumeSessionId?: string | null
  parentSessionId?: string | null
  emitTrace: (event: RunEvent) => void
}

export function createQwenDesktopRunRequest({
  runId,
  jobId,
  mode,
  preflight,
  prompt,
  permissionPolicy,
  providerBinding,
  mcpServers = [],
  signal,
  resumeSessionId,
  parentSessionId,
  emitTrace,
}: CreateQwenDesktopRunRequestInput): DesktopRunRequest {
  return {
    identity: {
      runId,
      jobId,
    },
    context: createDesktopRunContextFromPreflight("qwen-code", mode, preflight),
    prompt,
    requestedCapabilities: getDesktopRunRequestedCapabilities(permissionPolicy),
    permissionPolicy,
    providerBinding: {
      model: "qwen-code",
      modelSource: "runtime-managed",
      authMode: "runtime-managed",
      ...(providerBinding ?? {}),
      diagnostics: permissionPolicy.diagnostics.map((message, index) => ({
        id: `permission-policy-${index + 1}`,
        status: "ready",
        message,
      })),
    },
    mcp: {
      status: "ready",
      serverNames: mcpServers.map((server) => server.name),
      blockers: [],
    },
    mcpSessionServers: mcpServers,
    attachments: [],
    trace: {
      emit: emitTrace,
    },
    signal,
    session: {
      resumeSessionId,
      parentSessionId,
    },
  }
}
