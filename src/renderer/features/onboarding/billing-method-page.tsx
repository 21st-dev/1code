"use client"

import { useAtom, useSetAtom } from "jotai"
import {
  anthropicOnboardingCompletedAtom,
  apiKeyOnboardingCompletedAtom,
  billingMethodAtom,
  codexApiKeyAtom,
  codexOnboardingAuthMethodAtom,
  codexOnboardingCompletedAtom,
  customClaudeConfigAtom,
  openCodexBackendConfigAtom,
} from "../../lib/atoms"
import { lastSelectedAgentIdAtom } from "../agents/atoms"
import { bridgeOpenCodexBackendConfig } from "./opencodex-backend-config"
import { OpenCodexBackendEditor } from "./opencodex-backend-editor"

export function BillingMethodPage() {
  const [backendConfig, setBackendConfig] = useAtom(openCodexBackendConfigAtom)
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  )
  const setApiKeyOnboardingCompleted = useSetAtom(apiKeyOnboardingCompletedAtom)
  const setCodexOnboardingCompleted = useSetAtom(codexOnboardingCompletedAtom)
  const setCodexOnboardingAuthMethod = useSetAtom(
    codexOnboardingAuthMethodAtom,
  )
  const setCodexApiKey = useSetAtom(codexApiKeyAtom)
  const setCustomClaudeConfig = useSetAtom(customClaudeConfigAtom)
  const setLastSelectedAgentId = useSetAtom(lastSelectedAgentIdAtom)

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background px-4 text-foreground select-none">
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <div className="w-full max-w-[560px]">
        <OpenCodexBackendEditor
          variant="onboarding"
          initialConfig={backendConfig}
          onConfigured={(normalizedConfig) => {
            const bridge = bridgeOpenCodexBackendConfig(normalizedConfig)

            setBackendConfig(normalizedConfig)
            setBillingMethod(bridge.billingMethod)
            setAnthropicOnboardingCompleted(false)
            setApiKeyOnboardingCompleted(bridge.apiKeyOnboardingCompleted)
            setCodexOnboardingCompleted(bridge.codexOnboardingCompleted)
            setCodexOnboardingAuthMethod(bridge.codexOnboardingAuthMethod)
            setCodexApiKey(bridge.codexApiKey)
            setCustomClaudeConfig(bridge.customClaudeConfig)
            setLastSelectedAgentId(bridge.lastSelectedAgentId)
          }}
        />
      </div>
    </div>
  )
}
