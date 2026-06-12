import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { ResolvedChatImageAttachment } from "../src/shared/chat-attachments"
import type { DesktopRunAttachmentRef } from "../src/main/lib/agent-runtime/desktop-run-request"
import {
  CodexAppServerUnsupportedAttachmentError,
  buildCodexAppServerUserInputItems,
  prepareCodexAppServerPromptWithLongText,
} from "../src/main/lib/codex/app-server-attachments"
import {
  deleteLongTextAttachment,
  stageLongTextAttachment,
} from "../src/main/lib/long-text-attachments"
import { setElectronUserDataPathProviderForTest } from "../src/main/lib/electron-app"

let userDataDir = ""

const resolvedImage: ResolvedChatImageAttachment = {
  attachmentId: "image-1",
  localRef: "cia:v1:subchat/image-1.png",
  filename: "image.png",
  mediaType: "image/png",
  sizeBytes: 12,
  base64Data: "aW1hZ2UtYnl0ZXM=",
}

describe("Codex app-server attachment mapper", () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "locus-app-server-attachments-"))
    setElectronUserDataPathProviderForTest(() => userDataDir)
  })

  afterEach(async () => {
    setElectronUserDataPathProviderForTest(null)
    await rm(userDataDir, { force: true, recursive: true })
    userDataDir = ""
  })

  test("maps main-process resolved image attachments into app-server user input items", () => {
    const items = buildCodexAppServerUserInputItems({
      prompt: "inspect this",
      resolvedImages: [resolvedImage],
      attachmentRefs: [
        {
          kind: "image",
          attachmentId: resolvedImage.attachmentId,
          localRef: resolvedImage.localRef,
          mediaType: resolvedImage.mediaType,
          filename: resolvedImage.filename,
          byteLength: resolvedImage.sizeBytes,
        },
      ],
    })

    expect(items).toEqual([
      {
        type: "text",
        text: "inspect this",
        text_elements: [],
      },
      {
        type: "image",
        url: "data:image/png;base64,aW1hZ2UtYnl0ZXM=",
      },
    ])
    expect(JSON.stringify(items)).not.toContain(resolvedImage.localRef)
    expect(JSON.stringify(items)).not.toContain(resolvedImage.filename)
  })

  test("fails closed when image refs were not resolved before app-server startup", () => {
    expect(() =>
      buildCodexAppServerUserInputItems({
        prompt: "inspect this",
        attachmentRefs: [
          {
            kind: "image",
            attachmentId: "image-1",
            localRef: "cia:v1:subchat/image-1.png",
            mediaType: "image/png",
            filename: "image.png",
            byteLength: 12,
          },
        ],
      }),
    ).toThrow(
      "Codex app-server image attachments must be resolved in the main process before startup.",
    )
  })

  test("rejects long-text attachments unless they were explicitly prepared first", () => {
    const longTextRef: DesktopRunAttachmentRef = {
      kind: "long-text",
      attachmentId: "text-1",
      localRef: "lta:v1:subchat/text-1",
      filename: "notes.txt",
      byteLength: 1000,
    }

    expect(() =>
      buildCodexAppServerUserInputItems({
        prompt: "inspect this",
        attachmentRefs: [longTextRef],
      }),
    ).toThrow("Unsupported Codex app-server attachment kind: long-text")
  })

  test("rejects unsupported or unresolved image payloads before provider work", () => {
    expect(() =>
      buildCodexAppServerUserInputItems({
        prompt: "inspect this",
        resolvedImages: [
          {
            ...resolvedImage,
            mediaType: "image/tiff" as any,
          },
        ],
      }),
    ).toThrow(CodexAppServerUnsupportedAttachmentError)

    expect(() =>
      buildCodexAppServerUserInputItems({
        prompt: "inspect this",
        resolvedImages: [
          {
            ...resolvedImage,
            base64Data: "",
          },
        ],
      }),
    ).toThrow(
      "Codex app-server image attachment is missing resolved image data.",
    )
  })

  test("resolves long-text refs through the shared owner before building app-server text input", async () => {
    const longText = await stageLongTextAttachment({
      subChatId: "subchat-1",
      filename: "notes.txt",
      text: "resolved long text body",
      kind: "pasted",
    })

    const prompt = await prepareCodexAppServerPromptWithLongText({
      prompt: "summarize",
      longTextAttachments: [
        {
          attachmentId: longText.id,
          localRef: longText.localRef,
          filename: longText.filename,
          byteLength: longText.byteLength,
          kind: longText.kind,
        },
      ],
    })
    const items = buildCodexAppServerUserInputItems({
      prompt,
      attachmentRefs: [
        {
          kind: "long-text",
          attachmentId: longText.id,
          localRef: longText.localRef,
          filename: longText.filename,
          byteLength: longText.byteLength,
        },
      ],
      allowPreparedLongTextRefs: true,
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("resolved long text body"),
      text_elements: [],
    })
    expect(JSON.stringify(items)).not.toContain(longText.localRef)
  })

  test("fails before app-server startup when a long-text local ref cannot resolve", async () => {
    const longText = await stageLongTextAttachment({
      subChatId: "subchat-1",
      filename: "deleted.txt",
      text: "delete before send",
    })
    await deleteLongTextAttachment(longText.localRef)

    await expect(
      prepareCodexAppServerPromptWithLongText({
        prompt: "summarize",
        longTextAttachments: [
          {
            attachmentId: longText.id,
            localRef: longText.localRef,
            filename: longText.filename,
            byteLength: longText.byteLength,
            kind: longText.kind,
          },
        ],
      }),
    ).rejects.toThrow()
  })
})
