import { useState, useEffect } from "react"
import { trpc } from "../../../lib/trpc"
import { Label } from "../../ui/label"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { toast } from "sonner"
import { CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react"

function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

export function AgentsAuthenticationTab() {
  const isNarrowScreen = useIsNarrowScreen()

  const { data: settings, refetch } = trpc.anthropicAuth.getSettings.useQuery()
  const { data: awsValidation } = trpc.anthropicAuth.validateAwsCredentials.useQuery()
  const updateMutation = trpc.anthropicAuth.updateSettings.useMutation()

  const [authMode, setAuthMode] = useState<"oauth" | "bedrock">("oauth")
  const [awsRegion, setAwsRegion] = useState("us-east-1")
  const [awsProfile, setAwsProfile] = useState("")

  useEffect(() => {
    if (settings) {
      setAuthMode(settings.authMode as "oauth" | "bedrock")
      setAwsRegion(settings.awsRegion || "us-east-1")
      setAwsProfile(settings.awsProfile || "")
    }
  }, [settings])

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        authMode,
        awsRegion: authMode === "bedrock" ? awsRegion : undefined,
        awsProfile: authMode === "bedrock" && awsProfile ? awsProfile : undefined,
      })
      await refetch()
      toast.success("Authentication settings updated")
    } catch (error) {
      toast.error("Failed to update settings")
      console.error(error)
    }
  }

  const hasChanges = settings && (
    authMode !== settings.authMode ||
    (authMode === "bedrock" && (
      awsRegion !== (settings.awsRegion || "us-east-1") ||
      awsProfile !== (settings.awsProfile || "")
    ))
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens */}
      {!isNarrowScreen && (
        <div className="space-y-2 pb-3 mb-4">
          <h3 className="text-sm font-medium text-foreground">Authentication Method</h3>
          <p className="text-sm text-muted-foreground">
            Choose how 1Code connects to Claude API
          </p>
        </div>
      )}

      {/* Auth Mode Selection */}
      <div className="space-y-4">
        {/* OAuth Option */}
        <div
          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
            authMode === "oauth"
              ? "border-primary bg-primary/5"
              : "border-border bg-background hover:bg-muted/50"
          }`}
          onClick={() => setAuthMode("oauth")}
        >
          <div className="flex items-start space-x-3">
            <div className={`mt-1 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
              authMode === "oauth" ? "border-primary" : "border-muted-foreground"
            }`}>
              {authMode === "oauth" && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium cursor-pointer">
                Anthropic OAuth (Recommended)
              </Label>
              <p className="text-sm text-muted-foreground">
                Sign in with your Anthropic account. Works with Claude.ai subscriptions.
              </p>
            </div>
          </div>
        </div>

        {/* Bedrock Option */}
        <div
          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
            authMode === "bedrock"
              ? "border-primary bg-primary/5"
              : "border-border bg-background hover:bg-muted/50"
          }`}
          onClick={() => setAuthMode("bedrock")}
        >
          <div className="flex items-start space-x-3">
            <div className={`mt-1 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
              authMode === "bedrock" ? "border-primary" : "border-muted-foreground"
            }`}>
              {authMode === "bedrock" && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <Label className="text-sm font-medium cursor-pointer">
                  AWS Bedrock
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Use AWS CLI credentials from ~/.aws/credentials. Requires Bedrock access.
                </p>
              </div>

              {authMode === "bedrock" && (
                <div className="space-y-4 pt-2" onClick={(e) => e.stopPropagation()}>
                  {/* AWS Credentials Status */}
                  {awsValidation && (
                    <div
                      className={`p-3 rounded-lg border ${
                        awsValidation.hasAwsCredentials
                          ? "border-green-500/50 bg-green-500/10"
                          : "border-red-500/50 bg-red-500/10"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {awsValidation.hasAwsCredentials ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500" />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-green-500">
                                AWS credentials detected
                              </div>
                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                <div>Profile: {awsValidation.awsProfile}</div>
                                {awsValidation.awsRegion && (
                                  <div>Region: {awsValidation.awsRegion}</div>
                                )}
                                {awsValidation.hasCredentialsFile && (
                                  <div>Credentials file: {awsValidation.awsCredentialsPath}</div>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-4 w-4 mt-0.5 text-red-500" />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-red-500">
                                No AWS credentials found
                              </div>
                              <p className="mt-2 text-sm">
                                Please configure AWS CLI credentials before enabling Bedrock mode.
                              </p>
                              <button
                                onClick={() =>
                                  window.desktopApi?.openExternal(
                                    "https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html"
                                  )
                                }
                                className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                              >
                                View AWS CLI setup guide
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* AWS Configuration Fields */}
                  <div className="bg-background rounded-lg border border-border overflow-hidden">
                    {/* AWS Region */}
                    <div className="flex items-center justify-between p-4">
                      <div className="flex-1">
                        <Label htmlFor="aws-region" className="text-sm font-medium">
                          AWS Region
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Region where Claude on Bedrock is available
                        </p>
                      </div>
                      <div className="flex-shrink-0 w-64">
                        <Input
                          id="aws-region"
                          value={awsRegion}
                          onChange={(e) => setAwsRegion(e.target.value)}
                          placeholder="us-east-1"
                          className="w-full"
                        />
                      </div>
                    </div>

                    {/* AWS Profile (Optional) */}
                    <div className="flex items-center justify-between p-4 border-t border-border">
                      <div className="flex-1">
                        <Label htmlFor="aws-profile" className="text-sm font-medium">
                          AWS Profile (Optional)
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Leave empty to use default profile
                        </p>
                      </div>
                      <div className="flex-shrink-0 w-64">
                        <Input
                          id="aws-profile"
                          value={awsProfile}
                          onChange={(e) => setAwsProfile(e.target.value)}
                          placeholder="default"
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Setup Instructions */}
                  <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
                    <div className="font-medium">First time using Bedrock?</div>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>
                        Configure AWS CLI:{" "}
                        <code className="bg-background px-1.5 py-0.5 rounded text-xs">
                          aws configure
                        </code>
                      </li>
                      <li>Enable Claude models in AWS Bedrock console</li>
                      <li>Select "AWS Bedrock" above and click "Save Changes"</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending || !hasChanges}>
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
