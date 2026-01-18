export type ColumnType = "string" | "number" | "boolean" | "date" | "null" | "mixed"

export interface ParsedColumn {
  name: string
  type: ColumnType
}

export interface ParsedData {
  columns: ParsedColumn[]
  rows: Record<string, unknown>[]
  totalRows: number
  truncated: boolean
}

export type DataFileType = "csv" | "json" | "sqlite" | "unknown"

export interface DataFileInfo {
  path: string
  name: string
  type: DataFileType
  size: number
  tables?: string[] // For SQLite files
}
