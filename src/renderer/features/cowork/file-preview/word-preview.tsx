import { useEffect, useRef, useState } from "react"
import { FileText, Loader2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"

interface WordPreviewProps {
  filePath: string
  className?: string
}

export function WordPreview({ filePath, className }: WordPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  // Read file as binary via tRPC
  const { data, error: fetchError } = trpc.files.readBinaryFile.useQuery(
    { path: filePath, maxSize: 50 * 1024 * 1024 }, // 50MB max for Word files
    { staleTime: 30000 }
  )

  useEffect(() => {
    if (fetchError) {
      setHasError(true)
      setErrorMessage(fetchError.message)
      setIsLoading(false)
      return
    }

    if (!data || !containerRef.current) return

    const renderDocument = async () => {
      try {
        // Dynamically import docx-preview to avoid SSR issues
        const { renderAsync } = await import("docx-preview")

        // Convert base64 to ArrayBuffer
        const binaryString = atob(data.base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        // Render the document
        await renderAsync(bytes.buffer, containerRef.current!, undefined, {
          className: "docx-preview",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: false,
          trimXmlDeclaration: true,
          debug: false,
        })

        setIsLoading(false)
        setHasError(false)
      } catch (err) {
        console.error("[WordPreview] Failed to render:", err)
        setHasError(true)
        setErrorMessage(err instanceof Error ? err.message : "Render failed")
        setIsLoading(false)
      }
    }

    renderDocument()
  }, [data, fetchError])

  if (hasError) {
    return (
      <div className={cn("h-full w-full flex flex-col items-center justify-center gap-3 text-muted-foreground", className)}>
        <FileText className="h-12 w-12 opacity-40" />
        <p className="text-sm">Unable to preview Word document</p>
        {errorMessage && (
          <p className="text-xs text-muted-foreground/60 max-w-[300px] text-center">
            {errorMessage}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={cn("h-full w-full flex flex-col relative bg-white dark:bg-zinc-900", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <div
        ref={containerRef}
        className={cn(
          "flex-1 overflow-auto p-4",
          isLoading && "opacity-0"
        )}
      />
      <style>{`
        .docx-preview {
          padding: 20px;
        }
        .docx-wrapper {
          background: white;
          padding: 30px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
          max-width: 100%;
          margin: 0 auto;
        }
        .dark .docx-wrapper {
          background: #18181b;
          color: #fafafa;
        }
        .docx-wrapper section {
          margin-bottom: 20px;
        }
        .docx-wrapper p {
          margin: 0.5em 0;
          line-height: 1.6;
        }
        .docx-wrapper table {
          border-collapse: collapse;
          width: 100%;
        }
        .docx-wrapper td, .docx-wrapper th {
          border: 1px solid #ddd;
          padding: 8px;
        }
        .dark .docx-wrapper td, .dark .docx-wrapper th {
          border-color: #3f3f46;
        }
      `}</style>
    </div>
  )
}
