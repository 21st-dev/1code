"use client"

import { useSetAtom } from "jotai"
import { useState } from "react"
import { ChevronLeft, Cloud, CheckCircle2, AlertCircle } from "lucide-react"

import { IconSpinner } from "../../components/ui/icons"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Logo } from "../../components/ui/logo"
import {
  bedrockOnboardingCompletedAtom,
  billingMethodAtom,
} from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"

export function BedrockOnboardingPage() {
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const setBedrockOnboardingCompleted = useSetAtom(bedrockOnboardingCompletedAtom)

  const [region, setRegion] = useState("us-east-1")
  const [profile, setProfile] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Validate AWS credentials via backend
  const { data: validation, isLoading: isValidating } =
    trpc.anthropicAuth.validateAwsCredentials.useQuery(undefined, {
      staleTime: 10 * 1000,
    })

  const updateSettings = trpc.anthropicAuth.updateSettings.useMutation()

  const handleBack = () => {
    setBillingMethod(null)
  }

  const handleConnect = async () => {
    setIsSubmitting(true)
    try {
      await updateSettings.mutateAsync({
        authMode: "bedrock",
        awsRegion: region.trim() || "us-east-1",
        awsProfile: profile.trim() || undefined,
      })
      setBedrockOnboardingCompleted(true)
    } catch (error) {
      console.error("[bedrock-onboarding] Failed to save settings:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasCredentials = validation?.hasAwsCredentials ?? false
  const canSubmit = region.trim().length > 0

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
      {/* Draggable title bar area */}
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Back button */}
      <button
        onClick={handleBack}
        className="fixed top-12 left-4 flex items-center justify-center h-8 w-8 rounded-full hover:bg-foreground/5 transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="w-full max-w-[440px] space-y-8 px-4">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 p-2 mx-auto w-max rounded-full border border-border">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <Logo className="w-5 h-5" fill="white" />
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              Connect AWS Bedrock
            </h1>
            <p className="text-sm text-muted-foreground">
              Use Claude models via your AWS account
            </p>
          </div>
        </div>

        {/* Credential Status */}
        <div
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border",
            isValidating
              ? "border-border bg-muted/30"
              : hasCredentials
                ? "border-green-500/30 bg-green-500/5"
                : "border-amber-500/30 bg-amber-500/5",
          )}
        >
          {isValidating ? (
            <IconSpinner className="h-4 w-4 shrink-0" />
          ) : hasCredentials ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
          )}
          <div className="text-sm">
            {isValidating ? (
              <span className="text-muted-foreground">
                Checking AWS credentials...
              </span>
            ) : hasCredentials ? (
              <span className="text-green-600 dark:text-green-400">
                AWS credentials detected
                {validation?.hasEnvCredentials
                  ? " (environment variables)"
                  : validation?.hasProfile
                    ? ` (profile: ${validation.awsProfile})`
                    : " (~/.aws/credentials)"}
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                No AWS credentials found. Run{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">
                  aws configure
                </code>{" "}
                or set environment variables.
              </span>
            )}
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* AWS Region */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">AWS Region</Label>
            <Input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="us-east-1"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Region where Bedrock is enabled (e.g. us-east-1, us-west-2, eu-west-1)
            </p>
          </div>

          {/* AWS Profile (optional) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              AWS Profile{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder="default"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Named profile from ~/.aws/credentials. Leave empty for default.
            </p>
          </div>
        </div>

        {/* Connect Button */}
        <button
          onClick={handleConnect}
          disabled={!canSubmit || isSubmitting}
          className={cn(
            "w-full h-8 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] flex items-center justify-center",
            (!canSubmit || isSubmitting) && "opacity-50 cursor-not-allowed",
          )}
        >
          {isSubmitting ? <IconSpinner className="h-4 w-4" /> : "Connect"}
        </button>

        {/* Help text */}
        <p className="text-xs text-muted-foreground text-center">
          Requires AWS CLI configured with{" "}
          <code className="bg-muted px-1 py-0.5 rounded">aws configure</code>{" "}
          or AWS environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
        </p>
      </div>
    </div>
  )
}
