import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const anthropicAccountsRouterSource = () =>
  readFileSync("src/main/lib/trpc/routers/anthropic-accounts.ts", "utf8")

describe("Anthropic account storage ownership", () => {
  test("router does not expose legacy fallback accounts or own legacy migration", () => {
    const source = anthropicAccountsRouterSource()

    expect(source).toContain("ensureLegacyClaudeCodeCredentialMigrated")
    expect(source).not.toContain("legacy-default")
    expect(source).not.toContain("claudeCodeCredentials")
    expect(source).not.toContain("where(eq(claudeCodeCredentials.id")
  })

  test("read routes do not explicitly run legacy migration before reconciliation", () => {
    const source = anthropicAccountsRouterSource()

    for (const routeName of ["list", "getActive", "hasAccounts"]) {
      const routeStart = source.indexOf(`${routeName}: publicProcedure`)
      const nextRouteStart = source.indexOf(
        "publicProcedure",
        routeStart + `${routeName}: publicProcedure`.length,
      )
      const routeSource = source.slice(
        routeStart,
        nextRouteStart === -1 ? undefined : nextRouteStart,
      )

      expect(routeStart).toBeGreaterThanOrEqual(0)
      expect(routeSource).toContain("reconcileClaudeCodeCredentialStorage(db)")
      expect(routeSource).not.toContain(
        "ensureLegacyClaudeCodeCredentialMigrated(db)",
      )
    }
  })
})
