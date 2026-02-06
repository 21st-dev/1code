"use client"

import { useAtomValue } from "jotai"
import { ListTree } from "lucide-react"
import { memo, useCallback, useContext, useMemo, useState } from "react"

import { CollapseIcon, ExpandIcon, PlanIcon } from "../../../components/ui/icons"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import { cn } from "../../../lib/utils"
import { selectedProjectAtom, showMessageJsonAtom } from "../atoms"
import { MessageJsonDisplay } from "../ui/message-json-display"
import { AgentAskUserQuestionTool } from "../ui/agent-ask-user-question-tool"
import { AgentBashTool } from "../ui/agent-bash-tool"
import { AgentEditTool } from "../ui/agent-edit-tool"
import { AgentExploringGroup } from "../ui/agent-exploring-group"
import { AgentTaskToolsGroup } from "../ui/agent-task-tools"
import { AgentPlanFileTool } from "../ui/agent-plan-file-tool"
import { isPlanFile } from "../ui/agent-tool-utils"
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
import { useFileOpen } from "../mentions"
import { GitActivityBadges } from "../ui/git-activity-badges"
import { MemoizedTextPart } from "./memoized-text-part"

// Exploring tools - these get grouped when 3+ consecutive
const EXPLORING_TOOLS = new Set([
  "tool-Read",
  "tool-Grep",
  "tool-Glob",
  "tool-WebSearch",
  "tool-WebFetch",
])

// Task management tools - these get grouped when consecutive
const TASK_TOOLS = new Set([
  "tool-TaskCreate",
  "tool-TaskUpdate",
  "tool-TaskGet",
  "tool-TaskList",
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

// Group consecutive task tools into task-group
function groupTaskTools(parts: any[], nestedToolIds: Set<string>): any[] {
  const result: any[] = []
  let currentGroup: any[] = []

  for (const part of parts) {
    const isNested = part.toolCallId && nestedToolIds.has(part.toolCallId)

    if (TASK_TOOLS.has(part.type) && !isNested) {
      currentGroup.push(part)
    } else {
      if (currentGroup.length >= 1) {
        result.push({ type: "task-group", parts: currentGroup })
      }
      currentGroup = []
      result.push(part)
    }
  }
  if (currentGroup.length >= 1) {
    result.push({ type: "task-group", parts: currentGroup })
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
  chatId: string
  sandboxSetupStatus?: "cloning" | "ready" | "error"
}

// Cache for tracking previous message state per message (to detect AI SDK in-place mutations)
// Stores both text lengths and tool states for complete change detection
interface MessageStateSnapshot {
  textLengths: number[]
  partStates: (string | undefined)[]
  lastPartInputJson: string | undefined
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
  if (prev.chatId !== next.chatId) return false
  if (prev.sandboxSetupStatus !== next.sandboxSetupStatus) return false

  // Get current message state from parts
  const nextParts = next.message?.parts || []
  const lastPart = nextParts[nextParts.length - 1]

  const currentState: MessageStateSnapshot = {
    textLengths: nextParts.map((p: any) =>
      p.type === "text" ? (p.text?.length || 0) : -1
    ),
    // Track ALL part states - critical for detecting Edit plan file streaming!
    partStates: nextParts.map((p: any) => p.state),
    // Track tool input changes - this is critical for tool streaming!
    lastPartInputJson: lastPart?.input ? JSON.stringify(lastPart.input) : undefined,
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

  // Compare ALL part states (detects Edit plan file streaming!)
  for (let i = 0; i < currentState.partStates.length; i++) {
    if (cachedState.partStates[i] !== currentState.partStates[i]) {
      messageStateCache.set(msgId!, currentState)
      return false  // Part state changed
    }
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
  chatId,
  sandboxSetupStatus = "ready",
}: AssistantMessageItemProps) {
  const showMessageJson = useAtomValue(showMessageJsonAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const projectPath = selectedProject?.path
  const onOpenFile = useFileOpen()
  const isDev = import.meta.env.DEV
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

  // Collect all plan operations (Write/Edit) for unified handling
  const planOpsSummary = useMemo(() => {
    const operations: Array<{ type: "write" | "edit"; part: any; index: number }> = []

    for (let i = 0; i < messageParts.length; i++) {
      const part = messageParts[i]
      const filePath = part.input?.file_path || ""

      if ((part.type === "tool-Write" || part.type === "tool-Edit") && isPlanFile(filePath)) {
        operations.push({
          type: part.type === "tool-Write" ? "write" : "edit",
          part,
          index: i,
        })
      }
    }

    if (operations.length === 0) {
      return { operations: [], hasAnyPlanOperation: false, isStreaming: false, lastOperationType: null as "write" | "edit" | null }
    }

    const isStreaming = operations.some(op =>
      op.part.state === "input-streaming" || op.part.state === "pending"
    )

    const lastOp = operations[operations.length - 1]

    return {
      operations,
      hasAnyPlanOperation: true,
      isStreaming,
      lastOperationType: lastOp.type,
    }
  }, [messageParts])

  // Collapsing logic: collapse only if final text exists after tools
  const { shouldCollapse, visibleStepsCount, collapseBeforeIndex } = useMemo(() => {
    let lastToolIndex = -1
    let lastTextIndex = -1

    for (let i = 0; i < messageParts.length; i++) {
      const part = messageParts[i]
      // Ignore ExitPlanMode - it's not a real tool for the user
      if (part.type?.startsWith("tool-") && part.type !== "tool-ExitPlanMode") {
        lastToolIndex = i
      }
      if (part.type === "text" && part.text?.trim()) {
        lastTextIndex = i
      }
    }

    const hasToolsAndFinalText = lastToolIndex !== -1 && lastTextIndex > lastToolIndex
    const finalTextIndex = hasToolsAndFinalText ? lastTextIndex : -1
    const hasFinalText = finalTextIndex !== -1 && (!isStreaming || !isLastMessage)

    // Collapse only when there's final text after tools
    const shouldCollapse = hasFinalText
    const collapseBeforeIndex = hasFinalText ? finalTextIndex : -1

    // Calculate visible steps count for collapsible header
    const stepParts = shouldCollapse && collapseBeforeIndex !== -1 ? messageParts.slice(0, collapseBeforeIndex) : []
    const visibleStepsCount = stepParts.filter((p: any) => {
      if (p.type === "step-start") return false
      if (p.type === "tool-TaskOutput") return false
      if (p.type === "tool-ExitPlanMode") return false
      if (p.toolCallId && nestedToolIds.has(p.toolCallId)) return false
      if (p.toolCallId && orphanToolCallIds.has(p.toolCallId) && !orphanFirstToolCallIds.has(p.toolCallId)) return false
      if (p.type === "text" && !p.text?.trim()) return false
      return true
    }).length

    return { shouldCollapse, visibleStepsCount, collapseBeforeIndex }
  }, [messageParts, isStreaming, isLastMessage, nestedToolIds, orphanToolCallIds, orphanFirstToolCallIds])

  // Check if any plan operation is in collapsed steps (before collapseBeforeIndex)
  const hasPlanInCollapsedSteps = useMemo(() => {
    if (!shouldCollapse || collapseBeforeIndex === -1) return false
    return planOpsSummary.operations.some(op => op.index < collapseBeforeIndex)
  }, [shouldCollapse, collapseBeforeIndex, planOpsSummary.operations])

  // Get the last plan operation from collapsed steps for showing card
  const lastCollapsedPlanOp = useMemo(() => {
    if (!hasPlanInCollapsedSteps) return null
    const collapsedOps = planOpsSummary.operations.filter(op => op.index < collapseBeforeIndex)
    return collapsedOps[collapsedOps.length - 1] || null
  }, [hasPlanInCollapsedSteps, planOpsSummary.operations, collapseBeforeIndex])

  const stepParts = useMemo(() => {
    if (!shouldCollapse || collapseBeforeIndex === -1) return []
    return messageParts.slice(0, collapseBeforeIndex)
  }, [messageParts, shouldCollapse, collapseBeforeIndex])

  const finalParts = useMemo(() => {
    if (!shouldCollapse || collapseBeforeIndex === -1) return messageParts
    return messageParts.slice(collapseBeforeIndex)
  }, [messageParts, shouldCollapse, collapseBeforeIndex])

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
      const isFinalText = isFinal && idx === collapseBeforeIndex
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

    // Plan files: unified handling
    // - In collapsed steps: all show mini indicator, last collapsed op's card shown separately after finalParts
    // - In final parts: all but last show mini indicator, last shows full card
    if (part.type === "tool-Write" || part.type === "tool-Edit") {
      const filePath = part.input?.file_path || ""
      if (isPlanFile(filePath)) {
        // Use part.toolCallId to find operation since idx may be adjusted for collapsed parts
        const opIndex = planOpsSummary.operations.findIndex(op => op.part.toolCallId === part.toolCallId)
        if (opIndex === -1) return null

        const originalIndex = planOpsSummary.operations[opIndex]?.index ?? -1
        const isInCollapsedSteps = shouldCollapse && collapseBeforeIndex !== -1 && originalIndex < collapseBeforeIndex
        const isLastCollapsedOp = lastCollapsedPlanOp?.part.toolCallId === part.toolCallId
        const isLastOperation = opIndex === planOpsSummary.operations.length - 1

        // If this is the last collapsed plan op, hide it here (card shown after CollapsibleSteps)
        if (isInCollapsedSteps && isLastCollapsedOp) {
          return null
        }

        // Show mini indicator for:
        // - All operations in collapsed steps (except last collapsed, handled above)
        // - All operations except last in final parts
        const showMiniIndicator = isInCollapsedSteps || !isLastOperation

        if (showMiniIndicator) {
          const isWrite = part.type === "tool-Write"
          const { isPending } = getToolStatus(part, status)
          const isOpStreaming = isPending || (part.state === "input-streaming" && isStreaming && isLastMessage)

          return (
            <div key={idx} className="flex items-center gap-1.5 px-2 py-0.5">
              <span className="text-xs text-muted-foreground">
                {isOpStreaming ? (
                  <TextShimmer as="span" duration={1.2}>
                    {isWrite ? "Creating plan..." : "Updating plan..."}
                  </TextShimmer>
                ) : (
                  isWrite ? "Created plan" : "Updated plan"
                )}
              </span>
            </div>
          )
        }

        // Last operation in final parts: show full card
        return (
          <AgentPlanFileTool
            key={idx}
            part={part}
            chatStatus={status}
            subChatId={subChatId}
            isEdit={part.type === "tool-Edit"}
          />
        )
      }
    }

    if (part.type === "tool-Edit") return <AgentEditTool key={idx} part={part} messageId={message.id} partIndex={idx} chatStatus={status} />
    if (part.type === "tool-Write") return <AgentEditTool key={idx} part={part} messageId={message.id} partIndex={idx} chatStatus={status} />
    if (part.type === "tool-WebSearch") return <AgentWebSearchCollapsible key={idx} part={part} chatStatus={status} />
    if (part.type === "tool-WebFetch") return <AgentWebFetchTool key={idx} part={part} chatStatus={status} />
    if (part.type === "tool-PlanWrite") return <AgentPlanTool key={idx} part={part} chatStatus={status} />

    // ExitPlanMode tool is hidden - plan is shown in sidebar instead
    if (part.type === "tool-ExitPlanMode") {
      return null
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
      // Make Read tool clickable to open file in viewer
      const handleClick = part.type === "tool-Read" && onOpenFile && part.input?.file_path
        ? () => onOpenFile(part.input.file_path)
        : undefined
      return (
        <AgentToolCall
          key={idx}
          icon={meta.icon}
          title={meta.title(part)}
          subtitle={meta.subtitle?.(part)}
          tooltipContent={meta.tooltipContent?.(part, projectPath)}
          isPending={isPending}
          isError={isError}
          onClick={handleClick}
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
  }, [nestedToolsMap, nestedToolIds, orphanToolCallIds, orphanFirstToolCallIds, orphanTaskGroups, collapseBeforeIndex, visibleStepsCount, status, isLastMessage, isStreaming, subChatId, message.id, planOpsSummary, shouldCollapse, lastCollapsedPlanOp])

  if (!message) return null

  return (
    <div
      data-assistant-message-id={message.id}
      className="group/message w-full mb-4"
    >
      <div className="flex flex-col gap-1.5">
        {shouldCollapse && visibleStepsCount > 0 && (
          <CollapsibleSteps stepsCount={visibleStepsCount}>
            {(() => {
              // Apply both grouping functions: first task tools, then exploring tools
              const taskGrouped = groupTaskTools(stepParts, nestedToolIds)
              const grouped = groupExploringTools(taskGrouped, nestedToolIds)
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
                if (part.type === "task-group") {
                  const isLast = idx === grouped.length - 1
                  const isGroupStreaming = isStreaming && isLastMessage && isLast
                  return (
                    <AgentTaskToolsGroup
                      key={idx}
                      parts={part.parts}
                      chatStatus={status}
                      isStreaming={isGroupStreaming}
                      subChatId={subChatId}
                    />
                  )
                }
                return renderPart(part, idx, false)
              })
            })()}
          </CollapsibleSteps>
        )}

        {(() => {
          // Apply both grouping functions: first task tools, then exploring tools
          const taskGrouped = groupTaskTools(finalParts, nestedToolIds)
          const grouped = groupExploringTools(taskGrouped, nestedToolIds)
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
            if (part.type === "task-group") {
              const isLast = idx === grouped.length - 1
              const isGroupStreaming = isStreaming && isLastMessage && isLast
              return (
                <AgentTaskToolsGroup
                  key={idx}
                  parts={part.parts}
                  chatStatus={status}
                  isStreaming={isGroupStreaming}
                  subChatId={subChatId}
                />
              )
            }
            return renderPart(part, shouldCollapse ? collapseBeforeIndex + idx : idx, shouldCollapse)
          })
        })()}

        {/* Show plan card after finalParts if any plan operation was in collapsed steps */}
        {shouldCollapse && lastCollapsedPlanOp && (
          <AgentPlanFileTool
            part={lastCollapsedPlanOp.part}
            chatStatus={status}
            subChatId={subChatId}
            isEdit={lastCollapsedPlanOp.type === "edit"}
          />
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

      {hasTextContent && (!isStreaming || !isLastMessage) && (
        <div className="flex justify-between items-center h-6 px-2 mt-1">
          <div className="flex items-center gap-0.5">
            <CopyButton
              text={getMessageTextContent(message)}
              isMobile={isMobile}
            />
            <PlayButton
              text={getMessageTextContent(message)}
              isMobile={isMobile}
            />
          </div>
          <AgentMessageUsage metadata={msgMetadata} isStreaming={isStreaming} isMobile={isMobile} />
        </div>
      )}

      {/* Git activity badges - commit/PR pills */}
      {(!isStreaming || !isLastMessage) && <GitActivityBadges parts={messageParts} chatId={chatId} subChatId={subChatId} />}

      {isDev && showMessageJson && (
        <div className="px-2 mt-2">
          <MessageJsonDisplay message={message} label="Assistant" />
        </div>
      )}
    </div>
  )
}, areMessagePropsEqual)
