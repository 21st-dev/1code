import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const loginModalSource = () =>
  readFileSync("src/renderer/components/dialogs/claude-login-modal.tsx", "utf8")

const dictionarySource = () =>
  readFileSync("src/renderer/lib/i18n/dictionaries.ts", "utf8")

describe("Claude login modal auth choices", () => {
  test("does not force reconnect through local credential import", () => {
    const source = loginModalSource()
    const freshLoginIndex = source.indexOf("const handleStartFreshLogin")
    const connectIndex = source.indexOf("const handleConnectClick")
    const resetEffectIndex = source.indexOf("useEffect", connectIndex)
    const connectBlock = source.slice(freshLoginIndex, resetEffectIndex)

    expect(connectBlock).toContain("await startLocalLogin()")
    expect(connectBlock).toContain(
      "const handleConnectClick = handleStartFreshLogin",
    )
    expect(connectBlock).not.toContain("hasLocalClaudeCredential")
    expect(connectBlock).not.toContain("handleImportLocalCredentials()")
  })

  test("offers fresh web sign-in when local credentials exist or fail", () => {
    const source = loginModalSource()
    const dictionaries = dictionarySource()

    expect(source).toContain("onboarding.claude.signInAgainWithClaudeCode")
    expect(source).toContain("onboarding.claude.localCredentialsInvalid")
    expect(source).toContain("formatClaudeCodeAuthError")
    expect(dictionaries).toContain(
      "onboarding.claude.signInAgainWithClaudeCode",
    )
    expect(dictionaries).toContain("onboarding.claude.localCredentialsInvalid")
  })
})
