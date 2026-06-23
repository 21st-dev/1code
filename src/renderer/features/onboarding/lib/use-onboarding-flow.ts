import { useAtomValue } from "jotai"
import { repoOnboardingSkippedAtom } from "../../../lib/atoms"
import { type SetupStatus, useSetupStatus } from "./use-setup-status"

/**
 * First-run flow steps, derived from {@link useSetupStatus}.
 *
 * - `loading`  — still resolving whether any path is usable.
 * - `connect`  — no usable AI path yet (provider picker + auth/runtime).
 * - `project`  — a usable path exists, but no project chosen and not deferred.
 * - `complete` — ready to enter the app.
 *
 * The gate is `anyUsableAiPath` (credential AND runtime), not merely a stored
 * credential: a path whose runtime is missing cannot complete onboarding.
 */
export type OnboardingStep = "loading" | "connect" | "project" | "complete"

export type OnboardingFlow = {
  step: OnboardingStep
  status: SetupStatus
}

export function useOnboardingFlow(): OnboardingFlow {
  const status = useSetupStatus()
  const repoSkipped = useAtomValue(repoOnboardingSkippedAtom)

  const step: OnboardingStep = status.isResolving
    ? "loading"
    : !status.anyUsableAiPath
      ? "connect"
      : !status.hasProject && !repoSkipped
        ? "project"
        : "complete"

  return { step, status }
}
