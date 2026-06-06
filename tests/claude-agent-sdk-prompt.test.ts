import { describe, expect, test } from "bun:test"
import {
  ClaudeAgentSdkLongTextAttachmentPromptError,
  createClaudeAgentSdkPrompt,
  prepareClaudeAgentSdkRuntimePrompt,
} from "../src/main/lib/claude/agent-sdk-prompt"

async function collectAsyncIterable(value: AsyncIterable<any>): Promise<any[]> {
  const items: any[] = []
  for await (const item of value) {
    items.push(item)
  }
  return items
}

describe("Claude Agent SDK prompt", () => {
  test("owns App Agent, skill, and long text prompt assembly", async () => {
    const logs: unknown[][] = []
    const warnings: unknown[][] = []
    const prompt = await prepareClaudeAgentSdkRuntimePrompt({
      prompt: "@[agent:Reviewer] @[skill:Audit]\nReview this change",
      images: [],
      longTextAttachments: [
        {
          type: "long-text-attachment",
          attachmentId: "long-1",
          localRef: "lta:v1:scope/long-1",
          filename: "notes.txt",
          byteLength: 10,
          preview: "notes",
          kind: "pasted",
        },
      ],
      prepareAppAgentPrompt: async (cleanedPrompt, appAgentNames) => ({
        prompt: `agent:${appAgentNames?.join(",")}\n${cleanedPrompt}`,
        appAgentMentions: appAgentNames ?? [],
        resolvedAppAgents: [],
        missingAppAgents: ["Reviewer"],
      }),
      prependLongTextPromptBlocks: async (basePrompt, attachments) =>
        `long:${attachments?.[0]?.filename}\n${basePrompt}`,
      logger: {
        log: (...args) => logs.push(args),
        warn: (...args) => warnings.push(args),
      },
    })

    expect(prompt).toBe(
      [
        "long:notes.txt",
        "agent:Reviewer",
        "Review this change",
        "",
        'Use the "Audit" skill(s) for this task.',
      ].join("\n"),
    )
    expect(logs).toEqual([
      ["[claude] App Agents mentioned:", ["Reviewer"]],
      ["[claude] Skills mentioned:", ["Audit"]],
    ])
    expect(warnings).toEqual([
      ["[claude] Missing App Agents:", ["Reviewer"]],
    ])
  })

  test("turns skill-only prompts into an explicit skill invocation request", async () => {
    const prompt = await prepareClaudeAgentSdkRuntimePrompt({
      prompt: "@[skill:Audit]",
      images: [],
      prepareAppAgentPrompt: async () => ({
        prompt: "",
        appAgentMentions: [],
        resolvedAppAgents: [],
        missingAppAgents: [],
      }),
      prependLongTextPromptBlocks: async (basePrompt) => basePrompt,
      logger: {
        log: () => {},
        warn: () => {},
      },
    })

    expect(prompt).toBe(
      'Invoke the "Audit" skill(s) using the Skill tool for this task.',
    )
  })

  test("wraps long text prompt failures without swallowing other prompt errors", async () => {
    const originalError = new Error("missing attachment")
    const longTextFailure = prepareClaudeAgentSdkRuntimePrompt({
      prompt: "send",
      images: [],
      prepareAppAgentPrompt: async (cleanedPrompt) => ({
        prompt: cleanedPrompt,
        appAgentMentions: [],
        resolvedAppAgents: [],
        missingAppAgents: [],
      }),
      prependLongTextPromptBlocks: async () => {
        throw originalError
      },
      logger: {
        log: () => {},
        warn: () => {},
      },
    })
    await expect(longTextFailure).rejects.toThrow(
      ClaudeAgentSdkLongTextAttachmentPromptError,
    )
    await expect(longTextFailure).rejects.toMatchObject({ originalError })

    await expect(
      prepareClaudeAgentSdkRuntimePrompt({
        prompt: "send",
        images: [],
        prepareAppAgentPrompt: async () => {
          throw new Error("app agent store failed")
        },
        prependLongTextPromptBlocks: async (basePrompt) => basePrompt,
        logger: {
          log: () => {},
          warn: () => {},
        },
      }),
    ).rejects.toThrow("app agent store failed")
  })

  test("returns a plain prompt when there are no images", () => {
    expect(
      createClaudeAgentSdkPrompt({
        prompt: "hello",
        images: [],
      }),
    ).toBe("hello")
  })

  test("creates an SDK user message with images before text", async () => {
    const prompt = createClaudeAgentSdkPrompt({
      prompt: "inspect this",
      images: [
        {
          attachmentId: "image-1",
          localRef: "local-image",
          filename: "screen.png",
          mediaType: "image/png",
          sizeBytes: 100,
          base64Data: "base64-body",
        },
      ],
    })

    expect(typeof prompt).not.toBe("string")
    expect(await collectAsyncIterable(prompt as AsyncIterable<any>)).toEqual([
      {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "base64-body",
              },
            },
            {
              type: "text",
              text: "inspect this",
            },
          ],
        },
        parent_tool_use_id: null,
      },
    ])
  })

  test("omits empty text when image prompt text is blank", async () => {
    const prompt = createClaudeAgentSdkPrompt({
      prompt: "   ",
      images: [
        {
          mediaType: "image/jpeg",
          sizeBytes: 100,
          base64Data: "legacy-body",
        },
      ],
    })

    const [message] = await collectAsyncIterable(prompt as AsyncIterable<any>)
    expect(message.message.content).toEqual([
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "legacy-body",
        },
      },
    ])
  })
})
