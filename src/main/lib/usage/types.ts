/**
 * Normalized usage entry produced by each reader.
 * All token fields are absolute counts (not deltas). `source` tells the
 * aggregator which provider the entry came from so the UI can filter by it.
 */
export type UsageSource = "claude" | "codex"

export type UsageEntry = {
  /** Wall-clock timestamp of the record (ms since epoch). */
  ts: number
  /** Raw model id from the provider (e.g., "claude-opus-4-6", "gpt-5-codex"). */
  model: string
  source: UsageSource
  inputTokens: number
  outputTokens: number
  /** Cache-creation tokens (Anthropic only; 0 for Codex). */
  cacheCreationTokens: number
  /** Cache-read tokens (both providers). */
  cacheReadTokens: number
  /** Stable id used for dedup: `${messageId}:${requestId}`. Claude-only in practice. */
  dedupKey: string | null
  /**
   * Cost pre-computed by the provider, when available.
   * Anthropic Claude Code writes this on some assistant messages. Prefer it
   * when present so totals line up with Anthropic's own billing numbers.
   */
  costUSD: number | null
}

export type UsagePeriod = "7d" | "30d" | "90d" | "all"
export type UsageSourceFilter = UsageSource | "all"
