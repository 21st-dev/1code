import type { AgentJobMode } from "../../../shared/agent-jobs"
import {
  createDesktopRunContextFromPreflight,
  type DesktopRunProviderBinding,
  type DesktopRunRequest,
} from "../agent-runtime/desktop-run-request"
import type { DesktopPermissionPolicy } from "../agent-runtime/permission-policy"
import type { DesktopRunPreflightResult } from "../agent-runtime/preflight"
import type { RunEvent } from "../agent-runtime/runtime-events"

export type CodexDesktopRunImageAttachment = {
  attachmentId?: string
  localRef?: string
  mediaType?: string
  filename?: string
  sizeBytes?: number
}

export type CodexDesktopRunLongTextAttachment = {
  attachmentId?: string
  localRef?: string
  filename?: string
  byteLength?: number
}

export type CodexDesktopRunMcpServer = {
  name: string
}

export type CreateCodexDesktopRunRequestInput = {
  runId: string
  jobId: string
  mode: AgentJobMode
  preflight: DesktopRunPreflightResult
  prompt: string
  permissionPolicy: DesktopPermissionPolicy
  providerBinding: Omit<DesktopRunProviderBinding, "diagnostics">
  mcpServers: CodexDesktopRunMcpServer[]
  images?: CodexDesktopRunImageAttachment[]
  longTextAttachments?: CodexDesktopRunLongTextAttachment[]
  signal: AbortSignal
  resumeSessionId?: string | null
  parentSessionId?: string | null
  emitTrace: (event: RunEvent) => void
}

export function createCodexDesktopRunRequest({
  runId,
  jobId,
  mode,
  preflight,
  prompt,
  permissionPolicy,
  providerBinding,
  mcpServers,
  images,
  longTextAttachments,
  signal,
  resumeSessionId,
  parentSessionId,
  emitTrace,
}: CreateCodexDesktopRunRequestInput): DesktopRunRequest {
  return {
    identity: {
      runId,
      jobId,
    },
    context: createDesktopRunContextFromPreflight(
      "codex",
      mode,
      preflight,
    ),
    prompt,
    permissionPolicy,
    providerBinding: {
      ...providerBinding,
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
    attachments: [
      ...(images ?? []).map((image) => ({
        kind: "image" as const,
        attachmentId: image.attachmentId,
        localRef: image.localRef,
        mediaType: image.mediaType,
        filename: image.filename,
        byteLength: image.sizeBytes,
      })),
      ...(longTextAttachments ?? []).map((attachment) => ({
        kind: "long-text" as const,
        attachmentId: attachment.attachmentId,
        localRef: attachment.localRef,
        filename: attachment.filename,
        byteLength: attachment.byteLength,
      })),
    ],
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
