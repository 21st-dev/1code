// #NP - ADB tRPC router for Android Debug Bridge tools
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { spawn, exec } from "child_process"
import { promisify } from "util"
import { app } from "electron"
import * as path from "path"
import * as fs from "fs/promises"
import { createId } from "../../db/utils"

const execAsync = promisify(exec)

// ============ TYPES ============

interface ADBDevice {
  id: string
  serialNumber: string
  name: string
  model: string
  status: "connected" | "offline" | "unauthorized"
  androidVersion: string | null
}

interface ADBCommandResult {
  success: boolean
  output: string
  error?: string
}

interface LogcatEntry {
  timestamp: string
  level: "V" | "D" | "I" | "W" | "E" | "F"
  tag: string
  message: string
}

// ============ HELPERS ============

// Find ADB executable
async function findAdbPath(): Promise<string | null> {
  // Check common locations
  const possiblePaths = [
    // Windows
    process.env.ANDROID_HOME
      ? path.join(process.env.ANDROID_HOME, "platform-tools", "adb.exe")
      : null,
    "C:\\Users\\Public\\adb\\adb.exe",
    // macOS / Linux
    process.env.ANDROID_HOME
      ? path.join(process.env.ANDROID_HOME, "platform-tools", "adb")
      : null,
    "/usr/local/bin/adb",
    "/usr/bin/adb",
    // Android Studio default
    process.platform === "darwin"
      ? path.join(
          process.env.HOME || "",
          "Library/Android/sdk/platform-tools/adb"
        )
      : null,
    process.platform === "win32"
      ? path.join(
          process.env.LOCALAPPDATA || "",
          "Android/Sdk/platform-tools/adb.exe"
        )
      : null,
  ].filter(Boolean) as string[]

  for (const adbPath of possiblePaths) {
    try {
      await fs.access(adbPath)
      return adbPath
    } catch {
      // Not found, try next
    }
  }

  // Try to find in PATH
  try {
    const { stdout } = await execAsync(
      process.platform === "win32" ? "where adb" : "which adb"
    )
    const adbPath = stdout.trim().split("\n")[0]
    if (adbPath) return adbPath
  } catch {
    // Not in PATH
  }

  return null
}

async function runAdbCommand(args: string[]): Promise<ADBCommandResult> {
  const adbPath = await findAdbPath()

  if (!adbPath) {
    return {
      success: false,
      output: "",
      error: "ADB not found. Please install Android SDK Platform Tools.",
    }
  }

  return new Promise((resolve) => {
    const process = spawn(adbPath, args)
    let stdout = ""
    let stderr = ""

    process.stdout.on("data", (data) => {
      stdout += data.toString()
    })

    process.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    process.on("close", (code) => {
      resolve({
        success: code === 0,
        output: stdout.trim(),
        error: stderr.trim() || undefined,
      })
    })

    process.on("error", (err) => {
      resolve({
        success: false,
        output: "",
        error: err.message,
      })
    })
  })
}

function parseDevices(output: string): ADBDevice[] {
  const lines = output.split("\n").filter((line) => line.trim())
  const devices: ADBDevice[] = []

  for (const line of lines) {
    // Skip header line
    if (line.startsWith("List of devices")) continue

    // Parse device line: "serialNumber    device/offline/unauthorized"
    const match = line.match(/^(\S+)\s+(device|offline|unauthorized)/)
    if (!match) continue

    const [, serialNumber, statusStr] = match
    const status =
      statusStr === "device"
        ? "connected"
        : statusStr === "offline"
          ? "offline"
          : "unauthorized"

    devices.push({
      id: serialNumber,
      serialNumber,
      name: serialNumber, // Will be updated with actual name
      model: "Unknown",
      status: status as "connected" | "offline" | "unauthorized",
      androidVersion: null,
    })
  }

  return devices
}

async function getDeviceProperty(
  serialNumber: string,
  property: string
): Promise<string | null> {
  const result = await runAdbCommand([
    "-s",
    serialNumber,
    "shell",
    "getprop",
    property,
  ])
  return result.success ? result.output.trim() : null
}

async function enrichDeviceInfo(device: ADBDevice): Promise<ADBDevice> {
  if (device.status !== "connected") return device

  const [model, name, androidVersion] = await Promise.all([
    getDeviceProperty(device.serialNumber, "ro.product.model"),
    getDeviceProperty(device.serialNumber, "ro.product.name"),
    getDeviceProperty(device.serialNumber, "ro.build.version.release"),
  ])

  return {
    ...device,
    model: model || "Unknown",
    name: name || model || device.serialNumber,
    androidVersion,
  }
}

// ============ ROUTER ============

export const adbRouter = router({
  /**
   * Check if ADB is available
   */
  isAvailable: publicProcedure.query(async () => {
    const adbPath = await findAdbPath()
    return {
      available: !!adbPath,
      path: adbPath,
    }
  }),

  /**
   * List connected devices
   */
  listDevices: publicProcedure.query(async (): Promise<ADBDevice[]> => {
    const result = await runAdbCommand(["devices"])

    if (!result.success) {
      console.error("[ADB] Failed to list devices:", result.error)
      return []
    }

    const devices = parseDevices(result.output)

    // Enrich device info in parallel
    const enrichedDevices = await Promise.all(
      devices.map((device) => enrichDeviceInfo(device))
    )

    return enrichedDevices
  }),

  /**
   * Take a screenshot from device
   */
  screenshot: publicProcedure
    .input(z.object({ serialNumber: z.string() }))
    .mutation(async ({ input }) => {
      const tempDir = app.getPath("temp")
      const screenshotName = `adb-screenshot-${Date.now()}.png`
      const devicePath = `/sdcard/${screenshotName}`
      const localPath = path.join(tempDir, screenshotName)

      // Take screenshot on device
      const captureResult = await runAdbCommand([
        "-s",
        input.serialNumber,
        "shell",
        "screencap",
        "-p",
        devicePath,
      ])

      if (!captureResult.success) {
        throw new Error(`Failed to capture screenshot: ${captureResult.error}`)
      }

      // Pull to local
      const pullResult = await runAdbCommand([
        "-s",
        input.serialNumber,
        "pull",
        devicePath,
        localPath,
      ])

      if (!pullResult.success) {
        throw new Error(`Failed to pull screenshot: ${pullResult.error}`)
      }

      // Clean up device file
      await runAdbCommand([
        "-s",
        input.serialNumber,
        "shell",
        "rm",
        devicePath,
      ])

      return {
        success: true,
        path: localPath,
        filename: screenshotName,
      }
    }),

  /**
   * Start logcat capture
   */
  startLogcat: publicProcedure
    .input(
      z.object({
        serialNumber: z.string(),
        filter: z.string().optional(),
        maxLines: z.number().int().positive().default(100),
      })
    )
    .mutation(async ({ input }) => {
      const args = ["-s", input.serialNumber, "logcat", "-d", "-v", "threadtime"]

      if (input.filter) {
        args.push(input.filter)
      }

      const result = await runAdbCommand(args)

      if (!result.success) {
        throw new Error(`Failed to get logcat: ${result.error}`)
      }

      // Parse logcat output
      const lines = result.output.split("\n").slice(-input.maxLines)
      const entries: LogcatEntry[] = []

      for (const line of lines) {
        // Parse logcat line format: "MM-DD HH:MM:SS.mmm  PID  TID Level Tag: Message"
        const match = line.match(
          /^(\d+-\d+\s+\d+:\d+:\d+\.\d+)\s+\d+\s+\d+\s+([VDIWEF])\s+(\S+)\s*:\s*(.*)$/
        )

        if (match) {
          const [, timestamp, level, tag, message] = match
          entries.push({
            timestamp,
            level: level as LogcatEntry["level"],
            tag,
            message,
          })
        }
      }

      return {
        success: true,
        entries,
        rawOutput: result.output,
      }
    }),

  /**
   * Clear logcat buffer
   */
  clearLogcat: publicProcedure
    .input(z.object({ serialNumber: z.string() }))
    .mutation(async ({ input }) => {
      const result = await runAdbCommand([
        "-s",
        input.serialNumber,
        "logcat",
        "-c",
      ])

      return { success: result.success, error: result.error }
    }),

  /**
   * Install APK
   */
  installApk: publicProcedure
    .input(
      z.object({
        serialNumber: z.string(),
        apkPath: z.string(),
        reinstall: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      // Verify APK exists
      try {
        await fs.access(input.apkPath)
      } catch {
        throw new Error(`APK file not found: ${input.apkPath}`)
      }

      const args = ["-s", input.serialNumber, "install"]
      if (input.reinstall) {
        args.push("-r")
      }
      args.push(input.apkPath)

      const result = await runAdbCommand(args)

      if (!result.success || result.output.includes("Failure")) {
        throw new Error(`Failed to install APK: ${result.error || result.output}`)
      }

      return { success: true }
    }),

  /**
   * Uninstall app
   */
  uninstallApp: publicProcedure
    .input(
      z.object({
        serialNumber: z.string(),
        packageName: z.string(),
        keepData: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const args = ["-s", input.serialNumber, "uninstall"]
      if (input.keepData) {
        args.push("-k")
      }
      args.push(input.packageName)

      const result = await runAdbCommand(args)

      if (!result.success) {
        throw new Error(`Failed to uninstall: ${result.error}`)
      }

      return { success: true }
    }),

  /**
   * List installed packages
   */
  listPackages: publicProcedure
    .input(
      z.object({
        serialNumber: z.string(),
        filter: z.enum(["all", "system", "third_party"]).default("all"),
      })
    )
    .query(async ({ input }) => {
      const args = ["-s", input.serialNumber, "shell", "pm", "list", "packages"]

      if (input.filter === "system") {
        args.push("-s")
      } else if (input.filter === "third_party") {
        args.push("-3")
      }

      const result = await runAdbCommand(args)

      if (!result.success) {
        return []
      }

      return result.output
        .split("\n")
        .filter((line) => line.startsWith("package:"))
        .map((line) => line.replace("package:", "").trim())
    }),

  /**
   * Run shell command on device
   */
  shell: publicProcedure
    .input(
      z.object({
        serialNumber: z.string(),
        command: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Security: Block dangerous commands
      const dangerousPatterns = [
        /rm\s+-rf\s+\//, // rm -rf /
        /format\s+/,
        /factory.*reset/i,
        /wipe/i,
      ]

      for (const pattern of dangerousPatterns) {
        if (pattern.test(input.command)) {
          throw new Error("This command is blocked for safety reasons")
        }
      }

      const result = await runAdbCommand([
        "-s",
        input.serialNumber,
        "shell",
        input.command,
      ])

      return {
        success: result.success,
        output: result.output,
        error: result.error,
      }
    }),

  /**
   * Push file to device
   */
  push: publicProcedure
    .input(
      z.object({
        serialNumber: z.string(),
        localPath: z.string(),
        remotePath: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Verify local file exists
      try {
        await fs.access(input.localPath)
      } catch {
        throw new Error(`Local file not found: ${input.localPath}`)
      }

      const result = await runAdbCommand([
        "-s",
        input.serialNumber,
        "push",
        input.localPath,
        input.remotePath,
      ])

      if (!result.success) {
        throw new Error(`Failed to push file: ${result.error}`)
      }

      return { success: true }
    }),

  /**
   * Pull file from device
   */
  pull: publicProcedure
    .input(
      z.object({
        serialNumber: z.string(),
        remotePath: z.string(),
        localPath: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await runAdbCommand([
        "-s",
        input.serialNumber,
        "pull",
        input.remotePath,
        input.localPath,
      ])

      if (!result.success) {
        throw new Error(`Failed to pull file: ${result.error}`)
      }

      return { success: true, path: input.localPath }
    }),

  /**
   * Reboot device
   */
  reboot: publicProcedure
    .input(
      z.object({
        serialNumber: z.string(),
        mode: z.enum(["normal", "bootloader", "recovery"]).default("normal"),
      })
    )
    .mutation(async ({ input }) => {
      const args = ["-s", input.serialNumber, "reboot"]
      if (input.mode !== "normal") {
        args.push(input.mode)
      }

      const result = await runAdbCommand(args)

      return { success: result.success, error: result.error }
    }),

  /**
   * Get device battery info
   */
  getBatteryInfo: publicProcedure
    .input(z.object({ serialNumber: z.string() }))
    .query(async ({ input }) => {
      const result = await runAdbCommand([
        "-s",
        input.serialNumber,
        "shell",
        "dumpsys",
        "battery",
      ])

      if (!result.success) {
        return null
      }

      // Parse battery info
      const lines = result.output.split("\n")
      const info: Record<string, string | number | boolean> = {}

      for (const line of lines) {
        const match = line.match(/^\s*(\w+):\s*(.+)$/)
        if (match) {
          const [, key, value] = match
          if (value === "true" || value === "false") {
            info[key] = value === "true"
          } else if (!isNaN(Number(value))) {
            info[key] = Number(value)
          } else {
            info[key] = value
          }
        }
      }

      return info
    }),

  /**
   * Get device display info
   */
  getDisplayInfo: publicProcedure
    .input(z.object({ serialNumber: z.string() }))
    .query(async ({ input }) => {
      const result = await runAdbCommand([
        "-s",
        input.serialNumber,
        "shell",
        "wm",
        "size",
      ])

      if (!result.success) {
        return null
      }

      const match = result.output.match(/(\d+)x(\d+)/)
      if (!match) return null

      return {
        width: parseInt(match[1]),
        height: parseInt(match[2]),
      }
    }),

  /**
   * Input text on device
   */
  inputText: publicProcedure
    .input(
      z.object({
        serialNumber: z.string(),
        text: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Escape special characters for shell
      const escapedText = input.text.replace(/(['"\\ ])/g, "\\$1")

      const result = await runAdbCommand([
        "-s",
        input.serialNumber,
        "shell",
        "input",
        "text",
        escapedText,
      ])

      return { success: result.success, error: result.error }
    }),

  /**
   * Tap on screen coordinates
   */
  tap: publicProcedure
    .input(
      z.object({
        serialNumber: z.string(),
        x: z.number(),
        y: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await runAdbCommand([
        "-s",
        input.serialNumber,
        "shell",
        "input",
        "tap",
        String(input.x),
        String(input.y),
      ])

      return { success: result.success, error: result.error }
    }),

  /**
   * Swipe gesture
   */
  swipe: publicProcedure
    .input(
      z.object({
        serialNumber: z.string(),
        x1: z.number(),
        y1: z.number(),
        x2: z.number(),
        y2: z.number(),
        duration: z.number().default(300),
      })
    )
    .mutation(async ({ input }) => {
      const result = await runAdbCommand([
        "-s",
        input.serialNumber,
        "shell",
        "input",
        "swipe",
        String(input.x1),
        String(input.y1),
        String(input.x2),
        String(input.y2),
        String(input.duration),
      ])

      return { success: result.success, error: result.error }
    }),
})
