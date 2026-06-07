import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { LONG_TEXT_ATTACHMENT_REF_PREFIX } from "../src/shared/long-text-attachments"

let userDataDir = ""

mock.module("electron", () => ({
  app: {
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return userDataDir
    },
  },
}))

const attachments = await import("../src/main/lib/long-text-attachments")
const { setElectronUserDataPathProviderForTest } = await import(
  "../src/main/lib/electron-app"
)

describe("long text attachments", () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "locus-long-text-"))
    setElectronUserDataPathProviderForTest(() => userDataDir)
  })

  afterEach(async () => {
    setElectronUserDataPathProviderForTest(null)
    await rm(userDataDir, { force: true, recursive: true })
    userDataDir = ""
  })

  test("stages text behind an opaque local ref and builds prompt blocks", async () => {
    const attachment = await attachments.stageLongTextAttachment({
      subChatId: "sub_chat_1",
      text: 'hello </attached_text> "quoted"',
      filename: "../unsafe name.txt",
      kind: "pasted",
    })

    expect(attachment.localRef.startsWith(LONG_TEXT_ATTACHMENT_REF_PREFIX)).toBe(
      true,
    )
    expect(attachment.filename).toBe("unsafe name.txt")
    expect(attachment.byteLength).toBe(
      Buffer.byteLength('hello </attached_text> "quoted"', "utf8"),
    )

    const prompt = await attachments.prependLongTextAttachmentPromptBlocks(
      "use this",
      [
        {
          localRef: attachment.localRef,
          filename: attachment.filename,
          byteLength: attachment.byteLength,
          kind: attachment.kind,
          attachmentId: attachment.id,
        },
      ],
    )

    expect(prompt).toContain('<attached_text id="')
    expect(prompt).toContain('kind="pasted"')
    expect(prompt).toContain('filename="unsafe name.txt"')
    expect(prompt).toContain("hello </ attached_text>")
    expect(prompt.endsWith("\n\nuse this")).toBe(true)
  })

  test("rejects single attachments above the configured size limit", async () => {
    await expect(
      attachments.stageLongTextAttachment({
        subChatId: "sub_chat_1",
        text: "a".repeat(attachments.LONG_TEXT_ATTACHMENT_SINGLE_LIMIT_BYTES + 1),
      }),
    ).rejects.toThrow("too large")
  })

  test("rejects sends above the aggregate attachment limit", async () => {
    const staged = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        attachments.stageLongTextAttachment({
          subChatId: "sub_chat_1",
          text: String(index).repeat(800 * 1024),
          filename: `part-${index}.txt`,
        }),
      ),
    )

    await expect(
      attachments.prependLongTextAttachmentPromptBlocks(
        "summarize",
        staged.map((attachment) => ({
          localRef: attachment.localRef,
          filename: attachment.filename,
          byteLength: attachment.byteLength,
          kind: attachment.kind,
          attachmentId: attachment.id,
        })),
      ),
    ).rejects.toThrow("too large for one send")
  })

  test("deleted attachments cannot be resolved for runtime injection", async () => {
    const attachment = await attachments.stageLongTextAttachment({
      subChatId: "sub_chat_1",
      text: "delete me before send",
      filename: "removed.txt",
    })

    await attachments.deleteLongTextAttachment(attachment.localRef)

    await expect(
      attachments.prependLongTextAttachmentPromptBlocks("send", [
        {
          localRef: attachment.localRef,
          filename: attachment.filename,
          byteLength: attachment.byteLength,
          kind: attachment.kind,
          attachmentId: attachment.id,
        },
      ]),
    ).rejects.toThrow()
  })

  test("resolves legacy pasted files only from the old app-managed directory", async () => {
    const legacyDir = join(userDataDir, "claude-sessions", "sub_chat_1", "pasted")
    await mkdir(legacyDir, { recursive: true })
    const legacyPath = join(legacyDir, "old-paste.txt")
    await writeFile(legacyPath, "legacy pasted body", "utf8")

    const resolved = await attachments.resolveLongTextAttachments([
      {
        localRef: legacyPath,
        filename: "old-paste.txt",
        byteLength: 0,
        kind: "pasted",
        attachmentId: "legacy_1",
      },
    ])

    expect(resolved[0]?.text).toBe("legacy pasted body")
    expect(resolved[0]?.byteLength).toBe(
      Buffer.byteLength("legacy pasted body", "utf8"),
    )

    await expect(
      attachments.readLongTextAttachment(join(userDataDir, "not-pasted.txt")),
    ).rejects.toThrow("long text attachment")
  })
})
