"use client"

import { cn } from "../../../lib/utils"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  memo,
} from "react"
import { createFileIconElement } from "./agents-file-mention"

// Threshold for skipping expensive trigger detection (characters)
// Should be >= MAX_PASTE_LENGTH from paste-text.ts to avoid processing large pasted content
const LARGE_TEXT_THRESHOLD = 10000

export interface FileMentionOption {
  id: string // file:owner/repo:path/to/file.tsx or folder:owner/repo:path/to/folder or skill:skill-name or tool:servername
  label: string // filename or folder name or skill name or tool name
  path: string // full path or skill description
  repository: string
  truncatedPath?: string // directory path for inline display or skill description
  additions?: number // for changed files
  deletions?: number // for changed files
  type?: "file" | "folder" | "skill" | "agent" | "category" | "tool" // entry type (default: file)
  // Extended data for rich tooltips (skills/agents/tools)
  description?: string // skill/agent/tool description
  tools?: string[] // agent allowed tools
  model?: string // agent model
  source?: "user" | "project" // skill/agent source
  mcpServer?: string // MCP server name for tools
}

// Mention ID prefixes
export const MENTION_PREFIXES = {
  FILE: "file:",
  FOLDER: "folder:",
  SKILL: "skill:",
  AGENT: "agent:",
  TOOL: "tool:", // MCP tools
  QUOTE: "quote:", // Selected text from assistant messages
  DIFF: "diff:", // Selected text from diff sidebar
  PASTED: "pasted:", // Large pasted text saved as files
} as const

type TriggerPayload = {
  searchText: string
  rect: DOMRect
}

// Export SlashTriggerPayload for slash commands
export type SlashTriggerPayload = TriggerPayload

export type AgentsMentionsEditorHandle = {
  focus: () => void
  blur: () => void
  insertMention: (option: FileMentionOption) => void
  getValue: () => string
  setValue: (value: string) => void
  clear: () => void
  clearSlashCommand: () => void // Clear slash command text after selection
}

type AgentsMentionsEditorProps = {
  // UNCONTROLLED: no value/onChange - use ref methods instead
  initialValue?: string // optional initial content
  onTrigger: (payload: TriggerPayload) => void
  onCloseTrigger: () => void
  onSlashTrigger?: (payload: TriggerPayload) => void // Slash command trigger
  onCloseSlashTrigger?: () => void // Close slash command dropdown
  onContentChange?: (hasContent: boolean) => void // lightweight callback for send button state
  placeholder?: string
  className?: string
  onSubmit?: () => void
  onForceSubmit?: () => void // Opt+Enter: bypass queue, stop stream and send immediately
  disabled?: boolean
  onPaste?: (e: React.ClipboardEvent) => void
  onShiftTab?: () => void // callback for Shift+Tab (e.g., mode switching)
  onFocus?: () => void
  onBlur?: () => void
}

// Append text to element (no styling in input, ultrathink only in sent messages)
function appendText(root: HTMLElement, text: string) {
  if (text) {
    root.appendChild(document.createTextNode(text))
  }
}

// Create styled mention chip (matching canvas style)
function createMentionNode(option: FileMentionOption): HTMLSpanElement {
  const span = document.createElement("span")
  span.setAttribute("contenteditable", "false")
  span.setAttribute("data-mention-id", option.id)
  span.setAttribute("data-mention-type", option.type || "file")
  span.className =
    "inline-flex items-center gap-1 px-[6px] py-[1px] rounded-[4px] text-sm align-middle bg-black/[0.04] dark:bg-white/[0.08] text-foreground/80 [&.mention-selected]:bg-primary/70 [&.mention-selected]:text-primary-foreground"

  // Create icon element (pass type for folder icon)
  const iconElement = createFileIconElement(option.label, option.type)
  span.appendChild(iconElement)

  const label = document.createElement("span")
  label.textContent = option.label

  span.appendChild(label)
  return span
}

// Serialize DOM to text with @[id] tokens
function serializeContent(root: HTMLElement): string {
  let result = ""
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  )
  let node: Node | null = walker.nextNode()
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || ""
      node = walker.nextNode()
      continue
    }
    const el = node as HTMLElement
    // Handle <br> elements as newlines
    if (el.tagName === "BR") {
      result += "\n"
      node = walker.nextNode()
      continue
    }
    // Handle <div> elements (some browsers wrap lines in divs)
    if (el.tagName === "DIV" && el !== root) {
      // Add newline before div content (if not at start)
      if (result.length > 0 && !result.endsWith("\n")) {
        result += "\n"
      }
      node = walker.nextNode()
      continue
    }
    // Handle ultrathink styled nodes
    if (el.hasAttribute("data-ultrathink")) {
      result += el.textContent || ""
      // Skip subtree
      let next: Node | null = el.nextSibling
      if (next) {
        walker.currentNode = next
        node = next
        continue
      }
      let parent: Node | null = el.parentNode
      while (parent && !parent.nextSibling) parent = parent.parentNode
      if (parent && parent.nextSibling) {
        walker.currentNode = parent.nextSibling
        node = parent.nextSibling
      } else {
        node = null
      }
      continue
    }
    if (el.hasAttribute("data-mention-id")) {
      const id = el.getAttribute("data-mention-id") || ""
      result += `@[${id}]`
      // Skip subtree
      let next: Node | null = el.nextSibling
      if (next) {
        walker.currentNode = next
        node = next
        continue
      }
      let parent: Node | null = el.parentNode
      while (parent && !parent.nextSibling) parent = parent.parentNode
      if (parent && parent.nextSibling) {
        walker.currentNode = parent.nextSibling
        node = parent.nextSibling
      } else {
        node = null
      }
      continue
    }
    node = walker.nextNode()
  }
  return result
}

// Build DOM from serialized text
function buildContentFromSerialized(
  root: HTMLElement,
  serialized: string,
  resolveMention?: (id: string) => FileMentionOption | null,
) {
  // Clear safely
  while (root.firstChild) {
    root.removeChild(root.firstChild)
  }

  const regex = /@\[([^\]]+)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(serialized)) !== null) {
    // Text before mention
    if (match.index > lastIndex) {
      appendText(root, serialized.slice(lastIndex, match.index))
    }
    const id = match[1]
    // Try to resolve mention
    let option: FileMentionOption | null = null
    if (resolveMention) {
      option = resolveMention(id)
    }
    if (!option && (id.startsWith(MENTION_PREFIXES.FILE) || id.startsWith(MENTION_PREFIXES.FOLDER))) {
      // Parse file/folder mention: file:repo:path or folder:repo:path
      const parts = id.split(":")
      if (parts.length >= 3) {
        const type = parts[0] as "file" | "folder"
        const repo = parts[1]
        const path = parts.slice(2).join(":")
        const name = path.split("/").pop() || path
        option = { id, label: name, path, repository: repo, type }
      }
    }
    if (!option && id.startsWith(MENTION_PREFIXES.SKILL)) {
      // Parse skill mention: skill:skill-name
      const skillName = id.slice(MENTION_PREFIXES.SKILL.length)
      option = { id, label: skillName, path: "", repository: "", type: "skill" }
    }
    if (!option && id.startsWith(MENTION_PREFIXES.AGENT)) {
      // Parse agent mention: agent:agent-name
      const agentName = id.slice(MENTION_PREFIXES.AGENT.length)
      option = { id, label: agentName, path: "", repository: "", type: "agent" }
    }
    if (!option && id.startsWith(MENTION_PREFIXES.TOOL)) {
      const toolPath = id.slice(MENTION_PREFIXES.TOOL.length)
      if (toolPath.startsWith("mcp__")) {
        // Individual tool: tool:mcp__servername__toolname
        const parts = toolPath.split("__")
        const toolName = parts.length >= 3 ? parts.slice(2).join("__") : toolPath
        const displayName = toolName
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim()
        option = { id, label: displayName, path: toolPath, repository: "", type: "tool" }
      } else {
        // MCP server: tool:servername
        option = { id, label: toolPath, path: toolPath, repository: "", type: "tool" }
      }
    }
    if (option) {
      root.appendChild(createMentionNode(option))
      root.appendChild(document.createTextNode(" "))
    } else {
      // Fallback: just show the id
      root.appendChild(document.createTextNode(`@[${id}]`))
    }
    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < serialized.length) {
    appendText(root, serialized.slice(lastIndex))
  }
}

// Combined tree walk result - computes everything in ONE pass instead of 3
interface TreeWalkResult {
  serialized: string
  textBeforeCursor: string
  atPosition: { node: Node; offset: number } | null
  atIndex: number
  // Slash command trigger info
  slashPosition: { node: Node; offset: number } | null
  slashIndex: number
}

// Single O(n) tree walk that computes all needed data
function walkTreeOnce(root: HTMLElement, range: Range | null): TreeWalkResult {
  let serialized = ""
  let textBeforeCursor = ""
  let reachedCursor = false
  let atPosition: { node: Node; offset: number } | null = null
  let atIndex = -1
  let slashPosition: { node: Node; offset: number } | null = null
  let slashIndex = -1

  // Handle case where cursor is in root element (not in a text node)
  // This happens when the editor is empty or cursor is at element boundary
  let cursorInRoot = false
  let cursorRootOffset = 0
  if (range && range.endContainer === root) {
    cursorInRoot = true
    cursorRootOffset = range.endOffset
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  )
  let node: Node | null = walker.nextNode()

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ""

      // Check if cursor is in this node (direct case)
      const cursorInThisNode = range && !reachedCursor && node === range.endContainer

      // Handle cursor in root element - cursor is positioned between children
      // cursorRootOffset indicates the child index where cursor is
      let cursorAtRootBoundary = false
      if (cursorInRoot && !reachedCursor && node.parentNode === root) {
        const children = Array.from(root.childNodes)
        const nodeIndex = children.indexOf(node as ChildNode)
        // If cursor is after this node, include full text
        // If cursor is at this node's position, we've passed the cursor
        if (nodeIndex >= cursorRootOffset) {
          cursorAtRootBoundary = true
        }
      }

      if (cursorInThisNode) {
        const cursorOffset = range!.endOffset
        textBeforeCursor += text.slice(0, cursorOffset)
        reachedCursor = true

        // Find @ in text before cursor for this node
        const textBeforeInNode = text.slice(0, cursorOffset)
        const localAtIdx = textBeforeInNode.lastIndexOf("@")
        if (localAtIdx !== -1) {
          const globalAtIdx = serialized.length + localAtIdx

          // Check character before @ - must be start of text, whitespace, or newline (not part of email/word)
          const textUpToAt = serialized + textBeforeInNode.slice(0, localAtIdx)
          const charBefore = globalAtIdx > 0 ? textUpToAt.charAt(globalAtIdx - 1) : null
          const isStandaloneAt = charBefore === null || /\s/.test(charBefore)

          // Check if this @ is the most recent one AND is standalone
          if (isStandaloneAt && globalAtIdx > atIndex) {
            const afterAt = textBeforeCursor.slice(
              textBeforeCursor.lastIndexOf("@") + 1,
            )
            // Close on newline or double-space (not single space - allow multi-word search)
            const hasNewline = afterAt.includes("\n")
            const hasDoubleSpace = afterAt.includes("  ")
            if (!hasNewline && !hasDoubleSpace) {
              atIndex = globalAtIdx
              atPosition = { node, offset: localAtIdx }
            }
          }
        }

        // Find / at start of line (for slash commands)
        // Check all occurrences of / in this node
        for (let i = 0; i < textBeforeInNode.length; i++) {
          if (textBeforeInNode[i] === "/") {
            const globalSlashIdx = serialized.length + i
            // / is valid only at start of text OR after newline
            const charBefore =
              globalSlashIdx === 0
                ? null
                : (serialized + textBeforeInNode.slice(0, i)).charAt(
                    globalSlashIdx - 1,
                  )
            if (charBefore === null || charBefore === "\n") {
              // Check no space between / and cursor
              const afterSlash = textBeforeCursor.slice(globalSlashIdx + 1)
              if (!afterSlash.includes(" ") && !afterSlash.includes("\n")) {
                slashIndex = globalSlashIdx
                slashPosition = { node, offset: i }
              }
            }
          }
        }
      } else if (cursorAtRootBoundary) {
        // Cursor is in root element, at or past this node's position
        // Mark as reached and don't include this text in textBeforeCursor
        reachedCursor = true
      } else if (!reachedCursor) {
        textBeforeCursor += text
        // Track @ positions as we go (only if standalone - not part of email/word)
        const localAtIdx = text.lastIndexOf("@")
        if (localAtIdx !== -1) {
          const globalAtIdx = serialized.length + localAtIdx
          // Check character before @ - must be start of text, whitespace, or newline
          const textUpToAt = serialized + text.slice(0, localAtIdx)
          const charBefore = globalAtIdx > 0 ? textUpToAt.charAt(globalAtIdx - 1) : null
          const isStandaloneAt = charBefore === null || /\s/.test(charBefore)

          if (isStandaloneAt) {
            atIndex = globalAtIdx
            atPosition = { node, offset: localAtIdx }
          }
        }
      }

      serialized += text
      node = walker.nextNode()
      continue
    }

    // Element node - check for ultrathink or mention
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement

      // Handle ultrathink styled nodes
      if (el.hasAttribute("data-ultrathink")) {
        const text = el.textContent || ""
        serialized += text
        if (!reachedCursor) {
          textBeforeCursor += text
        }

        // Skip ultrathink subtree
        let next: Node | null = el.nextSibling
        if (next) {
          walker.currentNode = next
          node = next
          continue
        }
        let parent: Node | null = el.parentNode
        while (parent && !parent.nextSibling) parent = parent.parentNode
        if (parent && parent.nextSibling) {
          walker.currentNode = parent.nextSibling
          node = parent.nextSibling
          continue
        }
        node = null
        continue
      }

      if (el.hasAttribute("data-mention-id")) {
        const id = el.getAttribute("data-mention-id") || ""
        const mentionToken = `@[${id}]`
        serialized += mentionToken
        if (!reachedCursor) {
          textBeforeCursor += mentionToken
        }

        // Skip mention subtree
        let next: Node | null = el.nextSibling
        if (next) {
          walker.currentNode = next
          node = next
          continue
        }
        let parent: Node | null = el.parentNode
        while (parent && !parent.nextSibling) parent = parent.parentNode
        if (parent && parent.nextSibling) {
          walker.currentNode = parent.nextSibling
          node = parent.nextSibling
          continue
        }
        node = null
        continue
      }
    }

    node = walker.nextNode()
  }

  // Validate @ trigger - close on newline or double-space (allow single spaces for multi-word search)
  if (atIndex !== -1) {
    const afterAt = textBeforeCursor.slice(atIndex + 1)
    const hasNewline = afterAt.includes("\n")
    const hasDoubleSpace = afterAt.includes("  ")
    if (hasNewline || hasDoubleSpace) {
      atIndex = -1
      atPosition = null
    }
  }

  // Validate / trigger - check if space/newline after it
  if (slashIndex !== -1) {
    const afterSlash = textBeforeCursor.slice(slashIndex + 1)
    if (afterSlash.includes(" ") || afterSlash.includes("\n")) {
      slashIndex = -1
      slashPosition = null
    }
  }

  return {
    serialized,
    textBeforeCursor,
    atPosition,
    atIndex,
    slashPosition,
    slashIndex,
  }
}

// Memoized to prevent re-renders when parent re-renders
export const AgentsMentionsEditor = memo(
  forwardRef<AgentsMentionsEditorHandle, AgentsMentionsEditorProps>(
    function AgentsMentionsEditor(
      {
        initialValue,
        onTrigger,
        onCloseTrigger,
        onSlashTrigger,
        onCloseSlashTrigger,
        onContentChange,
        placeholder,
        className,
        onSubmit,
        onForceSubmit,
        disabled,
        onPaste,
        onShiftTab,
        onFocus,
        onBlur,
      },
      ref,
    ) {
      const editorRef = useRef<HTMLDivElement>(null)
      const triggerActive = useRef(false)
      const triggerStartIndex = useRef<number | null>(null)
      // Slash command trigger state
      const slashTriggerActive = useRef(false)
      const slashTriggerStartIndex = useRef<number | null>(null)
      // Track if editor has content for placeholder (updated via DOM, no React state)
      const [hasContent, setHasContent] = useState(false)

      // Custom undo/redo stack
      // Browser's native undo doesn't work well with execCommand insertText and DOM manipulations
      interface UndoState {
        html: string
        cursorOffset: number
      }
      const undoStack = useRef<UndoState[]>([])
      const redoStack = useRef<UndoState[]>([])
      const isUndoRedo = useRef(false)
      const lastSavedHtml = useRef<string>("")
      const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

      // Get current editor state (html + cursor position)
      const getCurrentState = useCallback((): UndoState | null => {
        if (!editorRef.current) return null
        const html = editorRef.current.innerHTML
        const sel = window.getSelection()
        let cursorOffset = 0
        if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
          const range = sel.getRangeAt(0)
          // Calculate offset by walking through all nodes
          const walker = document.createTreeWalker(
            editorRef.current,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
          )
          let node: Node | null = walker.nextNode()
          while (node) {
            if (node === range.startContainer) {
              cursorOffset += range.startOffset
              break
            }
            if (node.nodeType === Node.TEXT_NODE) {
              cursorOffset += node.textContent?.length || 0
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement
              // Mention nodes count as their serialized length for consistency
              if (el.hasAttribute("data-mention-id")) {
                cursorOffset += 1 // Count mention as single unit
                // Skip children of mention node - move walker to next sibling
                const nextSibling = walker.nextSibling()
                if (nextSibling) {
                  node = nextSibling
                  continue
                }
                // No sibling - break out and let nextNode handle it
              }
            }
            node = walker.nextNode()
          }
        }
        return { html, cursorOffset }
      }, [])

      // Save state to undo stack (call before making changes)
      const saveUndoState = useCallback(() => {
        if (!editorRef.current || isUndoRedo.current) return
        const state = getCurrentState()
        if (!state) return
        // Don't save if nothing changed
        if (state.html === lastSavedHtml.current) return
        lastSavedHtml.current = state.html
        undoStack.current.push(state)
        // Clear redo stack when new action is performed
        redoStack.current = []
        // Limit stack size
        if (undoStack.current.length > 100) {
          undoStack.current.shift()
        }
      }, [getCurrentState])

      // Debounced save for typing - saves state after 500ms of no typing
      const debouncedSaveUndoState = useCallback(() => {
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current)
        }
        debounceTimer.current = setTimeout(() => {
          saveUndoState()
          debounceTimer.current = null
        }, 500)
      }, [saveUndoState])

      // Immediate save (for paste, mentions) - also cancels any pending debounce
      const immediateSaveUndoState = useCallback(() => {
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current)
          debounceTimer.current = null
        }
        saveUndoState()
      }, [saveUndoState])

      // Restore cursor position after undo/redo
      // Handles both text nodes and mention nodes
      const restoreCursor = useCallback((offset: number) => {
        if (!editorRef.current) return
        const sel = window.getSelection()
        if (!sel) return

        let currentOffset = 0
        const walker = document.createTreeWalker(
          editorRef.current,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        )
        let node: Node | null = walker.nextNode()
        let lastTextNode: Text | null = null
        let lastTextNodeOffset = 0

        while (node) {
          if (node.nodeType === Node.TEXT_NODE) {
            const textNode = node as Text
            const nodeLength = textNode.textContent?.length || 0
            if (currentOffset + nodeLength >= offset) {
              const range = document.createRange()
              range.setStart(textNode, Math.min(offset - currentOffset, nodeLength))
              range.collapse(true)
              sel.removeAllRanges()
              sel.addRange(range)
              return
            }
            lastTextNode = textNode
            lastTextNodeOffset = nodeLength
            currentOffset += nodeLength
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            if (el.hasAttribute("data-mention-id")) {
              // Mention counts as 1 unit
              if (currentOffset + 1 >= offset) {
                // Place cursor after mention
                const range = document.createRange()
                range.setStartAfter(el)
                range.collapse(true)
                sel.removeAllRanges()
                sel.addRange(range)
                return
              }
              currentOffset += 1
              // Skip to next sibling (don't traverse inside mention)
              const nextSibling = walker.nextSibling()
              if (nextSibling) {
                node = nextSibling
                continue
              }
            }
          }
          node = walker.nextNode()
        }

        // Fallback: move to end
        sel.selectAllChildren(editorRef.current)
        sel.collapseToEnd()
      }, [])

      // Cleanup debounce timer on unmount
      useEffect(() => {
        return () => {
          if (debounceTimer.current) {
            clearTimeout(debounceTimer.current)
          }
        }
      }, [])

      // Resolve mention from id for rendering
      const resolveMention = useCallback(
        (id: string): FileMentionOption | null => {
          if (id.startsWith(MENTION_PREFIXES.FILE) || id.startsWith(MENTION_PREFIXES.FOLDER)) {
            const parts = id.split(":")
            if (parts.length >= 3) {
              const type = parts[0] as "file" | "folder"
              const repo = parts[1]
              const path = parts.slice(2).join(":")
              const name = path.split("/").pop() || path
              return { id, label: name, path, repository: repo, type }
            }
          }
          if (id.startsWith(MENTION_PREFIXES.SKILL)) {
            const skillName = id.slice(MENTION_PREFIXES.SKILL.length)
            return { id, label: skillName, path: "", repository: "", type: "skill" }
          }
          if (id.startsWith(MENTION_PREFIXES.AGENT)) {
            const agentName = id.slice(MENTION_PREFIXES.AGENT.length)
            return { id, label: agentName, path: "", repository: "", type: "agent" }
          }
          if (id.startsWith(MENTION_PREFIXES.TOOL)) {
            const toolPath = id.slice(MENTION_PREFIXES.TOOL.length)
            if (toolPath.startsWith("mcp__")) {
              const parts = toolPath.split("__")
              const toolName = parts.length >= 3 ? parts.slice(2).join("__") : toolPath
              const displayName = toolName
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase())
                .trim()
              return { id, label: displayName, path: toolPath, repository: "", type: "tool" }
            }
            return { id, label: toolPath, path: toolPath, repository: "", type: "tool" }
          }
          return null
        },
        [],
      )

      // Initialize editor with initialValue on mount
      useEffect(() => {
        if (editorRef.current && initialValue) {
          buildContentFromSerialized(
            editorRef.current,
            initialValue,
            resolveMention,
          )
          setHasContent(!!initialValue)
        }
        // Save initial state for undo (allows undo to empty)
        if (editorRef.current) {
          lastSavedHtml.current = editorRef.current.innerHTML
          undoStack.current = [{ html: editorRef.current.innerHTML, cursorOffset: 0 }]
        }
      }, []) // Only on mount

      // Handle selection changes to highlight mention chips
      // Throttled to avoid performance issues during rapid typing
      useEffect(() => {
        let rafId: number | null = null
        let lastRun = 0
        const THROTTLE_MS = 100

        const handleSelectionChange = () => {
          const now = Date.now()

          // Throttle: skip if called too recently
          if (now - lastRun < THROTTLE_MS) {
            // Schedule one final update after throttle period
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => {
              lastRun = Date.now()
              updateMentionHighlights()
            })
            return
          }

          lastRun = now
          updateMentionHighlights()
        }

        const updateMentionHighlights = () => {
          if (!editorRef.current) return

          const selection = window.getSelection()
          if (!selection || selection.rangeCount === 0) {
            // Clear all highlights when no selection
            const mentions =
              editorRef.current.querySelectorAll("[data-mention-id]")
            mentions.forEach((mention) => {
              const mentionEl = mention as HTMLElement
              mentionEl.classList.remove("mention-selected")
            })
            return
          }

          const range = selection.getRangeAt(0)

          // Check if selection is within our editor
          const commonAncestor = range.commonAncestorContainer
          const isInEditor = editorRef.current.contains(
            commonAncestor.nodeType === Node.ELEMENT_NODE
              ? commonAncestor
              : commonAncestor.parentElement,
          )

          if (!isInEditor) return

          // Get all mention chips
          const mentions =
            editorRef.current.querySelectorAll("[data-mention-id]")

          mentions.forEach((mention) => {
            const mentionEl = mention as HTMLElement

            // Check if mention is within selection range
            if (range.intersectsNode(mentionEl)) {
              mentionEl.classList.add("mention-selected")
            } else {
              mentionEl.classList.remove("mention-selected")
            }
          })
        }

        document.addEventListener("selectionchange", handleSelectionChange)
        return () => {
          document.removeEventListener("selectionchange", handleSelectionChange)
          if (rafId) cancelAnimationFrame(rafId)
        }
      }, [])

      // Trigger detection timeout ref for cleanup
      const triggerDetectionTimeout = useRef<number | null>(null)

      // Handle input - UNCONTROLLED: no onChange, just @ and / trigger detection
      const handleInput = useCallback(() => {
        if (!editorRef.current) return

        // Save undo state with debounce (for typing)
        // This captures state periodically during typing for proper undo
        debouncedSaveUndoState()

        // Update placeholder visibility and notify parent IMMEDIATELY (cheap operation)
        // Use textContent without trim() so placeholder hides even with just spaces
        const content = editorRef.current.textContent || ""
        const newHasContent = !!content
        setHasContent(newHasContent)
        onContentChange?.(newHasContent)

        // Skip expensive trigger detection for very large text
        // This prevents UI freeze when pasting large content
        if (content.length > LARGE_TEXT_THRESHOLD) {
          // Close any open triggers since we can't detect them
          if (triggerActive.current) {
            triggerActive.current = false
            triggerStartIndex.current = null
            onCloseTrigger()
          }
          if (slashTriggerActive.current) {
            slashTriggerActive.current = false
            slashTriggerStartIndex.current = null
            onCloseSlashTrigger?.()
          }
          return
        }

        // Clear previous timeout
        if (triggerDetectionTimeout.current) {
          clearTimeout(triggerDetectionTimeout.current)
        }

        // For short content, run trigger detection immediately
        // For longer content, debounce to avoid performance issues
        const runTriggerDetection = () => {
          if (!editorRef.current) return

          // Get selection for cursor position
          const sel = window.getSelection()
          const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null

          // Handle non-collapsed selection (close triggers)
          if (range && !range.collapsed) {
            if (triggerActive.current) {
              triggerActive.current = false
              triggerStartIndex.current = null
              onCloseTrigger()
            }
            if (slashTriggerActive.current) {
              slashTriggerActive.current = false
              slashTriggerStartIndex.current = null
              onCloseSlashTrigger?.()
            }
            return
          }

          // Single tree walk for @ and / trigger detection
          const {
            textBeforeCursor,
            atPosition,
            atIndex,
            slashPosition,
            slashIndex,
          } = walkTreeOnce(editorRef.current, range)

          // Handle @ trigger (takes priority over /)
          if (atIndex !== -1 && atPosition) {
            triggerActive.current = true
            triggerStartIndex.current = atIndex

            // Close slash trigger if active
            if (slashTriggerActive.current) {
              slashTriggerActive.current = false
              slashTriggerStartIndex.current = null
              onCloseSlashTrigger?.()
            }

            const afterAt = textBeforeCursor.slice(atIndex + 1)

            // Get position for dropdown
            // Use cursor position for vertical, parent container left edge for horizontal alignment
            if (range && editorRef.current) {
              const tempRange = document.createRange()
              tempRange.setStart(range.endContainer, range.endOffset)
              tempRange.setEnd(range.endContainer, range.endOffset)
              const cursorRect = tempRange.getBoundingClientRect()

              // Use CURSOR position - menu should appear under cursor, not at text start
              const rect = new DOMRect(
                cursorRect.left,   // Use actual cursor position for horizontal
                cursorRect.top,    // Use cursor top for vertical position
                0,
                cursorRect.height
              )

              onTrigger({ searchText: afterAt, rect })
              return
            }
          }

          // Close @ trigger if no @ found
          if (triggerActive.current) {
            triggerActive.current = false
            triggerStartIndex.current = null
            onCloseTrigger()
          }

          // Handle / trigger (only if @ trigger is not active)
          if (slashIndex !== -1 && slashPosition && onSlashTrigger) {
            slashTriggerActive.current = true
            slashTriggerStartIndex.current = slashIndex

            const afterSlash = textBeforeCursor.slice(slashIndex + 1)

            // Get position for dropdown
            // Use cursor position for vertical, parent container left edge for horizontal alignment
            if (range && editorRef.current) {
              const tempRange = document.createRange()
              tempRange.setStart(range.endContainer, range.endOffset)
              tempRange.setEnd(range.endContainer, range.endOffset)
              const cursorRect = tempRange.getBoundingClientRect()

              // Use CURSOR position - menu should appear under cursor, not at text start
              const rect = new DOMRect(
                cursorRect.left,   // Use actual cursor position for horizontal
                cursorRect.top,    // Use cursor top for vertical position
                0,
                cursorRect.height
              )

              onSlashTrigger({ searchText: afterSlash, rect })
              return
            }
          }

          // Close / trigger if no / found
          if (slashTriggerActive.current) {
            slashTriggerActive.current = false
            slashTriggerStartIndex.current = null
            onCloseSlashTrigger?.()
          }
        }

        // Always use requestAnimationFrame to avoid blocking input rendering
        // This allows the browser to render the typed character first,
        // then detect @ and / triggers in the next frame
        if (triggerDetectionTimeout.current) {
          cancelAnimationFrame(triggerDetectionTimeout.current)
        }
        triggerDetectionTimeout.current = requestAnimationFrame(runTriggerDetection)
      }, [onContentChange, onTrigger, onCloseTrigger, onSlashTrigger, onCloseSlashTrigger, debouncedSaveUndoState])

      // Cleanup on unmount
      useEffect(() => {
        return () => {
          if (triggerDetectionTimeout.current) {
            cancelAnimationFrame(triggerDetectionTimeout.current)
          }
        }
      }, [])

      // Handle keydown
      const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
          // Custom undo (Cmd+Z / Ctrl+Z)
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
            if (undoStack.current.length > 0) {
              e.preventDefault()
              isUndoRedo.current = true

              // Save current state to redo stack
              const currentState = getCurrentState()
              if (currentState) {
                redoStack.current.push(currentState)
              }

              // Restore previous state
              const state = undoStack.current.pop()!
              if (editorRef.current) {
                editorRef.current.innerHTML = state.html
                lastSavedHtml.current = state.html
                restoreCursor(state.cursorOffset)
                const newHasContent = !!editorRef.current.textContent
                setHasContent(newHasContent)
                onContentChange?.(newHasContent)
              }

              isUndoRedo.current = false
              return
            }
          }

          // Custom redo (Cmd+Shift+Z / Ctrl+Shift+Z or Cmd+Y / Ctrl+Y)
          if ((e.metaKey || e.ctrlKey) && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) {
            if (redoStack.current.length > 0) {
              e.preventDefault()
              isUndoRedo.current = true

              // Save current state to undo stack
              const currentState = getCurrentState()
              if (currentState) {
                undoStack.current.push(currentState)
              }

              // Restore redo state
              const state = redoStack.current.pop()!
              if (editorRef.current) {
                editorRef.current.innerHTML = state.html
                lastSavedHtml.current = state.html
                restoreCursor(state.cursorOffset)
                const newHasContent = !!editorRef.current.textContent
                setHasContent(newHasContent)
                onContentChange?.(newHasContent)
              }

              isUndoRedo.current = false
              return
            }
          }

          // Prevent submission during IME composition (e.g., Chinese/Japanese/Korean input)
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            if (triggerActive.current || slashTriggerActive.current) {
              // Let dropdown handle Enter
              return
            }
            e.preventDefault()
            // Opt+Enter = force submit (bypass queue, stop stream and send immediately)
            if (e.altKey && onForceSubmit) {
              onForceSubmit()
            } else {
              onSubmit?.()
            }
          }
          if (e.key === "Escape") {
            // Close mention dropdown
            if (triggerActive.current) {
              e.preventDefault()
              triggerActive.current = false
              triggerStartIndex.current = null
              onCloseTrigger()
              return
            }
            // Close command dropdown
            if (slashTriggerActive.current) {
              e.preventDefault()
              slashTriggerActive.current = false
              slashTriggerStartIndex.current = null
              onCloseSlashTrigger?.()
              return
            }
            // If no dropdown is open, blur the editor (but don't prevent default
            // to allow other handlers like multi-select clear to run)
            editorRef.current?.blur()
          }
          if (e.key === "Tab" && e.shiftKey) {
            e.preventDefault()
            onShiftTab?.()
          }
        },
        [onSubmit, onForceSubmit, onCloseTrigger, onCloseSlashTrigger, onShiftTab, restoreCursor, onContentChange, getCurrentState],
      )

      // Expose methods via ref (UNCONTROLLED pattern)
      useImperativeHandle(
        ref,
        () => ({
          focus: () => {
            const editor = editorRef.current
            if (!editor) return

            editor.focus()

            // Always ensure cursor is visible at end
            const sel = window.getSelection()
            if (sel && sel.rangeCount === 0) {
              sel.selectAllChildren(editor)
              sel.collapseToEnd()
            }
          },

          blur: () => {
            const editor = editorRef.current
            if (!editor) return
            editor.blur()
          },

          // Get serialized value with @[id] tokens
          getValue: () => {
            if (!editorRef.current) return ""
            return serializeContent(editorRef.current)
          },

          // Set content from serialized string
          setValue: (value: string) => {
            if (!editorRef.current) return
            buildContentFromSerialized(editorRef.current, value, resolveMention)
            const newHasContent = !!value
            setHasContent(newHasContent)
            onContentChange?.(newHasContent)

            // Position cursor at the end of content
            if (newHasContent) {
              const sel = window.getSelection()
              if (sel) {
                sel.selectAllChildren(editorRef.current)
                sel.collapseToEnd()
              }
            }
          },

          // Clear editor content
          clear: () => {
            if (!editorRef.current) return
            editorRef.current.innerHTML = ""
            setHasContent(false)
            onContentChange?.(false)
            triggerActive.current = false
            triggerStartIndex.current = null
            slashTriggerActive.current = false
            slashTriggerStartIndex.current = null
          },

          // Clear slash command text after selection (removes /command from input)
          clearSlashCommand: () => {
            if (!editorRef.current || slashTriggerStartIndex.current === null)
              return

            const sel = window.getSelection()
            if (!sel || sel.rangeCount === 0) {
              // Fallback: clear entire editor if we can't find the range
              editorRef.current.innerHTML = ""
              setHasContent(false)
              onContentChange?.(false)
              slashTriggerActive.current = false
              slashTriggerStartIndex.current = null
              onCloseSlashTrigger?.()
              return
            }

            const range = sel.getRangeAt(0)
            const node = range.startContainer

            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent || ""
              // Find local position of / within this text node
              let localSlashPosition: number | null = null
              let serializedCharCount = 0

              const walker = document.createTreeWalker(
                editorRef.current,
                NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
              )
              let walkNode: Node | null = walker.nextNode()

              while (walkNode) {
                if (walkNode === node) {
                  localSlashPosition =
                    slashTriggerStartIndex.current! - serializedCharCount
                  break
                }

                if (walkNode.nodeType === Node.TEXT_NODE) {
                  serializedCharCount += (walkNode.textContent || "").length
                } else if (walkNode.nodeType === Node.ELEMENT_NODE) {
                  const el = walkNode as HTMLElement
                  if (el.hasAttribute("data-mention-id")) {
                    const id = el.getAttribute("data-mention-id") || ""
                    serializedCharCount += `@[${id}]`.length
                    const next: Node | null = el.nextSibling
                    if (next) {
                      walker.currentNode = next
                      walkNode = next
                      continue
                    }
                  }
                }
                walkNode = walker.nextNode()
              }

              // Only proceed if we found the slash position
              if (localSlashPosition === null || localSlashPosition < 0) {
                // Node not found in tree walk - just close the trigger without modifying text
                slashTriggerActive.current = false
                slashTriggerStartIndex.current = null
                onCloseSlashTrigger?.()
                return
              }

              // Remove from / to cursor
              const beforeSlash = text.slice(0, localSlashPosition)
              const afterCursor = text.slice(range.startOffset)
              node.textContent = beforeSlash + afterCursor

              // Move cursor to where / was
              const newRange = document.createRange()
              newRange.setStart(node, localSlashPosition)
              newRange.collapse(true)
              sel.removeAllRanges()
              sel.addRange(newRange)

              // Update hasContent
              const newContent = editorRef.current.textContent
              setHasContent(!!newContent)
              onContentChange?.(!!newContent)
            }

            // Close trigger
            slashTriggerActive.current = false
            slashTriggerStartIndex.current = null
            onCloseSlashTrigger?.()
          },

          insertMention: (option: FileMentionOption) => {
            if (!editorRef.current) return

            // Save state for undo before inserting mention (immediate, not debounced)
            immediateSaveUndoState()

            const sel = window.getSelection()
            const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null

            // Case 1: Triggered by @ - remove @ and search text, then insert mention
            if (
              range &&
              range.startContainer.nodeType === Node.TEXT_NODE &&
              triggerStartIndex.current !== null
            ) {
              const node = range.startContainer
              const text = node.textContent || ""

              // Find local position of @ within THIS text node
              let localAtPosition = 0
              let serializedCharCount = 0

              const walker = document.createTreeWalker(
                editorRef.current,
                NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
              )
              let walkNode: Node | null = walker.nextNode()

              while (walkNode) {
                if (walkNode === node) {
                  localAtPosition =
                    triggerStartIndex.current - serializedCharCount
                  break
                }

                if (walkNode.nodeType === Node.TEXT_NODE) {
                  serializedCharCount += (walkNode.textContent || "").length
                } else if (walkNode.nodeType === Node.ELEMENT_NODE) {
                  const el = walkNode as HTMLElement
                  if (el.hasAttribute("data-mention-id")) {
                    const id = el.getAttribute("data-mention-id") || ""
                    serializedCharCount += `@[${id}]`.length
                    let next: Node | null = el.nextSibling
                    if (next) {
                      walker.currentNode = next
                      walkNode = next
                      continue
                    }
                  }
                }
                walkNode = walker.nextNode()
              }

              const beforeAt = text.slice(0, localAtPosition)
              const afterCursor = text.slice(range.startOffset)
              node.textContent = beforeAt + afterCursor

              // Insert mention node
              const mentionNode = createMentionNode(option)
              const newRange = document.createRange()
              newRange.setStart(node, localAtPosition)
              newRange.collapse(true)
              newRange.insertNode(mentionNode)

              // Add space after and move cursor
              const space = document.createTextNode(" ")
              mentionNode.after(space)
              newRange.setStartAfter(space)
              newRange.collapse(true)
              sel!.removeAllRanges()
              sel!.addRange(newRange)

              // Update hasContent
              setHasContent(true)

              // Close trigger
              triggerActive.current = false
              triggerStartIndex.current = null
              onCloseTrigger()
            }
            // Case 2: Direct insertion (e.g., from sidebar widget, drag & drop)
            else {
              const mentionNode = createMentionNode(option)
              const space = document.createTextNode(" ")

              // Try to insert at current cursor position if it's inside the editor
              const editorEl = editorRef.current
              let inserted = false

              if (range && editorEl.contains(range.startContainer)) {
                range.collapse(false)
                range.insertNode(space)
                range.insertNode(mentionNode)
                inserted = true
              }

              // Fallback: insert at end of the last text/inline content
              if (!inserted) {
                // Find the deepest last child to append inline (avoid new-line from div siblings)
                let target: Node = editorEl
                while (target.lastChild && target.lastChild.nodeType === Node.ELEMENT_NODE) {
                  const el = target.lastChild as HTMLElement
                  if (el.hasAttribute("data-mention-id") || el.tagName === "BR") break
                  target = el
                }
                target.appendChild(mentionNode)
                target.appendChild(space)
              }

              // Move cursor after the space
              const newRange = document.createRange()
              newRange.setStartAfter(space)
              newRange.collapse(true)

              if (sel) {
                sel.removeAllRanges()
                sel.addRange(newRange)
              }

              // Update hasContent
              setHasContent(true)
              onContentChange?.(true)
            }
          },
        }),
        [onCloseTrigger, onCloseSlashTrigger, resolveMention, onContentChange, immediateSaveUndoState],
      )

      return (
        <div className="relative">
          {!hasContent && placeholder && (
            <div className="pointer-events-none absolute left-1 top-1 text-sm text-muted-foreground/60 whitespace-pre-wrap">
              {placeholder}
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            spellCheck={false}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              // Save state for undo before paste (immediate, not debounced)
              immediateSaveUndoState()
              onPaste?.(e)
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            className={cn(
              "min-h-[24px] outline-none whitespace-pre-wrap break-words text-sm relative",
              disabled && "opacity-50 cursor-not-allowed",
              className,
            )}
          />
        </div>
      )
    },
  ),
)
