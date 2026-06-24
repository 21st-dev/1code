import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  DesktopRunPreflightError,
  verifyDesktopRunPreflight,
} from "../src/main/lib/agent-runtime/preflight"
import { chats, projects, subChats } from "../src/main/lib/db/schema"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

function seedChat(db: ReturnType<typeof createAgentJobTestDb>) {
  db.insert(projects)
    .values({
      id: "project-1",
      name: "Project",
      path: "/tmp/project",
    })
    .run()
  db.insert(chats)
    .values({
      id: "chat-1",
      projectId: "project-1",
      worktreePath: "/tmp/project-worktree",
    })
    .run()
  db.insert(subChats)
    .values({
      id: "sub-chat-1",
      chatId: "chat-1",
    })
    .run()
}

describe("desktop runtime preflight", () => {
  test("returns verified desktop context", () => {
    const db = createAgentJobTestDb()
    seedChat(db)

    const result = verifyDesktopRunPreflight(db, {
      chatId: "chat-1",
      subChatId: "sub-chat-1",
      cwd: "/tmp/project-worktree",
    })

    expect(result.kind).toBe("project")
    expect(result.project.id).toBe("project-1")
    expect(result.chat.id).toBe("chat-1")
    expect(result.subChat.id).toBe("sub-chat-1")
    expect(result.cwd).toBe("/tmp/project-worktree")
  })

  test("returns folderless context with main-process scratch cwd", () => {
    const db = createAgentJobTestDb()
    db.insert(chats)
      .values({
        id: "quick-chat-1",
        projectId: null,
      })
      .run()
    db.insert(subChats)
      .values({
        id: "quick-sub-chat-1",
        chatId: "quick-chat-1",
      })
      .run()

    const result = verifyDesktopRunPreflight(db, {
      chatId: "quick-chat-1",
      subChatId: "quick-sub-chat-1",
      cwd: "/tmp/renderer-supplied",
      folderlessScratchCwd: "/tmp/locus-test-scratch",
    })

    expect(result.kind).toBe("folderless")
    expect(result.project).toBeNull()
    expect(result.cwd).toBe("/tmp/locus-test-scratch")
    expect(result.cwd).not.toBe("/tmp/renderer-supplied")
  })

  test("rejects folderless chat carrying repository state", () => {
    const db = createAgentJobTestDb()
    db.insert(chats)
      .values({
        id: "quick-chat-with-worktree",
        projectId: null,
        worktreePath: "/tmp/project-worktree",
      })
      .run()
    db.insert(subChats)
      .values({
        id: "quick-sub-chat-with-worktree",
        chatId: "quick-chat-with-worktree",
      })
      .run()

    expect(() =>
      verifyDesktopRunPreflight(db, {
        chatId: "quick-chat-with-worktree",
        subChatId: "quick-sub-chat-with-worktree",
        cwd: "/tmp/renderer-supplied",
        folderlessScratchCwd: "/tmp/locus-test-scratch",
      }),
    ).toThrow("Folderless desktop run cannot carry project")
  })

  test("rejects mismatched cwd and sub-chat ownership", () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    db.insert(chats)
      .values({
        id: "other-chat",
        projectId: "project-1",
        worktreePath: "/tmp/project-worktree",
      })
      .run()

    expect(() =>
      verifyDesktopRunPreflight(db, {
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/other",
      }),
    ).toThrow("Desktop job cwd mismatch")

    expect(() =>
      verifyDesktopRunPreflight(db, {
        chatId: "other-chat",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project-worktree",
      }),
    ).toThrow("does not belong to chat")
  })

  test("rejects removed project history before provider work starts", () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    db.update(projects)
      .set({ removedAt: new Date("2026-06-22T00:00:00Z") })
      .run()

    expect(() =>
      verifyDesktopRunPreflight(db, {
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project-worktree",
      }),
    ).toThrow(DesktopRunPreflightError)
    try {
      verifyDesktopRunPreflight(db, {
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project-worktree",
      })
    } catch (error) {
      expect((error as DesktopRunPreflightError).blocker).toMatchObject({
        id: "project",
        status: "blocked",
      })
    }
  })

  test("rejects provider, MCP, attachment, and local-only blockers", () => {
    const db = createAgentJobTestDb()
    seedChat(db)

    const blockerIds = [
      "provider-profile",
      "mcp",
      "attachment",
      "local-only",
    ] as const

    for (const id of blockerIds) {
      expect(() =>
        verifyDesktopRunPreflight(db, {
          chatId: "chat-1",
          subChatId: "sub-chat-1",
          cwd: "/tmp/project-worktree",
          blockers: [
            {
              id,
              status: id === "mcp" ? "needs-auth" : "blocked",
              message: `${id} blocked before provider work`,
            },
          ],
        }),
      ).toThrow(DesktopRunPreflightError)
    }
  })

  test("Claude route blocks desktop preflight before creating a job", () => {
    const claude = readFileSync("src/main/lib/trpc/routers/claude.ts", "utf8")
    const claudeControls = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-run-controls.ts",
      "utf8",
    )
    const preflightIndex = claudeControls.indexOf("verifyDesktopRunPreflight")
    const controlsIndex = claude.indexOf(
      "prepareClaudeAgentSdkDesktopRunControls({",
    )
    const inputsIndex = claude.indexOf(
      "prepareClaudeAgentSdkDesktopRunInputs({",
      controlsIndex,
    )
    const startupIndex = claude.indexOf(
      "prepareClaudeAgentSdkDesktopRunStartup({",
      inputsIndex,
    )
    const runRequestIndex = claude.indexOf("desktopRunRequest,", startupIndex)
    const lifecycleIndex = claude.indexOf(
      "await runClaudeAgentSdkDesktopRuntimeWithMcpReadiness({",
    )

    expect(preflightIndex).toBeGreaterThan(0)
    expect(controlsIndex).toBeGreaterThan(0)
    expect(inputsIndex).toBeGreaterThan(controlsIndex)
    expect(startupIndex).toBeGreaterThan(inputsIndex)
    expect(runRequestIndex).toBeGreaterThan(startupIndex)
    expect(lifecycleIndex).toBeGreaterThan(runRequestIndex)
    expect(claude).not.toContain(
      "cwd: input.cwd,\n                systemPrompt",
    )
  })

  test("Codex route blocks desktop preflight before creating a job", () => {
    const codex = readFileSync("src/main/lib/trpc/routers/codex.ts", "utf8")
    const blockerIndex = codex.indexOf("new DesktopRunPreflightError(blocker)")
    const runtimeStatusIndex = codex.indexOf(
      "const runtimeStatus = await getCodexRuntimeStatus()",
    )
    const attachmentIndex = codex.indexOf(
      "prepareChatImageAttachmentsForDesktopRun({",
      runtimeStatusIndex,
    )
    const providerProfileMetadataIndex = codex.indexOf(
      "getProviderProfileMetadata(input.providerProfileId)",
      runtimeStatusIndex,
    )
    const providerProfileRuntimeConfigIndex = codex.indexOf(
      "getProviderProfileRuntimeConfig(",
      attachmentIndex,
    )
    const providerGatewayIndex = codex.indexOf(
      "getProviderGatewayEndpoint(",
      attachmentIndex,
    )
    const mcpIndex = codex.indexOf(
      "mcpSnapshot = await resolveCodexMcpSnapshotForDesktopRun({",
      attachmentIndex,
    )
    const localOnlyIndex = codex.indexOf(
      '"use Codex provider endpoint"',
      attachmentIndex,
    )
    const jobIndex = codex.indexOf("createAndRegisterDesktopChatAgentJob(db, {")
    const runRequestIndex = codex.indexOf(
      "const desktopRunRequest = createCodexDesktopRunRequest({",
    )
    const adapterIndex = codex.indexOf(
      "const codexAdapter = createCodexAppServerAdapter",
    )
    const adapterRunIndex = codex.indexOf(
      "codexAdapter.run(desktopRunRequest)",
      adapterIndex,
    )

    expect(blockerIndex).toBeGreaterThan(0)
    expect(runtimeStatusIndex).toBeGreaterThan(blockerIndex)
    expect(providerProfileMetadataIndex).toBeGreaterThan(runtimeStatusIndex)
    expect(providerProfileMetadataIndex).toBeLessThan(attachmentIndex)
    expect(attachmentIndex).toBeGreaterThan(runtimeStatusIndex)
    expect(providerProfileRuntimeConfigIndex).toBeGreaterThan(attachmentIndex)
    expect(providerGatewayIndex).toBeGreaterThan(attachmentIndex)
    expect(localOnlyIndex).toBeGreaterThan(attachmentIndex)
    expect(mcpIndex).toBeGreaterThan(attachmentIndex)
    expect(jobIndex).toBeGreaterThan(localOnlyIndex)
    expect(jobIndex).toBeGreaterThan(mcpIndex)
    expect(runRequestIndex).toBeGreaterThan(jobIndex)
    expect(adapterIndex).toBeGreaterThan(runRequestIndex)
    expect(adapterRunIndex).toBeGreaterThan(adapterIndex)
    expect(codex).toContain("cwd: runtimeCwd")
    expect(codex).toContain("codexAdapter.run(desktopRunRequest)")
    expect(codex).toContain('id: "local-only"')
    expect(codex).not.toContain("cwd: input.cwd,\n              mcpServers")
  })
})
