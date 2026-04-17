export function resolveOpenCodexCloudAuthEnabled(
  env: Record<string, string | undefined>,
): boolean {
  const raw = env.OPENCODEX_ENABLE_CLOUD_AUTH?.trim().toLowerCase()
  return raw === "1" || raw === "true"
}
