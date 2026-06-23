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

export type CreateKunDesktopRunRequestInput = {
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

export function createKunDesktopRunRequest({
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
}: CreateKunDesktopRunRequestInput): DesktopRunRequest {
  return {
    identity: {
      runId,
      jobId,
    },
    context: createDesktopRunContextFromPreflight("kun", mode, preflight),
    prompt,
    requestedCapabilities: getDesktopRunRequestedCapabilities(permissionPolicy),
    permissionPolicy,
    providerBinding: {
      model: "kun",
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
      status: "skipped",
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
