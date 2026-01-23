import { useEffect, useState, useMemo } from "react"
import { useAtomValue } from "jotai"
import { selectedFullThemeIdAtom, systemDarkThemeIdAtom, systemLightThemeIdAtom } from "../../../lib/atoms"
import { highlightCode } from "../../../lib/themes/shiki-theme-loader"
import { getLanguageFromPath } from "../utils/file-types"

// Escape HTML for safe plaintext rendering
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

interface CodeViewerProps {
  content: string
  filename: string
}

export function CodeViewer({ content, filename }: CodeViewerProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  // Theme atoms
  const selectedFullThemeId = useAtomValue(selectedFullThemeIdAtom)
  const systemDarkThemeId = useAtomValue(systemDarkThemeIdAtom)
  const systemLightThemeId = useAtomValue(systemLightThemeIdAtom)

  // Determine theme ID (memoized)
  const themeId = useMemo(() => {
    if (selectedFullThemeId) {
      return selectedFullThemeId
    }
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    return isDark ? systemDarkThemeId : systemLightThemeId
  }, [selectedFullThemeId, systemDarkThemeId, systemLightThemeId])

  // Get language from filename (memoized)
  const language = useMemo(() => getLanguageFromPath(filename), [filename])

  // Determine if we should highlight (memoized)
  const shouldHighlight = useMemo(
    () => language && language !== "plaintext" && language !== "text",
    [language]
  )

  // Async syntax highlighting with cancellation
  useEffect(() => {
    if (!shouldHighlight) {
      setHighlightedHtml(null)
      return
    }

    let cancelled = false

    const highlight = async () => {
      try {
        const html = await highlightCode(content, language, themeId)
        if (!cancelled) {
          setHighlightedHtml(html)
        }
      } catch (error) {
        console.error("[CodeViewer] Failed to highlight code:", error)
        if (!cancelled) {
          setHighlightedHtml(null)
        }
      }
    }

    highlight()

    return () => {
      cancelled = true
    }
  }, [content, language, themeId, shouldHighlight])

  // Prepare display content: highlighted HTML or escaped plaintext
  const htmlContent = useMemo(() => {
    if (shouldHighlight && highlightedHtml) {
      return highlightedHtml
    }
    return escapeHtml(content)
  }, [shouldHighlight, highlightedHtml, content])

  return (
    <div className="h-full overflow-auto p-4">
      {shouldHighlight && highlightedHtml ? (
        <div
          className="[&_.shiki]:bg-transparent"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      ) : (
        <pre className="font-mono text-sm whitespace-pre-wrap">
          {htmlContent}
        </pre>
      )}
    </div>
  )
}
