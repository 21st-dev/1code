import { useEffect, useState, useRef } from "react"
import { codeToHtml } from "shiki"
import { cn } from "../../../lib/utils"
import { Loader2, Code, Eye } from "lucide-react"

interface HtmlPreviewProps {
  content: string
  fileName: string
  className?: string
}

type TabType = "preview" | "source"

export function HtmlPreview({ content, fileName, className }: HtmlPreviewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("preview")
  const [highlightedHtml, setHighlightedHtml] = useState<string>("")
  const [isHighlighting, setIsHighlighting] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Syntax highlight for source view
  useEffect(() => {
    if (activeTab !== "source") return

    let cancelled = false
    setIsHighlighting(true)

    async function highlight() {
      try {
        const result = await codeToHtml(content, {
          lang: "html",
          theme: "github-dark-default",
        })

        if (!cancelled) {
          setHighlightedHtml(result)
        }
      } catch (err) {
        console.error("Syntax highlighting error:", err)
        if (!cancelled) {
          // Fallback to plain text
          setHighlightedHtml(
            `<pre class="shiki"><code>${content
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")}</code></pre>`
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

  // Update iframe content when switching to preview
  useEffect(() => {
    if (activeTab !== "preview" || !iframeRef.current) return

    const iframe = iframeRef.current
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(content)
      doc.close()
    }
  }, [content, activeTab])

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
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin"
            title={`Preview: ${fileName}`}
          />
        ) : isHighlighting ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div
            className="h-full overflow-auto text-sm [&_pre]:p-4 [&_pre]:m-0 [&_pre]:min-h-full [&_pre]:bg-transparent [&_code]:font-mono [&_code]:text-[13px] [&_code]:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        )}
      </div>
    </div>
  )
}
