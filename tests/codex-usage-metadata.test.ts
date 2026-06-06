import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createCodexUsageMetadataResolver,
  pollCodexUsageMetadata,
} from "../src/main/lib/codex/usage-metadata"

async function withSessionFile(
  sessionId: string,
  lines: unknown[],
  run: (sessionsRoot: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "codex-usage-"))
  try {
    const dayDir = join(root, "2026", "06", "07")
    await mkdir(dayDir, { recursive: true })
    await writeFile(
      join(dayDir, `rollout-${sessionId}.jsonl`),
      `${lines.map((line) => typeof line === "string" ? line : JSON.stringify(line)).join("\n")}\n`,
    )
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("Codex usage metadata", () => {
  test("reads token_count events from Codex session jsonl", async () => {
    await withSessionFile(
      "session-1",
      [
        "not json",
        {
          type: "event_msg",
          timestamp: "2026-06-07T00:00:00.000Z",
          payload: {
            type: "token_count",
            info: {
              last_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 40,
                output_tokens: 20,
                total_tokens: 120,
              },
              model_context_window: 200000,
            },
          },
        },
      ],
      async (sessionsRoot) => {
        await expect(
          pollCodexUsageMetadata("session-1", {
            sessionsRoot,
            pollAttempts: 1,
          }),
        ).resolves.toEqual({
          inputTokens: 60,
          outputTokens: 20,
          totalTokens: 120,
          modelContextWindow: 200000,
        })
      },
    )
  })

  test("ignores token_count events older than the current run", async () => {
    await withSessionFile(
      "session-2",
      [
        {
          type: "event_msg",
          timestamp: "2026-06-07T00:00:00.000Z",
          payload: {
            type: "token_count",
            info: {
              last_token_usage: {
                input_tokens: 99,
                output_tokens: 1,
              },
            },
          },
        },
        {
          type: "event_msg",
          timestamp: "2026-06-07T02:00:00.000Z",
          payload: {
            type: "token_count",
            info: {
              last_token_usage: {
                input_tokens: 8,
                output_tokens: 4,
              },
            },
          },
        },
      ],
      async (sessionsRoot) => {
        await expect(
          pollCodexUsageMetadata("session-2", {
            sessionsRoot,
            notBeforeTimestampMs: Date.parse("2026-06-07T01:00:00.000Z"),
            pollAttempts: 1,
          }),
        ).resolves.toEqual({
          inputTokens: 8,
          outputTokens: 4,
          totalTokens: 12,
        })
      },
    )
  })

  test("resolver tracks session id updates and resolves metadata once", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "codex-home-"))
    try {
      const sessionId = "session-3"
      const dayDir = join(codexHome, "sessions", "2026", "06", "07")
      await mkdir(dayDir, { recursive: true })
      await writeFile(
        join(dayDir, `rollout-${sessionId}.jsonl`),
        `${JSON.stringify({
          type: "event_msg",
          timestamp: "2026-06-07T02:00:00.000Z",
          payload: {
            type: "token_count",
            info: {
              last_token_usage: {
                input_tokens: 12,
                cached_input_tokens: 2,
                output_tokens: 5,
              },
            },
          },
        })}\n`,
      )

      const resolver = createCodexUsageMetadataResolver({
        provider: { getSessionId: () => null },
        startedAt: Date.parse("2026-06-07T01:00:00.000Z"),
        shellEnv: { CODEX_HOME: codexHome },
        processEnv: {},
      })

      expect(resolver.getSessionId()).toBeNull()
      resolver.setSessionId(sessionId)
      expect(resolver.getSessionId()).toBe(sessionId)
      await expect(resolver.resolveOnce()).resolves.toEqual({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 17,
      })
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })
})
