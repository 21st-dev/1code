#!/usr/bin/env node

/**
 * Generate packaged app icons from build/icon.png.
 *
 * This intentionally uses macOS system tools instead of a Node image dependency:
 * - sips for resizing PNGs
 * - iconutil for building build/icon.icns
 *
 * The source PNG should already be a finished 1024x1024 app icon.
 */

import { execFileSync } from "child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BUILD_DIR = join(__dirname, "../build")
const INPUT_ICON = join(BUILD_DIR, "icon.png")
const ICONSET_DIR = join(BUILD_DIR, "icon.iconset")
const OUTPUT_ICNS = join(BUILD_DIR, "icon.icns")
const OUTPUT_ICO = join(BUILD_DIR, "icon.ico")
const ICO_TEMP_DIR = join(BUILD_DIR, "icon.ico.tmp")

const ICONSET_SIZES = [
  { size: 16, scale: 1 },
  { size: 16, scale: 2 },
  { size: 32, scale: 1 },
  { size: 32, scale: 2 },
  { size: 128, scale: 1 },
  { size: 128, scale: 2 },
  { size: 256, scale: 1 },
  { size: 256, scale: 2 },
  { size: 512, scale: 1 },
  { size: 512, scale: 2 },
]

const ICO_SIZES = [16, 32, 48, 64, 128, 256]

function ensureCleanDir(path) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true })
  }
  mkdirSync(path, { recursive: true })
}

function resizePng(input, output, width, height = width) {
  execFileSync("sips", [
    "-z",
    String(height),
    String(width),
    input,
    "--out",
    output,
  ], { stdio: "pipe" })
}

function iconsetName(size, scale) {
  return scale === 1
    ? `icon_${size}x${size}.png`
    : `icon_${size}x${size}@${scale}x.png`
}

function writePngBackedIco(entries, outputPath) {
  const headerSize = 6
  const entrySize = 16
  const imageOffset = headerSize + entrySize * entries.length
  let offset = imageOffset

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(entrySize * entries.length)
  const images = []

  entries.forEach((entry, index) => {
    const data = readFileSync(entry.path)
    const base = index * entrySize
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base)
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1)
    directory.writeUInt8(0, base + 2)
    directory.writeUInt8(0, base + 3)
    directory.writeUInt16LE(1, base + 4)
    directory.writeUInt16LE(32, base + 6)
    directory.writeUInt32LE(data.length, base + 8)
    directory.writeUInt32LE(offset, base + 12)
    images.push(data)
    offset += data.length
  })

  writeFileSync(outputPath, Buffer.concat([header, directory, ...images]))
}

function main() {
  if (!existsSync(INPUT_ICON)) {
    console.error(`Input icon not found: ${INPUT_ICON}`)
    process.exit(1)
  }

  console.log("Generating app icons from build/icon.png")

  ensureCleanDir(ICONSET_DIR)
  ensureCleanDir(ICO_TEMP_DIR)

  console.log("Creating macOS iconset")
  for (const { size, scale } of ICONSET_SIZES) {
    const actualSize = size * scale
    const output = join(ICONSET_DIR, iconsetName(size, scale))
    resizePng(INPUT_ICON, output, actualSize)
    console.log(`  ${iconsetName(size, scale)}`)
  }

  execFileSync("iconutil", ["-c", "icns", ICONSET_DIR, "-o", OUTPUT_ICNS], {
    stdio: "pipe",
  })
  rmSync(ICONSET_DIR, { recursive: true, force: true })
  console.log(`Created ${OUTPUT_ICNS}`)

  console.log("Creating Windows ICO")
  const icoEntries = ICO_SIZES.map((size) => {
    const output = join(ICO_TEMP_DIR, `icon-${size}.png`)
    resizePng(INPUT_ICON, output, size)
    return { size, path: output }
  })
  writePngBackedIco(icoEntries, OUTPUT_ICO)
  rmSync(ICO_TEMP_DIR, { recursive: true, force: true })
  console.log(`Created ${OUTPUT_ICO}`)
}

main()
