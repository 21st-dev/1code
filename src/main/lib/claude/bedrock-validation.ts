/**
 * Validate AWS Bedrock configuration before executing Claude query
 * This ensures users get clear error messages if credentials or config are missing
 */
export function validateBedrockConfig(env: Record<string, string>): {
  valid: boolean
  error?: string
  details?: string
} {
  // Check for AWS credentials (either env vars or profile)
  const hasEnvCredentials = !!(
    env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
  )
  const hasProfile = !!env.AWS_PROFILE

  if (!hasEnvCredentials && !hasProfile) {
    return {
      valid: false,
      error: "AWS credentials not found",
      details:
        "Please configure AWS CLI credentials:\n" +
        "1. Run 'aws configure' in terminal\n" +
        "2. Or manually edit ~/.aws/credentials\n" +
        "3. Restart 1Code to load new credentials",
    }
  }

  // Check for AWS region
  if (!env.AWS_REGION && !env.AWS_DEFAULT_REGION) {
    return {
      valid: false,
      error: "AWS region not configured",
      details:
        "Please set AWS region in Settings > Authentication.\n" +
        "Claude on Bedrock is available in regions like us-east-1, us-west-2.",
    }
  }

  return { valid: true }
}
