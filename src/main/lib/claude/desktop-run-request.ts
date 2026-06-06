import type { AgentJobMode } from "../../../shared/agent-jobs"
import {
  createDesktopRunContextFromPreflight,
  type DesktopRunProviderBinding,
  type DesktopRunRequest,
} from "../agent-runtime/desktop-run-request"
import type { DesktopPermissionPolicy } from "../agent-runtime/permission-policy"
import type { DesktopRunPreflightResult } from "../agent-runtime/preflight"
import type { RunEvent } from "../agent-runtime/runtime-events"

export type ClaudeDesktopRunImageAttachment = {
  attachmentId?: string
  localRef?: string
  mediaType?: string
  filename?: string
  sizeBytes?: number
}

export type ClaudeDesktopRunLongTextAttachment = {
  attachmentId?: string
  localRef?: string
  filename?: string
  byteLength?: number
}

export type CreateClaudeDesktopRunRequestInput = {
  runId: string
  streamId: string
  jobId: string
  mode: AgentJobMode
  preflight: DesktopRunPreflightResult
  prompt: string
  permissionPolicy: DesktopPermissionPolicy
  providerBinding: Omit<DesktopRunProviderBinding, "diagnostics">
  images?: ClaudeDesktopRunImageAttachment[]
  longTextAttachments?: ClaudeDesktopRunLongTextAttachment[]
  signal: AbortSignal
  resumeSessionId?: string | null
  parentSessionId?: string | null
  emitTrace: (event: RunEvent) => void
}

export function createClaudeDesktopRunRequest({
  runId,
  streamId,
  jobId,
  mode,
  preflight,
  prompt,
  permissionPolicy,
  providerBinding,
  images,
  longTextAttachments,
  signal,
  resumeSessionId,
  parentSessionId,
  emitTrace,
}: CreateClaudeDesktopRunRequestInput): DesktopRunRequest {
  return {
    identity: {
      runId,
      streamId,
      jobId,
    },
    context: createDesktopRunContextFromPreflight(
      "claude-code",
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
      status: "skipped",
      serverNames: [],
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
