import { setTimeout as sleep } from "node:timers/promises"
import { KUN_HTTP_SSE_DESKTOP_ADAPTER_METADATA } from "../agent-runtime/desktop-adapter-metadata"
import type {
  DesktopRunRequest,
  DesktopRunResult,
} from "../agent-runtime/desktop-run-request"
import {
  type DesktopRuntimeAdapter,
  emitDesktopRuntimeAdapterStarted,
} from "../agent-runtime/desktop-runner"
import { getKunHttpSsePermissionMapping } from "../agent-runtime/permission-policy"
import { mapDesktopStreamChunkToRunEvents } from "../agent-runtime/stream-event-mapper"
import type { RunEvent } from "../agent-runtime/runtime-events"
import {
  KunHttpSseTransport,
  type KunRuntimeEvent,
} from "./kun-http-sse-transport"
import {
  launchKunServe,
  type KunServeHandle,
  type KunServeLaunchInput,
} from "./kun-serve-launcher"

const DEFAULT_KUN_APPROVAL_TIMEOUT_MS = 120_000

export type KunHttpSseApproval = {
  approved: boolean
  message?: string
  updatedInput?: unknown
}

export type KunHttpSseApprovalPending = {
  subChatId: string
  resolve: (approval: KunHttpSseApproval) => void
}

export type KunHttpSseTransportLike = {
  createThread(input: {
    workspace: string
    model: string
    mode: "agent" | "plan"
    signal: AbortSignal
  }): Promise<{ id: string }>
  startTurn(input: {
    threadId: string
    prompt: string
    mode: "agent" | "plan"
    model?: string | null
    signal: AbortSignal
  }): Promise<{ threadId: string; turnId: string }>
  streamEvents(input: {
    threadId: string
    sinceSeq?: number
    signal: AbortSignal
    onEvent: (event: KunRuntimeEvent) => void
  }): Promise<void>
  interruptTurn(input: {
    threadId: string
    turnId: string
    signal: AbortSignal
  }): Promise<void>
  decideApproval(input: {
    approvalId: string
    decision: "allow" | "deny"
    reason?: string | null
    signal: AbortSignal
  }): Promise<void>
}

export type CreateKunHttpSseAdapterInput = {
  executable?: string
  emit?: (chunk: Record<string, unknown>) => void
  registerPendingApproval?: (
    toolUseId: string,
    pending: KunHttpSseApprovalPending,
  ) => void
  unregisterPendingApproval?: (toolUseId: string) => void
  createTransport?: (input: {
    request: DesktopRunRequest
    signal: AbortSignal
  }) => Promise<{
    transport: KunHttpSseTransportLike
    close?: () => Promise<void>
    secretHints?: readonly string[]
  }>
  launchServe?: (input: KunServeLaunchInput) => Promise<KunServeHandle>
  approvalTimeoutMs?: number
}

type KunToolCallRecord = {
  callId: string
  toolName: string
  toolKind: "tool_call" | "command_execution" | "file_change"
  summary?: string
}

type KunRunTerminal = {
  status: DesktopRunResult["status"]
  message?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function emitQuestion(input: {
  emitChunk: (chunk: Record<string, unknown>) => void
  toolUseId: string
  toolLabel: string
  summary?: string
}): void {
  input.emitChunk({
    type: "ask-user-question",
    toolUseId: input.toolUseId,
    questions: [
      {
        header: "Kun",
        id: "approval",
        question:
          input.summary ||
          `Kun requests approval to run ${input.toolLabel}.`,
        options: [
          {
            label: "Approve",
            description: "Allow this Kun action.",
          },
          {
            label: "Deny",
            description: "Deny this Kun action.",
          },
        ],
      },
    ],
  })
}

async function waitForKunApproval(input: {
  subChatId: string
  toolUseId: string
  toolLabel: string
  summary?: string
  signal: AbortSignal
  timeoutMs: number
  emitChunk: (chunk: Record<string, unknown>) => void
  registerPendingApproval?: (
    toolUseId: string,
    pending: KunHttpSseApprovalPending,
  ) => void
  unregisterPendingApproval?: (toolUseId: string) => void
}): Promise<KunHttpSseApproval> {
  if (input.signal.aborted) {
    return { approved: false, message: "Kun run was canceled." }
  }

  emitQuestion(input)

  let settled = false
  return await new Promise<KunHttpSseApproval>((resolve) => {
    const finish = (approval: KunHttpSseApproval) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      input.signal.removeEventListener("abort", onAbort)
      input.unregisterPendingApproval?.(input.toolUseId)
      resolve(approval)
    }
    const timeout = setTimeout(() => {
      input.emitChunk({
        type: "ask-user-question-timeout",
        toolUseId: input.toolUseId,
      })
      finish({
        approved: false,
        message: "Kun approval request timed out.",
      })
    }, input.timeoutMs)
    const onAbort = () => {
      finish({ approved: false, message: "Kun run was canceled." })
    }
    input.signal.addEventListener("abort", onAbort, { once: true })
    input.registerPendingApproval?.(input.toolUseId, {
      subChatId: input.subChatId,
      resolve: finish,
    })
  })
}

function deriveCallIdFromApprovalId(approvalId: string): string | null {
  return approvalId.startsWith("appr_") ? approvalId.slice("appr_".length) : null
}

function kunTerminalFromEvent(event: KunRuntimeEvent): KunRunTerminal | null {
  switch (event.kind) {
    case "turn_completed":
      return { status: "succeeded" }
    case "turn_aborted":
      return { status: "canceled", message: stringValue(event.message) ?? undefined }
    case "turn_failed":
      return {
        status: "failed",
        message:
          stringValue(event.message) ||
          stringValue(event.text) ||
          "Kun turn failed.",
      }
    default:
      return null
  }
}

function toolCallRecordFromEvent(
  event: KunRuntimeEvent,
): KunToolCallRecord | null {
  if (
    event.kind !== "item_created" &&
    event.kind !== "item_updated" &&
    event.kind !== "tool_call_started" &&
    event.kind !== "tool_call_finished"
  ) {
    return null
  }
  const item = isRecord(event.item) ? event.item : null
  if (!item || item.kind !== "tool_call") return null
  const callId = stringValue(item.callId)
  const toolName = stringValue(item.toolName)
  const toolKind = stringValue(item.toolKind)
  if (
    !callId ||
    !toolName ||
    (toolKind !== "tool_call" &&
      toolKind !== "command_execution" &&
      toolKind !== "file_change")
  ) {
    return null
  }
  return {
    callId,
    toolName,
    toolKind,
    summary: stringValue(item.summary) ?? undefined,
  }
}

function textDeltaFromEvent(event: KunRuntimeEvent): Record<string, unknown> | null {
  if (event.kind !== "assistant_text_delta") return null
  const item = isRecord(event.item) ? event.item : null
  const delta = item ? stringValue(item.text) : stringValue(event.text)
  if (!delta) return null
  return {
    type: "text-delta",
    id: stringValue(event.itemId) ?? "kun-text",
    delta,
  }
}

function reasoningDeltaFromEvent(
  event: KunRuntimeEvent,
): Record<string, unknown> | null {
  if (event.kind !== "assistant_reasoning_delta") return null
  const item = isRecord(event.item) ? event.item : null
  const delta = item ? stringValue(item.text) : stringValue(event.text)
  if (!delta) return null
  return {
    type: "reasoning-delta",
    id: stringValue(event.itemId) ?? "kun-reasoning",
    delta,
  }
}

export function createKunHttpSseAdapter({
  executable,
  emit,
  registerPendingApproval,
  unregisterPendingApproval,
  createTransport,
  launchServe: launchServeOverride = launchKunServe,
  approvalTimeoutMs = DEFAULT_KUN_APPROVAL_TIMEOUT_MS,
}: CreateKunHttpSseAdapterInput = {}): DesktopRuntimeAdapter {
  return {
    metadata: KUN_HTTP_SSE_DESKTOP_ADAPTER_METADATA,

    async run(request: DesktopRunRequest): Promise<DesktopRunResult> {
      emitDesktopRuntimeAdapterStarted(
        request,
        KUN_HTTP_SSE_DESKTOP_ADAPTER_METADATA,
      )
      if (request.context.runtimeId !== "kun") {
        throw new Error(
          `Kun HTTP/SSE adapter cannot run ${request.context.runtimeId} requests.`,
        )
      }
      const permissionMapping = getKunHttpSsePermissionMapping(
        request.permissionPolicy,
      )
      if (request.context.mode === "plan") {
        const message =
          "Kun plan mode is degraded in v1 and is blocked before starting a turn."
        emit?.({ type: "capability-error", errorText: message })
        return { status: "failed", error: { message } }
      }

      const streamAbort = new AbortController()
      const abortStream = () => {
        if (!streamAbort.signal.aborted) streamAbort.abort()
      }
      request.signal.addEventListener("abort", abortStream, { once: true })

      let sequence = 0
      let terminal: KunRunTerminal | null = null
      let unsupportedEventReported = false
      let serveHandle: KunServeHandle | null = null
      let closeTransport: (() => Promise<void>) | undefined
      const toolCallsByCallId = new Map<string, KunToolCallRecord>()
      let threadId: string | null = null
      let turnId: string | null = null

      const emitChunk = (chunk: Record<string, unknown>) => {
        emit?.(chunk)
        const events = mapDesktopStreamChunkToRunEvents({
          runtimeId: "kun",
          runId: request.identity.runId,
          jobId: request.identity.jobId,
          sequence: ++sequence,
          chunk,
          secretHints: serveHandle ? [serveHandle.runtimeToken] : [],
        })
        for (const event of events) {
          request.trace.emit(event)
        }
      }

      const setTerminal = (next: KunRunTerminal) => {
        if (terminal) return
        terminal = next
        abortStream()
      }

      const denyApproval = async (
        transport: KunHttpSseTransportLike,
        approvalId: string,
        reason: string,
      ) => {
        await transport.decideApproval({
          approvalId,
          decision: "deny",
          reason,
          signal: request.signal,
        })
        emitChunk({
          type: "observed-tool-decision",
          controlLevel: permissionMapping.controlLevel,
          decision: "deny",
          message: reason,
          risk: {
            runtime: "kun",
            adapterSource: permissionMapping.adapterSource,
            approvalId,
          },
        })
      }

      const handleApproval = async (
        transport: KunHttpSseTransportLike,
        event: KunRuntimeEvent,
      ) => {
        const approvalId = stringValue(event.approvalId)
        const toolName = stringValue(event.toolName)
        if (!approvalId || !toolName) return
        const callId = deriveCallIdFromApprovalId(approvalId)
        const toolCall = callId ? toolCallsByCallId.get(callId) : null
        if (!callId || !toolCall || toolCall.toolName !== toolName) {
          await denyApproval(
            transport,
            approvalId,
            "Kun approval could not be correlated to a verified tool_call item.",
          )
          return
        }
        if (toolCall.toolKind === "command_execution") {
          await denyApproval(
            transport,
            approvalId,
            "Kun command_execution approvals are not supported in v1; shell must be sandbox-blocked before approval.",
          )
          return
        }

        const toolUseId = `kun-approval-${request.identity.runId}-${approvalId}`
        const approval = await waitForKunApproval({
          subChatId: request.context.subChatId,
          toolUseId,
          toolLabel: toolName,
          summary: stringValue(event.summary) ?? toolCall.summary,
          signal: request.signal,
          timeoutMs: approvalTimeoutMs,
          emitChunk,
          registerPendingApproval,
          unregisterPendingApproval,
        })
        const decision = approval.approved ? "allow" : "deny"
        await transport.decideApproval({
          approvalId,
          decision,
          reason: approval.message,
          signal: request.signal,
        })
        emitChunk({
          type: "ask-user-question-result",
          toolUseId,
          result: approval.approved ? "approved" : (approval.message ?? "denied"),
        })
        emitChunk({
          type: "observed-tool-decision",
          controlLevel: permissionMapping.controlLevel,
          decision,
          message: approval.message ?? decision,
          risk: {
            runtime: "kun",
            adapterSource: permissionMapping.adapterSource,
            tool: toolName,
            toolKind: toolCall.toolKind,
            approvalId,
            callId,
          },
        })
      }

      const handleEvent = async (
        transport: KunHttpSseTransportLike,
        event: KunRuntimeEvent,
      ): Promise<void> => {
        const toolCall = toolCallRecordFromEvent(event)
        if (toolCall) {
          toolCallsByCallId.set(toolCall.callId, toolCall)
        }
        const textDelta = textDeltaFromEvent(event)
        if (textDelta) emitChunk(textDelta)
        const reasoningDelta = reasoningDeltaFromEvent(event)
        if (reasoningDelta) emitChunk(reasoningDelta)

        if (event.kind === "approval_requested") {
          await handleApproval(transport, event)
          return
        }
        if (event.kind === "approval_resolved") {
          emitChunk({
            type: "ask-user-question-result",
            toolUseId: `kun-approval-${request.identity.runId}-${String(event.approvalId)}`,
            result: stringValue(event.status) ?? "resolved",
          })
          return
        }
        const nextTerminal = kunTerminalFromEvent(event)
        if (nextTerminal) {
          setTerminal(nextTerminal)
          return
        }

        const knownNoopEvents = new Set([
          "thread_created",
          "thread_updated",
          "turn_started",
          "item_created",
          "item_updated",
          "item_completed",
          "tool_call_ready",
          "tool_result_upload_wait",
          "tool_storm_suppressed",
          "tool_catalog_changed",
          "tool_call_started",
          "tool_call_finished",
          "usage",
          "heartbeat",
        ])
        if (
          typeof event.kind === "string" &&
          !knownNoopEvents.has(event.kind) &&
          !unsupportedEventReported
        ) {
          unsupportedEventReported = true
          emitChunk({
            type: "runtime-status",
            ok: false,
            blocker: {
              component: "kun",
              code: "kun-unsupported-event",
              message: `Kun emitted unsupported event kind: ${event.kind}`,
            },
          })
        }
      }

      try {
        emitChunk({
          type: "runtime-status",
          ok: true,
          blocker: null,
          kun: { status: "starting" },
        })
        let transport: KunHttpSseTransportLike
        const created = createTransport
          ? await createTransport({ request, signal: streamAbort.signal })
          : null
        if (created) {
          transport = created.transport
          closeTransport = created.close
        } else {
          if (!executable) {
            throw new Error("Kun executable path is required.")
          }
          serveHandle = await launchServeOverride({
            executable,
            runId: request.identity.runId,
            cwd: request.context.cwd,
          })
          transport = new KunHttpSseTransport({
            baseUrl: serveHandle.baseUrl,
            runtimeToken: serveHandle.runtimeToken,
          })
          closeTransport = serveHandle.close
        }

        const thread = await transport.createThread({
          workspace: request.context.cwd,
          model: request.providerBinding.model || "kun",
          mode: "agent",
          signal: request.signal,
        })
        threadId = thread.id
        const streamPromise = transport
          .streamEvents({
            threadId,
            sinceSeq: 0,
            signal: streamAbort.signal,
            onEvent: (event) => {
              void handleEvent(transport, event).catch((error) => {
                setTerminal({
                  status: "failed",
                  message:
                    error instanceof Error ? error.message : String(error),
                })
              })
            },
          })
          .catch((error) => {
            if (!terminal && !streamAbort.signal.aborted) {
              setTerminal({
                status: "failed",
                message: error instanceof Error ? error.message : String(error),
              })
            }
          })

        const started = await transport.startTurn({
          threadId,
          prompt: request.prompt,
          mode: "agent",
          model: request.providerBinding.model,
          signal: request.signal,
        })
        turnId = started.turnId
        emitChunk({
          type: "runtime-status",
          ok: true,
          blocker: null,
          kun: { status: "running", threadId, turnId },
        })

        while (!terminal && !request.signal.aborted) {
          await sleep(50, undefined, { signal: streamAbort.signal }).catch(
            () => undefined,
          )
        }
        if (request.signal.aborted) {
          if (threadId && turnId) {
            await transport
              .interruptTurn({ threadId, turnId, signal: streamAbort.signal })
              .catch(() => undefined)
          }
          setTerminal({ status: "canceled", message: "Kun run was canceled." })
        }
        abortStream()
        await streamPromise
      } catch (error) {
        setTerminal({
          status: request.signal.aborted ? "canceled" : "failed",
          message: error instanceof Error ? error.message : String(error),
        })
      } finally {
        request.signal.removeEventListener("abort", abortStream)
        if (threadId && turnId && request.signal.aborted && closeTransport) {
          await closeTransport().catch(() => undefined)
        } else {
          await closeTransport?.().catch(() => undefined)
        }
      }

      const finalTerminal = terminal ?? {
        status: "failed" as const,
        message: "Kun run ended without a terminal event.",
      }
      emitChunk({
        type: finalTerminal.status === "failed" ? "error" : "finish",
        status: finalTerminal.status,
        message: finalTerminal.message,
        errorText:
          finalTerminal.status === "failed" ? finalTerminal.message : undefined,
      })
      return {
        status: finalTerminal.status,
        sessionId: threadId,
        ...(finalTerminal.status === "failed"
          ? {
              error: {
                message: finalTerminal.message ?? "Kun run failed.",
              },
            }
          : {}),
      }
    },
  }
}

export const KUN_HTTP_SSE_ADAPTER_TEST_ONLY = {
  deriveCallIdFromApprovalId,
  toolCallRecordFromEvent,
}
