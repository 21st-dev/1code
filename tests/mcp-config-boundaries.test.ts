import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

function getProcedureBlock(source: string, procedure: string): string {
  const mutationStart = source.indexOf(`${procedure}: publicProcedure`)
  expect(mutationStart).toBeGreaterThan(0)
  const blockStart = mutationStart + `${procedure}: publicProcedure`.length
  const following = source.slice(blockStart)
  const nextMutationOffset = following.search(
    /\n\n {2}[a-zA-Z0-9]+: publicProcedure/,
  )
  return source.slice(
    mutationStart,
    nextMutationOffset === -1 ? undefined : blockStart + nextMutationOffset,
  )
}

describe("Claude MCP config mutation boundaries", () => {
  test("routes project-scoped MCP writes through main-layer project and name guards", () => {
    const source = readFileSync("src/main/lib/trpc/routers/claude.ts", "utf8")

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
    const route = readFileSync("src/main/lib/trpc/routers/codex.ts", "utf8")
    const service = readFileSync(
      "src/main/lib/runtime-mcp-config/codex.ts",
      "utf8",
    )

    expect(service).toContain("function resolveCodexMcpProjectPathForCli")
    expect(service).toContain(
      "Codex MCP project path must match a registered project",
    )
    expect(service).toContain("Codex MCP project path no longer exists")
    expect(service).toContain("function isExistingCodexMcpCwd")
    expect(service).toContain(".from(projectsTable)")
    expect(service).toContain(".where(eq(projectsTable.path, requestedPath))")

    const oauthBlock = getProcedureBlock(route, "startMcpOAuth")
    const logoutBlock = getProcedureBlock(route, "logoutMcpServer")
    const projectPathResolverStart = service.indexOf(
      "function resolveCodexMcpProjectPathForCli",
    )
    const registeredProjectCheck = service.indexOf(
      "if (!registeredProject)",
      projectPathResolverStart,
    )
    const existingCwdCheck = service.indexOf(
      "if (!isExistingCodexMcpCwd(registeredProject.path))",
      projectPathResolverStart,
    )
    const projectPathReturn = service.indexOf(
      "return registeredProject.path",
      projectPathResolverStart,
    )

    expect(oauthBlock).toContain("startCodexMcpOAuth(input)")
    expect(logoutBlock).toContain("logoutCodexMcpServer(input)")
    expect(oauthBlock).not.toContain(
      "cwd: projectPath && projectPath.length > 0 ? projectPath : undefined",
    )
    expect(logoutBlock).not.toContain(
      "cwd: projectPath && projectPath.length > 0 ? projectPath : undefined",
    )
    expect(route).not.toContain("function resolveCodexMcpProjectPathForCli")
    expect(route).not.toContain('runCodexCliChecked(["mcp", "login"')
    expect(route).not.toContain('runCodexCliChecked(["mcp", "logout"')
    expect(registeredProjectCheck).toBeGreaterThan(projectPathResolverStart)
    expect(existingCwdCheck).toBeGreaterThan(registeredProjectCheck)
    expect(projectPathReturn).toBeGreaterThan(existingCwdCheck)
  })

  test("snapshot reads skip missing project cwd before spawning Codex", () => {
    const service = readFileSync(
      "src/main/lib/runtime-mcp-config/codex.ts",
      "utf8",
    )

    const snapshotStart = service.indexOf(
      "async function resolveCodexMcpSnapshot",
    )
    const cwdGuard = service.indexOf(
      'lookupPath !== "__global__" && !isExistingCodexMcpCwd(lookupPath)',
      snapshotStart,
    )
    const emptySnapshot = service.indexOf(
      "return createEmptyCodexMcpSnapshot",
      cwdGuard,
    )
    const cliSpawn = service.indexOf(
      'runCodexCliChecked(["mcp", "list", "--json"]',
      snapshotStart,
    )

    expect(snapshotStart).toBeGreaterThan(0)
    expect(cwdGuard).toBeGreaterThan(snapshotStart)
    expect(emptySnapshot).toBeGreaterThan(cwdGuard)
    expect(cliSpawn).toBeGreaterThan(emptySnapshot)
  })
})
