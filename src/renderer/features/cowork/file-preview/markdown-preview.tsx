import { useEffect, useState, useRef, useCallback } from "react"
import { codeToHtml } from "shiki"
import { cn } from "../../../lib/utils"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { Loader2, Code, Eye } from "lucide-react"

interface MarkdownPreviewProps {
  content: string
  className?: string
  /** Line number to scroll to (switches to source view) */
  scrollToLine?: number | null
  /** Text to highlight in the content */
  highlightText?: string | null
}

type TabType = "preview" | "source"

export function MarkdownPreview({ content, className, scrollToLine, highlightText }: MarkdownPreviewProps) {
  // Auto-switch to source view when scrollToLine is provided
  const [activeTab, setActiveTab] = useState<TabType>(scrollToLine ? "source" : "preview")
  const [highlightedLines, setHighlightedLines] = useState<string[]>([])
  const [isHighlighting, setIsHighlighting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasScrolledRef = useRef(false)

  // Switch to source view when scrollToLine changes
  useEffect(() => {
    if (scrollToLine) {
      setActiveTab("source")
      hasScrolledRef.current = false
    }
  }, [scrollToLine])

  // Split content into lines
  const lines = content.split("\n")

  // Syntax highlight for source view (line by line)
  useEffect(() => {
    if (activeTab !== "source") return

    let cancelled = false
    setIsHighlighting(true)
    hasScrolledRef.current = false

    async function highlight() {
      try {
        const result = await codeToHtml(content, {
          lang: "markdown",
          theme: "github-dark-default",
        })

        if (!cancelled) {
          // Parse the HTML and extract line contents
          const codeMatch = result.match(/<code[^>]*>([\s\S]*?)<\/code>/i)
          if (codeMatch) {
            const innerHtml = codeMatch[1]
            const lineHtmls = innerHtml.split("\n")
            setHighlightedLines(lineHtmls)
          } else {
            // Fallback: split plain content
            setHighlightedLines(
              lines.map((line) =>
                line
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;") || "&nbsp;"
              )
            )
          }
        }
      } catch (err) {
        console.error("Syntax highlighting error:", err)
        if (!cancelled) {
          // Fallback to plain text
          setHighlightedLines(
            lines.map((line) =>
              line
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;") || "&nbsp;"
            )
          )
        }
      } finally {
        if (!cancelled) {
          setIsHighlighting(false)
        }
      }
    }

    highlight()

    return () => {
      cancelled = true
    }
  }, [content, activeTab])

  // Scroll to line when specified
  useEffect(() => {
    if (scrollToLine && !isHighlighting && containerRef.current && !hasScrolledRef.current && activeTab === "source") {
      const lineElement = containerRef.current.querySelector(`[data-line="${scrollToLine}"]`)
      if (lineElement) {
        requestAnimationFrame(() => {
          lineElement.scrollIntoView({ behavior: "smooth", block: "center" })
          hasScrolledRef.current = true
        })
      }
    }
  }, [scrollToLine, isHighlighting, highlightedLines, activeTab])

  // Function to highlight text within a line
  const highlightLineText = useCallback((lineHtml: string, searchText: string | null | undefined): string => {
    if (!searchText) return lineHtml

    const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(`(${escaped})`, "gi")

    const parts = lineHtml.split(/(<[^>]+>)/g)
    const result = parts.map((part) => {
      if (part.startsWith("<")) return part
      return part.replace(regex, '<mark class="bg-yellow-400/60 text-inherit rounded px-0.5">$1</mark>')
    })
    return result.join("")
  }, [])

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "preview", label: "Preview", icon: <Eye className="h-3.5 w-3.5" /> },
    { id: "source", label: "Source", icon: <Code className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className={cn("h-full w-full flex flex-col", className)}>
      {/* Tab bar */}
      <div className="flex items-center justify-center gap-1 p-2 border-b bg-muted/30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors",
              tab.id === activeTab
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "preview" ? (
          <div className="h-full overflow-auto p-4">
            <ChatMarkdownRenderer content={content} size="md" />
          </div>
        ) : isHighlighting ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div
            ref={containerRef}
            className="h-full overflow-auto font-mono text-[13px] leading-relaxed"
          >
            <table className="w-full border-collapse">
              <tbody>
                {highlightedLines.map((lineHtml, index) => {
                  const lineNumber = index + 1
                  const isTargetLine = scrollToLine === lineNumber
                  const processedHtml = highlightLineText(lineHtml, highlightText)

                  return (
                    <tr
                      key={lineNumber}
                      data-line={lineNumber}
                      className={cn(
                        "group/line",
                        isTargetLine && "bg-yellow-500/20"
                      )}
                    >
                      {/* Line number */}
                      <td className="w-12 text-right pr-3 select-none align-top text-muted-foreground/60 border-r border-border/40">
                        <span className="text-xs tabular-nums">{lineNumber}</span>
                      </td>

                      {/* Code content */}
                      <td
                        className="pl-4 whitespace-pre"
                        dangerouslySetInnerHTML={{ __html: processedHtml || "&nbsp;" }}
                      />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
