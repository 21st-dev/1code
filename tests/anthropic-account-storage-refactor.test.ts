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
})
