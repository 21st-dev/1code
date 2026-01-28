import { toast } from "sonner"
import {
  hasCodeBlocks,
  parseCodeBlocks,
  looksLikeCode,
  detectLanguage,
} from "./parse-user-code-blocks"
import { createCodeBlockNode } from "../mentions/agents-mentions-editor"

// Threshold for auto-converting large pasted text to a file (5KB)
// Text larger than this will be saved as a file attachment instead of pasted inline
export const LARGE_PASTE_THRESHOLD = 5_000

// Maximum characters allowed for paste (10KB of text)
// ContentEditable elements become extremely slow with large text content,
// causing browser/system freeze. 50KB still causes noticeable lag on some systems.
// For larger content, users should attach it as a file instead.
const MAX_PASTE_LENGTH = 10_000

// Threshold for showing "very large" warning (1MB+)
const VERY_LARGE_THRESHOLD = 1_000_000

// Callback type for adding large pasted text as a file
export type AddPastedTextFn = (text: string) => Promise<void>

/**
 * Insert text at the current cursor position in a contentEditable element.
 * Truncates large text to prevent browser freeze.
 * Also accounts for existing content to prevent total size from exceeding limit.
 * Uses execCommand to preserve browser's undo history.
 *
 * @param text - The text to insert
 * @param editableElement - The contentEditable element (used for size calculation)
 */
export function insertTextAtCursor(text: string, editableElement: Element): void {
  // Check existing content size to prevent exceeding total limit
  const existingLength = editableElement?.textContent?.length || 0
  const availableSpace = Math.max(0, MAX_PASTE_LENGTH - existingLength)

  // Truncate based on available space (not just paste size)
  let textToInsert = text
  const effectiveLimit = Math.min(text.length, availableSpace)

  if (text.length > effectiveLimit) {
    textToInsert = text.slice(0, effectiveLimit)
    // Show toast warning to user
    const originalKB = Math.round(text.length / 1024)

    if (availableSpace === 0) {
      // No space left at all
      toast.warning("Cannot paste: input is full", {
        description: "Please clear some text or attach content as a file instead.",
      })
      return
    } else if (text.length > VERY_LARGE_THRESHOLD) {
      const originalMB = (text.length / 1_000_000).toFixed(1)
      toast.warning(`Text truncated`, {
        description: `Original text was ${originalMB}MB. Please attach as a file instead.`,
      })
    } else {
      const truncatedKB = Math.round(effectiveLimit / 1024)
      toast.warning(`Text truncated to ${truncatedKB}KB`, {
        description: `Original text was ${originalKB}KB. Consider attaching as a file instead.`,
      })
    }
  }

  // Insert using execCommand to preserve undo history
  // execCommand is deprecated but it's the only way to properly integrate with
  // the browser's undo stack in contenteditable elements
  // eslint-disable-next-line deprecation/deprecation
  document.execCommand("insertText", false, textToInsert)
}

/**
 * Insert a code block element at the current cursor position, or append
 * to the editable element if no selection is available.
 */
function insertCodeBlockAtCursor(
  editableElement: Element,
  language: string,
  content: string,
): void {
  const codeBlockEl = createCodeBlockNode(language, content)
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(codeBlockEl)

    const newRange = document.createRange()
    newRange.setStartAfter(codeBlockEl)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
  } else {
    editableElement.appendChild(codeBlockEl)
  }
}

/**
 * Check if clipboard HTML indicates text was copied from a code editor
 * (VS Code, IntelliJ, Sublime, etc.) by looking for monospace fonts and
 * syntax-highlighted spans in the HTML representation.
 */
function isPastedFromCodeEditor(clipboardData: DataTransfer): boolean {
  const html = clipboardData.getData("text/html")
  if (!html) return false

  // VS Code specific data attributes
  if (/data-vscode/i.test(html)) return true

  // Monospace font-family used by code editors
  const hasMonospaceFont =
    /font-family:[^;]*(?:monospace|Consolas|Menlo|Monaco|Courier|SFMono|"Fira Code"|"JetBrains Mono"|"Source Code Pro"|Inconsolata)/i.test(
      html,
    )

  // Multiple colored spans = syntax highlighting
  const coloredSpans = (html.match(/<span[^>]*style="[^"]*color:/g) || []).length

  return hasMonospaceFont && coloredSpans >= 2
}

/**
 * Check if the cursor is positioned right after an opening code fence (```lang).
 * If found, removes the fence text from the DOM and returns the language.
 * Returns null if no opening fence is found before the cursor.
 *
 * This handles the case where a user types ```php then pastes code —
 * we consume the fence and use its language for the code block.
 */
function consumeOpenFence(editableElement: Element): string | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return null

  // Get all text from start of editor to cursor
  const preRange = document.createRange()
  preRange.selectNodeContents(editableElement)
  preRange.setEnd(range.startContainer, range.startOffset)
  const textBefore = preRange.toString()

  // Check for opening fence at end: ``` with optional language and trailing whitespace/newline
  const fenceMatch = textBefore.match(/```(\w*)[\t ]*\n?$/)
  if (!fenceMatch) return null

  const language = fenceMatch[1] || ""
  const charsToDelete = fenceMatch[0].length

  // Delete the fence by extending selection backwards and deleting
  for (let i = 0; i < charsToDelete; i++) {
    sel.modify("extend", "backward", "character")
  }
  if (!sel.isCollapsed) {
    document.execCommand("delete", false)
  }

  return language
}

/**
 * Handle paste event for contentEditable elements.
 * Extracts images and passes them to handleAddAttachments.
 * For large text (>LARGE_PASTE_THRESHOLD), saves as a file attachment.
 * For smaller text, pastes as plain text only (prevents HTML).
 *
 * @param e - The clipboard event
 * @param handleAddAttachments - Callback to handle image attachments
 * @param addPastedText - Optional callback to save large text as a file
 */
export function handlePasteEvent(
  e: React.ClipboardEvent,
  handleAddAttachments: (files: File[]) => void,
  addPastedText?: AddPastedTextFn,
): void {
  const files = Array.from(e.clipboardData.items)
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean) as File[]

  if (files.length > 0) {
    e.preventDefault()
    handleAddAttachments(files)
  } else {
    // Paste as plain text only (prevents HTML from being pasted)
    const text = e.clipboardData.getData("text/plain")
    if (text) {
      e.preventDefault()

      // Large text: save as file attachment instead of pasting inline
      if (text.length > LARGE_PASTE_THRESHOLD && addPastedText) {
        addPastedText(text)
        return
      }

      // Get the contentEditable element
      const target = e.currentTarget as HTMLElement
      const editableElement =
        target.closest('[contenteditable="true"]') || target

      // Check if the user already typed an opening fence (```lang) before pasting.
      // If so, consume the fence and always create a code block with that language.
      const fenceLanguage = consumeOpenFence(editableElement)
      if (fenceLanguage !== null) {
        const language = fenceLanguage || detectLanguage(text)
        insertCodeBlockAtCursor(editableElement, language, text)
        editableElement.dispatchEvent(new Event("input", { bubbles: true }))
        return
      }

      // Check for fenced code blocks in pasted text
      if (hasCodeBlocks(text)) {
        const segments = parseCodeBlocks(text)
        insertSegmentsAtCursor(segments, editableElement, addPastedText)
        return
      }

      // Auto-detect code: first check if pasted from a code editor (VS Code, etc.),
      // then fall back to heuristic text analysis
      const fromEditor = isPastedFromCodeEditor(e.clipboardData)
      const codeDetection = fromEditor
        ? { isCode: true, language: detectLanguage(text) }
        : looksLikeCode(text)
      if (codeDetection.isCode) {
        // Large auto-detected code: convert to file attachment if possible
        if (text.length > LARGE_PASTE_THRESHOLD && addPastedText) {
          addPastedText(text)
          return
        }
        insertCodeBlockAtCursor(editableElement, codeDetection.language, text)
        editableElement.dispatchEvent(new Event("input", { bubbles: true }))
        return
      }

      insertTextAtCursor(text, editableElement)
    }
  }
}

/**
 * Insert parsed segments (text + code blocks) at the current cursor position.
 * Text segments are inserted via execCommand, code blocks are inserted as DOM elements.
 */
function insertSegmentsAtCursor(
  segments: ReturnType<typeof parseCodeBlocks>,
  editableElement: Element,
  addPastedText?: AddPastedTextFn,
): void {
  let insertedCodeBlock = false

  for (const segment of segments) {
    if (segment.type === "text") {
      if (segment.content) {
        insertTextAtCursor(segment.content, editableElement)
      }
    } else {
      // Code block segment
      // If the code block is too large, convert to file attachment
      if (segment.content.length > LARGE_PASTE_THRESHOLD && addPastedText) {
        const fileContent = "```" + segment.language + "\n" + segment.content + "\n```"
        addPastedText(fileContent)
        continue
      }

      // Insert code block element at cursor position
      insertCodeBlockAtCursor(editableElement, segment.language, segment.content)
      insertedCodeBlock = true
    }
  }

  // Only dispatch manual input event if code block elements were inserted
  // (text segments already fire input events via execCommand)
  if (insertedCodeBlock) {
    editableElement.dispatchEvent(new Event("input", { bubbles: true }))
  }
}
