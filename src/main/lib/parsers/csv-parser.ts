import Papa from "papaparse"
import { readFile } from "node:fs/promises"
import type { ParsedData, ParsedColumn, ColumnType } from "./types"

/**
 * Infer the type of a value
 */
function inferType(value: unknown): ColumnType {
  if (value === null || value === undefined || value === "") {
    return "null"
  }

  if (typeof value === "boolean") {
    return "boolean"
  }

  if (typeof value === "number" && !isNaN(value)) {
    return "number"
  }

  const strValue = String(value).trim()

  // Check for boolean strings
  if (strValue.toLowerCase() === "true" || strValue.toLowerCase() === "false") {
    return "boolean"
  }

  // Check for number
  if (strValue !== "" && !isNaN(Number(strValue))) {
    return "number"
  }

  // Check for date (ISO format or common formats)
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO 8601
    /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
    /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
  ]

  for (const pattern of datePatterns) {
    if (pattern.test(strValue)) {
      const date = new Date(strValue)
      if (!isNaN(date.getTime())) {
        return "date"
      }
    }
  }

  return "string"
}

/**
 * Infer column types from sample rows
 */
function inferColumnTypes(
  columns: string[],
  rows: Record<string, unknown>[]
): ParsedColumn[] {
  const sampleSize = Math.min(rows.length, 100)
  const typeMap = new Map<string, Set<ColumnType>>()

  // Initialize type sets for each column
  for (const col of columns) {
    typeMap.set(col, new Set())
  }

  // Sample rows to infer types
  for (let i = 0; i < sampleSize; i++) {
    const row = rows[i]
    for (const col of columns) {
      const value = row[col]
      const type = inferType(value)
      typeMap.get(col)?.add(type)
    }
  }

  // Determine final type for each column
  return columns.map((name) => {
    const types = typeMap.get(name) || new Set()

    // Remove null from consideration if there are other types
    types.delete("null")

    if (types.size === 0) {
      return { name, type: "null" as ColumnType }
    }

    if (types.size === 1) {
      return { name, type: Array.from(types)[0] }
    }

    // Multiple types = mixed
    return { name, type: "mixed" as ColumnType }
  })
}

/**
 * Parse a CSV or TSV file
 */
export async function parseCsvFile(
  filePath: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ParsedData> {
  const { limit = 1000, offset = 0 } = options

  const content = await readFile(filePath, "utf-8")

  // Detect delimiter (CSV vs TSV)
  const firstLine = content.split("\n")[0] || ""
  const delimiter = firstLine.includes("\t") ? "\t" : ","

  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    dynamicTyping: true, // Automatically convert numbers
  })

  if (result.errors.length > 0) {
    console.warn("[csv-parser] Parse warnings:", result.errors.slice(0, 5))
  }

  const allRows = result.data
  const totalRows = allRows.length
  const columns = result.meta.fields || []

  // Apply offset and limit
  const slicedRows = allRows.slice(offset, offset + limit)
  const truncated = offset + limit < totalRows

  // Infer column types
  const parsedColumns = inferColumnTypes(columns, slicedRows)

  return {
    columns: parsedColumns,
    rows: slicedRows,
    totalRows,
    truncated,
  }
}

/**
 * Count rows in a CSV file without loading all data
 */
export async function countCsvRows(filePath: string): Promise<number> {
  const content = await readFile(filePath, "utf-8")
  const lines = content.split("\n").filter((line) => line.trim() !== "")
  // Subtract 1 for header row
  return Math.max(0, lines.length - 1)
}
