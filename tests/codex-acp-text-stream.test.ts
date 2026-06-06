import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  buildCodexAcpModelMessageContent,
} from "../src/main/lib/codex/acp-text-stream"

describe("Codex ACP text stream owner", () => {
  test("builds model message content with resolved images", () => {
    expect(
      buildCodexAcpModelMessageContent("hello", [
        {
          base64Data: "image-data",
          mediaType: "image/png",
          filename: "screen.png",
        },
        {
          base64Data: "",
          mediaType: "image/jpeg",
          filename: "missing-data.jpg",
        },
      ]),
    ).toEqual([
      { type: "text", text: "hello" },
      {
        type: "file",
        mediaType: "image/png",
        data: "image-data",
        filename: "screen.png",
      },
    ])
  })

  test("owns Codex ACP streamText and UI message metadata wiring", () => {
    const codexRouter = readFileSync(
      "src/main/lib/trpc/routers/codex.ts",
      "utf8",
    )
    const codexAcpTemporaryCompatAdapter = readFileSync(
      "src/main/lib/codex/acp-temporary-compat-adapter.ts",
      "utf8",
    )
    const codexAcpTextStream = readFileSync(
      "src/main/lib/codex/acp-text-stream.ts",
      "utf8",
    )

    expect(codexAcpTemporaryCompatAdapter).toContain(
      "createCodexAcpUiMessageStream",
    )
    expect(codexRouter).not.toContain("createCodexAcpUiMessageStream")
    expect(codexRouter).not.toContain("streamText")
    expect(codexRouter).not.toContain("buildCodexAcpModelMessageContent")
    expect(codexRouter).not.toContain("toUIMessageStream")
    expect(codexAcpTextStream).toContain("streamText")
    expect(codexAcpTextStream).toContain("buildCodexAcpModelMessageContent")
    expect(codexAcpTextStream).toContain("toUIMessageStream")
    expect(codexAcpTextStream).toContain("messageMetadata")
    expect(codexAcpTextStream).toContain("onSessionId")
    expect(codexAcpTextStream).toContain("resultSubtype")
  })
})
