"use client"

import { useAtomValue } from "jotai"
import { ListTree } from "lucide-react"
import { memo, useCallback, useMemo, useState } from "react"

import { CollapseIcon, ExpandIcon, IconTextUndo } from "../../../components/ui/icons"
import { cn } from "../../../lib/utils"
import { isRollingBackAtom, rollbackHandlerAtom } from "../stores/message-store"
import { AgentAskUserQuestionTool } from "../ui/agent-ask-user-question-tool"
import { AgentBashTool } from "../ui/agent-bash-tool"
import { AgentEditTool } from "../ui/agent-edit-tool"
import { AgentExitPlanModeTool } from "../ui/agent-exit-plan-mode-tool"
import { AgentExploringGroup } from "../ui/agent-exploring-group"
import {
  AgentMessageUsage,
  type AgentMessageMetadata,
} from "../ui/agent-message-usage"
import { AgentPlanTool } from "../ui/agent-plan-tool"
import { AgentTaskTool } from "../ui/agent-task-tool"
import { AgentThinkingTool } from "../ui/agent-thinking-tool"
import { AgentTodoTool } from "../ui/agent-todo-tool"
import { AgentToolCall } from "../ui/agent-tool-call"
import { AgentToolRegistry, getToolStatus } from "../ui/agent-tool-registry"
import { AgentWebFetchTool } from "../ui/agent-web-fetch-tool"
import { AgentWebSearchCollapsible } from "../ui/agent-web-search-collapsible"
import {
  CopyButton,
  PlayButton,
  getMessageTextContent,
} from "../ui/message-action-buttons"
import { MemoizedTextPart } from "./memoized-text-part"

// Exploring tools - these get grouped when 3+ consecutive
const EXPLORING_TOOLS = new Set([
  "tool-Read",
  "tool-Grep",
  "tool-Glob",
  "tool-WebSearch",
  "tool-WebFetch",
])

// Group consecutive exploring tools into exploring-group
function groupExploringTools(parts: any[], nestedToolIds: Set<string>): any[] {
  const result: any[] = []
  let currentGroup: any[] = []

  for (const part of parts) {
    const isNested = part.toolCallId && nestedToolIds.has(part.toolCallId)

    if (EXPLORING_TOOLS.has(part.type) && !isNested) {
      currentGroup.push(part)
    } else {
      if (currentGroup.length >= 3) {
        result.push({ type: "exploring-group", parts: currentGroup })
      } else {
        result.push(...currentGroup)
      }
      currentGroup = []
      result.push(part)
    }
  }
  if (currentGroup.length >= 3) {
    result.push({ type: "exploring-group", parts: currentGroup })
  } else {
    result.push(...currentGroup)
  }
  return result
}

// Collapsible steps component
interface CollapsibleStepsProps {
  stepsCount: number
  children: React.ReactNode
  defaultExpanded?: boolean
}

function CollapsibleSteps({
  stepsCount,
  children,
  defaultExpanded = false,
}: CollapsibleStepsProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  if (stepsCount === 0) return null

  return (
    <div className="mb-2" data-collapsible-steps="true">
      <div
        className="flex items-center justify-between rounded-md py-0.5 px-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ListTree className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-medium whitespace-nowrap">
            {stepsCount} {stepsCount === 1 ? "step" : "steps"}
          </span>
        </div>
        <button
          className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded(!isExpanded)
          }}
        >
          <div className="relative w-4 h-4">
            <ExpandIcon
              className={cn(
                "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                isExpanded ? "opacity-0 scale-75" : "opacity-100 scale-100",
              )}
            />
            <CollapseIcon
              className={cn(
                "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-75",
              )}
            />
          </div>
        </button>
      </div>
      {isExpanded && <div className="mt-1 space-y-1.5">{children}</div>}
    </div>
  )
}

// ============================================================================
// ASSISTANT MESSAGE ITEM - MEMOIZED BY MESSAGE ID + PARTS LENGTH
// ============================================================================

export interface AssistantMessageItemProps {
  message: any
  isLastMessage: boolean
  isStreaming: boolean
  status: string
  isMobile: boolean
  subChatId: string
  sandboxSetupStatus?: "cloning" | "ready" | "error"
}

// Cache for tracking previous message state per message (to detect AI SDK in-place mutations)
// Stores both text lengths and tool input JSON strings for complete change detection
interface MessageStateSnapshot {
  textLengths: number[]
  lastPartInputJson: string | undefined
  lastPartState: string | undefined
}
const messageStateCache = new Map<string, MessageStateSnapshot>()

// Custom comparison - check if message content actually changed
// CRITICAL: AI SDK mutates objects in-place! So prev.message.parts[i].text === next.message.parts[i].text
// even when text HAS changed (they're the same mutated object).
// Solution: Cache state externally and compare those.
function areMessagePropsEqual(
  prev: AssistantMessageItemProps,
  next: AssistantMessageItemProps
): boolean {
  const msgId = next.message?.id

  // Different message ID = different message
  if (prev.message?.id !== next.message?.id) {
    return false
  }

  // Check other props first (cheap comparisons)
  if (prev.status !== next.status) return false
  if (prev.isStreaming !== next.isStreaming) return false
  if (prev.isLastMessage !== next.isLastMessage) return false
  if (prev.isMobile !== next.isMobile) return false
  if (prev.subChatId !== next.subChatId) return false
  if (prev.sandboxSetupStatus !== next.sandboxSetupStatus) return false

  // Get current message state from parts
  const nextParts = next.message?.parts || []
  const lastPart = nextParts[nextParts.length - 1]

  const currentState: MessageStateSnapshot = {
    textLengths: nextParts.map((p: any) =>
      p.type === "text" ? (p.text?.length || 0) : -1
    ),
    // Track tool input changes - this is critical for tool streaming!
    lastPartInputJson: lastPart?.input ? JSON.stringify(lastPart.input) : undefined,
    lastPartState: lastPart?.state,
  }

  // Get cached state from previous render
  const cachedState = msgId ? messageStateCache.get(msgId) : undefined

  // If no cache, this is first comparison - cache and allow render
  if (!cachedState) {
    if (msgId) messageStateCache.set(msgId, currentState)
    return false  // First render - must render
  }

  // Compare parts count
  if (cachedState.textLengths.length !== currentState.textLengths.length) {
    messageStateCache.set(msgId!, currentState)
    return false  // Parts count changed
  }

  // Compare text lengths (detects streaming text changes!)
  for (let i = 0; i < currentState.textLengths.length; i++) {
    if (cachedState.textLengths[i] !== currentState.textLengths[i]) {
      messageStateCache.set(msgId!, currentState)
      return false  // Text length changed = content changed
    }
  }

  // Compare last part's input (detects tool input streaming!)
  if (cachedState.lastPartInputJson !== currentState.lastPartInputJson) {
    messageStateCache.set(msgId!, currentState)
    return false  // Tool input changed
  }

  // Compare last part's state
  if (cachedState.lastPartState !== currentState.lastPartState) {
    messageStateCache.set(msgId!, currentState)
    return false  // Part state changed
  }

  // Nothing changed - skip re-render
  return true
}

export const AssistantMessageItem = memo(function AssistantMessageItem({
  message,
  isLastMessage,
  isStreaming,
  status,
  isMobile,
  subChatId,
  sandboxSetupStatus = "ready",
}: AssistantMessageItemProps) {
  const onRollback = useAtomValue(rollbackHandlerAtom)
  const isRollingBack = useAtomValue(isRollingBackAtom)
  const messageParts = message?.parts || []

  const contentParts = useMemo(() =>
    messageParts.filter((p: any) => p.type !== "step-start"),
    [messageParts]
  )

  const shouldShowPlanning =
    sandboxSetupStatus === "ready" &&
    isStreaming &&
    isLastMessage &&
    contentParts.length === 0

  const { nestedToolsMap, nestedToolIds, orphanTaskGroups, orphanToolCallIds, orphanFirstToolCallIds } = useMemo(() => {
    const nestedToolsMap = new Map<string, any[]>()
    const nestedToolIds = new Set<string>()
    const taskPartIds = new Set(
      messageParts
        .filter((p: any) => p.type === "tool-Task" && p.toolCallId)
        .map((p: any) => p.toolCallId)
    )
    const orphanTaskGroups = new Map<string, { parts: any[]; firstToolCallId: string }>()
    const orphanToolCallIds = new Set<string>()
    const orphanFirstToolCallIds = new Set<string>()

    for (const part of messageParts) {
      if (part.toolCallId?.includes(":")) {
        const parentId = part.toolCallId.split(":")[0]
        if (taskPartIds.has(parentId)) {
          if (!nestedToolsMap.has(parentId)) {
            nestedToolsMap.set(parentId, [])
          }
          nestedToolsMap.get(parentId)!.push(part)
          nestedToolIds.add(part.toolCallId)
        } else {
          let group = orphanTaskGroups.get(parentId)
          if (!group) {
            group = { parts: [], firstToolCallId: part.toolCallId }
            orphanTaskGroups.set(parentId, group)
            orphanFirstToolCallIds.add(part.toolCallId)
          }
          group.parts.push(part)
          orphanToolCallIds.add(part.toolCallId)
        }
      }
    }

    return { nestedToolsMap, nestedToolIds, orphanTaskGroups, orphanToolCallIds, orphanFirstToolCallIds }
  }, [messageParts])

  const { finalTextIndex, hasFinalText, visibleStepsCount, hasPlan, exitPlanPart, planText } = useMemo(() => {
    let lastToolIndex = -1
    let lastTextIndex = -1
    for (let i = 0; i < messageParts.length; i++) {
      const part = messageParts[i]
      if (part.type?.startsWith("tool-")) {
        lastToolIndex = i
      }
      if (part.type === "text" && part.text?.trim()) {
        lastTextIndex = i
      }
    }

    const hasToolsAndFinalText = lastToolIndex !== -1 && lastTextIndex > lastToolIndex
    const finalTextIndex = hasToolsAndFinalText ? lastTextIndex : -1
    const hasFinalText = finalTextIndex !== -1 && (!isStreaming || !isLastMessage)

    const exitPlanPart = messageParts.find((p: any) => p.type === "tool-ExitPlanMode")
    const planText = typeof exitPlanPart?.output?.plan === "string" ? exitPlanPart.output.plan : ""
    const hasPlan = !!planText

    const stepParts = hasFinalText
      ? messageParts.slice(0, finalTextIndex)
      : hasPlan
        ? messageParts.filter((p: any) => p.type !== "tool-ExitPlanMode")
        : []

    const visibleStepsCount = stepParts.filter((p: any) => {
      if (p.type === "step-start") return false
      if (p.type === "tool-TaskOutput") return false
      if (p.toolCallId && nestedToolIds.has(p.toolCallId)) return false
      if (p.toolCallId && orphanToolCallIds.has(p.toolCallId) && !orphanFirstToolCallIds.has(p.toolCallId)) return false
      if (p.type === "text" && !p.text?.trim()) return false
      return true
    }).length

    return { finalTextIndex, hasFinalText, visibleStepsCount, hasPlan, exitPlanPart, planText }
  }, [messageParts, isStreaming, isLastMessage, nestedToolIds, orphanToolCallIds, orphanFirstToolCallIds])

  const stepParts = useMemo(() => {
    if (hasFinalText) return messageParts.slice(0, finalTextIndex)
    if (hasPlan) return messageParts.filter((p: any) => p.type !== "tool-ExitPlanMode")
    return []
  }, [messageParts, hasFinalText, hasPlan, finalTextIndex])

  const finalParts = useMemo(() => {
    if (hasFinalText) return messageParts.slice(finalTextIndex)
    if (hasPlan) return []
    return messageParts
  }, [messageParts, hasFinalText, hasPlan, finalTextIndex])

  const hasTextContent = useMemo(() =>
    messageParts.some((p: any) => p.type === "text" && p.text?.trim()),
    [messageParts]
  )

  const msgMetadata = message?.metadata as AgentMessageMetadata

  const renderPart = useCallback((part: any, idx: number, isFinal = false) => {
    if (part.type === "step-start") return null
    if (part.type === "tool-TaskOutput") return null

    if (part.toolCallId && orphanToolCallIds.has(part.toolCallId)) {
      if (!orphanFirstToolCallIds.has(part.toolCallId)) return null
      const parentId = part.toolCallId.split(":")[0]
      const group = orphanTaskGroups.get(parentId)
      if (group) {
        return (
          <AgentTaskTool
            key={idx}
            part={{
              type: "tool-Task",
              toolCallId: parentId,
              input: { subagent_type: "unknown-agent", description: "Incomplete task" },
            }}
            nestedTools={group.parts}
            chatStatus={status}
          />
        )
      }
    }

    if (part.toolCallId && nestedToolIds.has(part.toolCallId)) return null
    if (part.type === "exploring-group") return null

    if (part.type === "text") {
      if (!part.text?.trim()) return null
      const isFinalText = isFinal && idx === finalTextIndex
      const isTextStreaming = isLastMessage && isStreaming
      return (
        <MemoizedTextPart
          key={idx}
          text={part.text}
          messageId={message.id}
          partIndex={idx}
          isFinalText={isFinalText}
          visibleStepsCount={visibleStepsCount}
          isStreaming={isTextStreaming}
        />
      )
    }

    if (part.type === "tool-Task") {
      const nestedTools = nestedToolsMap.get(part.toolCallId) || []
      return <AgentTaskTool key={idx} part={part} nestedTools={nestedTools} chatStatus={status} />
    }

    if (part.type === "tool-Bash") return <AgentBashTool key={idx} part={part} messageId={message.id} partIndex={idx} chatStatus={status} />
    if (part.type === "tool-Thinking") return <AgentThinkingTool key={idx} part={part} chatStatus={status} />
    if (part.type === "tool-Edit") return <AgentEditTool key={idx} part={part} messageId={message.id} partIndex={idx} chatStatus={status} />
    if (part.type === "tool-Write") return <AgentEditTool key={idx} part={part} messageId={message.id} partIndex={idx} chatStatus={status} />
    if (part.type === "tool-WebSearch") return <AgentWebSearchCollapsible key={idx} part={part} chatStatus={status} />
    if (part.type === "tool-WebFetch") return <AgentWebFetchTool key={idx} part={part} chatStatus={status} />
    if (part.type === "tool-PlanWrite") return <AgentPlanTool key={idx} part={part} chatStatus={status} />

    if (part.type === "tool-ExitPlanMode") {
      const { isPending, isError } = getToolStatus(part, status)
      return (
        <AgentToolCall
          key={idx}
          icon={AgentToolRegistry["tool-ExitPlanMode"].icon}
          title={AgentToolRegistry["tool-ExitPlanMode"].title(part)}
          isPending={isPending}
          isError={isError}
        />
      )
    }

    if (part.type === "tool-TodoWrite") {
      return <AgentTodoTool key={idx} part={part} chatStatus={status} subChatId={subChatId} />
    }

    if (part.type === "tool-AskUserQuestion") {
      const { isPending, isError } = getToolStatus(part, status)
      return (
        <AgentAskUserQuestionTool
          key={idx}
          input={part.input}
          result={part.result}
          errorText={(part as any).errorText || (part as any).error}
          state={isPending ? "call" : "result"}
          isError={isError}
          isStreaming={isStreaming && isLastMessage}
          toolCallId={part.toolCallId}
        />
      )
    }

    if (part.type in AgentToolRegistry) {
      const meta = AgentToolRegistry[part.type]
      const { isPending, isError } = getToolStatus(part, status)
      return (
        <AgentToolCall
          key={idx}
          icon={meta.icon}
          title={meta.title(part)}
          subtitle={meta.subtitle?.(part)}
          isPending={isPending}
          isError={isError}
        />
      )
    }

    if (part.type?.startsWith("tool-")) {
      return (
        <div key={idx} className="text-xs text-muted-foreground py-0.5 px-2">
          {part.type.replace("tool-", "")}
        </div>
      )
    }

    return null
  }, [nestedToolsMap, nestedToolIds, orphanToolCallIds, orphanFirstToolCallIds, orphanTaskGroups, finalTextIndex, visibleStepsCount, status, isLastMessage, isStreaming, subChatId, message.id])

  if (!message) return null

  return (
    <div
      data-assistant-message-id={message.id}
      className="group/message w-full mb-4"
    >
      <div className="flex flex-col gap-1.5">
        {(hasFinalText || hasPlan) && visibleStepsCount > 0 && (
          <CollapsibleSteps stepsCount={visibleStepsCount}>
            {(() => {
              const grouped = groupExploringTools(stepParts, nestedToolIds)
              return grouped.map((part: any, idx: number) => {
                if (part.type === "exploring-group") {
                  const isLast = idx === grouped.length - 1
                  const isGroupStreaming = isStreaming && isLastMessage && isLast
                  return (
                    <AgentExploringGroup
                      key={idx}
                      parts={part.parts}
                      chatStatus={status}
                      isStreaming={isGroupStreaming}
                    />
                  )
                }
                return renderPart(part, idx, false)
              })
            })()}
          </CollapsibleSteps>
        )}

        {(() => {
          const grouped = groupExploringTools(finalParts, nestedToolIds)
          return grouped.map((part: any, idx: number) => {
            if (part.type === "exploring-group") {
              const isLast = idx === grouped.length - 1
              const isGroupStreaming = isStreaming && isLastMessage && isLast
              return (
                <AgentExploringGroup
                  key={idx}
                  parts={part.parts}
                  chatStatus={status}
                  isStreaming={isGroupStreaming}
                />
              )
            }
            return renderPart(part, hasFinalText ? finalTextIndex + idx : idx, hasFinalText)
          })
        })()}

        {hasPlan && exitPlanPart && (
          <AgentExitPlanModeTool part={exitPlanPart as any} chatStatus={status} />
        )}

        {shouldShowPlanning && (
          <AgentToolCall
            icon={AgentToolRegistry["tool-planning"].icon}
            title={AgentToolRegistry["tool-planning"].title({})}
            isPending={true}
            isError={false}
          />
        )}
      </div>

      {(hasTextContent || hasPlan) && (!isStreaming || !isLastMessage) && (
        <div className="flex justify-between items-center h-6 px-2 mt-1">
          <div className="flex items-center gap-0.5">
            <CopyButton
              text={hasPlan ? planText : getMessageTextContent(message)}
              isMobile={isMobile}
            />
            <PlayButton
              text={hasPlan ? planText : getMessageTextContent(message)}
              isMobile={isMobile}
            />
            {onRollback && (message.metadata as any)?.sdkMessageUuid && (
              <button
                onClick={() => onRollback(message)}
                disabled={isStreaming || isRollingBack}
                tabIndex={-1}
                className={cn(
                  "p-1.5 rounded-md transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.97]",
                  (isStreaming || isRollingBack) && "opacity-50 cursor-not-allowed",
                )}
              >
                <IconTextUndo className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <AgentMessageUsage metadata={msgMetadata} isStreaming={isStreaming} isMobile={isMobile} />
        </div>
      )}
    </div>
  )
}, areMessagePropsEqual)
