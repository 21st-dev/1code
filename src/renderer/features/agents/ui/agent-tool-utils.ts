/**
 * Utility functions for agent tool components
 *
 * CRITICAL: AI SDK mutates objects in-place during streaming!
 * This means prev.output === next.output (same reference) even when
 * the values inside have changed. We MUST cache state externally
 * and compare cached values, not object references.
 */

// ============================================================================
// TOOL STATE CACHE
// ============================================================================
// Cache tool state by toolCallId to detect AI SDK in-place mutations.
// This is the same pattern used for MemoizedTextPart.
// ============================================================================

interface CachedToolState {
  state: string | undefined
  inputJson: string  // JSON stringified input for deep comparison
  outputJson: string // JSON stringified output for deep comparison
}

const toolStateCache = new Map<string, CachedToolState>()

function getToolStateSnapshot(part: any): CachedToolState {
  return {
    state: part.state,
    inputJson: JSON.stringify(part.input || {}),
    outputJson: JSON.stringify(part.output || {}),
  }
}

function hasToolStateChanged(toolCallId: string, part: any): boolean {
  const cached = toolStateCache.get(toolCallId)
  const current = getToolStateSnapshot(part)

  if (!cached) {
    toolStateCache.set(toolCallId, current)
    return true
  }

  const changed =
    cached.state !== current.state ||
    cached.inputJson !== current.inputJson ||
    cached.outputJson !== current.outputJson

  if (changed) {
    toolStateCache.set(toolCallId, current)
  }

  return changed
}

/**
 * Compare two part objects by their significant fields.
 * Returns true if they are equal.
 *
 * IMPORTANT: Uses external cache to detect AI SDK in-place mutations.
 */
function arePartsEqual(prev: any, next: any): boolean {
  // Different toolCallId = different tool
  if (prev.toolCallId !== next.toolCallId) return false
  if (prev.type !== next.type) return false

  // Use cache-based comparison for the next part
  // We check if the NEXT part has changed from what we cached
  const toolCallId = next.toolCallId
  if (!toolCallId) {
    // No toolCallId - fall back to simple comparison
    return prev.state === next.state
  }

  // Check if tool state has changed using our external cache
  // hasToolStateChanged updates the cache if changed
  const changed = hasToolStateChanged(toolCallId, next)

  // Return true (equal) if nothing changed
  return !changed
}

/**
 * Check if a tool is completed (has output or error state).
 * Completed tools don't need to react to chatStatus changes.
 */
function isToolCompleted(part: any): boolean {
  // Has output = completed
  if (part.output !== undefined && part.output !== null) return true
  // Error state = completed
  if (part.state === "error") return true
  // Result state = completed (for some tools)
  if (part.state === "result") return true
  return false
}

/**
 * Deep compare function for tool part props.
 * Used with React.memo() to prevent unnecessary re-renders when
 * parent component re-renders but the tool's actual data hasn't changed.
 *
 * This is critical for streaming performance - when ai-sdk updates messages,
 * it creates new object references for all parts, but most parts haven't
 * actually changed. This comparator checks the actual values.
 *
 * OPTIMIZATION: Completed tools don't re-render on chatStatus changes.
 */
export function areToolPropsEqual(
  prevProps: { part: any; chatStatus?: string },
  nextProps: { part: any; chatStatus?: string },
): boolean {
  // First check if the tool data itself changed
  const partsEqual = arePartsEqual(prevProps.part, nextProps.part)

  if (!partsEqual) return false

  // If tool is completed, it doesn't care about chatStatus changes
  if (isToolCompleted(nextProps.part)) {
    return true
  }

  // For pending tools, chatStatus matters (determines spinner vs completed)
  if (prevProps.chatStatus !== nextProps.chatStatus) return false

  return true
}

/**
 * Compare function for AgentTaskTool which has additional nestedTools prop.
 */
export function areTaskToolPropsEqual(
  prevProps: { part: any; nestedTools: any[]; chatStatus?: string },
  nextProps: { part: any; nestedTools: any[]; chatStatus?: string },
): boolean {
  // Compare main part first
  if (!arePartsEqual(prevProps.part, nextProps.part)) return false

  // Compare nestedTools array
  const prevNested = prevProps.nestedTools || []
  const nextNested = nextProps.nestedTools || []

  if (prevNested.length !== nextNested.length) return false

  // Compare each nested tool
  for (let i = 0; i < prevNested.length; i++) {
    if (!arePartsEqual(prevNested[i], nextNested[i])) return false
  }

  // If all tools are completed, don't care about chatStatus
  const mainCompleted = isToolCompleted(nextProps.part)
  const allNestedCompleted = nextNested.every(isToolCompleted)

  if (mainCompleted && allNestedCompleted) {
    return true
  }

  // For pending tools, chatStatus matters
  if (prevProps.chatStatus !== nextProps.chatStatus) return false

  return true
}

/**
 * Compare function for AgentExploringGroup which has parts array.
 */
export function areExploringGroupPropsEqual(
  prevProps: { parts: any[]; chatStatus?: string; isStreaming: boolean },
  nextProps: { parts: any[]; chatStatus?: string; isStreaming: boolean },
): boolean {
  const prevParts = prevProps.parts || []
  const nextParts = nextProps.parts || []

  if (prevParts.length !== nextParts.length) return false

  for (let i = 0; i < prevParts.length; i++) {
    if (!arePartsEqual(prevParts[i], nextParts[i])) return false
  }

  // isStreaming changes always matter - they drive auto-collapse via useEffect
  if (prevProps.isStreaming !== nextProps.isStreaming) return false

  // If all parts are completed, don't care about chatStatus
  const allCompleted = nextParts.every(isToolCompleted)
  if (allCompleted) {
    return true
  }

  // For pending groups, chatStatus matters
  if (prevProps.chatStatus !== nextProps.chatStatus) return false

  return true
}

/**
 * Check if a file path is a plan file.
 * Plan files are stored in the claude-sessions directory under /plans/
 */
export function isPlanFile(filePath: string): boolean {
  // Check for official plan location in claude-sessions
  if (filePath.includes("claude-sessions") && filePath.includes("/plans/")) {
    return true
  }
  // Also check for plan files by name pattern (for backwards compatibility)
  const fileName = filePath.split("/").pop()?.toLowerCase() || ""
  if (fileName.includes("plan") && fileName.endsWith(".md")) {
    return true
  }
  return false
}

/**
 * Compare function for AgentAskUserQuestionTool which has different props structure.
 * Uses cache-based comparison for AI SDK in-place mutations.
 */

interface CachedAskUserState {
  state: string
  isError: boolean | undefined
  errorText: string | undefined
  inputJson: string
  resultJson: string
}

const askUserStateCache = new Map<string, CachedAskUserState>()

export function areAskUserQuestionPropsEqual(
  prevProps: {
    input: any
    result?: any
    errorText?: string
    state: string
    isError?: boolean
    isStreaming?: boolean
    toolCallId?: string
  },
  nextProps: {
    input: any
    result?: any
    errorText?: string
    state: string
    isError?: boolean
    isStreaming?: boolean
    toolCallId?: string
  },
): boolean {
  // Different toolCallId = different tool
  if (prevProps.toolCallId !== nextProps.toolCallId) return false

  const toolCallId = nextProps.toolCallId
  if (!toolCallId) {
    // No toolCallId - fall back to simple comparison
    return prevProps.state === nextProps.state
  }

  // Create current state snapshot
  const current: CachedAskUserState = {
    state: nextProps.state,
    isError: nextProps.isError,
    errorText: nextProps.errorText,
    inputJson: JSON.stringify(nextProps.input || {}),
    resultJson: JSON.stringify(nextProps.result || {}),
  }

  const cached = askUserStateCache.get(toolCallId)

  if (!cached) {
    askUserStateCache.set(toolCallId, current)
    return false // First render
  }

  const changed =
    cached.state !== current.state ||
    cached.isError !== current.isError ||
    cached.errorText !== current.errorText ||
    cached.inputJson !== current.inputJson ||
    cached.resultJson !== current.resultJson

  if (changed) {
    askUserStateCache.set(toolCallId, current)
    return false
  }

  // If tool has result, it's completed - don't care about isStreaming
  if (nextProps.result !== undefined) {
    return true
  }

  // For pending state, isStreaming matters
  if (prevProps.isStreaming !== nextProps.isStreaming) return false

  return true
}
