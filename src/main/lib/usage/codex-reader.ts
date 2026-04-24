import type { Dirent } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { UsageEntry } from "./types"

function codexSessionsRoot(): string {
  // Codex CLI does not advertise a CODEX_CONFIG_DIR override today; hardcode
  // the default but keep it centralized so a future override is a one-liner.
  return join(homedir(), ".codex", "sessions")
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
    } else if (
      entry.isFile() &&
      name.startsWith("rollout-") &&
      name.endsWith(".jsonl")
    ) {
      out.push(full)
    }
  }
}

type CodexRecord = {
  type?: string
  timestamp?: string
  payload?: {
    type?: string
    model?: string
    info?: {
      last_token_usage?: {
        input_tokens?: number
        cached_input_tokens?: number
        output_tokens?: number
        total_tokens?: number
      }
    }
  }
}

function parseLine(line: string): CodexRecord | null {
  if (!line || line[0] !== "{") return null
  try {
    return JSON.parse(line) as CodexRecord
  } catch {
    return null
  }
}

/**
 * Scan one Codex session file.
 *
 * Codex CLI writes a `session_meta` line at the top, then `turn_context`
 * (which carries the model), then an `event_msg` of payload-type `token_count`
 * after each model response. The token_count payload carries
 * `info.last_token_usage` — interpreted here as the usage for the response
 * that just finished, so summing across events gives the session total.
 *
 * `input_tokens` in Codex INCLUDES cached tokens (unlike Anthropic), so we
 * subtract `cached_input_tokens` to land on a comparable "true new input"
 * bucket. The cached portion goes into `cacheReadTokens`.
 */
async function readSession(file: string, sinceMs: number | null): Promise<UsageEntry[]> {
  let raw: string
  try {
    raw = await readFile(file, "utf8")
  } catch {
    return []
  }
  let currentModel: string | null = null
  const out: UsageEntry[] = []
  let tokenEventIndex = 0

  for (const line of raw.split("\n")) {
    const rec = parseLine(line)
    if (!rec) continue

    if (rec.type === "turn_context" && rec.payload?.model) {
      currentModel = rec.payload.model
      continue
    }
    if (rec.type === "session_meta" && rec.payload?.model && !currentModel) {
      currentModel = rec.payload.model
      continue
    }

    if (rec.type !== "event_msg" || rec.payload?.type !== "token_count") continue
    const usage = rec.payload?.info?.last_token_usage
    if (!usage) continue

    const ts = rec.timestamp ? Date.parse(rec.timestamp) : NaN
    if (!Number.isFinite(ts)) continue
    if (sinceMs !== null && ts < sinceMs) continue

    const inputWithCached = usage.input_tokens ?? 0
    const cached = usage.cached_input_tokens ?? 0
    const inputUncached = Math.max(0, inputWithCached - cached)
    const output = usage.output_tokens ?? 0
    if (inputUncached === 0 && output === 0 && cached === 0) continue

    out.push({
      ts,
      model: currentModel ?? "gpt-unknown",
      source: "codex",
      inputTokens: inputUncached,
      outputTokens: output,
      cacheCreationTokens: 0,
      cacheReadTokens: cached,
      dedupKey: `${file}:${tokenEventIndex}`,
      costUSD: null,
    })
    tokenEventIndex += 1
  }
  return out
}

export async function readCodexUsage(sinceMs: number | null = null): Promise<UsageEntry[]> {
  const files: string[] = []
  await walkJsonlFiles(codexSessionsRoot(), files)

  const results = await Promise.all(
    files.map(async (file) => {
      if (sinceMs !== null) {
        try {
          const st = await stat(file)
          if (st.mtimeMs < sinceMs) return []
        } catch {
          return []
        }
      }
      return readSession(file, sinceMs)
    }),
  )
  return results.flat()
}
