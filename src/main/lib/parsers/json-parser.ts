import { readFile } from "node:fs/promises"
import type { ParsedData, ParsedColumn, ColumnType } from "./types"

/**
 * Infer the type of a value
 */
function inferType(value: unknown): ColumnType {
  if (value === null || value === undefined) {
    return "null"
  }

  if (typeof value === "boolean") {
    return "boolean"
  }

  if (typeof value === "number" && !isNaN(value)) {
    return "number"
  }

  if (typeof value === "string") {
    // Check for date strings
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    ]

    for (const pattern of datePatterns) {
      if (pattern.test(value)) {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return "date"
        }
      }
    }

    return "string"
  }

  // Objects and arrays are treated as strings (JSON stringified)
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

  for (const col of columns) {
    typeMap.set(col, new Set())
  }

  for (let i = 0; i < sampleSize; i++) {
    const row = rows[i]
    for (const col of columns) {
      const value = row[col]
      const type = inferType(value)
      typeMap.get(col)?.add(type)
    }
  }

  return columns.map((name) => {
    const types = typeMap.get(name) || new Set()
    types.delete("null")

    if (types.size === 0) {
      return { name, type: "null" as ColumnType }
    }

    if (types.size === 1) {
      return { name, type: Array.from(types)[0] }
    }

    return { name, type: "mixed" as ColumnType }
  })
}

/**
 * Extract all unique keys from an array of objects
 */
function extractColumns(rows: Record<string, unknown>[]): string[] {
  const columnSet = new Set<string>()
  const sampleSize = Math.min(rows.length, 100)

  for (let i = 0; i < sampleSize; i++) {
    const row = rows[i]
    if (row && typeof row === "object") {
      for (const key of Object.keys(row)) {
        columnSet.add(key)
      }
    }
  }

  return Array.from(columnSet)
}

/**
 * Flatten nested objects for display
 */
function flattenRow(row: Record<string, unknown>): Record<string, unknown> {
  const flattened: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // Stringify nested objects
      flattened[key] = JSON.stringify(value)
    } else if (Array.isArray(value)) {
      // Stringify arrays
      flattened[key] = JSON.stringify(value)
    } else {
      flattened[key] = value
    }
  }

  return flattened
}

/**
 * Parse a JSON file (supports arrays and JSON Lines)
 */
export async function parseJsonFile(
  filePath: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ParsedData> {
  const { limit = 1000, offset = 0 } = options

  const content = await readFile(filePath, "utf-8")
  let allRows: Record<string, unknown>[] = []

  // Try parsing as JSON array first
  try {
    const parsed = JSON.parse(content)

    if (Array.isArray(parsed)) {
      // JSON array of objects
      allRows = parsed.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object"
      )
    } else if (typeof parsed === "object" && parsed !== null) {
      // Single object - wrap in array
      allRows = [parsed as Record<string, unknown>]
    }
  } catch {
    // Try parsing as JSON Lines (JSONL)
    const lines = content.split("\n").filter((line) => line.trim() !== "")

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)
        if (typeof parsed === "object" && parsed !== null) {
          allRows.push(parsed as Record<string, unknown>)
        }
      } catch {
        // Skip invalid lines
        console.warn("[json-parser] Skipping invalid JSON line")
      }
    }
  }

  if (allRows.length === 0) {
    return {
      columns: [],
      rows: [],
      totalRows: 0,
      truncated: false,
    }
  }

  const totalRows = allRows.length

  // Apply offset and limit
  const slicedRows = allRows.slice(offset, offset + limit).map(flattenRow)
  const truncated = offset + limit < totalRows

  // Extract and infer columns
  const columns = extractColumns(slicedRows)
  const parsedColumns = inferColumnTypes(columns, slicedRows)

  return {
    columns: parsedColumns,
    rows: slicedRows,
    totalRows,
    truncated,
  }
}

/**
 * Count rows in a JSON file
 */
export async function countJsonRows(filePath: string): Promise<number> {
  const content = await readFile(filePath, "utf-8")

  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      return parsed.length
    }
    return 1 // Single object
  } catch {
    // JSON Lines - count lines
    return content.split("\n").filter((line) => line.trim() !== "").length
  }
}
