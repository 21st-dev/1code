import type {
  AgentEngineId,
  AgentRuntimeRunReceipt,
  AgentRuntimeRunStatus,
} from "./types"

export type AgentRuntimeReceiptSource =
  | "agent-runtime"
  | "mobile-gateway"
  | "codex-app-server"
  | string

interface AgentRuntimeReceiptBase {
  sequence: number
  createdAt: string
  runId: string
  engineId: AgentEngineId
  chatId: string
  subChatId: string
  source?: AgentRuntimeReceiptSource
  metadata?: Record<string, unknown>
}

export interface AgentRuntimeRunStartedReceipt
  extends AgentRuntimeReceiptBase {
  type: "runtime.run.started"
}

export interface AgentRuntimeTurnProcessingQuiescedReceipt
  extends AgentRuntimeReceiptBase {
  type: "turn.processing.quiesced"
  status: Exclude<AgentRuntimeRunStatus, "running">
  resultSubtype: AgentRuntimeRunReceipt["resultSubtype"]
  latestSequence?: number | null
  eventCount: number
  error?: string | null
}

export type AgentRuntimeReceipt =
  | AgentRuntimeRunStartedReceipt
  | AgentRuntimeTurnProcessingQuiescedReceipt

export type AgentRuntimeReceiptInput =
  | Omit<AgentRuntimeRunStartedReceipt, "sequence">
  | Omit<AgentRuntimeTurnProcessingQuiescedReceipt, "sequence">

export interface AgentRuntimeReceiptBus {
  publish(receipt: AgentRuntimeReceiptInput): AgentRuntimeReceipt
}

export interface AgentRuntimeReceiptWaitOptions {
  timeoutMs?: number
}

export interface AgentRuntimeReceiptBusForTests
  extends AgentRuntimeReceiptBus {
  listReceipts(): AgentRuntimeReceipt[]
  waitForReceipt(
    predicate: (receipt: AgentRuntimeReceipt) => boolean,
    options?: AgentRuntimeReceiptWaitOptions,
  ): Promise<AgentRuntimeReceipt | null>
}

export function createNoopAgentRuntimeReceiptBus(): AgentRuntimeReceiptBus {
  return {
    publish(receipt) {
      return { ...receipt, sequence: 0 } as AgentRuntimeReceipt
    },
  }
}

export function createInMemoryAgentRuntimeReceiptBus(): AgentRuntimeReceiptBusForTests {
  const receipts: AgentRuntimeReceipt[] = []
  const subscribers = new Set<(receipt: AgentRuntimeReceipt) => void>()
  let nextSequence = 1

  return {
    publish(receipt) {
      const stored = {
        ...receipt,
        sequence: nextSequence++,
      } as AgentRuntimeReceipt
      receipts.push(stored)
      for (const subscriber of subscribers) subscriber(stored)
      return stored
    },
    listReceipts() {
      return [...receipts]
    },
    waitForReceipt(predicate, options = {}) {
      const existing = receipts.find(predicate)
      if (existing) return Promise.resolve(existing)

      const timeoutMs = options.timeoutMs ?? 1000
      return new Promise((resolve) => {
        let timeout: ReturnType<typeof setTimeout> | null = null
        const complete = (receipt: AgentRuntimeReceipt | null) => {
          if (timeout) clearTimeout(timeout)
          subscribers.delete(onReceipt)
          resolve(receipt)
        }
        const onReceipt = (receipt: AgentRuntimeReceipt) => {
          if (predicate(receipt)) complete(receipt)
        }
        subscribers.add(onReceipt)
        timeout = setTimeout(() => complete(null), timeoutMs)
      })
    },
  }
}
