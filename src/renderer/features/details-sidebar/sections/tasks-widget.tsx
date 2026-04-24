"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import { atom, useAtomValue } from "jotai"
import { atomFamily } from "jotai/utils"
import { Activity, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getPerChatMessageKey,
  messageAtomFamily,
  messageIdsPerChatAtom,
  type Message,
} from "@/features/agents/stores/message-store"
import { useStreamingStatusStore } from "@/features/agents/stores/streaming-status-store"

interface TasksWidgetProps {
  subChatId: string | null
}

interface RunningTask {
  toolCallId: string
  toolName: string
  summary: string
  startedAt: number
  parentId: string | null
  children: RunningTask[]
}

// Tools that are tracked elsewhere (Todo widget / plan approvals) or are not real work.
const EXCLUDED_TOOL_NAMES = new Set([
  "TodoWrite",
  "TaskCreate",
  "TaskUpdate",
  "TaskList",
  "TaskGet",
  "TaskOutput",
  "ExitPlanMode",
  "Thinking",
])

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return ""
  const rec = input as Record<string, unknown>
  const preferredKeys = [
    "command",
    "file_path",
    "path",
    "pattern",
    "description",
    "url",
    "query",
    "prompt",
    "subagent_type",
  ]
  for (const key of preferredKeys) {
    const v = rec[key]
    if (typeof v === "string" && v.length > 0) return v
  }
  for (const key in rec) {
    const v = rec[key]
    if (typeof v === "string" && v.length > 0) return v
  }
  return ""
}

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  return `${min}m ${rem.toString().padStart(2, "0")}s`
}

// Derived atom: the last assistant Message for a given subChatId.
// Scans from the end of messageIdsPerChatAtom; returns null if none found.
const lastAssistantMessageForSubChatAtomFamily = atomFamily((subChatId: string) =>
  atom<Message | null>((get) => {
    const ids = get(messageIdsPerChatAtom(subChatId))
    for (let i = ids.length - 1; i >= 0; i--) {
      const id = ids[i]
      if (!id) continue
      const msg = get(messageAtomFamily(getPerChatMessageKey(subChatId, id)))
      if (msg && msg.role === "assistant") return msg
    }
    return null
  }),
)

export const TasksWidget = memo(function TasksWidget({
  subChatId,
}: TasksWidgetProps) {
  const key = subChatId || "default"

  const isStreaming = useStreamingStatusStore((s) => s.isStreaming(key))

  const lastAssistantAtom = useMemo(
    () => lastAssistantMessageForSubChatAtomFamily(key),
    [key],
  )
  const lastAssistant = useAtomValue(lastAssistantAtom)

  const startedAtRef = useRef<Map<string, number>>(new Map())

  const tasks = useMemo<RunningTask[]>(() => {
    if (!isStreaming || !lastAssistant) return []

    const parts = lastAssistant.parts || []
    const byId = new Map<string, RunningTask>()

    for (const part of parts) {
      if (!part?.type || typeof part.type !== "string") continue
      if (!part.type.startsWith("tool-")) continue
      if (!part.toolCallId) continue

      const st = part.state
      const isRunning =
        st !== "output-available" &&
        st !== "output-error" &&
        st !== "result" &&
        st !== "input-error"
      if (!isRunning) continue

      const toolName = part.type.slice(5)
      if (EXCLUDED_TOOL_NAMES.has(toolName)) continue

      const colonIdx = part.toolCallId.indexOf(":")
      const parentId =
        colonIdx > -1 ? part.toolCallId.slice(0, colonIdx) : null

      // AI SDK exposes transform-provided startedAt on `callProviderMetadata`;
      // fall back to `providerMetadata` and then to first-sighting time.
      const metaStart =
        (part.callProviderMetadata?.custom?.startedAt as number | undefined) ??
        (part.providerMetadata?.custom?.startedAt as number | undefined) ??
        (part.startedAt as number | undefined)
      let startedAt =
        typeof metaStart === "number"
          ? metaStart
          : startedAtRef.current.get(part.toolCallId)
      if (typeof startedAt !== "number") {
        startedAt = Date.now()
      }
      startedAtRef.current.set(part.toolCallId, startedAt)

      byId.set(part.toolCallId, {
        toolCallId: part.toolCallId,
        toolName,
        summary: summarizeInput(part.input).slice(0, 80),
        startedAt,
        parentId,
        children: [],
      })
    }

    const roots: RunningTask[] = []
    for (const task of byId.values()) {
      if (task.parentId && byId.has(task.parentId)) {
        byId.get(task.parentId)!.children.push(task)
      } else {
        roots.push(task)
      }
    }
    return roots
  }, [isStreaming, lastAssistant])

  // Prune startedAt entries that no longer correspond to a running tool.
  useEffect(() => {
    if (tasks.length === 0) {
      startedAtRef.current.clear()
      return
    }
    const live = new Set<string>()
    const walk = (list: RunningTask[]) => {
      for (const t of list) {
        live.add(t.toolCallId)
        walk(t.children)
      }
    }
    walk(tasks)
    for (const id of Array.from(startedAtRef.current.keys())) {
      if (!live.has(id)) startedAtRef.current.delete(id)
    }
  }, [tasks])

  // Tick once per second while the list is non-empty to update elapsed times.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (tasks.length === 0) return
    const h = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(h)
  }, [tasks.length])

  const total = useMemo(() => {
    let n = 0
    const walk = (list: RunningTask[]) => {
      for (const t of list) {
        n++
        walk(t.children)
      }
    }
    walk(tasks)
    return n
  }, [tasks])

  if (tasks.length === 0) return null

  return (
    <div className="mx-2 mb-2">
      <div className="rounded-t-lg border border-b-0 border-border/50 bg-muted/30 px-2 h-8 flex items-center">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Activity className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">Tasks</span>
          <span className="text-xs text-muted-foreground flex-1 truncate">
            Running now
          </span>
          <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
            {total}
          </span>
        </div>
      </div>
      <div className="rounded-b-lg border border-border/50 border-t-0 py-0.5">
        {tasks.map((task) => (
          <TaskRow key={task.toolCallId} task={task} depth={0} />
        ))}
      </div>
    </div>
  )
})

function TaskRow({ task, depth }: { task: RunningTask; depth: number }) {
  const elapsed = formatElapsed(Date.now() - task.startedAt)
  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 text-xs",
          depth > 0 && "pl-6 ml-3 border-l border-border/30",
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
        <span className="text-foreground font-medium flex-shrink-0">
          {task.toolName}
        </span>
        {task.summary ? (
          <span className="text-muted-foreground truncate min-w-0">
            {task.summary}
          </span>
        ) : null}
        <span className="ml-auto text-muted-foreground tabular-nums flex-shrink-0">
          {elapsed}
        </span>
      </div>
      {task.children.map((child) => (
        <TaskRow key={child.toolCallId} task={child} depth={depth + 1} />
      ))}
    </>
  )
}
