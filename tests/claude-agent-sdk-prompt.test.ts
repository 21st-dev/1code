import { describe, expect, test } from "bun:test"
import { createClaudeAgentSdkPrompt } from "../src/main/lib/claude/agent-sdk-prompt"

async function collectAsyncIterable(value: AsyncIterable<any>): Promise<any[]> {
  const items: any[] = []
  for await (const item of value) {
    items.push(item)
  }
  return items
}

describe("Claude Agent SDK prompt", () => {
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
