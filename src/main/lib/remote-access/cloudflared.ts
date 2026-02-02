// src/main/lib/remote-access/cloudflared.ts

import { spawn, ChildProcess } from "child_process"
import { createWriteStream, existsSync, chmodSync } from "fs"
import { mkdir, unlink } from "fs/promises"
import { join } from "path"
import { app } from "electron"
import { extract } from "tar"

const CLOUDFLARED_VERSION = "2026.1.1"

const DOWNLOAD_URLS: Record<string, string> = {
  "darwin-arm64": `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-darwin-arm64.tgz`,
  "darwin-x64": `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-darwin-amd64.tgz`,
  "win32-x64": `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`,
  "linux-x64": `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64`,
}

let cloudflaredProcess: ChildProcess | null = null

/**
 * Get the path where cloudflared binary should be stored
 */
export function getCloudflaredPath(): string {
  const binDir = join(app.getPath("userData"), "bin")
  const ext = process.platform === "win32" ? ".exe" : ""
  return join(binDir, `cloudflared${ext}`)
}

/**
 * Check if cloudflared is already downloaded
 */
export function isCloudflaredInstalled(): boolean {
  return existsSync(getCloudflaredPath())
}

/**
 * Download cloudflared binary for current platform
 */
export async function downloadCloudflared(
  onProgress?: (percent: number) => void
): Promise<void> {
  const platform = process.platform
  const arch = process.arch
  const key = `${platform}-${arch}`

  const url = DOWNLOAD_URLS[key]
  if (!url) {
    throw new Error(`Unsupported platform: ${key}`)
  }

  const binDir = join(app.getPath("userData"), "bin")
  await mkdir(binDir, { recursive: true })

  const cloudflaredPath = getCloudflaredPath()
  const isTgz = url.endsWith(".tgz")

  console.log(`[Cloudflared] Downloading from ${url}`)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`)
  }

  const contentLength = parseInt(response.headers.get("content-length") || "0")
  let downloaded = 0

  if (isTgz) {
    // For .tgz files, extract directly
    const tempPath = join(binDir, "cloudflared.tgz")
    const fileStream = createWriteStream(tempPath)

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fileStream.write(value)
      downloaded += value.length
      if (contentLength && onProgress) {
        onProgress(Math.round((downloaded / contentLength) * 100))
      }
    }
    fileStream.end()

    // Wait for file to be written
    await new Promise((resolve) => fileStream.on("finish", resolve))

    // Extract tar.gz
    await extract({
      file: tempPath,
      cwd: binDir,
    })

    // Clean up temp file
    await unlink(tempPath)
  } else {
    // For direct executables (Windows, Linux)
    const fileStream = createWriteStream(cloudflaredPath)
    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fileStream.write(value)
      downloaded += value.length
      if (contentLength && onProgress) {
        onProgress(Math.round((downloaded / contentLength) * 100))
      }
    }
    fileStream.end()
    await new Promise((resolve) => fileStream.on("finish", resolve))
  }

  // Make executable on Unix
  if (process.platform !== "win32") {
    chmodSync(cloudflaredPath, 0o755)
  }

  console.log(`[Cloudflared] Downloaded to ${cloudflaredPath}`)
}

/**
 * Start cloudflared tunnel
 * Returns the public URL when ready
 */
export function startTunnel(localPort: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const cloudflaredPath = getCloudflaredPath()

    if (!existsSync(cloudflaredPath)) {
      reject(new Error("Cloudflared not installed"))
      return
    }

    console.log(`[Cloudflared] Starting tunnel to localhost:${localPort}`)

    cloudflaredProcess = spawn(cloudflaredPath, [
      "tunnel",
      "--url",
      `http://localhost:${localPort}`,
    ])

    let urlFound = false
    let outputBuffer = ""

    cloudflaredProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString()
      console.log(`[Cloudflared] stdout: ${output}`)
    })

    cloudflaredProcess.stderr?.on("data", (data: Buffer) => {
      const output = data.toString()
      console.log(`[Cloudflared] ${output}`)
      outputBuffer += output

      // Parse URL from output
      // Example: "INF +-----------------------------------------------------------+"
      // followed by "INF |  https://random-words.trycloudflare.com                  |"
      const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
      if (urlMatch && !urlFound) {
        urlFound = true
        const url = urlMatch[0]
        console.log(`[Cloudflared] Tunnel URL found: ${url}`)
        resolve(url)
      }
    })

    cloudflaredProcess.on("error", (err) => {
      console.error("[Cloudflared] Process error:", err)
      reject(err)
    })

    cloudflaredProcess.on("exit", (code, signal) => {
      console.log(`[Cloudflared] Process exited with code ${code}, signal: ${signal}`)
      cloudflaredProcess = null
      if (!urlFound) {
        // Include output buffer for debugging
        console.error(`[Cloudflared] Output before exit:\n${outputBuffer}`)
        reject(new Error(`Cloudflared exited with code ${code} before URL was found`))
      }
    })

    // Timeout after 45 seconds (increased from 30)
    setTimeout(() => {
      if (!urlFound) {
        console.error(`[Cloudflared] Timeout waiting for tunnel URL. Output so far:\n${outputBuffer}`)
        stopTunnel()
        reject(new Error("Timeout waiting for tunnel URL"))
      }
    }, 45000)
  })
}

/**
 * Stop cloudflared tunnel
 */
export function stopTunnel(): void {
  if (cloudflaredProcess) {
    console.log("[Cloudflared] Stopping tunnel")
    cloudflaredProcess.kill()
    cloudflaredProcess = null
  }
}

/**
 * Check if tunnel is running
 */
export function isTunnelRunning(): boolean {
  return cloudflaredProcess !== null
}
