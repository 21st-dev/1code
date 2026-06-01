import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  parseProviderProfileSource,
  providerProfileSource,
} from "../src/shared/provider-profile-types"
import { PROVIDER_PROFILE_PRESETS } from "../src/main/lib/provider-profiles/presets"
import {
  hasProviderGatewayAuthHeader,
  redactProviderSecrets,
} from "../src/shared/provider-profile-security"
import {
  anthropicMessagesToChatCompletions,
  buildProviderChatCompletionBody,
  chatCompletionToAnthropicMessage,
  chatCompletionToResponse,
  responsesToChatCompletions,
} from "../src/shared/provider-profile-transforms"

describe("provider profile source ids", () => {
  test("round trips provider-profile source ids", () => {
    const source = providerProfileSource("profile_123")

    expect(source).toBe("provider-profile:profile_123")
    expect(parseProviderProfileSource(source)).toBe("profile_123")
    expect(parseProviderProfileSource("claude-oauth")).toBeNull()
  })
})

describe("provider profile presets", () => {
  test("uses the current DeepSeek OpenAI-compatible default", () => {
    const preset = PROVIDER_PROFILE_PRESETS.find((item) => item.id === "deepseek")

    expect(preset).toMatchObject({
      protocol: "openai-chat",
      baseUrl: "https://api.deepseek.com",
      defaultModel: "deepseek-v4-flash",
      authMode: "bearer",
      targetRuntimes: ["claude", "codex", "helpers"],
    })
  })
})

describe("provider profile request transforms", () => {
  test("bridges Anthropic Messages requests to OpenAI chat completions", () => {
    const body = anthropicMessagesToChatCompletions({
      model: "deepseek-chat",
      system: "Be concise.",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          input_schema: {
            type: "object",
            properties: { path: { type: "string" } },
          },
        },
      ],
    })

    expect(body.model).toBe("deepseek-chat")
    expect(body.max_tokens).toBe(100)
    expect(body.messages).toEqual([
      { role: "system", content: "Be concise." },
      { role: "user", content: "Hello" },
    ])
    expect(body.tools[0].function.name).toBe("read_file")
  })

  test("bridges Anthropic tool use and tool results to OpenAI chat messages", () => {
    const body = anthropicMessagesToChatCompletions({
      model: "deepseek-chat",
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "read_file",
              input: { path: "package.json" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: [{ type: "text", text: "{\"name\":\"locus\"}" }],
            },
          ],
        },
      ],
    })

    expect(body.messages).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "toolu_1",
            type: "function",
            function: {
              name: "read_file",
              arguments: "{\"path\":\"package.json\"}",
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "toolu_1",
        content: "{\"name\":\"locus\"}",
      },
    ])
  })

  test("bridges Responses requests to OpenAI chat completions", () => {
    const body = responsesToChatCompletions({
      model: "qwen-plus",
      instructions: "Use short answers.",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: "Summarize this" }],
        },
      ],
      max_output_tokens: 80,
      tools: [
        {
          type: "function",
          name: "read_file",
          description: "Read a file",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
          },
        },
      ],
    })

    expect(body).toMatchObject({
      model: "qwen-plus",
      max_tokens: 80,
      messages: [
        { role: "system", content: "Use short answers." },
        { role: "user", content: "Summarize this" },
      ],
    })
    expect(body.tools[0].function.name).toBe("read_file")
  })

  test("bridges Responses function call output to OpenAI tool messages", () => {
    const body = responsesToChatCompletions({
      model: "deepseek-chat",
      input: [
        {
          type: "function_call",
          call_id: "call_1",
          name: "read_file",
          arguments: "{\"path\":\"package.json\"}",
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: "{\"name\":\"locus\"}",
        },
      ],
    })

    expect(body.messages).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "read_file",
              arguments: "{\"path\":\"package.json\"}",
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: "{\"name\":\"locus\"}",
      },
    ])
  })

  test("redacts no secrets while converting provider responses", () => {
    const chatCompletion = {
      id: "chatcmpl_1",
      model: "moonshot-v1-128k",
      choices: [{ message: { content: "Done" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }

    const anthropic = chatCompletionToAnthropicMessage(
      chatCompletion,
      "fallback",
    )
    const response = chatCompletionToResponse(chatCompletion, "fallback")

    expect(anthropic.content[0].text).toBe("Done")
    expect(anthropic.usage).toEqual({ input_tokens: 3, output_tokens: 2 })
    expect(response.output[0].content[0].text).toBe("Done")
    expect(JSON.stringify({ anthropic, response })).not.toContain("sk-")
  })

  test("bridges OpenAI chat tool calls to Anthropic and Responses outputs", () => {
    const chatCompletion = {
      id: "chatcmpl_tool",
      model: "deepseek-chat",
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "read_file",
                  arguments: "{\"path\":\"package.json\"}",
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    }

    const anthropic = chatCompletionToAnthropicMessage(
      chatCompletion,
      "fallback",
    )
    const response = chatCompletionToResponse(chatCompletion, "fallback")

    expect(anthropic.stop_reason).toBe("tool_use")
    expect(anthropic.content).toEqual([
      {
        type: "tool_use",
        id: "call_1",
        name: "read_file",
        input: { path: "package.json" },
      },
    ])
    expect(response.output).toEqual([
      {
        id: "fc_call_1",
        type: "function_call",
        status: "completed",
        call_id: "call_1",
        name: "read_file",
        arguments: "{\"path\":\"package.json\"}",
      },
    ])
  })
})

describe("provider profile gateway security helpers", () => {
  test("disables DeepSeek thinking mode for OpenAI chat gateway requests", () => {
    const deepSeek = PROVIDER_PROFILE_PRESETS.find((item) => item.id === "deepseek")
    expect(deepSeek).toBeDefined()

    const body = buildProviderChatCompletionBody(deepSeek!, {
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "Use a tool." }],
      tools: [{ type: "function", function: { name: "read_file" } }],
    })

    expect(body.thinking).toEqual({ type: "disabled" })
  })

  test("leaves non-DeepSeek OpenAI chat gateway requests unchanged", () => {
    const qwen = PROVIDER_PROFILE_PRESETS.find((item) => item.id === "dashscope-qwen")
    expect(qwen).toBeDefined()
    const input = {
      model: "qwen-plus",
      messages: [{ role: "user", content: "Hello" }],
    }

    const body = buildProviderChatCompletionBody(qwen!, input)

    expect(body).toBe(input)
    expect(body).not.toHaveProperty("thinking")
  })

  test("does not add OpenAI thinking toggle to Anthropic-format DeepSeek profiles", () => {
    const input = {
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "Hello" }],
    }

    const body = buildProviderChatCompletionBody(
      {
        protocol: "anthropic",
        baseUrl: "https://api.deepseek.com/anthropic",
      },
      input,
    )

    expect(body).toBe(input)
    expect(body).not.toHaveProperty("thinking")
  })

  test("accepts only the per-process gateway token", () => {
    expect(
      hasProviderGatewayAuthHeader({ authorization: "Bearer gateway-token" }, "gateway-token"),
    ).toBe(true)
    expect(
      hasProviderGatewayAuthHeader({ "x-api-key": "gateway-token" }, "gateway-token"),
    ).toBe(true)
    expect(
      hasProviderGatewayAuthHeader({ authorization: "Bearer wrong" }, "gateway-token"),
    ).toBe(false)
  })

  test("redacts provider tokens from error text", () => {
    expect(
      redactProviderSecrets(
        "upstream rejected sk-abc123_DEF and Bearer local-gateway-token",
      ),
    ).toBe("upstream rejected sk-*** and Bearer ***")
    expect(
      redactProviderSecrets(
        'code=oauth-code state=oauth-state {"access_token":"secret"} jwt eyJabc.def.ghi',
      ),
    ).toBe('code=*** state=*** {"access_token":"***"} jwt jwt-***')
  })
})

describe("provider profile migration", () => {
  test("creates profile and default binding tables", () => {
    const migration = readFileSync(
      join(import.meta.dir, "../drizzle/0011_steep_whiplash.sql"),
      "utf8",
    )

    expect(migration).toContain("CREATE TABLE `agent_provider_profiles`")
    expect(migration).toContain("CREATE TABLE `agent_provider_defaults`")
    expect(migration).toContain("ON DELETE set null")
  })
})
