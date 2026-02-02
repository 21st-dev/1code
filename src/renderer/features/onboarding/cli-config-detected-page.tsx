"use client";

import { useSetAtom } from "jotai";
import { useState } from "react";
import { ChevronLeft, Check, ExternalLink } from "lucide-react";

import { ClaudeCodeIcon, KeyFilledIcon } from "../../components/ui/icons";
import {
  billingMethodAtom,
  cliConfigDetectedShownAtom,
} from "../../lib/atoms";
import { trpc } from "../../lib/trpc";
import { cn } from "../../lib/utils";

export function CliConfigDetectedPage() {
  const setBillingMethod = useSetAtom(billingMethodAtom);
  const setCliConfigDetectedShown = useSetAtom(cliConfigDetectedShownAtom);
  const [isContinuing, setIsContinuing] = useState(false);
  const [showOAuthFlow, setShowOAuthFlow] = useState(false);

  // Check for existing CLI config
  const { data: cliConfig, isLoading } =
    trpc.claudeCode.hasExistingCliConfig.useQuery();

  const handleUseExistingConfig = () => {
    setIsContinuing(true);
    // Mark CLI config detected as shown so we don't show this page again
    setCliConfigDetectedShown(true);
    // Navigate to custom-model form (api-key-onboarding-page in "custom-model" mode)
    // This allows users to review/edit the pre-filled values before continuing
    setBillingMethod("custom-model");
    // Note: apiKeyOnboardingCompleted is NOT set here - user needs to submit the form
  };

  const handleUseOAuth = () => {
    setShowOAuthFlow(true);
    setBillingMethod("claude-subscription");
  };

  const handleBack = () => {
    setBillingMethod(null);
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">
          Checking configuration...
        </div>
      </div>
    );
  }

  // If user chose OAuth, show loading while redirecting
  if (showOAuthFlow) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
        <div className="w-full max-w-[440px] space-y-8 px-4 text-center">
          <ClaudeCodeIcon className="w-12 h-12 mx-auto text-primary" />
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              Connecting to Claude...
            </h1>
            <p className="text-sm text-muted-foreground">
              Opening browser for authentication
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasApiKey = cliConfig?.hasApiKey;
  const hasBaseUrl = cliConfig?.baseUrl !== null;

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
      {/* Draggable title bar area */}
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Back button - fixed in top left corner below traffic lights */}
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
              <ClaudeCodeIcon className="w-5 h-5" fill="white" />
            </div>
            <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center">
              <KeyFilledIcon className="w-5 h-5 text-background" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              Claude Configuration Detected
            </h1>
            <p className="text-sm text-muted-foreground">
              We found an existing Claude CLI configuration in your shell
              environment.
            </p>
          </div>
        </div>

        {/* Configuration Status */}
        <div className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                hasApiKey ? "bg-green-500" : "bg-muted-foreground/30",
              )}
            />
            <span className="text-sm">
              <span className="font-medium">API Key:</span>{" "}
              {hasApiKey ? (
                <span className="text-green-600 dark:text-green-400">
                  Configured
                </span>
              ) : (
                <span className="text-muted-foreground">Not set</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                hasBaseUrl ? "bg-blue-500" : "bg-muted-foreground/30",
              )}
            />
            <span className="text-sm">
              <span className="font-medium">API Proxy:</span>{" "}
              {hasBaseUrl ? (
                <span className="text-blue-600 dark:text-blue-400 font-mono text-xs">
                  {cliConfig?.baseUrl}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Default (api.anthropic.com)
                </span>
              )}
            </span>
          </div>

          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Your <span className="font-mono">ANTHROPIC_API_KEY</span>
              {hasBaseUrl && " and "}
              {hasBaseUrl && (
                <span className="font-mono">ANTHROPIC_BASE_URL</span>
              )}{" "}
              environment variables were detected.
            </p>
          </div>
        </div>

        {/* Primary Action - Use Existing Config */}
        {/* Enable if we have API key OR proxy URL (proxies may handle auth) */}
        <button
          onClick={handleUseExistingConfig}
          disabled={isContinuing || (!hasApiKey && !hasBaseUrl)}
          className={cn(
            "w-full h-10 px-3 rounded-lg text-sm font-medium transition-all duration-150 flex items-center justify-center gap-2",
            "shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)]",
            (hasApiKey || hasBaseUrl)
              ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97]"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {isContinuing ? (
            <>Setting up...</>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Use Existing Configuration
            </>
          )}
        </button>

        {/* Secondary Action - OAuth */}
        <div className="space-y-3">
          <button
            onClick={handleUseOAuth}
            className="w-full h-8 px-3 rounded-lg text-sm font-medium transition-all duration-150 hover:bg-foreground/5 active:scale-[0.97] flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Continue with OAuth Instead
          </button>
          <p className="text-xs text-muted-foreground text-center">
            Use your Claude Pro/Max subscription with OAuth authentication
          </p>
        </div>
      </div>
    </div>
  );
}
