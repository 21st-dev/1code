// Patches the Electron.app bundle in node_modules to show the app name and icon in macOS dock during dev mode.
import { execSync } from "child_process"
import { copyFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const electronApp = join(root, "node_modules/electron/dist/Electron.app")
const plistPath = join(electronApp, "Contents/Info.plist")
const icnsSource = join(root, "build/icon.icns")
const icnsDest = join(electronApp, "Contents/Resources/electron.icns")
const appName = "Agent Code for Me"
const bundleIdentifier = "io.github.lupanpan1030.agentcodeforme.dev"

function setPlistValue(key, value) {
  execSync(`/usr/libexec/PlistBuddy -c "Set :${key} ${value}" "${plistPath}"`)
}

if (process.platform !== "darwin") {
  process.exit(0)
}

if (existsSync(plistPath)) {
  try {
    setPlistValue("CFBundleName", appName)
    setPlistValue("CFBundleDisplayName", appName)
    setPlistValue("CFBundleIdentifier", bundleIdentifier)
    console.log(
      `[patch-electron-dev] Updated Info.plist: name -> ${appName}, bundle id -> ${bundleIdentifier}`,
    )
  } catch (e) {
    console.warn("[patch-electron-dev] Failed to update Info.plist:", e.message)
  }
}

if (existsSync(icnsSource) && existsSync(icnsDest)) {
  copyFileSync(icnsSource, icnsDest)
  console.log("[patch-electron-dev] Replaced electron.icns with custom icon")
}

// Touch the .app bundle so macOS re-reads it
if (existsSync(electronApp)) {
  execSync(`touch "${electronApp}"`)
}
