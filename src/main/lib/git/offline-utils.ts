import { checkInternetConnection } from '../ollama'

/**
 * Warns if a git command requires internet connection and we're offline.
 * Returns a warning message if the command will likely fail, null otherwise.
 */
export async function warnIfOfflineGitOperation(command: string): Promise<string | null> {
  const requiresInternet = [
    'git push',
    'git pull',
    'git fetch',
    'git clone',
    'gh pr',
    'gh issue',
    'gh repo',
  ].some(cmd => command.includes(cmd))

  if (requiresInternet) {
    const hasInternet = await checkInternetConnection()

    if (!hasInternet) {
      return `⚠️ Warning: "${command}" requires internet connection and will likely fail.`
    }
  }

  return null
}
