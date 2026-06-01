import { describe, expect, test } from "bun:test"
import {
  CODEX_ASK_USER_QUESTION_TOOL_NAME,
  QUESTIONS_SKIPPED_MESSAGE,
  QUESTIONS_TIMED_OUT_MESSAGE,
  createCodexAskUserQuestionTools,
  installCodexAskUserQuestionAcpResultNormalizer,
  normalizeCodexAskUserQuestionAcpToolResult,
  normalizeCodexAskUserQuestions,
  type CodexAskUserQuestionPending,
} from "../src/main/lib/codex/ask-user-question"
import {
  normalizeCodexAssistantMessage,
  normalizeCodexStreamChunk,
} from "../src/shared/codex-tool-normalizer"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createHarness(timeoutMs = 1000) {
  const chunks: Record<string, any>[] = []
  const pending = new Map<string, CodexAskUserQuestionPending>()
  const tools = createCodexAskUserQuestionTools({
    subChatId: "subchat-1",
    timeoutMs,
    emit: (chunk) => chunks.push(chunk),
    registerPending: (toolUseId, item) => pending.set(toolUseId, item),
    unregisterPending: (toolUseId) => pending.delete(toolUseId),
  })
  const execute = (tools as any)[CODEX_ASK_USER_QUESTION_TOOL_NAME].execute as (
    input: unknown,
  ) => Promise<unknown>

  return { chunks, pending, execute }
}

describe("Codex AskUserQuestion bridge", () => {
  test("normalizes question input for the shared desktop UI", () => {
    expect(
      normalizeCodexAskUserQuestions({
        questions: [
          {
            question: "Proceed?",
            options: [{ label: "Yes" }, { label: "No", description: "Stop" }],
          },
        ],
      }),
    ).toEqual([
      {
        question: "Proceed?",
        header: "Proceed?",
        options: [
          { label: "Yes", description: "" },
          { label: "No", description: "Stop" },
        ],
        multiSelect: false,
      },
    ])
  })

  test("emits pending and result events when the user answers", async () => {
    const { chunks, pending, execute } = createHarness()
    const promise = execute({
      questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
    })

    expect(chunks[0]).toMatchObject({
      type: "ask-user-question",
      questions: [{ question: "Proceed?" }],
    })
    const toolUseId = chunks[0].toolUseId
    expect(pending.has(toolUseId)).toBe(true)

    pending.get(toolUseId)?.resolve({
      approved: true,
      updatedInput: {
        answers: {
          "Proceed?": "Yes",
        },
      },
    })

    await expect(promise).resolves.toBe(JSON.stringify({
      answers: {
        "Proceed?": "Yes",
      },
    }))
    expect(chunks.at(-1)).toEqual({
      type: "ask-user-question-result",
      toolUseId,
      result: {
        answers: {
          "Proceed?": "Yes",
        },
      },
    })
    expect(pending.has(toolUseId)).toBe(false)
  })

  test("emits denial result events when the user skips", async () => {
    const { chunks, pending, execute } = createHarness()
    const promise = execute({
      questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
    })
    const toolUseId = chunks[0].toolUseId

    pending.get(toolUseId)?.resolve({
      approved: false,
      message: QUESTIONS_SKIPPED_MESSAGE,
    })

    await expect(promise).resolves.toBe(QUESTIONS_SKIPPED_MESSAGE)
    expect(chunks.at(-1)).toEqual({
      type: "ask-user-question-result",
      toolUseId,
      result: QUESTIONS_SKIPPED_MESSAGE,
    })
  })

  test("emits timeout and result events when unanswered", async () => {
    const { chunks, pending, execute } = createHarness(5)
    const promise = execute({
      questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
    })
    const toolUseId = chunks[0].toolUseId

    await sleep(20)

    await expect(promise).resolves.toBe(QUESTIONS_TIMED_OUT_MESSAGE)
    expect(pending.has(toolUseId)).toBe(false)
    expect(chunks).toContainEqual({
      type: "ask-user-question-timeout",
      toolUseId,
    })
    expect(chunks.at(-1)).toEqual({
      type: "ask-user-question-result",
      toolUseId,
      result: QUESTIONS_TIMED_OUT_MESSAGE,
    })
  })

  test("normalizes Codex ACP proxy tool chunks into AskUserQuestion parts", () => {
    expect(
      normalizeCodexStreamChunk({
        type: "tool-input-available",
        toolCallId: "tool-1",
        toolName: "Tool: acp-ai-sdk-tools/AskUserQuestion",
        input: {
          args: {
            questions: [{ question: "Proceed?" }],
          },
        },
      }),
    ).toMatchObject({
      type: "tool-input-available",
      toolName: "AskUserQuestion",
      input: {
        questions: [{ question: "Proceed?" }],
      },
    })

    expect(
      normalizeCodexAssistantMessage(
        {
          role: "assistant",
          parts: [
            {
              type: "tool-acp.acp_provider_agent_dynamic_tool",
              toolName: "Tool: acp-ai-sdk-tools/AskUserQuestion",
              input: {
                args: {
                  questions: [{ question: "Proceed?" }],
                },
              },
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({ answers: { "Proceed?": "Yes" } }),
                  },
                ],
              },
            },
          ],
        },
        { normalizeState: true },
      ),
    ).toMatchObject({
      role: "assistant",
      parts: [
        {
          type: "tool-AskUserQuestion",
          input: {
            questions: [{ question: "Proceed?" }],
          },
          result: {
            answers: { "Proceed?": "Yes" },
          },
        },
      ],
    })

    expect(
      normalizeCodexAssistantMessage(
        {
          role: "assistant",
          parts: [
            {
              type: "tool-acp.acp_provider_agent_dynamic_tool",
              toolName: "Tool: acp-ai-sdk-tools/AskUserQuestion",
              input: {
                args: {
                  questions: [{ question: "Proceed?" }],
                },
              },
              result: [
                {
                  type: "content",
                  content: {
                    type: "text",
                    text: JSON.stringify({
                      answers: { "Proceed?": "Yes" },
                    }),
                  },
                },
              ],
            },
          ],
        },
        { normalizeState: true },
      ),
    ).toMatchObject({
      role: "assistant",
      parts: [
        {
          type: "tool-AskUserQuestion",
          result: {
            answers: { "Proceed?": "Yes" },
          },
        },
      ],
    })
  })

  test("normalizes AskUserQuestion MCP tool results to ACP content arrays", () => {
    expect(
      normalizeCodexAskUserQuestionAcpToolResult({
        content: [
          {
            type: "text",
            text: JSON.stringify({ answers: { "Proceed?": "Yes" } }),
          },
        ],
        isError: false,
      }),
    ).toEqual([
      {
        type: "content",
        content: {
          type: "text",
          text: JSON.stringify({ answers: { "Proceed?": "Yes" } }),
        },
      },
    ])
  })

  test("keeps ACP provider AskUserQuestion failed updates from iterating object results", async () => {
    const { createACPProvider } = await import("@mcpc-tech/acp-ai-provider")
    const provider = createACPProvider({ command: "/bin/echo" })
    const model = provider.languageModel()
    const enqueued: Record<string, any>[] = []
    const controller = {
      enqueue: (part: Record<string, any>) => enqueued.push(part),
      close: () => {},
    }
    const title = "Tool: acp-ai-sdk-tools/AskUserQuestion"
    const anyModel = model as any

    installCodexAskUserQuestionAcpResultNormalizer(model)

    expect(() => {
      anyModel.handleStreamNotification(controller, {
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tool-1",
          title,
          rawInput: { questions: [{ question: "Proceed?" }] },
        },
      })
      anyModel.handleStreamNotification(controller, {
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "tool-1",
          title,
          status: "failed",
          rawOutput: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ answers: { "Proceed?": "Yes" } }),
              },
            ],
          },
        },
      })
    }).not.toThrow()

    const result = enqueued.find((part) => part.type === "tool-result")
    expect(result?.isError).toBe(true)
    expect(result?.result).toBeInstanceOf(Error)
    expect((result?.result as Error).message).toBe(
      JSON.stringify({ answers: { "Proceed?": "Yes" } }),
    )
  })
})
