import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const DEFAULT_CODEX_USAGE_POLL_ATTEMPTS = 3
const DEFAULT_CODEX_USAGE_POLL_INTERVAL_MS = 200

type EnvSource = Record<string, string | undefined>

export type CodexTokenUsage = {
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

export type CodexTokenCountInfo = {
  last_token_usage?: CodexTokenUsage
  model_context_window?: number
}

export type CodexUsageMetadata = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  modelContextWindow?: number
}

export type PollCodexUsageMetadataOptions = {
  notBeforeTimestampMs?: number
  sessionsRoot?: string
  shellEnv?: EnvSource
  processEnv?: EnvSource
  homeDir?: string
  pollAttempts?: number
  pollIntervalMs?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return Math.trunc(value)
}

function toTimestampMs(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return parsed
}

function resolveCodexSessionsRoot(
  options: PollCodexUsageMetadataOptions = {},
): string {
  if (options.sessionsRoot) return options.sessionsRoot

  const shellCodexHome = options.shellEnv?.CODEX_HOME?.trim()
  if (shellCodexHome) {
    return join(shellCodexHome, "sessions")
  }

  const processCodexHome = options.processEnv?.CODEX_HOME?.trim()
  if (processCodexHome) {
    return join(processCodexHome, "sessions")
  }

  return join(options.homeDir ?? homedir(), ".codex", "sessions")
}

async function findSessionFileById(
  sessionId: string,
  sessionsRoot: string,
): Promise<string | null> {
  const fileSuffix = `-${sessionId}.jsonl`
  const sortDesc = (values: string[]) =>
    values.sort((left, right) =>
      right.localeCompare(left, undefined, { numeric: true }),
    )
  const listNames = async (dirPath: string): Promise<string[]> => {
    try {
      return await readdir(dirPath, { encoding: "utf8" })
    } catch {
      return []
    }
  }
  const years = sortDesc(
    (await listNames(sessionsRoot)).filter((name) => /^\d{4}$/.test(name)),
  )

  for (const year of years) {
    const yearPath = join(sessionsRoot, year)
    const months = sortDesc(
      (await listNames(yearPath)).filter((name) => /^\d{2}$/.test(name)),
    )
    for (const month of months) {
      const monthPath = join(yearPath, month)
      const days = sortDesc(
        (await listNames(monthPath)).filter((name) => /^\d{2}$/.test(name)),
      )
      for (const day of days) {
        const dayPath = join(monthPath, day)
        const fileName = (await listNames(dayPath)).find((name) =>
          name.endsWith(fileSuffix),
        )
        if (fileName) {
          return join(dayPath, fileName)
        }
      }
    }
  }

  return null
}

async function readLatestTokenCountInfo(
  filePath: string,
  options?: { notBeforeTimestampMs?: number },
): Promise<CodexTokenCountInfo | null> {
  let rawContent = ""
  try {
    rawContent = await readFile(filePath, "utf8")
  } catch {
    return null
  }

  const lines = rawContent.split("\n")
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const rawLine = lines[index]?.trim()
    if (!rawLine) continue

    let parsedLine: any
    try {
      parsedLine = JSON.parse(rawLine)
    } catch {
      continue
    }

    if (
      parsedLine?.type !== "event_msg" ||
      parsedLine?.payload?.type !== "token_count"
    ) {
      continue
    }

    const eventTimestampMs = toTimestampMs(parsedLine?.timestamp)
    const notBeforeTimestampMs = options?.notBeforeTimestampMs
    if (
      notBeforeTimestampMs !== undefined &&
      (eventTimestampMs === undefined || eventTimestampMs < notBeforeTimestampMs)
    ) {
      continue
    }

    const rawInfo = parsedLine.payload?.info
    if (!rawInfo || typeof rawInfo !== "object") continue

    const rawTokenUsage = (rawInfo as any).last_token_usage
    let lastTokenUsage: CodexTokenUsage | undefined
    if (rawTokenUsage && typeof rawTokenUsage === "object") {
      const tokenUsage = rawTokenUsage as any
      const parsedTokenUsage: CodexTokenUsage = {
        input_tokens: toNonNegativeInt(tokenUsage.input_tokens),
        cached_input_tokens: toNonNegativeInt(tokenUsage.cached_input_tokens),
        output_tokens: toNonNegativeInt(tokenUsage.output_tokens),
        total_tokens: toNonNegativeInt(tokenUsage.total_tokens),
      }
      if (Object.values(parsedTokenUsage).some((tokenCount) => tokenCount !== undefined)) {
        lastTokenUsage = parsedTokenUsage
      }
    }

    const modelContextWindow = toNonNegativeInt(
      (rawInfo as any).model_context_window,
    )

    const info: CodexTokenCountInfo = {
      last_token_usage: lastTokenUsage,
      model_context_window: modelContextWindow,
    }
    if (!info.last_token_usage && info.model_context_window === undefined) continue

    return info
  }

  return null
}

export function mapCodexTokenCountInfoToUsageMetadata(
  info: CodexTokenCountInfo,
): CodexUsageMetadata | null {
  const perMessageUsage = info.last_token_usage

  if (!perMessageUsage && info.model_context_window === undefined) {
    return null
  }

  const inputTokens =
    perMessageUsage?.input_tokens !== undefined
      ? Math.max(
          0,
          perMessageUsage.input_tokens - (perMessageUsage.cached_input_tokens ?? 0),
        )
      : undefined
  const outputTokens = perMessageUsage?.output_tokens
  const totalTokens =
    perMessageUsage?.total_tokens ??
    (perMessageUsage?.input_tokens !== undefined || perMessageUsage?.output_tokens !== undefined
      ? (perMessageUsage?.input_tokens ?? 0) + (perMessageUsage?.output_tokens ?? 0)
      : undefined
    )

  const usageMetadata: CodexUsageMetadata = {}
  if (inputTokens !== undefined) usageMetadata.inputTokens = inputTokens
  if (outputTokens !== undefined) usageMetadata.outputTokens = outputTokens
  if (totalTokens !== undefined) usageMetadata.totalTokens = totalTokens
  if (info.model_context_window !== undefined) {
    usageMetadata.modelContextWindow = info.model_context_window
  }

  return Object.keys(usageMetadata).length > 0 ? usageMetadata : null
}

export async function pollCodexUsageMetadata(
  sessionId: string,
  options: PollCodexUsageMetadataOptions = {},
): Promise<CodexUsageMetadata | null> {
  const sessionsRoot = resolveCodexSessionsRoot(options)
  const pollAttempts = options.pollAttempts ?? DEFAULT_CODEX_USAGE_POLL_ATTEMPTS
  const pollIntervalMs =
    options.pollIntervalMs ?? DEFAULT_CODEX_USAGE_POLL_INTERVAL_MS
  let sessionFilePath: string | null = null

  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    if (!sessionFilePath) {
      sessionFilePath = await findSessionFileById(sessionId, sessionsRoot)
    }

    if (sessionFilePath) {
      const latestInfo = await readLatestTokenCountInfo(sessionFilePath, {
        notBeforeTimestampMs: options.notBeforeTimestampMs,
      })
      if (latestInfo) {
        const usageMetadata = mapCodexTokenCountInfoToUsageMetadata(latestInfo)
        if (usageMetadata) {
          return usageMetadata
        }
      }
    }

    if (attempt < pollAttempts - 1) {
      await sleep(pollIntervalMs)
    }
  }

  return null
}
