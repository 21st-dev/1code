import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOAuthToken, isTokenExpired as checkTokenExpired } from "./oauth-utils";

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
  };
}

export interface ClaudeOAuthCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}

/**
 * Read Claude OAuth credentials from system credential store
 * Dispatches to platform-specific implementation
 */
function readFromKeychain(): ClaudeOAuthCredential | null {
  if (process.platform === 'darwin') {
    return readFromMacOSKeychain();
  } else if (process.platform === 'win32') {
    return readFromWindowsCredentialManager();
  } else if (process.platform === 'linux') {
    return readFromLinuxSecretService();
  }
  return null;
}

/**
 * Read Claude OAuth credentials from macOS Keychain
 */
function readFromMacOSKeychain(): ClaudeOAuthCredential | null {
  try {
    const result = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (result) {
      const credentials: ClaudeCredentials = JSON.parse(result);
      if (credentials.claudeAiOauth) {
        return {
          accessToken: credentials.claudeAiOauth.accessToken,
          refreshToken: credentials.claudeAiOauth.refreshToken,
          expiresAt: credentials.claudeAiOauth.expiresAt,
          scopes: credentials.claudeAiOauth.scopes,
        };
      }
    }
  } catch {
    // Keychain entry not found or parse error
  }
  return null;
}

/**
 * Read Claude OAuth credentials from Windows Credential Manager
 * Falls back to credentials file which Claude Code uses on Windows
 */
function readFromWindowsCredentialManager(): ClaudeOAuthCredential | null {
  try {
    // Read from the credentials file location that Claude Code uses on Windows
    const credentialsPath = join(homedir(), '.claude', '.credentials.json');
    if (existsSync(credentialsPath)) {
      const content = readFileSync(credentialsPath, 'utf-8');
      const credentials: ClaudeCredentials = JSON.parse(content);
      if (credentials.claudeAiOauth) {
        return {
          accessToken: credentials.claudeAiOauth.accessToken,
          refreshToken: credentials.claudeAiOauth.refreshToken,
          expiresAt: credentials.claudeAiOauth.expiresAt,
          scopes: credentials.claudeAiOauth.scopes,
        };
      }
    }
  } catch {
    // Credential Manager read failed
  }
  return null;
}

/**
 * Read Claude OAuth credentials from Linux Secret Service (libsecret)
 * Uses secret-tool CLI which interfaces with GNOME Keyring or KDE Wallet
 */
function readFromLinuxSecretService(): ClaudeOAuthCredential | null {
  try {
    // Try secret-tool (works with GNOME Keyring, KDE Wallet via libsecret)
    const result = execSync(
      'secret-tool lookup service "Claude Code" account "credentials" 2>/dev/null',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (result) {
      const credentials: ClaudeCredentials = JSON.parse(result);
      if (credentials.claudeAiOauth) {
        return {
          accessToken: credentials.claudeAiOauth.accessToken,
          refreshToken: credentials.claudeAiOauth.refreshToken,
          expiresAt: credentials.claudeAiOauth.expiresAt,
          scopes: credentials.claudeAiOauth.scopes,
        };
      }
    }
  } catch {
    // secret-tool not available or entry not found
  }

  // Fallback: try pass (password-store)
  try {
    const result = execSync(
      'pass show claude-code/credentials 2>/dev/null',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (result) {
      const credentials: ClaudeCredentials = JSON.parse(result);
      if (credentials.claudeAiOauth) {
        return {
          accessToken: credentials.claudeAiOauth.accessToken,
          refreshToken: credentials.claudeAiOauth.refreshToken,
          expiresAt: credentials.claudeAiOauth.expiresAt,
          scopes: credentials.claudeAiOauth.scopes,
        };
      }
    }
  } catch {
    // pass not available or entry not found
  }

  return null;
}

/**
 * Read Claude OAuth credentials from credentials file (Linux/fallback)
 */
function readFromCredentialsFile(): ClaudeOAuthCredential | null {
  const credentialsPath = join(homedir(), '.claude', '.credentials.json');

  try {
    if (existsSync(credentialsPath)) {
      const content = readFileSync(credentialsPath, 'utf-8');
      const credentials: ClaudeCredentials = JSON.parse(content);
      if (credentials.claudeAiOauth) {
        return {
          accessToken: credentials.claudeAiOauth.accessToken,
          refreshToken: credentials.claudeAiOauth.refreshToken,
          expiresAt: credentials.claudeAiOauth.expiresAt,
          scopes: credentials.claudeAiOauth.scopes,
        };
      }
    }
  } catch {
    // File not found or parse error
  }
  return null;
}

/**
 * Get existing Claude OAuth credentials from keychain or credentials file
 */
export function getExistingClaudeCredentials(): ClaudeOAuthCredential | null {
  // Try keychain first (macOS, Windows, Linux)
  const keychainCreds = readFromKeychain();
  if (keychainCreds) {
    return keychainCreds;
  }

  // Fall back to credentials file
  return readFromCredentialsFile();
}

/**
 * Get existing Claude OAuth token from keychain or credentials file
 * @deprecated Use getExistingClaudeCredentials() to get full credentials with refresh token
 */
export function getExistingClaudeToken(): string | null {
  const creds = getExistingClaudeCredentials();
  return creds?.accessToken || null;
}

/**
 * Refresh Claude OAuth token using refresh token
 * Delegates to shared oauth-utils.ts implementation
 */
export async function refreshClaudeToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}> {
  return refreshOAuthToken(refreshToken);
}

/**
 * Check if a token is expired or will expire soon (within 5 minutes)
 * Delegates to shared oauth-utils.ts implementation
 */
export function isTokenExpired(expiresAt?: number): boolean {
  return checkTokenExpired(expiresAt);
}

/**
 * Build extended PATH with common installation locations
 * This is necessary because when running from Finder/Dock, the PATH
 * may not include directories where claude CLI is installed
 */
function getExtendedPath(): string {
  const home = homedir();
  const extendedPaths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    `${home}/.local/bin`,
    `${home}/.bun/bin`,
    `${home}/.cargo/bin`,
    '/opt/local/bin',
    `${home}/.nvm/versions/node/*/bin`, // Common Node.js installations
  ].filter(Boolean);

  const currentPath = process.env.PATH || '';
  return [...extendedPaths, ...currentPath.split(':')].join(':');
}

/**
 * Check if Claude CLI is installed (cross-platform)
 * Uses extended PATH to find claude even when running from Finder/Dock
 */
export function isClaudeCliInstalled(): boolean {
  try {
    // Use 'where' on Windows, 'which' on Unix-like systems
    const command = process.platform === 'win32' ? 'where claude' : 'which claude';
    const fullPath = getExtendedPath();

    execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: fullPath }
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `claude setup-token` in a new terminal window
 * Returns a promise that resolves when setup is complete
 *
 * This approach opens a new terminal window where the user can complete
 * the OAuth flow with proper TTY support, then checks for the token
 */
export function runClaudeSetupToken(
  onStatus: (message: string) => void
): Promise<{ success: boolean; token?: string; error?: string }> {
  return new Promise((resolve) => {
    onStatus('Opening terminal for authentication...');

    const fullPath = getExtendedPath();

    // Script that runs claude setup-token and signals completion
    const script = [
      `export PATH="${fullPath}"`,
      'echo "=== Claude Code Authentication ==="',
      'echo ""',
      'echo "Please complete the authentication in your browser."',
      'echo "This terminal will close automatically when done."',
      'echo ""',
      '',
      'if claude setup-token; then',
      '  echo ""',
      '  echo "✓ Authentication successful!"',
      '  sleep 1',
      'else',
      '  echo ""',
      '  echo "✗ Authentication failed"',
      '  sleep 2',
      'fi',
    ].join('\n').trim();

    let terminalCommand: string;
    let terminalArgs: string[] = [];

    if (process.platform === 'darwin') {
      // macOS: Write script to temp file and open with Terminal.app
      const scriptDir = join(tmpdir(), 'claude-auth-scripts');
      const scriptPath = join(scriptDir, `auth-${Date.now()}.sh`);

      // Ensure script directory exists
      try {
        mkdirSync(scriptDir, { recursive: true });
      } catch {
        // Directory might already exist
      }

      writeFileSync(scriptPath, script, { mode: 0o755 });

      // Use osascript to tell Terminal to execute the script
      // This avoids shell escaping issues
      const escapedPath = scriptPath.replace(/"/g, '\\"'); // Escape quotes for osascript
      terminalCommand = 'osascript';
      terminalArgs = [
        '-e',
        `tell application "Terminal" to do script "bash \\"${escapedPath}\\""`
      ];
    } else if (process.platform === 'win32') {
      // Windows: Use cmd or Windows Terminal
      terminalCommand = 'cmd';
      terminalArgs = ['/c', 'start', 'cmd', '/k', script.replace(/\n/g, ' && ')];
    } else {
      // Linux: Try various terminal emulators
      terminalCommand = 'x-terminal-emulator';
      terminalArgs = ['-e', 'bash', '-c', script];
    }

    const child = spawn(terminalCommand, terminalArgs, {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PATH: fullPath },
    });

    child.unref(); // Allow the parent process to exit independently

    child.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to open terminal: ${err.message}`,
      });
    });

    // Poll for token appearance (user might take time to complete OAuth)
    onStatus('Waiting for authentication to complete...');

    let attempts = 0;
    const maxAttempts = 60; // 2 minutes (60 * 2 seconds)

    const checkInterval = setInterval(() => {
      attempts++;

      const token = getExistingClaudeToken();
      if (token) {
        clearInterval(checkInterval);
        onStatus('Authentication complete!');
        resolve({ success: true, token });
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        resolve({
          success: false,
          error: 'Authentication timed out. Please run "claude setup-token" in your terminal manually.',
        });
      }
    }, 2000); // Check every 2 seconds
  });
}
