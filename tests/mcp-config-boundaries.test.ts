import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

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

    for (const mutation of [
      "addMcpServer",
      "updateMcpServer",
      "removeMcpServer",
      "setMcpBearerToken",
    ]) {
      const mutationStart = source.indexOf(`${mutation}: publicProcedure`)
      expect(mutationStart).toBeGreaterThan(0)
      const blockStart = mutationStart + `${mutation}: publicProcedure`.length
      const following = source.slice(blockStart)
      const nextMutationOffset = following.search(/\n\n  [a-zA-Z0-9]+: publicProcedure/)
      const block = source.slice(
        mutationStart,
        nextMutationOffset === -1 ? undefined : blockStart + nextMutationOffset,
      )
      expect(block).toContain("normalizeMcpServerName")
      expect(block).toContain("resolveMcpProjectPathForMutation")
    }
  })
})
