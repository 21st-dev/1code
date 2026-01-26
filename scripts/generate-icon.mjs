#!/usr/bin/env node

/**
 * Generate macOS icon with proper rounded corners for all macOS versions
 *
 * This script creates a properly rounded macOS app icon that looks good on:
 * - macOS Sequoia (26+) - where system applies automatic rounding
 * - Older macOS versions (Big Sur, Monterey, Ventura) - where manual rounding is needed
 *
 * Based on Apple's macOS Big Sur icon guidelines:
 * - 1024x1024 canvas
 * - 824x824 content area (centered)
 * - ~18% corner radius (185.4px for 1024x1024)
 * - 100px transparent padding on all sides
 */

import { writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import sharp from 'sharp';
import { getRootDir, fileExists, ensureDir } from './utils.mjs';

const ROOT_DIR = getRootDir(import.meta.url);

// Paths
const BUILD_DIR = join(ROOT_DIR, 'build');
const INPUT_ICON = join(BUILD_DIR, 'icon.png');
const ICONSET_DIR = join(BUILD_DIR, 'icon.iconset');
const OUTPUT_ICON = join(BUILD_DIR, 'icon.icns');

// Icon specifications
const ICON_SIZES = [
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
];

/**
 * Create an SVG rounded rectangle path (Apple's squircle approximation)
 */
function createRoundedRectSVG(width, height, radius) {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>
  `;
}

/**
 * Create a rounded squircle icon following Apple's design guidelines
 * 
 * For older macOS (pre-Sequoia), icons need padding to look correct in Dock.
 * Apple recommends: 1024x1024 canvas with ~824x824 content area (100px padding).
 */
async function createRoundedSquircle(inputPath, outputPath, size = 1024, padding = 100) {
  const contentSize = size - (padding * 2); // 824 for 1024 canvas
  const contentCornerRadius = Math.round(contentSize * 0.22); // ~22% for content area

  console.log(`   • Processing: ${size}x${size} canvas`);
  console.log(`   • Content area: ${contentSize}x${contentSize}`);
  console.log(`   • Content corner radius: ${contentCornerRadius}px`);
  console.log(`   • Padding: ${padding}px on all sides`);

  // Create rounded rectangle mask for the CONTENT area (not full canvas)
  const maskSVG = createRoundedRectSVG(contentSize, contentSize, contentCornerRadius);
  const maskBuffer = Buffer.from(maskSVG);

  // Step 1: Resize input to content size and apply rounded mask
  const maskedContent = await sharp(inputPath)
    .resize(contentSize, contentSize, { fit: 'cover' })
    .composite([
      {
        input: maskBuffer,
        blend: 'dest-in'
      }
    ])
    .png()
    .toBuffer();

  // Step 2: Place masked content centered on transparent canvas with padding
  const result = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      {
        input: maskedContent,
        left: padding,
        top: padding
      }
    ])
    .png()
    .toBuffer();

  await sharp(result).toFile(outputPath);

  return outputPath;
}

/**
 * Generate a specific icon size
 */
async function generateIconSize(sourcePath, size, scale, outputDir) {
  const actualSize = size * scale;
  const filename = scale === 1
    ? `icon_${size}x${size}.png`
    : `icon_${size}x${size}@${scale}x.png`;

  const outputPath = join(outputDir, filename);

  await sharp(sourcePath)
    .resize(actualSize, actualSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath);

  return { filename, actualSize };
}

async function main() {
  console.log('🎨 Generating macOS icon with proper rounded corners...\n');

  // Check input file
  if (!fileExists(INPUT_ICON)) {
    console.error(`❌ Error: Input icon not found at ${INPUT_ICON}`);
    process.exit(1);
  }

  console.log(`📂 Input:  ${INPUT_ICON}`);
  console.log(`📂 Output: ${OUTPUT_ICON}\n`);

  // Create iconset directory
  if (fileExists(ICONSET_DIR)) {
    rmSync(ICONSET_DIR, { recursive: true });
  }
  ensureDir(ICONSET_DIR);

  // Step 1: Create rounded version
  console.log('1️⃣  Creating rounded squircle shape...');

  const roundedSource = join(ICONSET_DIR, 'source-rounded.png');
  await createRoundedSquircle(INPUT_ICON, roundedSource);

  console.log('   ✓ Created rounded icon with proper squircle shape\n');

  // Step 2: Generate all sizes
  console.log('2️⃣  Generating all required icon sizes...');

  for (const { size, scale } of ICON_SIZES) {
    const { filename, actualSize } = await generateIconSize(
      roundedSource,
      size,
      scale,
      ICONSET_DIR
    );
    console.log(`   ✓ ${filename} (${actualSize}x${actualSize})`);
  }

  // Clean up temp file
  if (fileExists(roundedSource)) {
    rmSync(roundedSource);
  }

  // Step 3: Create .icns file
  console.log('\n3️⃣  Creating .icns file...');

  try {
    execSync(`iconutil -c icns "${ICONSET_DIR}" -o "${OUTPUT_ICON}"`, { stdio: 'pipe' });

    console.log(`   ✓ Created ${OUTPUT_ICON.split('/').pop()}`);

    // Clean up iconset directory
    rmSync(ICONSET_DIR, { recursive: true });

    console.log('\n✅ Success! Icon generated with proper macOS rounded corners');
    console.log(`   File: ${OUTPUT_ICON}`);
    console.log('\n📝 This icon will now look correct on:');
    console.log('   • macOS Sequoia (26+) - system auto-rounding');
    console.log('   • macOS Ventura, Monterey, Big Sur - manual rounding');
    console.log('   • Older macOS versions');
    console.log('\n🔄 Next steps:');
    console.log('   1. Update package.json to use: "icon": "build/icon.icns"');
    console.log('   2. Rebuild your app: npm run package:mac');

  } catch (error) {
    console.error('\n❌ Error creating .icns file:', error.message);
    console.error('   Make sure you\'re running on macOS with iconutil available');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
