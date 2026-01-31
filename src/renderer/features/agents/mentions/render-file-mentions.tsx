"use client"

import { createContext, useContext, useMemo } from "react"
import { getFileIconByExtension } from "./agents-file-mention"
import { FilesIcon, SkillIcon, CustomAgentIcon, OriginalMCPIcon } from "../../../components/ui/icons"
import { MENTION_PREFIXES } from "./agents-mentions-editor"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../../components/ui/hover-card"

/**
 * Context for opening files in the file viewer sidebar.
 * Provided by ChatView, consumed by MentionChip.
 */
type FileOpenHandler = (filePath: string) => void
const FileOpenContext = createContext<FileOpenHandler | null>(null)

export function FileOpenProvider({
  onOpenFile,
  children,
}: {
  onOpenFile: FileOpenHandler
  children: React.ReactNode
}) {
  return (
    <FileOpenContext.Provider value={onOpenFile}>
      {children}
    </FileOpenContext.Provider>
  )
}

/**
 * Hook to access the file open handler from any child component.
 * Returns null if not inside a FileOpenProvider.
 */
export function useFileOpen(): FileOpenHandler | null {
  return useContext(FileOpenContext)
}

// UTF-8 safe base64 decoding (atob doesn't support Unicode)
function base64ToUtf8(base64: string): string {
  const binString = atob(base64)
  const bytes = Uint8Array.from(binString, (char) => char.codePointAt(0)!)
  return new TextDecoder().decode(bytes)
}

// Text selection icon - "A" with text cursor
function TextSelectIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M8.50027 4C8.91147 4 9.28067 4.25166 9.43107 4.63435L14.9311 18.6343C15.133 19.1484 14.88 19.7288 14.366 19.9308C13.8519 20.1327 13.2715 19.8797 13.0695 19.3657L11.3545 15H5.64607L3.93107 19.3657C3.72907 19.8797 3.14867 20.1327 2.63462 19.9308C2.12058 19.7288 1.86757 19.1484 2.06952 18.6343L7.56947 4.63435C7.71987 4.25166 8.08907 4 8.50027 4ZM6.43177 13H10.5688L8.50027 7.73484L6.43177 13Z" fill="currentColor"/>
      <path d="M17 2C16.4477 2 16 2.44772 16 3C16 3.55228 16.4477 4 17 4H18V20H17C16.4477 20 16 20.4477 16 21C16 21.5523 16.4477 22 17 22H21C21.5523 22 22 21.5523 22 21C22 20.4477 21.5523 20 21 20H20V4H21C21.5523 4 22 3.55228 22 3C22 2.44772 21.5523 2 21 2H17Z" fill="currentColor"/>
    </svg>
  )
}

// Code selection icon - cursor arrow with text cursor
function CodeSelectIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14 2C13.4477 2 13 2.44772 13 3C13 3.55228 13.4477 4 14 4H15V20H14C13.4477 20 13 20.4477 13 21C13 21.5523 13.4477 22 14 22H18C18.5523 22 19 21.5523 19 21C19 20.4477 18.5523 20 18 20H17V4H18C18.5523 4 19 3.55228 19 3C19 2.44772 18.5523 2 18 2H14Z" fill="currentColor"/>
      <path d="M4.29287 5.29289C4.68338 4.90237 5.31638 4.90237 5.70698 5.29289L11.707 11.2929C12.0974 11.6834 12.0975 12.3165 11.707 12.707L5.70698 18.707C5.31648 19.0975 4.68338 19.0974 4.29287 18.707C3.90237 18.3164 3.90237 17.6834 4.29287 17.2929L9.58587 11.9999L4.29287 6.70696C3.90237 6.31643 3.90237 5.68342 4.29287 5.29289Z" fill="currentColor"/>
    </svg>
  )
}

// Custom folder icon matching design
function FolderOpenIcon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none"
      className={className}
    >
      <path 
        d="M4 8V6C4 4.89543 4.89543 4 6 4H14C15.1046 4 16 4.89543 16 6M4 8H8.17548C8.70591 8 9.21462 8.21071 9.58969 8.58579L11.4181 10.4142C11.7932 10.7893 12.3019 11 12.8323 11H16M4 8C3.44987 8 3.00391 8.44597 3.00391 8.99609V18C3.00391 19.1046 3.89934 20 5.00391 20H19.0039C20.1085 20 21.0039 19.1046 21.0039 18V12.0039C21.0039 11.4495 20.5544 11 20 11M16 11V6M16 11H20M16 6H18C19.1046 6 20 6.89543 20 8V11" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface ParsedMention {
  id: string
  label: string
  path: string
  repository: string
  type: "file" | "folder" | "skill" | "agent" | "tool" | "quote" | "diff" | "pasted"
  // Extra data for quote/diff/pasted mentions
  fullText?: string
  lineNumber?: number
  size?: number // Size in bytes for pasted mentions
}

/**
 * Parse file/folder/skill/agent/tool/quote/diff/pasted mention ID into its components
 * Format: file:owner/repo:path/to/file.tsx or folder:owner/repo:path/to/folder or skill:skill-name or agent:agent-name or tool:servername
 * Quote format: quote:preview_text:full_text (base64 encoded full text)
 * Diff format: diff:filepath:lineNumber:preview_text:full_text (base64 encoded full text)
 * Pasted format: pasted:filepath:size:preview_text
 */
function parseMention(id: string): ParsedMention | null {
  const isFile = id.startsWith(MENTION_PREFIXES.FILE)
  const isFolder = id.startsWith(MENTION_PREFIXES.FOLDER)
  const isSkill = id.startsWith(MENTION_PREFIXES.SKILL)
  const isAgent = id.startsWith(MENTION_PREFIXES.AGENT)
  const isTool = id.startsWith(MENTION_PREFIXES.TOOL)
  const isQuote = id.startsWith(MENTION_PREFIXES.QUOTE)
  const isDiff = id.startsWith(MENTION_PREFIXES.DIFF)
  const isPasted = id.startsWith(MENTION_PREFIXES.PASTED)

  if (!isFile && !isFolder && !isSkill && !isAgent && !isTool && !isQuote && !isDiff && !isPasted) return null

  // Handle quote mentions (format: quote:preview_text:base64_full_text)
  if (isQuote) {
    const content = id.slice(MENTION_PREFIXES.QUOTE.length)
    const separatorIdx = content.indexOf(":")
    if (separatorIdx === -1) {
      // Simple format without full text
      return {
        id,
        label: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
        path: "",
        repository: "",
        type: "quote",
        fullText: content,
      }
    }
    const preview = content.slice(0, separatorIdx)
    const encodedText = content.slice(separatorIdx + 1)
    let fullText = preview
    try {
      fullText = base64ToUtf8(encodedText)
    } catch {
      fullText = preview
    }
    return {
      id,
      label: preview,
      path: "",
      repository: "",
      type: "quote",
      fullText,
    }
  }

  // Handle diff mentions (format: diff:filepath:lineNumber:preview_text:base64_full_text)
  if (isDiff) {
    const content = id.slice(MENTION_PREFIXES.DIFF.length)
    const parts = content.split(":")
    if (parts.length < 3) return null

    const filePath = parts[0] || ""
    const lineNumber = parseInt(parts[1] || "0", 10) || undefined
    const preview = parts[2] || ""
    const encodedText = parts.slice(3).join(":") // Handle colons in base64

    let fullText = preview
    try {
      if (encodedText) {
        fullText = base64ToUtf8(encodedText)
      }
    } catch {
      fullText = preview
    }

    const fileName = filePath.split("/").pop() || filePath
    const lineInfo = lineNumber ? `:${lineNumber}` : ""

    return {
      id,
      label: `${fileName}${lineInfo}`,
      path: filePath,
      repository: "",
      type: "diff",
      fullText,
      lineNumber,
    }
  }

  // Handle pasted mentions (format: pasted:size:preview|filepath)
  // Using | as separator between preview and filepath since filepath can contain colons
  if (isPasted) {
    const content = id.slice(MENTION_PREFIXES.PASTED.length)
    const pipeIndex = content.lastIndexOf("|")
    if (pipeIndex === -1) return null

    const beforePipe = content.slice(0, pipeIndex)
    const filePath = content.slice(pipeIndex + 1)

    const colonIndex = beforePipe.indexOf(":")
    if (colonIndex === -1) return null

    const size = parseInt(beforePipe.slice(0, colonIndex) || "0", 10)
    const preview = beforePipe.slice(colonIndex + 1)

    return {
      id,
      label: preview,
      path: filePath,
      repository: "",
      type: "pasted",
      size,
    }
  }

  // Handle skill mentions (simpler format: skill:name)
  if (isSkill) {
    const skillName = id.slice(MENTION_PREFIXES.SKILL.length)
    return {
      id,
      label: skillName,
      path: "",
      repository: "",
      type: "skill",
    }
  }

  // Handle agent mentions (simpler format: agent:name)
  if (isAgent) {
    const agentName = id.slice(MENTION_PREFIXES.AGENT.length)
    return {
      id,
      label: agentName,
      path: "",
      repository: "",
      type: "agent",
    }
  }

  // Handle tool mentions: tool:servername (MCP server) or tool:mcp__server__toolname (individual tool)
  if (isTool) {
    const toolPath = id.slice(MENTION_PREFIXES.TOOL.length)
    if (toolPath.startsWith("mcp__")) {
      const parts = toolPath.split("__")
      const toolName = parts.length >= 3 ? parts.slice(2).join("__") : toolPath
      const displayName = toolName
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim()
      return {
        id,
        label: displayName,
        path: toolPath,
        repository: "",
        type: "tool",
      }
    }
    return {
      id,
      label: toolPath,
      path: toolPath,
      repository: "",
      type: "tool",
    }
  }

  const parts = id.split(":")
  if (parts.length < 3) return null

  const type = parts[0] as "file" | "folder"
  const repository = parts[1]
  const path = parts.slice(2).join(":") // Handle paths with colons
  const name = path.split("/").pop() || path

  return {
    id,
    label: name,
    path,
    repository,
    type,
  }
}

/**
 * Component to render a single file/folder/skill/agent/tool/quote/diff mention chip (matching canvas style)
 */
function MentionChip({ mention }: { mention: ParsedMention }) {
  // Quote and diff mentions render as block cards
  if (mention.type === "quote") {
    // Get a short title from the label
    const title = mention.label.split('\n')[0]?.slice(0, 20) || mention.label.slice(0, 20)
    const displayTitle = title.length < mention.label.length ? `${title}...` : title

    return (
      <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 cursor-default min-w-[120px] max-w-[200px] align-middle">
        {/* Icon container */}
        <span className="flex items-center justify-center size-8 rounded-md bg-muted shrink-0">
          <TextSelectIcon className="size-4 text-muted-foreground" />
        </span>
        {/* Text content */}
        <span className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {displayTitle}
          </span>
          <span className="text-xs text-muted-foreground">
            Selected Text
          </span>
        </span>
      </span>
    )
  }

  if (mention.type === "diff") {
    const fileName = mention.path.split("/").pop() || mention.path

    return (
      <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 cursor-default min-w-[120px] max-w-[200px] align-middle">
        {/* Icon container */}
        <span className="flex items-center justify-center size-8 rounded-md bg-muted shrink-0">
          <CodeSelectIcon className="size-4 text-muted-foreground" />
        </span>
        {/* Text content */}
        <span className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {fileName}
          </span>
          <span className="text-xs text-muted-foreground">
            {mention.lineNumber ? `Line ${mention.lineNumber}` : "Code selection"}
          </span>
        </span>
      </span>
    )
  }

  const onOpenFile = useContext(FileOpenContext)
  const isClickable = (mention.type === "file" || mention.type === "folder") && !!onOpenFile

  const Icon = mention.type === "skill"
    ? SkillIcon
    : mention.type === "agent"
      ? CustomAgentIcon
      : mention.type === "tool"
        ? OriginalMCPIcon
        : mention.type === "folder"
          ? FolderOpenIcon
          : (getFileIconByExtension(mention.label) ?? FilesIcon)

  const title = mention.type === "skill"
    ? `Skill: ${mention.label}`
    : mention.type === "agent"
      ? `Agent: ${mention.label}`
      : mention.type === "tool"
        ? `MCP Tool: ${mention.path}`
        : `${mention.repository}:${mention.path}`

  return (
    <span
      className={`inline-flex items-center gap-1 px-[6px] rounded-[6px] text-sm align-middle bg-black/[0.04] dark:bg-white/[0.08] text-foreground/80 select-none${isClickable ? " cursor-pointer hover:bg-black/[0.08] dark:hover:bg-white/[0.12] transition-colors" : ""}`}
      title={title}
      onClick={isClickable ? () => onOpenFile(mention.path) : undefined}
    >
      <Icon className={mention.type === "tool" ? "h-3.5 w-3.5 text-muted-foreground flex-shrink-0" : "h-3 w-3 text-muted-foreground flex-shrink-0"} />
      <span>{mention.label}</span>
    </span>
  )
}

/**
 * Render text with ultrathink highlighting
 */
function renderTextWithUltrathink(text: string): React.ReactNode {
  const parts = text.split(/(ultrathink)/gi)
  if (parts.length === 1) return text

  return parts.map((part, index) => {
    if (part.toLowerCase() === "ultrathink") {
      return (
        <span key={index} className="chroma-text chroma-text-animate">
          {part}
        </span>
      )
    }
    return part
  })
}

/**
 * Hook to render text with file/folder mentions and ultrathink highlighting
 * Returns array of React nodes with mentions rendered as chips
 */
export function useRenderFileMentions(text: string): React.ReactNode[] {
  return useMemo(() => {
    const nodes: React.ReactNode[] = []
    const regex = /@\[([^\]]+)\]/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    let key = 0

    while ((match = regex.exec(text)) !== null) {
      // Add text before mention (with ultrathink highlighting)
      if (match.index > lastIndex) {
        nodes.push(
          <span key={`text-${key++}`}>
            {renderTextWithUltrathink(text.slice(lastIndex, match.index))}
          </span>,
        )
      }

      const id = match[1]
      const mention = parseMention(id)

      if (mention) {
        nodes.push(<MentionChip key={`mention-${key++}`} mention={mention} />)
      } else {
        // Fallback: show as plain text if not a valid mention
        nodes.push(<span key={`unknown-${key++}`}>{match[0]}</span>)
      }

      lastIndex = match.index + match[0].length
    }

    // Add remaining text (with ultrathink highlighting)
    if (lastIndex < text.length) {
      nodes.push(
        <span key={`text-end-${key}`}>
          {renderTextWithUltrathink(text.slice(lastIndex))}
        </span>
      )
    }

    return nodes
  }, [text])
}

/**
 * Component to render text with file mentions
 */
export function RenderFileMentions({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const nodes = useRenderFileMentions(text)
  return <span className={className}>{nodes}</span>
}

/**
 * Extract all file/folder mentions from text
 * Returns array of parsed mentions
 */
export function extractFileMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = []
  const regex = /@\[([^\]]+)\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const mention = parseMention(match[1])
    if (mention) {
      mentions.push(mention)
    }
  }

  return mentions
}

/**
 * Check if text contains any file, folder, skill, agent, tool, quote, diff, or pasted mentions
 */
export function hasFileMentions(text: string): boolean {
  return /@\[(file|folder|skill|agent|tool|quote|diff|pasted):[^\]]+\]/.test(text)
}

/**
 * Extract quote/diff/pasted mentions from text and return them separately with cleaned text
 * Used for rendering these mentions as blocks above the message bubble
 */
export function extractTextMentions(text: string): {
  textMentions: ParsedMention[]
  cleanedText: string
} {
  const textMentions: ParsedMention[] = []
  let cleanedText = text

  const regex = /@\[([^\]]+)\]/g
  let match: RegExpExecArray | null
  const mentionsToRemove: string[] = []

  while ((match = regex.exec(text)) !== null) {
    const id = match[1]
    if (
      id.startsWith(MENTION_PREFIXES.QUOTE) ||
      id.startsWith(MENTION_PREFIXES.DIFF) ||
      id.startsWith(MENTION_PREFIXES.PASTED)
    ) {
      const parsed = parseMention(id)
      if (parsed) {
        textMentions.push(parsed)
        mentionsToRemove.push(match[0])
      }
    }
  }

  // Remove the mentions from text
  for (const mentionStr of mentionsToRemove) {
    cleanedText = cleanedText.replace(mentionStr, "")
  }

  // Clean up extra whitespace but preserve newlines
  // Only collapse multiple spaces (not newlines) into one space
  // and trim leading/trailing whitespace from each line
  cleanedText = cleanedText
    .split("\n")
    .map(line => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n") // Collapse 3+ newlines to 2
    .trim()

  return { textMentions, cleanedText }
}

/**
 * Format bytes to human readable size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/**
 * Component to render a single text mention block (quote/diff/pasted)
 * Used for displaying above message bubbles, not inline
 */
export function TextMentionBlock({ mention }: { mention: ParsedMention }) {
  if (mention.type !== "quote" && mention.type !== "diff" && mention.type !== "pasted") return null

  const displayTitle = mention.type === "quote"
    ? (mention.label.split('\n')[0]?.slice(0, 20) || mention.label.slice(0, 20))
    : mention.type === "pasted"
      ? (mention.label.split('\n')[0]?.slice(0, 20) || mention.label.slice(0, 20))
      : (mention.path?.split("/").pop() || "Code")

  const title = displayTitle.length < 20 ? displayTitle : `${displayTitle}...`

  const subtitle = mention.type === "quote"
    ? "Selected Text"
    : mention.type === "pasted"
      ? `Pasted Text · ${formatSize(mention.size || 0)}`
      : mention.lineNumber
        ? `Line ${mention.lineNumber}`
        : "Code selection"

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 cursor-default min-w-[120px] max-w-[200px]">
          {/* Icon container */}
          <div className="flex items-center justify-center size-8 rounded-md bg-muted shrink-0">
            {mention.type === "quote" || mention.type === "pasted" ? (
              <TextSelectIcon className="size-4 text-muted-foreground" />
            ) : (
              <CodeSelectIcon className="size-4 text-muted-foreground" />
            )}
          </div>

          {/* Text content */}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-foreground truncate">
              {title}
            </span>
            <span className="text-xs text-muted-foreground">
              {subtitle}
            </span>
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        className="w-80 max-h-48 overflow-y-auto"
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {mention.type === "quote" || mention.type === "pasted" ? (
              <TextSelectIcon className="size-3" />
            ) : (
              <CodeSelectIcon className="size-3" />
            )}
            <span>
              {mention.type === "quote"
                ? "Selected text"
                : mention.type === "pasted"
                  ? `Pasted text · ${formatSize(mention.size || 0)}`
                  : `${mention.path}${mention.lineNumber ? `:${mention.lineNumber}` : ""}`}
            </span>
          </div>
          <pre className="text-sm whitespace-pre-wrap break-words font-mono">
            {mention.fullText || mention.label}
          </pre>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

/**
 * Component to render multiple text mention blocks
 */
export function TextMentionBlocks({ mentions }: { mentions: ParsedMention[] }) {
  const textMentions = mentions.filter(m => m.type === "quote" || m.type === "diff" || m.type === "pasted")
  if (textMentions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {textMentions.map((mention, idx) => (
        <TextMentionBlock key={idx} mention={mention} />
      ))}
    </div>
  )
}
