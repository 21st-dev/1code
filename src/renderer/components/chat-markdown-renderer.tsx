import { cn } from "../lib/utils"
import { memo, useMemo, useState, useCallback, useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import { Copy, Check } from "lucide-react"
import { useCodeTheme } from "../lib/hooks/use-code-theme"
import { highlightCode } from "../lib/themes/shiki-theme-loader"
import { marked } from "marked"

// Removed react-syntax-highlighter themes - now using Shiki with VS Code themes

// Function to strip emojis from text (only common emojis, preserving markdown symbols)
export function stripEmojis(text: string): string {
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "") // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "") // Misc Symbols and Pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "") // Transport and Map
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "") // Flags
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "") // Supplemental Symbols
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, "") // Extended-A
    .replace(/[\u{2700}-\u{27BF}]/gu, "") // Dingbats
}

// Function to fix numbered list items that have line breaks after the number
// Converts "1.\n\nText" or "1.\n  \nText" to "1. Text"
function fixNumberedListBreaks(text: string): string {
  return text.replace(/^(\d+)\.\s*\n+\s*\n*/gm, "$1. ")
}

// Function to fix malformed bold/italic markdown where there's a space after opening markers
// Converts "** text**" to "**text**" and "* text*" to "*text*"
function fixMalformedEmphasis(text: string): string {
  // Fix bold: "** text**" -> "**text**"
  // Use " +" (spaces only) not "\s+" to avoid matching newlines
  // Also require text to start with non-space to ensure we're at the START of bold content
  let fixed = text.replace(/\*\* +([^\n*]+?)\*\*/g, "**$1**")
  // Fix italic: "* text*" -> "*text*" (but not inside bold)
  fixed = fixed.replace(/(?<!\*)\* +([^\n*]+?)\*(?!\*)/g, "*$1*")
  return fixed
}

// Escape HTML special characters for safe rendering
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

// Code block text sizes matching paragraph text sizes
const codeBlockTextSize = {
  sm: "text-sm",  // 14px - matches p text
  md: "text-sm",  // 14px - matches p text
  lg: "text-sm",  // 14px - matches p text
}

// Code block with copy button using Shiki
function CodeBlock({
  language,
  children,
  themeId,
  size = "md",
}: {
  language?: string
  children: string
  themeId: string
  size?: "sm" | "md" | "lg"
}) {
  const [copied, setCopied] = useState(false)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [children])

  // Only use Shiki for known programming languages, not for plaintext/ASCII art
  const shouldHighlight = language && language !== "plaintext" && language !== "text"

  useEffect(() => {
    if (!shouldHighlight) return

    let cancelled = false

    const highlight = async () => {
      try {
        const html = await highlightCode(children, language, themeId)
        if (!cancelled) {
          setHighlightedHtml(html)
        }
      } catch (error) {
        console.error("Failed to highlight code:", error)
      }
    }

    highlight()

    return () => {
      cancelled = true
    }
  }, [children, language, themeId, shouldHighlight])

  // For plaintext/ASCII art, just escape and render directly (no Shiki)
  // For code with syntax highlighting, use Shiki output when available
  const htmlContent = shouldHighlight
    ? (highlightedHtml ?? escapeHtml(children))
    : escapeHtml(children)

  return (
    <div className="relative mt-2 mb-4 rounded-[10px] bg-muted/50 overflow-hidden">
      <button
        onClick={handleCopy}
        tabIndex={-1}
        className="absolute top-[6px] right-[6px] p-1 z-10"
        title={copied ? "Copied!" : "Copy code"}
      >
        <div className="relative w-3.5 h-3.5">
          <Copy
            className={cn(
              "absolute inset-0 w-3 h-3 text-muted-foreground transition-[opacity,transform] duration-200 ease-out hover:text-foreground",
              copied ? "opacity-0 scale-50" : "opacity-100 scale-100",
            )}
          />
          <Check
            className={cn(
              "absolute inset-0 w-3 h-3 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
              copied ? "opacity-100 scale-100" : "opacity-0 scale-50",
            )}
          />
        </div>
      </button>
      <pre
        className={cn(
          "m-0 bg-transparent",
          "text-foreground",
          codeBlockTextSize[size],
          "px-4 py-3",
          "overflow-x-auto",
          "whitespace-pre",
          // Force all nested elements to preserve whitespace and have no background
          "[&_*]:whitespace-pre [&_*]:bg-transparent",
          "[&_pre]:m-0 [&_code]:m-0",
          "[&_pre]:p-0 [&_code]:p-0",
        )}
        style={{
          fontFamily: "SFMono-Regular, Menlo, Consolas, 'PT Mono', 'Liberation Mono', Courier, monospace",
          lineHeight: 1.5,
          tabSize: 2,
        }}
      >
        <code dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </pre>
    </div>
  )
}

type MarkdownSize = "sm" | "md" | "lg"

interface ChatMarkdownRendererProps {
  content: string
  /** Size variant: sm for compact views, md for normal, lg for fullscreen */
  size?: MarkdownSize
  /** Additional className for the wrapper */
  className?: string
  /** Whether to enable syntax highlighting (default: true) */
  syntaxHighlight?: boolean
  /** Whether content is being streamed - enables throttling for better FPS */
  isStreaming?: boolean
  /** Callback when a localhost URL is clicked (opens preview) */
  onUrlClick?: (url: string) => void
}

// Size-based styles inspired by Notion's spacing
// Key principles:
// - Minimal margin-bottom (elements "breathe" via padding)
// - Larger margin-top on headings creates visual sections
// - line-height: 1.5 for body, 1.3 for headings
const sizeStyles: Record<
  MarkdownSize,
  {
    h1: string
    h2: string
    h3: string
    h4: string
    h5: string
    h6: string
    p: string
    ul: string
    ol: string
    li: string
    inlineCode: string
    blockquote: string
    hr: string
    table: string
    thead: string
    tbody: string
    tr: string
    th: string
    td: string
  }
> = {
  sm: {
    // Compact variant for sidebar/compact views
    h1: "text-base font-semibold text-foreground mt-[1.4em] mb-px first:mt-0 leading-[1.3]",
    h2: "text-base font-semibold text-foreground mt-[1.4em] mb-px first:mt-0 leading-[1.3]",
    h3: "text-sm font-semibold text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    h4: "text-sm font-medium text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    h5: "text-sm font-medium text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    h6: "text-sm font-medium text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    p: "text-sm text-foreground/80 my-px leading-normal py-[3px]",
    ul: "list-disc list-inside text-sm text-foreground/80 mb-px marker:text-foreground/60",
    ol: "list-decimal list-inside text-sm text-foreground/80 mb-px marker:text-foreground/60",
    li: "text-sm text-foreground/80 py-[3px]",
    inlineCode:
      "bg-foreground/[0.06] dark:bg-foreground/[0.1] font-mono text-[85%] rounded px-[0.4em] py-[0.2em] break-all",
    blockquote:
      "border-l-2 border-foreground/20 pl-3 text-foreground/70 mb-px text-sm",
    hr: "mt-8 mb-4 border-t border-border",
    table: "w-full text-sm",
    thead: "border-b border-border",
    tbody: "",
    tr: "[&:not(:last-child)]:border-b [&:not(:last-child)]:border-border",
    th: "text-left text-sm font-medium text-foreground px-3 py-2 bg-muted/50 border-r border-border last:border-r-0",
    td: "text-sm text-foreground/80 px-3 py-2 border-r border-border last:border-r-0",
  },
  md: {
    // Default variant - matches Notion spacing
    h1: "text-[1.5em] font-semibold text-foreground mt-[1.4em] mb-px first:mt-0 leading-[1.3]",
    h2: "text-[1.5em] font-semibold text-foreground mt-[1.4em] mb-px first:mt-0 leading-[1.3]",
    h3: "text-[1.25em] font-semibold text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    h4: "text-base font-semibold text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    h5: "text-sm font-medium text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    h6: "text-sm font-medium text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    p: "text-sm text-foreground/80 my-px leading-normal py-[3px]",
    ul: "list-disc list-inside text-sm text-foreground/80 mb-px marker:text-foreground/60",
    ol: "list-decimal list-inside text-sm text-foreground/80 mb-px marker:text-foreground/60",
    li: "text-sm text-foreground/80 py-[3px]",
    inlineCode:
      "bg-foreground/[0.06] dark:bg-foreground/[0.1] font-mono text-[85%] rounded px-[0.4em] py-[0.2em] break-all",
    blockquote:
      "border-l-2 border-foreground/20 pl-4 text-foreground/70 mb-px",
    hr: "mt-8 mb-4 border-t border-border",
    table: "w-full text-sm",
    thead: "border-b border-border",
    tbody: "",
    tr: "[&:not(:last-child)]:border-b [&:not(:last-child)]:border-border",
    th: "text-left text-sm font-medium text-foreground px-3 py-2 bg-muted/50 border-r border-border last:border-r-0",
    td: "text-sm text-foreground/80 px-3 py-2 border-r border-border last:border-r-0",
  },
  lg: {
    // Fullscreen/large variant
    h1: "text-[1.875em] font-semibold text-foreground mt-[1.4em] mb-px first:mt-0 leading-[1.3]",
    h2: "text-[1.5em] font-semibold text-foreground mt-[1.4em] mb-px first:mt-0 leading-[1.3]",
    h3: "text-[1.25em] font-semibold text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    h4: "text-base font-semibold text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    h5: "text-sm font-medium text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    h6: "text-sm font-medium text-foreground mt-[1em] mb-px first:mt-0 leading-[1.3]",
    p: "text-sm text-foreground/80 my-px leading-normal py-[3px]",
    ul: "list-disc list-inside text-sm text-foreground/80 mb-px marker:text-foreground/60",
    ol: "list-decimal list-inside text-sm text-foreground/80 mb-px marker:text-foreground/60",
    li: "text-sm text-foreground/80 py-[3px]",
    inlineCode:
      "bg-foreground/[0.06] dark:bg-foreground/[0.1] font-mono text-[85%] rounded px-[0.4em] py-[0.2em] break-all",
    blockquote:
      "border-l-2 border-foreground/20 pl-4 text-foreground/70 mb-px",
    hr: "mt-8 mb-4 border-t border-border",
    table: "w-full text-sm",
    thead: "border-b border-border",
    tbody: "",
    tr: "[&:not(:last-child)]:border-b [&:not(:last-child)]:border-border",
    th: "text-left text-sm font-medium text-foreground px-3 py-2 bg-muted/50 border-r border-border last:border-r-0",
    td: "text-sm text-foreground/80 px-3 py-2 border-r border-border last:border-r-0",
  },
}

export const ChatMarkdownRenderer = memo(function ChatMarkdownRenderer({
  content,
  size = "md",
  className,
  syntaxHighlight = true,
  isStreaming = false,
  onUrlClick,
}: ChatMarkdownRendererProps) {
  const codeTheme = useCodeTheme()
  const styles = sizeStyles[size]

  // Throttle content updates during streaming for better FPS
  // Only update rendered content every 150ms during streaming
  const [throttledContent, setThrottledContent] = useState(content)
  const lastUpdateRef = useRef<number>(0)

  useEffect(() => {
    if (!isStreaming) {
      // Not streaming - update immediately
      setThrottledContent(content)
      return
    }

    const now = Date.now()
    const timeSinceLastUpdate = now - lastUpdateRef.current

    // Throttle to ~7 updates per second (150ms intervals) during streaming
    if (timeSinceLastUpdate >= 150) {
      lastUpdateRef.current = now
      setThrottledContent(content)
    } else {
      // Schedule update for remaining time
      const timer = setTimeout(() => {
        lastUpdateRef.current = Date.now()
        setThrottledContent(content)
      }, 150 - timeSinceLastUpdate)
      return () => clearTimeout(timer)
    }
  }, [content, isStreaming])

  // Memoize processed content to avoid re-processing on every render
  const processedContent = useMemo(
    () => fixMalformedEmphasis(fixNumberedListBreaks(stripEmojis(throttledContent))),
    [throttledContent]
  )

  const components = useMemo(
    () => ({
      h1: ({ children, ...props }: any) => (
        <h1 className={styles.h1} {...props}>
          {children}
        </h1>
      ),
      h2: ({ children, ...props }: any) => (
        <h2 className={styles.h2} {...props}>
          {children}
        </h2>
      ),
      h3: ({ children, ...props }: any) => (
        <h3 className={styles.h3} {...props}>
          {children}
        </h3>
      ),
      h4: ({ children, ...props }: any) => (
        <h4 className={styles.h4} {...props}>
          {children}
        </h4>
      ),
      h5: ({ children, ...props }: any) => (
        <h5 className={styles.h5} {...props}>
          {children}
        </h5>
      ),
      h6: ({ children, ...props }: any) => (
        <h6 className={styles.h6} {...props}>
          {children}
        </h6>
      ),
      p: ({ children, ...props }: any) => (
        <p className={styles.p} {...props}>
          {children}
        </p>
      ),
      ul: ({ children, ...props }: any) => (
        <ul className={styles.ul} {...props}>
          {children}
        </ul>
      ),
      ol: ({ children, ...props }: any) => (
        <ol className={styles.ol} {...props}>
          {children}
        </ol>
      ),
      li: ({ children, ...props }: any) => (
        <li className={styles.li} {...props}>
          {children}
        </li>
      ),
      a: ({ href, children, ...props }: any) => {
        // Detect localhost/dev server URLs
        const isLocalhost = href && (
          href.includes('localhost') ||
          href.includes('127.0.0.1') ||
          /:\d{4,5}/.test(href) // URLs with port numbers (e.g., :3000, :8080)
        )

        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              if (href) {
                // If localhost URL and onUrlClick handler exists, open in preview
                if (isLocalhost && onUrlClick) {
                  onUrlClick(href)
                } else {
                  // Otherwise open in external browser
                  window.desktopApi.openExternal(href)
                }
              }
            }}
            className="text-blue-600 dark:text-blue-400 no-underline hover:underline hover:decoration-current underline-offset-2 decoration-1 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/30 focus-visible:rounded-sm"
            {...props}
          >
            {children}
            {/* Visual indicator for preview-able URLs */}
            {isLocalhost && onUrlClick && (
              <svg className="inline h-3 w-3 ml-1 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </a>
        )
      },
      strong: ({ children, ...props }: any) => (
        <strong className="font-medium text-foreground" {...props}>
          {children}
        </strong>
      ),
      em: ({ children, ...props }: any) => (
        <em className="italic" {...props}>
          {children}
        </em>
      ),
      blockquote: ({ children, ...props }: any) => (
        <blockquote className={styles.blockquote} {...props}>
          {children}
        </blockquote>
      ),
      hr: ({ ...props }: any) => <hr className={styles.hr} {...props} />,
      table: ({ children, ...props }: any) => (
        <div className="overflow-x-auto my-3 rounded-lg border border-border overflow-hidden">
          <table className={cn(styles.table, "border-collapse")} {...props}>
            {children}
          </table>
        </div>
      ),
      thead: ({ children, ...props }: any) => (
        <thead className={styles.thead} {...props}>
          {children}
        </thead>
      ),
      tbody: ({ children, ...props }: any) => (
        <tbody className={styles.tbody} {...props}>
          {children}
        </tbody>
      ),
      tr: ({ children, ...props }: any) => (
        <tr className={styles.tr} {...props}>
          {children}
        </tr>
      ),
      th: ({ children, ...props }: any) => (
        <th className={styles.th} {...props}>
          {children}
        </th>
      ),
      td: ({ children, ...props }: any) => (
        <td className={styles.td} {...props}>
          {children}
        </td>
      ),
      pre: ({ children }: any) => <>{children}</>,
      code: ({ inline, className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || "")
        const language = match ? match[1] : undefined
        const codeContent = String(children)

        // Determine if code should be inline:
        // 1. If markdown explicitly marks it as inline
        // 2. If it's short code without line breaks (likely from single backticks)
        const shouldBeInline =
          inline ||
          (!language && codeContent.length < 100 && !codeContent.includes("\n"))

        if (shouldBeInline) {
          return <span className={styles.inlineCode}>{children}</span>
        }

        return (
          <CodeBlock
            language={language}
            themeId={codeTheme}
            size={size}
          >
            {String(children).replace(/\n$/, "")}
          </CodeBlock>
        )
      },
    }),
    [styles, codeTheme, syntaxHighlight, size, onUrlClick],
  )

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert prose-code:before:content-none prose-code:after:content-none",
        // Reset prose margins - we use our own compact Notion-like spacing
        "prose-p:my-0 prose-ul:my-0 prose-ol:my-0 prose-li:my-0",
        "prose-ul:pl-0 prose-ol:pl-0 prose-li:pl-0",
        // Reset prose hr margins - we use our own
        "prose-hr:my-0",
        // Reset prose table margins - we use our own wrapper with margins
        "prose-table:my-0",
        // Fix for p inside li - make it inline so numbered list items don't break
        "[&_li>p]:inline [&_li>p]:mb-0",
        // Prevent horizontal overflow on mobile
        "overflow-hidden break-words",
        // Global spacing: elements before hr get extra bottom margin (for spacing above divider)
        "[&_p:has(+hr)]:mb-6 [&_ul:has(+hr)]:mb-6 [&_ol:has(+hr)]:mb-6 [&_div:has(+hr)]:mb-6 [&_table:has(+hr)]:mb-6 [&_h1:has(+hr)]:mb-6 [&_h2:has(+hr)]:mb-6 [&_h3:has(+hr)]:mb-6 [&_blockquote:has(+hr)]:mb-6",
        // Global spacing: elements after hr get extra top margin
        "[&_hr+p]:mt-4 [&_hr+ul]:mt-4 [&_hr+ol]:mt-4",
        // Global spacing: elements after code blocks get extra top margin
        "[&_div+p]:mt-2 [&_div+ul]:mt-2 [&_div+ol]:mt-2",
        // Global spacing: elements after tables get extra top margin
        "[&_table+p]:mt-4 [&_table+ul]:mt-4 [&_table+ol]:mt-4",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {processedContent}
      </ReactMarkdown>
    </div>
  )
})

// Convenience exports for specific use cases
export const CompactMarkdownRenderer = memo(function CompactMarkdownRenderer({
  content,
  className,
  syntaxHighlight = false,
}: {
  content: string
  className?: string
  syntaxHighlight?: boolean
}) {
  return (
    <ChatMarkdownRenderer
      content={content}
      size="sm"
      syntaxHighlight={syntaxHighlight}
      className={className}
    />
  )
})

export const FullscreenMarkdownRenderer = memo(
  function FullscreenMarkdownRenderer({
    content,
    className,
  }: {
    content: string
    className?: string
  }) {
    return (
      <ChatMarkdownRenderer
        content={content}
        size="lg"
        syntaxHighlight={true}
        className={className}
      />
    )
  },
)

// ============================================================================
// MEMOIZED MARKDOWN - Block-level memoization for streaming performance
// ============================================================================
// This is the KEY optimization for streaming performance!
// Instead of re-rendering the entire markdown on each chunk, we:
// 1. Parse markdown into discrete blocks (paragraphs, headers, code blocks, etc.)
// 2. Memoize each block individually
// 3. Only the last (incomplete) block re-renders during streaming

// Simple hash function for content-based keys
// Using djb2 algorithm - fast and good distribution
function hashString(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
  }
  // Convert to unsigned 32-bit and then to base36 for shorter keys
  return (hash >>> 0).toString(36)
}

interface ParsedBlock {
  content: string
  // Stable key based on: block type + position hint + content hash
  // This ensures blocks maintain identity even when new blocks are inserted
  key: string
}

function parseMarkdownIntoBlocks(markdown: string): ParsedBlock[] {
  try {
    const tokens = marked.lexer(markdown)
    // Track occurrences of each type+hash combo to handle duplicates
    const seen = new Map<string, number>()
    return tokens.map((token) => {
      const content = token.raw
      // Base key = type + content hash
      const baseKey = `${token.type}-${hashString(content)}`
      // Add occurrence counter for duplicate content (e.g., multiple empty lines)
      const occurrence = seen.get(baseKey) ?? 0
      seen.set(baseKey, occurrence + 1)
      const key = occurrence > 0 ? `${baseKey}-${occurrence}` : baseKey
      return { content, key }
    })
  } catch {
    // Fallback: return entire content as single block
    return [{ content: markdown, key: `fallback-${hashString(markdown)}` }]
  }
}

// Individual block - only re-renders when its content changes
const MemoizedMarkdownBlock = memo(
  function MemoizedMarkdownBlock({
    content,
    size,
    className,
    blockIndex,
    onUrlClick,
  }: {
    content: string
    size: MarkdownSize
    className?: string
    blockIndex: number
    onUrlClick?: (url: string) => void
  }) {
    // Don't render empty blocks
    if (!content.trim()) return null

    return (
      <ChatMarkdownRenderer
        content={content}
        size={size}
        className={className}
        isStreaming={false}  // Individual blocks are never "streaming"
        onUrlClick={onUrlClick}
      />
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if content actually changed
    const same = prevProps.content === nextProps.content &&
           prevProps.size === nextProps.size &&
           prevProps.className === nextProps.className &&
           prevProps.onUrlClick === nextProps.onUrlClick
    return same
  },
)

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock"

// Main memoized markdown component - splits into blocks and memoizes each
export const MemoizedMarkdown = memo(
  function MemoizedMarkdown({
    content,
    id,
    size = "sm",
    className,
    onUrlClick,
  }: {
    content: string
    id: string  // Unique ID for stable keys
    size?: MarkdownSize
    className?: string
    onUrlClick?: (url: string) => void
  }) {
    // Pre-process content before splitting into blocks
    const processedContent = useMemo(
      () => fixMalformedEmphasis(fixNumberedListBreaks(stripEmojis(content))),
      [content]
    )

    // Split into blocks - this recalculates when content changes,
    // but each block is individually memoized with content-based keys
    const blocks = useMemo(() => parseMarkdownIntoBlocks(processedContent), [processedContent])

    return (
      <>
        {blocks.map((block, index) => (
          <MemoizedMarkdownBlock
            key={`${id}-${block.key}`}
            content={block.content}
            size={size}
            className={className}
            blockIndex={index}
            onUrlClick={onUrlClick}
          />
        ))}
      </>
    )
  },
)

MemoizedMarkdown.displayName = "MemoizedMarkdown"
