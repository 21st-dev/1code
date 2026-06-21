import type { McpRegistryVerificationKeyInput } from "../mcp-registry/verification-state"
import { upsertMcpRegistryVerificationRecord } from "../mcp-registry/verification-state"
import type { UIMessageChunk } from "./types"

export type ClaudeMcpRegistryVerificationTargets = Record<
  string,
  McpRegistryVerificationKeyInput
>

type ClaudeMcpRegistryToolCall = {
  toolName: string
  target: McpRegistryVerificationKeyInput
}

type UpsertMcpRegistryVerificationRecord =
  typeof upsertMcpRegistryVerificationRecord

const ERROR_STATUS_VALUES = new Set(["error", "errored", "failed", "failure"])

export type ClaudeMcpRegistryVerificationObserver = {
  observeChunk: (chunk: UIMessageChunk) => void
  flush: () => Promise<void>
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(record, key)
}

function isMeaningfulErrorValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function isErrorStatus(value: unknown): boolean {
  return (
    typeof value === "string" &&
    ERROR_STATUS_VALUES.has(value.trim().toLowerCase())
  )
}

function isTextualErrorOutput(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\s*(error|failed|failure)\s*:/i.test(value)
  )
}

function hasToolOutputErrorMarker(
  output: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): boolean {
  if (isTextualErrorOutput(output)) return true
  if (output === null || typeof output !== "object") return false
  if (seen.has(output)) return false
  seen.add(output)

  const record = output as Record<string, unknown>
  if (record.isError === true) return true
  if (hasOwn(record, "error") && isMeaningfulErrorValue(record.error)) {
    return true
  }
  if (record.ok === false || record.success === false) return true
  if (isErrorStatus(record.status) || isErrorStatus(record.state)) return true
  if (depth >= 4) return false

  return Object.values(record).some((value) =>
    hasToolOutputErrorMarker(value, seen, depth + 1),
  )
}

function verificationTargetId(target: McpRegistryVerificationKeyInput): string {
  return [
    target.runtime,
    target.serverName,
    target.entryFingerprint,
    target.configFingerprint,
  ].join("\n")
}

function resolveClaudeMcpRegistryToolCall(input: {
  toolName: string
  targets: ClaudeMcpRegistryVerificationTargets
}): ClaudeMcpRegistryToolCall | null {
  if (!input.toolName.startsWith("mcp__")) return null

  const serverNames = Object.keys(input.targets).sort(
    (a, b) => b.length - a.length,
  )
  for (const serverName of serverNames) {
    const prefix = `mcp__${serverName}__`
    if (!input.toolName.startsWith(prefix)) continue
    const runtimeToolName = input.toolName.slice(prefix.length)
    if (!runtimeToolName) continue
    const target = input.targets[serverName]
    if (target?.runtime !== "claude-code") continue
    return { toolName: runtimeToolName, target }
  }

  return null
}

export function createClaudeMcpRegistryVerificationObserver(input: {
  targets?: ClaudeMcpRegistryVerificationTargets | null
  upsert?: UpsertMcpRegistryVerificationRecord
  warn?: (...args: unknown[]) => void
}): ClaudeMcpRegistryVerificationObserver {
  const targets = input.targets ?? {}
  const upsert = input.upsert ?? upsertMcpRegistryVerificationRecord
  const warn = input.warn ?? console.warn
  const pendingToolCalls = new Map<string, ClaudeMcpRegistryToolCall>()
  const verifiedTargets = new Set<string>()
  const pendingWrites: Array<Promise<void>> = []

  function scheduleVerifiedLocalWrite(call: ClaudeMcpRegistryToolCall): void {
    const targetId = verificationTargetId(call.target)
    if (verifiedTargets.has(targetId)) return
    verifiedTargets.add(targetId)

    pendingWrites.push(
      upsert({
        ...call.target,
        status: "verified-local",
        reason: `claude-tool-call-success:${call.toolName}`,
      })
        .then(() => undefined)
        .catch((error) => {
          warn("[claude] Failed to persist MCP registry verification:", error)
        }),
    )
  }

  return {
    observeChunk(chunk) {
      if (chunk.type === "tool-input-available") {
        const call = resolveClaudeMcpRegistryToolCall({
          toolName: chunk.toolName,
          targets,
        })
        if (call) pendingToolCalls.set(chunk.toolCallId, call)
        return
      }

      if (chunk.type === "tool-output-available") {
        const call = pendingToolCalls.get(chunk.toolCallId)
        pendingToolCalls.delete(chunk.toolCallId)
        if (call && !hasToolOutputErrorMarker(chunk.output)) {
          scheduleVerifiedLocalWrite(call)
        }
        return
      }

      if (chunk.type === "tool-output-error") {
        pendingToolCalls.delete(chunk.toolCallId)
      }
    },
    async flush() {
      await Promise.all(pendingWrites)
    },
  }
}
