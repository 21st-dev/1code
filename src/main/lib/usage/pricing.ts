/**
 * Bundled model pricing snapshot (USD per 1M tokens).
 * Snapshotted from https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
 * on 2026-04-17. Update this file when new models ship.
 *
 * Matching is prefix-based so that dated variants like "claude-opus-4-6-20250929"
 * resolve to the base model entry.
 */

export type ModelRates = {
  /** USD per 1M input tokens. */
  input: number
  /** USD per 1M output tokens. */
  output: number
  /** USD per 1M tokens written to the 5-minute ephemeral cache (Anthropic). */
  cacheWrite?: number
  /** USD per 1M tokens read from cache (both providers). */
  cacheRead?: number
}

type PricingEntry = {
  /** Display name shown in the UI. */
  displayName: string
  /** Provider bucket for grouping + the source toggle. */
  provider: "claude" | "codex"
  rates: ModelRates
}

/**
 * Ordered list of (prefix, entry) pairs. Longest-prefix-wins during lookup —
 * the ordering here is the tie-breaker when two prefixes overlap (e.g.,
 * "claude-opus-4-6" should win over "claude-opus-4").
 */
const PRICING_TABLE: ReadonlyArray<readonly [string, PricingEntry]> = [
  // Claude — most specific first
  ["claude-opus-4-7", { displayName: "Opus 4.7", provider: "claude", rates: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 } }],
  ["claude-opus-4-6", { displayName: "Opus 4.6", provider: "claude", rates: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 } }],
  ["claude-opus-4-5", { displayName: "Opus 4.5", provider: "claude", rates: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 } }],
  ["claude-opus-4-1", { displayName: "Opus 4.1", provider: "claude", rates: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } }],
  ["claude-opus-4",   { displayName: "Opus 4",   provider: "claude", rates: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } }],
  ["claude-sonnet-4-6", { displayName: "Sonnet 4.6", provider: "claude", rates: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } }],
  ["claude-sonnet-4-5", { displayName: "Sonnet 4.5", provider: "claude", rates: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } }],
  ["claude-sonnet-4",   { displayName: "Sonnet 4",   provider: "claude", rates: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } }],
  ["claude-haiku-4-5",  { displayName: "Haiku 4.5",  provider: "claude", rates: { input: 1, output: 5,  cacheWrite: 1.25, cacheRead: 0.1 } }],
  ["claude-haiku-4",    { displayName: "Haiku 4",    provider: "claude", rates: { input: 1, output: 5,  cacheWrite: 1.25, cacheRead: 0.1 } }],
  ["claude-3-7-sonnet", { displayName: "Sonnet 3.7", provider: "claude", rates: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } }],
  ["claude-3-5-sonnet", { displayName: "Sonnet 3.5", provider: "claude", rates: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } }],
  ["claude-3-5-haiku",  { displayName: "Haiku 3.5",  provider: "claude", rates: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 } }],
  ["claude-3-opus",     { displayName: "Opus 3",     provider: "claude", rates: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } }],
  ["claude-3-haiku",    { displayName: "Haiku 3",    provider: "claude", rates: { input: 0.25, output: 1.25, cacheWrite: 0.3, cacheRead: 0.03 } }],

  // Codex / OpenAI — Codex CLI reports `cached_input_tokens` (no cache-write distinction)
  ["gpt-5.4-mini",  { displayName: "GPT-5.4 mini", provider: "codex", rates: { input: 0.75, output: 4.5,  cacheRead: 0.075 } }],
  ["gpt-5.4",       { displayName: "GPT-5.4",      provider: "codex", rates: { input: 2.5,  output: 15,   cacheRead: 0.25 } }],
  ["gpt-5.3-codex", { displayName: "GPT-5.3 Codex",provider: "codex", rates: { input: 1.75, output: 14,   cacheRead: 0.175 } }],
  ["gpt-5.2-codex", { displayName: "GPT-5.2 Codex",provider: "codex", rates: { input: 1.75, output: 14,   cacheRead: 0.175 } }],
  ["gpt-5-codex",   { displayName: "GPT-5 Codex",  provider: "codex", rates: { input: 1.25, output: 10 } }],
  ["gpt-5-mini",    { displayName: "GPT-5 mini",   provider: "codex", rates: { input: 0.25, output: 2,    cacheRead: 0.025 } }],
  ["gpt-5",         { displayName: "GPT-5",        provider: "codex", rates: { input: 1.25, output: 10,   cacheRead: 0.125 } }],
  ["gpt-4.1-mini",  { displayName: "GPT-4.1 mini", provider: "codex", rates: { input: 0.4,  output: 1.6,  cacheRead: 0.1 } }],
  ["gpt-4.1",       { displayName: "GPT-4.1",      provider: "codex", rates: { input: 2,    output: 8,    cacheRead: 0.5 } }],
  ["o4-mini",       { displayName: "o4-mini",      provider: "codex", rates: { input: 1.1,  output: 4.4,  cacheRead: 0.275 } }],
  ["o3-mini",       { displayName: "o3-mini",      provider: "codex", rates: { input: 1.1,  output: 4.4,  cacheRead: 0.55 } }],
  ["o3",            { displayName: "o3",           provider: "codex", rates: { input: 2,    output: 8,    cacheRead: 0.5 } }],
  ["o1-mini",       { displayName: "o1-mini",      provider: "codex", rates: { input: 1.1,  output: 4.4,  cacheRead: 0.55 } }],
  ["o1",            { displayName: "o1",           provider: "codex", rates: { input: 15,   output: 60,   cacheRead: 7.5 } }],
]

/**
 * Look up rates + display info for a model name.
 * Matches the longest prefix in PRICING_TABLE. Returns null for unknown models
 * so callers can surface "unpriced" instead of silently charging $0.
 */
export function priceFor(model: string | undefined | null): PricingEntry | null {
  if (!model) return null
  const normalized = model.toLowerCase()
  let best: PricingEntry | null = null
  let bestLen = 0
  for (const [prefix, entry] of PRICING_TABLE) {
    if (normalized.startsWith(prefix) && prefix.length > bestLen) {
      best = entry
      bestLen = prefix.length
    }
  }
  return best
}

/**
 * Compute cost in USD given a token bucket and a model name.
 * Returns null when the model is unpriced — caller decides how to surface.
 */
export function costForTokens(
  model: string | undefined | null,
  tokens: { input: number; output: number; cacheWrite: number; cacheRead: number },
): number | null {
  const entry = priceFor(model)
  if (!entry) return null
  const r = entry.rates
  const perMillion = 1_000_000
  return (
    (tokens.input * r.input) / perMillion +
    (tokens.output * r.output) / perMillion +
    (tokens.cacheWrite * (r.cacheWrite ?? 0)) / perMillion +
    (tokens.cacheRead * (r.cacheRead ?? 0)) / perMillion
  )
}

/** Resolve a display name, falling back to the raw id when unknown. */
export function displayNameFor(model: string | undefined | null): string {
  const entry = priceFor(model)
  return entry?.displayName ?? (model ?? "unknown")
}
