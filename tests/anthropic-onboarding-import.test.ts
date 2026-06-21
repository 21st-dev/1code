import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const onboardingSource = () =>
  readFileSync(
    "src/renderer/features/onboarding/anthropic-onboarding-page.tsx",
    "utf8",
  )

const claudeCodeRouterSource = () =>
  readFileSync("src/main/lib/trpc/routers/claude-code.ts", "utf8")

const dictionarySource = () =>
  readFileSync("src/renderer/lib/i18n/dictionaries.ts", "utf8")

describe("Anthropic onboarding Claude Code auth", () => {
  test("refreshes Claude integration before marking onboarding complete", () => {
    const source = onboardingSource()

    expect(source).toContain("const trpcUtils = trpc.useUtils()")
    expect(source).toContain(
      "const result = await importSystemTokenMutation.mutateAsync()",
    )
    expect(source).toContain(
      "trpcUtils.claudeCode.getIntegration.setData(undefined, result.metadata)",
    )
    expect(source).toContain("trpcUtils.claudeCode.getIntegration.invalidate()")

    const importIndex = source.indexOf(
      "const result = await importSystemTokenMutation.mutateAsync()",
    )
    const setDataIndex = source.indexOf(
      "trpcUtils.claudeCode.getIntegration.setData(undefined, result.metadata)",
    )
    const invalidateIndex = source.indexOf(
      "trpcUtils.claudeCode.getIntegration.invalidate()",
    )
    const completeIndex = source.indexOf(
      "setAnthropicOnboardingCompleted(true)",
    )

    expect(importIndex).toBeGreaterThanOrEqual(0)
    expect(setDataIndex).toBeGreaterThan(importIndex)
    expect(invalidateIndex).toBeGreaterThan(setDataIndex)
    expect(completeIndex).toBeGreaterThan(invalidateIndex)
  })

  test("checks secure storage before opening Claude Code OAuth", () => {
    const source = claudeCodeRouterSource()

    expect(source).toContain('from "../../secure-storage"')
    expect(source).toContain("SECURE_STORAGE_UNAVAILABLE_MESSAGE")

    const startPreflightIndex = source.indexOf(
      "if (!isSecureStorageAvailable())",
    )
    const authUrlIndex = source.indexOf("const url = buildClaudeCodeAuthUrl")
    expect(startPreflightIndex).toBeGreaterThanOrEqual(0)
    expect(authUrlIndex).toBeGreaterThan(startPreflightIndex)

    const exchangeIndex = source.indexOf(
      "const credential = await exchangeClaudeCodeAuthCode",
    )
    const submitPreflightIndex = source.lastIndexOf(
      "if (!isSecureStorageAvailable())",
      exchangeIndex,
    )
    expect(exchangeIndex).toBeGreaterThanOrEqual(0)
    expect(submitPreflightIndex).toBeGreaterThan(startPreflightIndex)
    expect(submitPreflightIndex).toBeLessThan(exchangeIndex)
  })

  test("localizes secure storage failures in onboarding", () => {
    const source = onboardingSource()
    const dictionaries = dictionarySource()

    expect(source).toContain("formatClaudeCodeAuthError")
    expect(source).toContain("onboarding.claude.secureStorageUnavailable")
    expect(source).toContain("onboarding.claude.localCredentialsInvalid")
    expect(dictionaries).toContain("onboarding.claude.secureStorageUnavailable")
    expect(dictionaries).toContain("onboarding.claude.localCredentialsInvalid")
    expect(dictionaries).toContain("系统钥匙串不可用")
    expect(dictionaries).not.toContain("instead of importing local credentials")
    expect(dictionaries).not.toContain("请不要导入本机凭据")
  })
})
