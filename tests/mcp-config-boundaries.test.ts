import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

function getProcedureBlock(source: string, procedure: string): string {
  const mutationStart = source.indexOf(`${procedure}: publicProcedure`)
  expect(mutationStart).toBeGreaterThan(0)
  const blockStart = mutationStart + `${procedure}: publicProcedure`.length
  const following = source.slice(blockStart)
  const nextMutationOffset = following.search(/\n\n  [a-zA-Z0-9]+: publicProcedure/)
  return source.slice(
    mutationStart,
    nextMutationOffset === -1 ? undefined : blockStart + nextMutationOffset,
  )
}

describe("Claude MCP config mutation boundaries", () => {
  test("routes project-scoped MCP writes through main-layer project and name guards", () => {
    const source = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )

    expect(source).toContain("const MCP_SERVER_NAME_REGEX")
    expect(source).toContain("function normalizeMcpServerName")
    expect(source).toContain("function resolveMcpProjectPathForMutation")
    expect(source).toContain("function getMcpServersForScope")
    expect(source).toContain("updateClaudeConfigAtomic")

    const oauthBlock = getProcedureBlock(source, "startMcpOAuth")
    expect(oauthBlock).toContain("normalizeMcpServerName")
    expect(oauthBlock).toContain("resolveMcpProjectPathForMutation")

    for (const mutation of [
      "addMcpServer",
      "updateMcpServer",
      "removeMcpServer",
      "setMcpBearerToken",
    ]) {
      const block = getProcedureBlock(source, mutation)
      expect(block).toContain("normalizeMcpServerName")
      expect(block).toContain("resolveMcpProjectPathForMutation")
      expect(block).toContain("updateClaudeConfigAtomic")
      expect(block).not.toContain("await writeClaudeConfig")
    }
  })
})

describe("Codex MCP config mutation boundaries", () => {
  test("OAuth and logout cwd are limited to registered projects", () => {
    const source = readFileSync(
      "src/main/lib/trpc/routers/codex.ts",
      "utf8",
    )

    expect(source).toContain("function resolveCodexMcpProjectPathForCli")
    expect(source).toContain("Codex MCP project path must match a registered project")
    expect(source).toContain(".from(projectsTable)")
    expect(source).toContain(".where(eq(projectsTable.path, requestedPath))")

    const oauthBlock = getProcedureBlock(source, "startMcpOAuth")
    const logoutBlock = getProcedureBlock(source, "logoutMcpServer")

    expect(oauthBlock).toContain("resolveCodexMcpProjectPathForCli(input.projectPath)")
    expect(logoutBlock).toContain("resolveCodexMcpProjectPathForCli(input.projectPath)")
    expect(oauthBlock).not.toContain("cwd: projectPath && projectPath.length > 0 ? projectPath : undefined")
    expect(logoutBlock).not.toContain("cwd: projectPath && projectPath.length > 0 ? projectPath : undefined")
  })
})
