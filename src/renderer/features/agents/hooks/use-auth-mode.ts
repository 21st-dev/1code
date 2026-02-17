import { trpc } from "../../../lib/trpc"

export function useAuthMode() {
  const { data: authSettings } = trpc.anthropicAuth.getSettings.useQuery(
    undefined,
    { staleTime: 60 * 1000 }, // 1 minute - auth mode changes rarely
  )
  return {
    authMode: (authSettings?.authMode ?? "oauth") as "oauth" | "bedrock",
    awsRegion: (authSettings?.awsRegion ?? "us-east-1") as string,
    isBedrockMode: authSettings?.authMode === "bedrock",
  }
}
