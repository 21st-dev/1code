import {
  QUESTIONS_SKIPPED_MESSAGE,
  QUESTIONS_TIMED_OUT_MESSAGE,
  extractCodexAskUserQuestionAnswers,
  type CodexAskUserQuestion,
  type CodexAskUserQuestionApproval,
  type CodexAskUserQuestionOption,
  type CodexAskUserQuestionPending,
} from "./ask-user-question"

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
type JsonObject = { [key: string]: JsonValue }

export type CodexAppServerToolRequestUserInputOption = {
  label: string
  description: string
}

export type CodexAppServerToolRequestUserInputQuestion = {
  id: string
  header: string
  question: string
  isOther: boolean
  isSecret: boolean
  options: CodexAppServerToolRequestUserInputOption[] | null
}

export type CodexAppServerToolRequestUserInputParams = {
  threadId: string
  turnId: string
  itemId: string
  questions: CodexAppServerToolRequestUserInputQuestion[]
}

export type CodexAppServerToolRequestUserInputResponse = {
  answers: Record<string, { answers: string[] }>
}

export type CodexAppServerMcpElicitationPrimitiveSchema = {
  type: "string" | "number" | "integer" | "boolean" | "array"
  title?: string
  description?: string
  enum?: string[]
  enumNames?: string[]
  anyOf?: { const?: string; title?: string }[]
  items?: {
    enum?: string[]
    anyOf?: { const?: string; title?: string }[]
  }
}

export type CodexAppServerMcpElicitationSchema = {
  type: "object"
  properties: Record<string, CodexAppServerMcpElicitationPrimitiveSchema>
  required?: string[]
}

export type CodexAppServerMcpElicitationRequestParams = {
  threadId: string
  turnId: string | null
  serverName: string
  _meta: JsonValue | null
  message: string
} & (
  | {
      mode: "form"
      requestedSchema: CodexAppServerMcpElicitationSchema
    }
  | {
      mode: "url"
      url: string
      elicitationId: string
    }
)

export type CodexAppServerMcpElicitationRequestResponse = {
  action: "accept" | "decline" | "cancel"
  content: JsonValue | null
  _meta: JsonValue | null
}

export type CreateCodexAppServerUserInteractionBridgeInput = {
  subChatId: string
  emit: (chunk: Record<string, unknown>) => void
  registerPending: (
    toolUseId: string,
    pending: CodexAskUserQuestionPending,
  ) => void
  unregisterPending: (toolUseId: string) => void
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 60000
const SECRET_KEY_PATTERN =
  /(?:api[_-]?key|authorization|bearer|cookie|oauth|password|secret|token)/i

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeOptions(
  options: CodexAppServerToolRequestUserInputOption[] | null | undefined,
  isOther: boolean,
): CodexAskUserQuestionOption[] {
  const normalized = Array.isArray(options)
    ? options
        .map((option) => {
          const label = cleanText(option.label)
          if (!label) return null
          return {
            label,
            description: cleanText(option.description),
          }
        })
        .filter((option): option is CodexAskUserQuestionOption =>
          Boolean(option),
        )
    : []

  if (isOther && !normalized.some((option) => option.label === "Other")) {
    normalized.push({ label: "Other", description: "" })
  }

  return normalized
}

export function normalizeCodexAppServerUserInputQuestions(
  params: CodexAppServerToolRequestUserInputParams,
): CodexAskUserQuestion[] {
  return params.questions
    .map((question) => {
      const questionText = cleanText(question.question)
      if (!question.id || !questionText) return null
      const header = cleanText(question.header) || questionText
      return {
        question: questionText,
        header,
        options: normalizeOptions(question.options, Boolean(question.isOther)),
        multiSelect: false,
      }
    })
    .filter((question): question is CodexAskUserQuestion => Boolean(question))
}

function answerForQuestion(
  answersByPrompt: Record<string, string>,
  question: {
    id: string
    header: string
    question: string
  },
): string | null {
  return (
    answersByPrompt[question.id] ??
    answersByPrompt[question.question] ??
    answersByPrompt[question.header] ??
    null
  )
}

export function buildCodexAppServerUserInputResponse(
  params: CodexAppServerToolRequestUserInputParams,
  approval: CodexAskUserQuestionApproval,
): CodexAppServerToolRequestUserInputResponse {
  if (!approval.approved) return { answers: {} }

  const answersByPrompt = extractCodexAskUserQuestionAnswers(
    approval.updatedInput,
  )
  const answers: CodexAppServerToolRequestUserInputResponse["answers"] = {}

  for (const question of params.questions) {
    const answer = answerForQuestion(answersByPrompt, question)
    if (answer === null) continue
    answers[question.id] = { answers: [answer] }
  }

  return { answers }
}

function redactedUserInputResult(
  params: CodexAppServerToolRequestUserInputParams,
  response: CodexAppServerToolRequestUserInputResponse,
): JsonValue {
  const secretQuestionIds = new Set(
    params.questions
      .filter((question) => question.isSecret)
      .map((question) => question.id),
  )
  const answers: JsonObject = {}
  for (const [questionId, answer] of Object.entries(response.answers)) {
    answers[questionId] = {
      answers: secretQuestionIds.has(questionId)
        ? ["<redacted>"]
        : answer.answers,
    }
  }
  return { answers }
}

function enumOptions(
  schema: CodexAppServerMcpElicitationPrimitiveSchema,
): CodexAskUserQuestionOption[] {
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((value, index) => ({
      label: schema.enumNames?.[index] ?? value,
      description: "",
    }))
  }

  const titledOptions = schema.anyOf ?? schema.items?.anyOf
  if (Array.isArray(titledOptions)) {
    return titledOptions
      .map((option) => {
        const label = cleanText(option.title) || cleanText(option.const)
        if (!label) return null
        return { label, description: "" }
      })
      .filter((option): option is CodexAskUserQuestionOption =>
        Boolean(option),
      )
  }

  if (Array.isArray(schema.items?.enum)) {
    return schema.items.enum.map((value) => ({
      label: value,
      description: "",
    }))
  }

  return []
}

export function normalizeCodexAppServerMcpElicitationQuestions(
  params: CodexAppServerMcpElicitationRequestParams,
): CodexAskUserQuestion[] {
  if (params.mode === "url") {
    return [
      {
        header: params.serverName,
        question: `${params.message}\n${params.url}`,
        options: [
          { label: "Accept", description: "" },
          { label: "Decline", description: "" },
        ],
        multiSelect: false,
      },
    ]
  }

  const entries = Object.entries(params.requestedSchema.properties)
  if (entries.length === 0) {
    return [
      {
        header: params.serverName,
        question: params.message,
        options: [],
        multiSelect: false,
      },
    ]
  }

  return entries.map(([propertyName, schema]) => ({
    header: cleanText(schema.title) || propertyName,
    question: cleanText(schema.description) || cleanText(schema.title) || propertyName,
    options: enumOptions(schema),
    multiSelect: schema.type === "array",
  }))
}

function coerceMcpAnswer(
  rawAnswer: string,
  schema: CodexAppServerMcpElicitationPrimitiveSchema,
): JsonValue {
  if (schema.type === "boolean") {
    return /^(true|yes|y|1)$/i.test(rawAnswer)
  }
  if (schema.type === "number" || schema.type === "integer") {
    const value = Number(rawAnswer)
    return Number.isFinite(value) ? value : rawAnswer
  }
  if (schema.type === "array") {
    return rawAnswer
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return rawAnswer
}

function mcpActionForRejectedApproval(
  approval: CodexAskUserQuestionApproval,
): "decline" | "cancel" {
  return approval.message === QUESTIONS_TIMED_OUT_MESSAGE ? "cancel" : "decline"
}

export function buildCodexAppServerMcpElicitationResponse(
  params: CodexAppServerMcpElicitationRequestParams,
  approval: CodexAskUserQuestionApproval,
): CodexAppServerMcpElicitationRequestResponse {
  if (!approval.approved) {
    return {
      action: mcpActionForRejectedApproval(approval),
      content: null,
      _meta: null,
    }
  }

  if (params.mode === "url") {
    return {
      action: "accept",
      content: null,
      _meta: null,
    }
  }

  const answersByPrompt = extractCodexAskUserQuestionAnswers(
    approval.updatedInput,
  )
  const content: JsonObject = {}

  for (const [propertyName, schema] of Object.entries(
    params.requestedSchema.properties,
  )) {
    const answer =
      answersByPrompt[propertyName] ??
      answersByPrompt[schema.title ?? ""] ??
      answersByPrompt[schema.description ?? ""]
    if (answer === undefined) continue
    content[propertyName] = coerceMcpAnswer(answer, schema)
  }

  return {
    action: "accept",
    content,
    _meta: null,
  }
}

function redactedMcpContent(content: JsonValue | null): JsonValue | null {
  if (!isRecord(content)) return content

  const redacted: JsonObject = {}
  for (const [key, value] of Object.entries(content)) {
    redacted[key] = SECRET_KEY_PATTERN.test(key) ? "<redacted>" : value
  }
  return redacted
}

async function waitForApproval(input: {
  subChatId: string
  toolUseId: string
  timeoutMs: number
  emit: (chunk: Record<string, unknown>) => void
  registerPending: (
    toolUseId: string,
    pending: CodexAskUserQuestionPending,
  ) => void
  unregisterPending: (toolUseId: string) => void
}): Promise<CodexAskUserQuestionApproval> {
  return new Promise<CodexAskUserQuestionApproval>((resolve) => {
    const timeoutId = setTimeout(() => {
      input.unregisterPending(input.toolUseId)
      input.emit({
        type: "ask-user-question-timeout",
        toolUseId: input.toolUseId,
      })
      resolve({
        approved: false,
        message: QUESTIONS_TIMED_OUT_MESSAGE,
      })
    }, input.timeoutMs)

    input.registerPending(input.toolUseId, {
      subChatId: input.subChatId,
      resolve: (approval) => {
        clearTimeout(timeoutId)
        resolve(approval)
      },
    })
  })
}

export function createCodexAppServerUserInteractionBridge({
  subChatId,
  emit,
  registerPending,
  unregisterPending,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: CreateCodexAppServerUserInteractionBridgeInput) {
  return {
    async handleUserInputRequest(input: {
      requestId: string
      params: CodexAppServerToolRequestUserInputParams
    }): Promise<CodexAppServerToolRequestUserInputResponse> {
      const toolUseId = `codex-app-server-user-input-${input.requestId}`
      const questions = normalizeCodexAppServerUserInputQuestions(input.params)

      if (questions.length === 0) return { answers: {} }

      emit({ type: "ask-user-question", toolUseId, questions })
      const approval = await waitForApproval({
        subChatId,
        toolUseId,
        timeoutMs,
        emit,
        registerPending,
        unregisterPending,
      })
      unregisterPending(toolUseId)

      const response = buildCodexAppServerUserInputResponse(
        input.params,
        approval,
      )
      emit({
        type: "ask-user-question-result",
        toolUseId,
        result: approval.approved
          ? redactedUserInputResult(input.params, response)
          : approval.message || QUESTIONS_SKIPPED_MESSAGE,
      })
      return response
    },

    async handleMcpElicitationRequest(input: {
      requestId: string
      params: CodexAppServerMcpElicitationRequestParams
    }): Promise<CodexAppServerMcpElicitationRequestResponse> {
      const toolUseId = `codex-app-server-mcp-elicitation-${input.requestId}`
      const questions = normalizeCodexAppServerMcpElicitationQuestions(
        input.params,
      )

      emit({ type: "ask-user-question", toolUseId, questions })
      const approval = await waitForApproval({
        subChatId,
        toolUseId,
        timeoutMs,
        emit,
        registerPending,
        unregisterPending,
      })
      unregisterPending(toolUseId)

      const response = buildCodexAppServerMcpElicitationResponse(
        input.params,
        approval,
      )
      emit({
        type: "ask-user-question-result",
        toolUseId,
        result: {
          action: response.action,
          content: redactedMcpContent(response.content),
        },
      })
      return response
    },
  }
}
