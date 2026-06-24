import { setTimeout as sleep } from "node:timers/promises"
import {
  decideClaudeToolUse,
  resolveGuardedScopedShellWriteApproval,
  type ValidatedAgentScopeContract,
} from "../agent-guard"
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
import { createRunEvent, type JsonValue } from "../agent-runtime/runtime-events"
import {
  mapDesktopStreamChunkToRunEvents,
  redactRendererRuntimeChunk,
} from "../agent-runtime/stream-event-mapper"
import {
  KunHttpSseTransport,
  type KunRuntimeEvent,
} from "./kun-http-sse-transport"
import {
  KUN_FILE_ONLY_SANDBOX_MODE,
  type KunServeHandle,
  type KunServeLaunchInput,
  type KunServeSandboxMode,
  launchKunServe,
} from "./kun-serve-launcher"

const DEFAULT_KUN_APPROVAL_TIMEOUT_MS = 120_000
const KNOWN_KUN_NOOP_EVENTS = new Set([
  "thread_created",
  "thread_updated",
  "turn_started",
  "item_created",
  "item_updated",
  "item_completed",
  "tool_call_ready",
  "tool_result_upload_wait",
  "tool_result",
  "tool_storm_suppressed",
  "tool_catalog_changed",
  "tool_call_started",
  "tool_call_finished",
  "pipeline_stage",
  "error",
  "assistant_text_delta",
  "assistant_reasoning_delta",
  "usage",
  "heartbeat",
])

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
  configPath?: string | null
  configSecretHints?: readonly string[]
  sandboxMode?: KunServeSandboxMode
  shellEnabled?: boolean
  guardedContract?: ValidatedAgentScopeContract | null
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
  toolInput: Record<string, unknown>
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

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function kunToolInputFromItem(
  item: Record<string, unknown>,
): Record<string, unknown> {
  return (
    recordValue(item.input) ??
    recordValue(item.args) ??
    parseJsonRecord(item.arguments) ??
    {}
  )
}

function normalizeKunToolForGuard(
  toolCall: KunToolCallRecord,
): { toolName: string; toolInput: Record<string, unknown> } | null {
  if (toolCall.toolKind === "command_execution") {
    const command =
      stringValue(toolCall.toolInput.command) ??
      stringValue(toolCall.toolInput.cmd) ??
      stringValue(toolCall.toolInput.input) ??
      stringValue(toolCall.toolInput.script)
    return {
      toolName: "Bash",
      toolInput: { ...toolCall.toolInput, command: command ?? "" },
    }
  }

  if (toolCall.toolKind === "file_change") {
    const filePath =
      stringValue(toolCall.toolInput.file_path) ??
      stringValue(toolCall.toolInput.path) ??
      stringValue(toolCall.toolInput.targetPath) ??
      stringValue(toolCall.toolInput.target_path)
    if (!filePath) return null
    const toolName = toolCall.toolName.toLowerCase().includes("write")
      ? "Write"
      : "Edit"
    return {
      toolName,
      toolInput: { ...toolCall.toolInput, file_path: filePath },
    }
  }

  return null
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
          input.summary || `Kun requests approval to run ${input.toolLabel}.`,
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
  return approvalId.startsWith("appr_")
    ? approvalId.slice("appr_".length)
    : null
}

function kunTerminalFromEvent(event: KunRuntimeEvent): KunRunTerminal | null {
  switch (event.kind) {
    case "turn_completed":
      return { status: "succeeded" }
    case "turn_aborted":
      return {
        status: "canceled",
        message: stringValue(event.message) ?? undefined,
      }
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
  if (item?.kind !== "tool_call") return null
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
    toolInput: kunToolInputFromItem(item),
    summary: stringValue(item.summary) ?? undefined,
  }
}

function textDeltaFromEvent(
  event: KunRuntimeEvent,
): Record<string, unknown> | null {
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
  configPath,
  configSecretHints = [],
  sandboxMode = KUN_FILE_ONLY_SANDBOX_MODE,
  shellEnabled = false,
  guardedContract = null,
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
      let secretHints: readonly string[] = []
      const toolCallsByCallId = new Map<string, KunToolCallRecord>()
      let threadId: string | null = null
      let turnId: string | null = null
      const decidedSideEffectCallIds = new Set<string>()
      const approvedSideEffectCallIds = new Set<string>()

      const emitChunk = (chunk: Record<string, unknown>) => {
        emit?.(
          redactRendererRuntimeChunk({
            runtimeId: "kun",
            runId: request.identity.runId,
            jobId: request.identity.jobId,
            source: "runtime-diagnostic",
            chunk,
            secretHints,
          }) as Record<string, unknown>,
        )
        const events = mapDesktopStreamChunkToRunEvents({
          runtimeId: "kun",
          runId: request.identity.runId,
          jobId: request.identity.jobId,
          sequence: ++sequence,
          chunk,
          secretHints,
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

      const isSideEffectToolCall = (toolCall: KunToolCallRecord): boolean =>
        toolCall.toolKind === "command_execution" ||
        toolCall.toolKind === "file_change"

      const emitToolDecision = (input: {
        decision: "allow" | "deny"
        message: string
        toolCall: KunToolCallRecord
        approvalId: string
        guardOwner?: boolean
      }) => {
        emitChunk({
          type: "observed-tool-decision",
          controlLevel: permissionMapping.controlLevel,
          decision: input.decision,
          message: input.message,
          risk: {
            runtime: "kun",
            adapterSource: permissionMapping.adapterSource,
            guardOwner: input.guardOwner ?? false,
            tool: input.toolCall.toolName,
            toolKind: input.toolCall.toolKind,
            approvalId: input.approvalId,
            callId: input.toolCall.callId,
          },
        })
      }

      const emitGuardDecisionEvent = (event: unknown) => {
        emitChunk({
          type: "guard-event",
          event,
        })
        request.trace.emit(
          createRunEvent({
            type: "guard_decision",
            runtimeId: "kun",
            runId: request.identity.runId,
            jobId: request.identity.jobId,
            sequence: ++sequence,
            payload: event as JsonValue,
          }),
        )
      }

      const sideEffectCallIdFromExecutionEvent = (
        event: KunRuntimeEvent,
      ): string | null => {
        if (
          event.kind !== "tool_call_started" &&
          event.kind !== "tool_call_finished" &&
          event.kind !== "tool_result"
        ) {
          return null
        }
        const item = isRecord(event.item) ? event.item : null
        return (
          stringValue(event.callId) ??
          stringValue(event.toolCallId) ??
          (item ? stringValue(item.callId) : null)
        )
      }

      const failClosedForUnguardedSideEffect = (
        callId: string,
        trigger: string,
      ) => {
        const toolCall = toolCallsByCallId.get(callId)
        if (!toolCall || !isSideEffectToolCall(toolCall)) return
        if (approvedSideEffectCallIds.has(callId)) return
        const message = `Kun observed ${trigger} for ${toolCall.toolKind} without a prior approved guard decision.`
        emitChunk({
          type: "runtime-status",
          ok: false,
          blocker: {
            component: "kun",
            code: "kun-unguarded-side-effect",
            message,
          },
        })
        setTerminal({ status: "failed", message })
      }

      const decideWithGuardOwner = async (
        transport: KunHttpSseTransportLike,
        approvalId: string,
        toolCall: KunToolCallRecord,
      ): Promise<boolean> => {
        if (!guardedContract) {
          const reason =
            "Kun guarded shell requires an approved guarded scope contract."
          decidedSideEffectCallIds.add(toolCall.callId)
          await denyApproval(transport, approvalId, reason)
          return false
        }
        const normalized = normalizeKunToolForGuard(toolCall)
        if (!normalized) {
          const reason =
            "Kun side-effect approval could not be normalized for the guard owner."
          decidedSideEffectCallIds.add(toolCall.callId)
          await denyApproval(transport, approvalId, reason)
          return false
        }
        const scopedShellApproval = resolveGuardedScopedShellWriteApproval({
          contract: guardedContract,
          toolName: normalized.toolName,
          toolInput: normalized.toolInput,
          toolUseId: toolCall.callId,
        })
        if (
          scopedShellApproval?.decision === "allow" &&
          scopedShellApproval.requiresUserApproval
        ) {
          emitGuardDecisionEvent(scopedShellApproval.event)
          const toolUseId = `kun-approval-${request.identity.runId}-${approvalId}`
          const approval = await waitForKunApproval({
            subChatId: request.context.subChatId,
            toolUseId,
            toolLabel: toolCall.toolName,
            summary: scopedShellApproval.reason,
            signal: request.signal,
            timeoutMs: approvalTimeoutMs,
            emitChunk,
            registerPendingApproval,
            unregisterPendingApproval,
          })
          const decision = approval.approved ? "allow" : "deny"
          const message = approval.message ?? scopedShellApproval.reason
          decidedSideEffectCallIds.add(toolCall.callId)
          if (decision === "allow") {
            approvedSideEffectCallIds.add(toolCall.callId)
          }
          await transport.decideApproval({
            approvalId,
            decision,
            reason: message,
            signal: request.signal,
          })
          emitChunk({
            type: "ask-user-question-result",
            toolUseId,
            result: decision === "allow" ? "approved" : message,
          })
          emitToolDecision({
            decision,
            message,
            toolCall,
            approvalId,
            guardOwner: true,
          })
          return decision === "allow"
        }
        const guardDecision = decideClaudeToolUse({
          contract: guardedContract,
          toolName: normalized.toolName,
          toolInput: normalized.toolInput,
          toolUseId: toolCall.callId,
        })
        const decision = guardDecision.decision === "allow" ? "allow" : "deny"
        decidedSideEffectCallIds.add(toolCall.callId)
        if (decision === "allow") {
          approvedSideEffectCallIds.add(toolCall.callId)
        }
        await transport.decideApproval({
          approvalId,
          decision,
          reason: guardDecision.reason,
          signal: request.signal,
        })
        emitToolDecision({
          decision,
          message: guardDecision.reason,
          toolCall,
          approvalId,
          guardOwner: true,
        })
        if (guardDecision.event) {
          emitGuardDecisionEvent(guardDecision.event)
        }
        return decision === "allow"
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
        if (shellEnabled && isSideEffectToolCall(toolCall)) {
          await decideWithGuardOwner(transport, approvalId, toolCall)
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
        if (isSideEffectToolCall(toolCall)) {
          decidedSideEffectCallIds.add(toolCall.callId)
          if (decision === "allow")
            approvedSideEffectCallIds.add(toolCall.callId)
        }
        await transport.decideApproval({
          approvalId,
          decision,
          reason: approval.message,
          signal: request.signal,
        })
        emitChunk({
          type: "ask-user-question-result",
          toolUseId,
          result: approval.approved
            ? "approved"
            : (approval.message ?? "denied"),
        })
        emitToolDecision({
          decision,
          message: approval.message ?? decision,
          toolCall,
          approvalId,
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
        if (shellEnabled) {
          const executionCallId = sideEffectCallIdFromExecutionEvent(event)
          if (executionCallId) {
            failClosedForUnguardedSideEffect(
              executionCallId,
              event.kind ?? "execution",
            )
          }
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
          if (shellEnabled && nextTerminal.status === "succeeded") {
            for (const toolCall of toolCallsByCallId.values()) {
              if (
                isSideEffectToolCall(toolCall) &&
                !decidedSideEffectCallIds.has(toolCall.callId)
              ) {
                failClosedForUnguardedSideEffect(
                  toolCall.callId,
                  "turn completion",
                )
              }
            }
          }
          setTerminal(nextTerminal)
          return
        }

        if (
          typeof event.kind === "string" &&
          !KNOWN_KUN_NOOP_EVENTS.has(event.kind) &&
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
          secretHints = created.secretHints ?? []
        } else {
          if (!executable) {
            throw new Error("Kun executable path is required.")
          }
          serveHandle = await launchServeOverride({
            executable,
            configPath,
            secretHints: configSecretHints,
            sandboxMode,
            runId: request.identity.runId,
            cwd: request.context.cwd,
          })
          serveHandle.child.once("exit", (code, signal) => {
            if (terminal || request.signal.aborted) return
            setTerminal({
              status: "failed",
              message: `Kun serve exited unexpectedly: code=${code ?? "null"} signal=${signal ?? "null"}.`,
            })
          })
          transport = new KunHttpSseTransport({
            baseUrl: serveHandle.baseUrl,
            runtimeToken: serveHandle.runtimeToken,
            sandboxMode,
          })
          closeTransport = serveHandle.close
          secretHints = [serveHandle.runtimeToken, ...configSecretHints]
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
