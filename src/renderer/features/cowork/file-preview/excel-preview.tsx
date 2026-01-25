import { useEffect, useState } from "react"
import { Table2, Loader2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"

interface ExcelPreviewProps {
  filePath: string
  className?: string
}

interface SheetData {
  name: string
  data: string[][]
}

export function ExcelPreview({ filePath, className }: ExcelPreviewProps) {
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  // Read file as binary via tRPC
  const { data, error: fetchError } = trpc.files.readBinaryFile.useQuery(
    { path: filePath, maxSize: 50 * 1024 * 1024 }, // 50MB max
    { staleTime: 30000 }
  )

  useEffect(() => {
    if (fetchError) {
      setHasError(true)
      setErrorMessage(fetchError.message)
      setIsLoading(false)
      return
    }

    if (!data) return

    const parseExcel = async () => {
      try {
        // Dynamically import xlsx
        const XLSX = await import("xlsx")

        // Convert base64 to ArrayBuffer
        const binaryString = atob(data.base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        // Parse the workbook
        const workbook = XLSX.read(bytes, { type: "array" })

        // Convert each sheet to array of arrays
        const parsedSheets: SheetData[] = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name]
          const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
          return { name, data: data as string[][] }
        })

        setSheets(parsedSheets)
        setIsLoading(false)
        setHasError(false)
      } catch (err) {
        console.error("[ExcelPreview] Failed to parse:", err)
        setHasError(true)
        setErrorMessage(err instanceof Error ? err.message : "Parse failed")
        setIsLoading(false)
      }
    }

    parseExcel()
  }, [data, fetchError])

  if (hasError) {
    return (
      <div className={cn("h-full w-full flex flex-col items-center justify-center gap-3 text-muted-foreground", className)}>
        <Table2 className="h-12 w-12 opacity-40" />
        <p className="text-sm">Unable to preview Excel file</p>
        {errorMessage && (
          <p className="text-xs text-muted-foreground/60 max-w-[300px] text-center">
            {errorMessage}
          </p>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={cn("h-full w-full flex items-center justify-center", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const currentSheet = sheets[activeSheet]

  return (
    <div className={cn("h-full w-full flex flex-col", className)}>
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex items-center gap-1 p-2 border-b bg-muted/30 overflow-x-auto">
          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(index)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors",
                index === activeSheet
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {currentSheet && currentSheet.data.length > 0 ? (
          <table className="w-full border-collapse text-sm">
            <tbody>
              {currentSheet.data.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex === 0 ? "bg-muted/50 font-medium" : ""}>
                  {/* Row number */}
                  <td className="px-2 py-1.5 border border-border bg-muted/30 text-muted-foreground text-xs text-center min-w-[40px]">
                    {rowIndex + 1}
                  </td>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-2 py-1.5 border border-border min-w-[80px] max-w-[300px] truncate"
                      title={String(cell ?? "")}
                    >
                      {cell ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Empty sheet</p>
          </div>
        )}
      </div>
    </div>
  )
}
