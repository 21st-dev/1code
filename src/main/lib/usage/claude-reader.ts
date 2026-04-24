import type { Dirent } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { UsageEntry } from "./types"

/**
 * Root directory Claude Code writes session JSONLs to.
 * Honors CLAUDE_CONFIG_DIR (may be colon-separated for multi-root installs),
 * matching ccusage's resolution order.
 */
function claudeProjectRoots(): string[] {
  const envDir = process.env.CLAUDE_CONFIG_DIR
  if (envDir && envDir.trim().length > 0) {
    return envDir
      .split(":")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => join(d, "projects"))
  }
  return [join(homedir(), ".claude", "projects")]
}

async function walkJsonlFiles(dir: string, out: string[]): Promise<void> {
  let entries: Dirent[]
  try {
    entries = (await readdir(dir, { withFileTypes: true, encoding: "utf8" })) as Dirent[]
  } catch {
    return
  }
  for (const entry of entries) {
    const name = entry.name as string
    const full = join(dir, name)
    if (entry.isDirectory()) {
      await walkJsonlFiles(full, out)
    } else if (entry.isFile() && name.endsWith(".jsonl")) {
      out.push(full)
    }
  }
}

type ClaudeRecord = {
  type?: string
  timestamp?: string
  requestId?: string
  message?: {
    id?: string
    model?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
  costUSD?: number
}

function parseLine(line: string): ClaudeRecord | null {
  if (!line || line[0] !== "{") return null
  try {
    return JSON.parse(line) as ClaudeRecord
  } catch {
    return null
  }
}

function toEntry(rec: ClaudeRecord): UsageEntry | null {
  if (rec.type !== "assistant") return null
  const u = rec.message?.usage
  if (!u) return null
  const model = rec.message?.model
  if (!model) return null
  const ts = rec.timestamp ? Date.parse(rec.timestamp) : NaN
  if (!Number.isFinite(ts)) return null
  const messageId = rec.message?.id ?? ""
  const requestId = rec.requestId ?? ""
  const dedupKey = messageId && requestId ? `${messageId}:${requestId}` : null
  return {
    ts,
    model,
    source: "claude",
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    dedupKey,
    costUSD: typeof rec.costUSD === "number" ? rec.costUSD : null,
  }
}

/**
 * Read all Claude Code session JSONLs and return normalized entries.
 * Files newer than `sinceMs` are fully scanned; older ones are skipped by
 * mtime to keep the scan cheap even across many months of transcripts.
 */
export async function readClaudeUsage(sinceMs: number | null = null): Promise<UsageEntry[]> {
  const roots = claudeProjectRoots()
  const files: string[] = []
  for (const root of roots) {
    await walkJsonlFiles(root, files)
  }

  const entries: UsageEntry[] = []
  await Promise.all(
    files.map(async (file) => {
      if (sinceMs !== null) {
        try {
          const st = await stat(file)
          if (st.mtimeMs < sinceMs) return
        } catch {
          return
        }
      }
      let raw: string
      try {
        raw = await readFile(file, "utf8")
      } catch {
        return
      }
      for (const line of raw.split("\n")) {
        const rec = parseLine(line)
        if (!rec) continue
        const entry = toEntry(rec)
        if (!entry) continue
        if (sinceMs !== null && entry.ts < sinceMs) continue
        entries.push(entry)
      }
    }),
  )
  return entries
}
