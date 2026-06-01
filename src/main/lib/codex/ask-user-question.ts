import { acpTools } from "@mcpc-tech/acp-ai-provider"
import { randomUUID } from "node:crypto"
import { tool } from "ai"
import { z } from "zod"

export const CODEX_ASK_USER_QUESTION_TOOL_NAME = "AskUserQuestion"
export const CODEX_ASK_USER_QUESTION_PROXY_SERVER = "acp-ai-sdk-tools"
export const QUESTIONS_SKIPPED_MESSAGE =
  "User skipped questions - proceed with defaults"
export const QUESTIONS_TIMED_OUT_MESSAGE = "Timed out"

export type CodexAskUserQuestionOption = {
  label: string
  description: string
}

export type CodexAskUserQuestion = {
  question: string
  header: string
  options: CodexAskUserQuestionOption[]
  multiSelect: boolean
}

export type CodexAskUserQuestionApproval = {
  approved: boolean
  message?: string
  updatedInput?: unknown
}

export type CodexAskUserQuestionPending = {
  subChatId: string
  resolve: (response: CodexAskUserQuestionApproval) => void
}

type EmitCodexAskUserQuestionChunk = (chunk: Record<string, unknown>) => void

const ASK_USER_QUESTION_RESULT_NORMALIZER_FLAG =
  "__locusCodexAskUserQuestionResultNormalizerInstalled"

const optionSchema = z
  .object({
    label: z.string(),
    description: z.string().optional(),
  })
  .passthrough()

const questionSchema = z
  .object({
    question: z.string(),
    header: z.string().optional(),
    options: z.array(optionSchema).optional(),
    multiSelect: z.boolean().optional(),
  })
  .passthrough()

export const codexAskUserQuestionInputSchema = z
  .object({
    questions: z.array(questionSchema).min(1),
  })
  .passthrough()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function isAskUserQuestionToolName(value: unknown): boolean {
  if (typeof value !== "string") return false
  return (
    value === CODEX_ASK_USER_QUESTION_TOOL_NAME ||
    value.includes(
      `${CODEX_ASK_USER_QUESTION_PROXY_SERVER}/${CODEX_ASK_USER_QUESTION_TOOL_NAME}`,
    )
  )
}

function toAcpToolCallContent(item: unknown): Record<string, unknown> | null {
  if (!isRecord(item) || typeof item.type !== "string") return null
  if (item.type === "content" && isRecord(item.content)) return item
  return {
    type: "content",
    content: item,
  }
}

export function normalizeCodexAskUserQuestionAcpToolResult(
  value: unknown,
): Record<string, unknown>[] {
  const rawContent = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.content)
      ? value.content
      : null

  if (rawContent) {
    const content = rawContent
      .map(toAcpToolCallContent)
      .filter((item): item is Record<string, unknown> => Boolean(item))
    if (content.length > 0) return content
  }

  if (value === null || value === undefined) return []

  return [
    {
      type: "content",
      content: {
        type: "text",
        text: safeStringify(value),
      },
    },
  ]
}

export function installCodexAskUserQuestionAcpResultNormalizer(
  model: unknown,
): boolean {
  const target = model as {
    parseToolResult?: (update: unknown) => unknown
    toolCallsMap?: Map<string, { name?: unknown }>
    [ASK_USER_QUESTION_RESULT_NORMALIZER_FLAG]?: boolean
  }

  if (target[ASK_USER_QUESTION_RESULT_NORMALIZER_FLAG]) return true
  if (typeof target.parseToolResult !== "function") return false

  const originalParseToolResult = target.parseToolResult
  target.parseToolResult = function parseToolResultWithAskUserQuestionShape(
    this: {
      toolCallsMap?: Map<string, { name?: unknown }>
    },
    update: unknown,
  ) {
    const parsed = originalParseToolResult.call(this, update)
    if (!isRecord(parsed)) return parsed

    const toolCallId =
      typeof parsed.toolCallId === "string" ? parsed.toolCallId : null
    const storedToolName =
      toolCallId && this.toolCallsMap instanceof Map
        ? this.toolCallsMap.get(toolCallId)?.name
        : undefined
    const updateTitle =
      isRecord(update) && typeof update.title === "string"
        ? update.title
        : undefined

    if (
      ![
        parsed.toolName,
        storedToolName,
        updateTitle,
      ].some(isAskUserQuestionToolName)
    ) {
      return parsed
    }

    return {
      ...parsed,
      toolResult: normalizeCodexAskUserQuestionAcpToolResult(
        parsed.toolResult,
      ),
    }
  }
  target[ASK_USER_QUESTION_RESULT_NORMALIZER_FLAG] = true

  return true
}

export function normalizeCodexAskUserQuestions(
  input: unknown,
): CodexAskUserQuestion[] {
  const parsed = codexAskUserQuestionInputSchema.safeParse(input)
  const rawQuestions = parsed.success
    ? parsed.data.questions
    : isRecord(input) && typeof input.question === "string"
      ? [
          {
            question: input.question,
            header:
              typeof input.header === "string" ? input.header : undefined,
            options: Array.isArray(input.options) ? input.options : undefined,
            multiSelect:
              typeof input.multiSelect === "boolean"
                ? input.multiSelect
                : undefined,
          },
        ]
      : []

  return rawQuestions
    .map((question) => {
      const questionText =
        typeof question.question === "string" ? question.question.trim() : ""
      if (!questionText) return null

      const options = Array.isArray(question.options)
        ? question.options
            .map((option) => {
              if (!isRecord(option)) return null
              const label =
                typeof option.label === "string" ? option.label.trim() : ""
              if (!label) return null
              return {
                label,
                description:
                  typeof option.description === "string"
                    ? option.description
                    : "",
              }
            })
            .filter((option): option is CodexAskUserQuestionOption =>
              Boolean(option),
            )
        : []

      return {
        question: questionText,
        header:
          typeof question.header === "string" && question.header.trim()
            ? question.header.trim()
            : questionText,
        options,
        multiSelect: Boolean(question.multiSelect),
      }
    })
    .filter((question): question is CodexAskUserQuestion => Boolean(question))
}

export function extractCodexAskUserQuestionAnswers(
  updatedInput: unknown,
): Record<string, string> {
  if (!isRecord(updatedInput) || !isRecord(updatedInput.answers)) {
    return {}
  }

  const answers: Record<string, string> = {}
  for (const [question, answer] of Object.entries(updatedInput.answers)) {
    if (typeof answer === "string") {
      answers[question] = answer
    }
  }
  return answers
}

export function createCodexAskUserQuestionTools(input: {
  subChatId: string
  emit: EmitCodexAskUserQuestionChunk
  registerPending: (
    toolUseId: string,
    pending: CodexAskUserQuestionPending,
  ) => void
  unregisterPending: (toolUseId: string) => void
  timeoutMs?: number
}) {
  const timeoutMs = input.timeoutMs ?? 60000

  return acpTools({
    [CODEX_ASK_USER_QUESTION_TOOL_NAME]: tool({
      description:
        "Ask the user a blocking clarification question. Use this before proceeding when user input is required.",
      inputSchema: codexAskUserQuestionInputSchema,
      execute: async (rawInput: unknown) => {
        const questions = normalizeCodexAskUserQuestions(rawInput)
        const toolUseId = `codex-ask-${randomUUID()}`

        if (questions.length === 0) {
          return "AskUserQuestion was called without a valid question."
        }

        input.emit({
          type: "ask-user-question",
          toolUseId,
          questions,
        })

        const response = await new Promise<CodexAskUserQuestionApproval>(
          (resolve) => {
            const timeoutId = setTimeout(() => {
              input.unregisterPending(toolUseId)
              input.emit({
                type: "ask-user-question-timeout",
                toolUseId,
              })
              resolve({
                approved: false,
                message: QUESTIONS_TIMED_OUT_MESSAGE,
              })
            }, timeoutMs)

            input.registerPending(toolUseId, {
              subChatId: input.subChatId,
              resolve: (approval) => {
                clearTimeout(timeoutId)
                resolve(approval)
              },
            })
          },
        )

        input.unregisterPending(toolUseId)

        if (!response.approved) {
          const result = response.message || QUESTIONS_SKIPPED_MESSAGE
          input.emit({
            type: "ask-user-question-result",
            toolUseId,
            result,
          })
          return result
        }

        const result = {
          answers: extractCodexAskUserQuestionAnswers(response.updatedInput),
        }
        input.emit({
          type: "ask-user-question-result",
          toolUseId,
          result,
        })
        return JSON.stringify(result)
      },
    }),
  })
}
