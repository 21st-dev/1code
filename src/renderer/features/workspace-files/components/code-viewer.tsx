import { useEffect, useState } from "react"
import { useAtomValue } from "jotai"
import { selectedFullThemeIdAtom, systemDarkThemeIdAtom, systemLightThemeIdAtom } from "../../../lib/atoms"
import { highlightCode } from "../../../lib/themes/shiki-theme-loader"
import { getLanguageFromPath } from "../utils/file-types"

interface CodeViewerProps {
  content: string
  filename: string
}

export function CodeViewer({ content, filename }: CodeViewerProps) {
  const [highlighted, setHighlighted] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  // Theme atoms
  const selectedFullThemeId = useAtomValue(selectedFullThemeIdAtom)
  const systemDarkThemeId = useAtomValue(systemDarkThemeIdAtom)
  const systemLightThemeId = useAtomValue(systemLightThemeIdAtom)

  // Determine theme ID
  const themeId = (() => {
    if (selectedFullThemeId) {
      return selectedFullThemeId
    }
    // Check system preference
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    return isDark ? systemDarkThemeId : systemLightThemeId
  })()

  useEffect(() => {
    const language = getLanguageFromPath(filename)
    setIsLoading(true)

    highlightCode(content, language, themeId)
      .then((html) => {
        setHighlighted(html)
        setIsLoading(false)
      })
      .catch((error) => {
        console.error("[CodeViewer] Failed to highlight code:", error)
        // Fallback to plain text
        setHighlighted(`<pre>${content}</pre>`)
        setIsLoading(false)
      })
  }, [content, filename, themeId])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-auto p-4"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  )
}
