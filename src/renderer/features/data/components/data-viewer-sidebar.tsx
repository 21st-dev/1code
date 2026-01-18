import { useCallback, useMemo, useState, useEffect } from "react"
import {
  DataEditor,
  GridColumn,
  GridCell,
  GridCellKind,
  GridSelection,
  CompactSelection,
  type Item,
  type Theme,
  type Rectangle,
} from "@glideapps/glide-data-grid"
import "@glideapps/glide-data-grid/dist/index.css"
import { useAtom } from "jotai"
import {
  X,
  Loader2,
  Database,
  FileSpreadsheet,
  FileJson,
  Search,
  Pin,
  Hash,
  ArrowUpAZ,
  ArrowDownAZ,
  EyeOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { selectedSqliteTableAtomFamily } from "../../agents/atoms"
import { useTheme } from "next-themes"

interface DataViewerSidebarProps {
  chatId: string
  filePath: string
  projectPath: string
  onClose: () => void
}

/**
 * Get the file extension
 */
function getFileExtension(filePath: string): string {
  const parts = filePath.split(".")
  return parts.length > 1 ? `.${parts[parts.length - 1].toLowerCase()}` : ""
}

/**
 * Get file type from extension
 */
function getFileType(filePath: string): "csv" | "json" | "sqlite" | "unknown" {
  const ext = getFileExtension(filePath)
  switch (ext) {
    case ".csv":
    case ".tsv":
      return "csv"
    case ".json":
    case ".jsonl":
      return "json"
    case ".db":
    case ".sqlite":
    case ".sqlite3":
      return "sqlite"
    default:
      return "unknown"
  }
}

/**
 * Get file icon based on type
 */
function FileIcon({ filePath }: { filePath: string }) {
  const fileType = getFileType(filePath)

  switch (fileType) {
    case "csv":
      return <FileSpreadsheet className="h-4 w-4 text-green-500" />
    case "json":
      return <FileJson className="h-4 w-4 text-yellow-500" />
    case "sqlite":
      return <Database className="h-4 w-4 text-blue-500" />
    default:
      return <FileSpreadsheet className="h-4 w-4" />
  }
}

/**
 * Get file name from path
 */
function getFileName(filePath: string): string {
  const parts = filePath.split("/")
  return parts[parts.length - 1] || filePath
}

/**
 * Format cell value for display
 */
function formatCellValue(value: unknown): string {
  if (value === null) return "null"
  if (value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export function DataViewerSidebar({
  chatId,
  filePath,
  projectPath,
  onClose,
}: DataViewerSidebarProps) {
  const fileType = getFileType(filePath)
  const fileName = getFileName(filePath)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  // ============ Column State ============
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [columnOrder, setColumnOrder] = useState<number[]>([])
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())

  // ============ Selection State ============
  const [selection, setSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  })

  // ============ Feature State ============
  const [freezeColumns, setFreezeColumns] = useState(0)
  const [showRowMarkers, setShowRowMarkers] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [searchResults, setSearchResults] = useState<readonly Item[]>([])

  // ============ Header Menu State ============
  const [menuColumn, setMenuColumn] = useState<number | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)

  // ============ Sort State ============
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")

  // Glide Data Grid theme - use explicit colors instead of CSS variables
  const gridTheme: Partial<Theme> = useMemo(
    () => ({
      // Backgrounds
      bgCell: isDark ? "#09090b" : "#ffffff",
      bgHeader: isDark ? "#18181b" : "#f4f4f5",
      bgHeaderHovered: isDark ? "#27272a" : "#e4e4e7",
      bgHeaderHasFocus: isDark ? "#27272a" : "#e4e4e7",
      bgBubble: isDark ? "#3f3f46" : "#e4e4e7",
      bgBubbleSelected: isDark ? "#52525b" : "#d4d4d8",
      bgSearchResult: isDark ? "#854d0e" : "#fef08a",

      // Text colors
      textDark: isDark ? "#fafafa" : "#09090b",
      textHeader: isDark ? "#fafafa" : "#09090b",
      textLight: isDark ? "#a1a1aa" : "#71717a",
      textMedium: isDark ? "#d4d4d8" : "#52525b",
      textBubble: isDark ? "#fafafa" : "#09090b",

      // Borders
      borderColor: isDark ? "#27272a" : "#e4e4e7",
      horizontalBorderColor: isDark ? "#27272a" : "#e4e4e7",
      drilldownBorder: isDark ? "#3f3f46" : "#d4d4d8",

      // Selection/Accent
      accentColor: isDark ? "#3b82f6" : "#2563eb",
      accentLight: isDark ? "#1e3a5f" : "#dbeafe",
      accentFg: "#ffffff",

      // Cell states
      bgCellMedium: isDark ? "#18181b" : "#f4f4f5",
      bgIconHeader: isDark ? "#27272a" : "#d4d4d8",
      fgIconHeader: isDark ? "#fafafa" : "#09090b",

      // Fonts
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      baseFontStyle: "12px",
      headerFontStyle: "600 12px",
      editorFontSize: "12px",
      markerFontStyle: "11px",

      // Sizing
      cellHorizontalPadding: 8,
      cellVerticalPadding: 3,
      headerIconSize: 16,

      // Shadows & effects
      linkColor: isDark ? "#60a5fa" : "#2563eb",
    }),
    [isDark]
  )

  // Build absolute path
  const absolutePath = filePath.startsWith("/")
    ? filePath
    : `${projectPath}/${filePath}`

  // For SQLite files, we need to select a table
  const selectedTableAtom = useMemo(
    () => selectedSqliteTableAtomFamily(absolutePath),
    [absolutePath]
  )
  const [selectedTable, setSelectedTable] = useAtom(selectedTableAtom)

  // Fetch tables for SQLite files
  const { data: tables } = trpc.files.listSqliteTables.useQuery(
    { filePath: absolutePath },
    { enabled: fileType === "sqlite" }
  )

  // Auto-select first table if none selected
  useEffect(() => {
    if (fileType === "sqlite" && tables && tables.length > 0 && !selectedTable) {
      setSelectedTable(tables[0])
    }
  }, [fileType, tables, selectedTable, setSelectedTable])

  // Fetch data
  const { data, isLoading, error } = trpc.files.previewDataFile.useQuery(
    {
      filePath: absolutePath,
      limit: 1000,
      offset: 0,
      tableName: fileType === "sqlite" ? selectedTable || undefined : undefined,
    },
    {
      enabled:
        fileType !== "unknown" &&
        (fileType !== "sqlite" || (!!selectedTable && selectedTable !== "")),
    }
  )

  // Initialize column order when data changes
  useEffect(() => {
    if (data?.columns) {
      setColumnOrder(data.columns.map((_, i) => i))
      setHiddenColumns(new Set())
      setSortColumn(null)
    }
  }, [data?.columns])

  // Compute search results when search value changes
  useEffect(() => {
    if (!searchValue || !data) {
      setSearchResults([])
      return
    }

    const results: Item[] = []
    const searchLower = searchValue.toLowerCase()

    data.rows.forEach((row, rowIdx) => {
      data.columns.forEach((col, colIdx) => {
        if (hiddenColumns.has(col.name)) return
        const value = formatCellValue(row[col.name])
        if (value.toLowerCase().includes(searchLower)) {
          results.push([colIdx, rowIdx])
        }
      })
    })

    setSearchResults(results)
  }, [searchValue, data, hiddenColumns])

  // Sort rows if sort is active
  const sortedRows = useMemo(() => {
    if (!data?.rows || !sortColumn) return data?.rows ?? []

    const sorted = [...data.rows].sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]

      // Handle nulls
      if (aVal === null && bVal === null) return 0
      if (aVal === null) return sortDirection === "asc" ? -1 : 1
      if (bVal === null) return sortDirection === "asc" ? 1 : -1

      // Compare
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal
      }

      const aStr = String(aVal)
      const bStr = String(bVal)
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr)
    })

    return sorted
  }, [data?.rows, sortColumn, sortDirection])

  // Build columns with proper widths and filtering hidden
  const baseColumns: GridColumn[] = useMemo(
    () =>
      data?.columns
        .map((col, idx) => ({
          title: col.name,
          id: col.name,
          width:
            columnWidths[col.name] ??
            Math.max(100, Math.min(300, col.name.length * 10 + 40)),
          hasMenu: true,
          originalIndex: idx,
        }))
        .filter((col) => !hiddenColumns.has(col.id)) ?? [],
    [data?.columns, columnWidths, hiddenColumns]
  )

  // Apply column order
  const orderedColumns: GridColumn[] = useMemo(() => {
    if (!data?.columns || columnOrder.length === 0) return baseColumns

    // Filter column order to only include visible columns
    const visibleIndices = columnOrder.filter(
      (idx) => data.columns[idx] && !hiddenColumns.has(data.columns[idx].name)
    )

    return visibleIndices
      .map((idx) => {
        const col = data.columns[idx]
        return baseColumns.find((bc) => bc.id === col.name)
      })
      .filter(Boolean) as GridColumn[]
  }, [baseColumns, columnOrder, data?.columns, hiddenColumns])

  // ============ Handlers ============

  const onColumnResize = useCallback(
    (column: GridColumn, newSize: number) => {
      setColumnWidths((prev) => ({
        ...prev,
        [column.id ?? column.title]: newSize,
      }))
    },
    []
  )

  const onColumnMoved = useCallback((startIndex: number, endIndex: number) => {
    setColumnOrder((prev) => {
      const newOrder = [...prev]
      const [removed] = newOrder.splice(startIndex, 1)
      newOrder.splice(endIndex, 0, removed)
      return newOrder
    })
  }, [])

  const onSelectionChange = useCallback((newSelection: GridSelection) => {
    setSelection(newSelection)
  }, [])

  const onSearchClose = useCallback(() => {
    setShowSearch(false)
    setSearchValue("")
    setSearchResults([])
  }, [])

  const onHeaderMenuClick = useCallback(
    (col: number, bounds: Rectangle) => {
      const column = orderedColumns[col]
      if (column) {
        setMenuColumn(col)
        setMenuPosition({ x: bounds.x, y: bounds.y + bounds.height })
      }
    },
    [orderedColumns]
  )

  const handleSort = useCallback(
    (direction: "asc" | "desc") => {
      if (menuColumn !== null && orderedColumns[menuColumn]) {
        const colName = orderedColumns[menuColumn].id as string
        setSortColumn(colName)
        setSortDirection(direction)
      }
      setMenuColumn(null)
      setMenuPosition(null)
    },
    [menuColumn, orderedColumns]
  )

  const handleFreezeColumn = useCallback(() => {
    if (menuColumn !== null) {
      setFreezeColumns(menuColumn + 1)
    }
    setMenuColumn(null)
    setMenuPosition(null)
  }, [menuColumn])

  const handleHideColumn = useCallback(() => {
    if (menuColumn !== null && orderedColumns[menuColumn]) {
      const colName = orderedColumns[menuColumn].id as string
      setHiddenColumns((prev) => new Set([...prev, colName]))
    }
    setMenuColumn(null)
    setMenuPosition(null)
  }, [menuColumn, orderedColumns])

  const handleShowAllColumns = useCallback(() => {
    setHiddenColumns(new Set())
  }, [])

  // Get cell content with proper cell types
  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell
      const column = orderedColumns[col]
      const colName = column?.id as string
      const colMeta = data?.columns.find((c) => c.name === colName)
      const colType = colMeta?.type
      const rowData = sortedRows[row]
      const value = rowData?.[colName]

      // Handle null values
      if (value === null || value === undefined) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: value === null ? "null" : "",
          allowOverlay: true,
          readonly: true,
          style: "faded",
        }
      }

      // Number type
      if (colType === "number" && typeof value === "number") {
        return {
          kind: GridCellKind.Number,
          data: value,
          displayData: value.toLocaleString(),
          allowOverlay: true,
          readonly: true,
        }
      }

      // Boolean type
      if (colType === "boolean" || typeof value === "boolean") {
        return {
          kind: GridCellKind.Boolean,
          data: Boolean(value),
          allowOverlay: false,
          readonly: true,
        }
      }

      // URI detection (http/https links)
      if (typeof value === "string" && /^https?:\/\//i.test(value)) {
        return {
          kind: GridCellKind.Uri,
          data: value,
          displayData: value,
          allowOverlay: true,
          readonly: true,
        }
      }

      // Default: text
      const displayValue = formatCellValue(value)
      return {
        kind: GridCellKind.Text,
        data: displayValue,
        displayData: displayValue,
        allowOverlay: true,
        readonly: true,
      }
    },
    [orderedColumns, sortedRows, data?.columns]
  )

  // Get cells for selection (enables copy)
  const getCellsForSelection = useCallback(
    (selection: Rectangle): readonly (readonly GridCell[])[] => {
      const result: GridCell[][] = []
      for (let row = selection.y; row < selection.y + selection.height; row++) {
        const rowCells: GridCell[] = []
        for (let col = selection.x; col < selection.x + selection.width; col++) {
          rowCells.push(getCellContent([col, row]))
        }
        result.push(rowCells)
      }
      return result
    },
    [getCellContent]
  )

  // Error state
  if (error) {
    return (
      <div className="flex flex-col h-full">
        <Header fileName={fileName} filePath={filePath} onClose={onClose} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-destructive">
            <p className="font-medium">Failed to load file</p>
            <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <Header fileName={fileName} filePath={filePath} onClose={onClose} />

      {/* Toolbar */}
      <Toolbar
        onSearch={() => setShowSearch((prev) => !prev)}
        onFreeze={() => setFreezeColumns((prev) => (prev === 0 ? 1 : 0))}
        freezeCount={freezeColumns}
        showRowMarkers={showRowMarkers}
        onToggleRowMarkers={() => setShowRowMarkers((prev) => !prev)}
        hiddenColumnCount={hiddenColumns.size}
        onShowAllColumns={handleShowAllColumns}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onClearSort={() => setSortColumn(null)}
      />

      {/* Table selector for SQLite */}
      {fileType === "sqlite" && tables && tables.length > 0 && (
        <div className="px-3 py-2 border-b">
          <Select value={selectedTable} onValueChange={setSelectedTable}>
            <SelectTrigger className="w-full h-8 text-sm">
              <Database className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Select a table" />
            </SelectTrigger>
            <SelectContent>
              {tables.map((table) => (
                <SelectItem key={table} value={table}>
                  {table}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data && sortedRows.length > 0 ? (
          <>
            <DataEditor
              getCellContent={getCellContent}
              getCellsForSelection={getCellsForSelection}
              columns={orderedColumns}
              rows={sortedRows.length}
              // Layout
              width="100%"
              height="100%"
              rowHeight={32}
              headerHeight={36}
              // Scrolling
              smoothScrollX
              smoothScrollY
              // Column features
              onColumnResize={onColumnResize}
              onColumnMoved={onColumnMoved}
              minColumnWidth={50}
              maxColumnWidth={500}
              freezeColumns={freezeColumns}
              fixedShadowX={freezeColumns > 0}
              // Row markers
              rowMarkers={showRowMarkers ? "both" : "none"}
              rowMarkerWidth={60}
              rowMarkerStartIndex={1}
              // Selection
              gridSelection={selection}
              onGridSelectionChange={onSelectionChange}
              rowSelect="multi"
              columnSelect="multi"
              rangeSelect="multi-rect"
              rowSelectionMode="auto"
              drawFocusRing={true}
              // Search
              showSearch={showSearch}
              searchValue={searchValue}
              searchResults={searchResults}
              onSearchValueChange={setSearchValue}
              onSearchClose={onSearchClose}
              // Header menu
              onHeaderMenuClick={onHeaderMenuClick}
              // Keyboard
              keybindings={{
                selectAll: true,
                selectColumn: true,
                selectRow: true,
                copy: true,
                search: true,
                first: true,
                last: true,
              }}
              // Theme
              theme={gridTheme}
            />

            {/* Header Menu Dropdown */}
            {menuColumn !== null && menuPosition && (
              <div
                className="fixed z-50"
                style={{ left: menuPosition.x, top: menuPosition.y }}
              >
                <DropdownMenu
                  open={true}
                  onOpenChange={() => {
                    setMenuColumn(null)
                    setMenuPosition(null)
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <div />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => handleSort("asc")}>
                      <ArrowUpAZ className="h-4 w-4 mr-2" />
                      Sort Ascending
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSort("desc")}>
                      <ArrowDownAZ className="h-4 w-4 mr-2" />
                      Sort Descending
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleFreezeColumn}>
                      <Pin className="h-4 w-4 mr-2" />
                      Freeze up to here
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleHideColumn}>
                      <EyeOff className="h-4 w-4 mr-2" />
                      Hide Column
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No data to display</p>
          </div>
        )}
      </div>

      {/* Footer with row count */}
      {data && (
        <div className="px-3 py-2 border-t text-xs text-muted-foreground flex items-center justify-between">
          <span>
            {data.truncated
              ? `Showing ${sortedRows.length.toLocaleString()} of ${data.totalRows.toLocaleString()} rows`
              : `${sortedRows.length.toLocaleString()} rows`}
          </span>
          <span>
            {orderedColumns.length}
            {hiddenColumns.size > 0 && ` (${hiddenColumns.size} hidden)`} columns
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Header component for the sidebar
 */
function Header({
  fileName,
  filePath,
  onClose,
}: {
  fileName: string
  filePath: string
  onClose: () => void
}) {
  return (
    <div className="flex items-center justify-between px-3 h-10 border-b bg-background flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <FileIcon filePath={filePath} />
        <span className="text-sm font-medium truncate" title={filePath}>
          {fileName}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 flex-shrink-0"
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

/**
 * Toolbar component with feature controls
 */
interface ToolbarProps {
  onSearch: () => void
  onFreeze: () => void
  freezeCount: number
  showRowMarkers: boolean
  onToggleRowMarkers: () => void
  hiddenColumnCount: number
  onShowAllColumns: () => void
  sortColumn: string | null
  sortDirection: "asc" | "desc"
  onClearSort: () => void
}

function Toolbar({
  onSearch,
  onFreeze,
  freezeCount,
  showRowMarkers,
  onToggleRowMarkers,
  hiddenColumnCount,
  onShowAllColumns,
  sortColumn,
  onClearSort,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/30">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onSearch}
            >
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Search (Ctrl+F)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", freezeCount > 0 && "bg-accent")}
              onClick={onFreeze}
            >
              <Pin className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {freezeCount > 0 ? "Unfreeze columns" : "Freeze first column"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", showRowMarkers && "bg-accent")}
              onClick={onToggleRowMarkers}
            >
              <Hash className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle row numbers</TooltipContent>
        </Tooltip>

        {hiddenColumnCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onShowAllColumns}
              >
                <EyeOff className="h-3 w-3 mr-1" />
                {hiddenColumnCount} hidden
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Show all columns</TooltipContent>
          </Tooltip>
        )}

        {sortColumn && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onClearSort}
              >
                <ArrowUpAZ className="h-3 w-3 mr-1" />
                {sortColumn}
                <X className="h-3 w-3 ml-1" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear sort</TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  )
}

export default DataViewerSidebar
