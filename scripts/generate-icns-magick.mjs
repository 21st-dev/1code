#!/usr/bin/env node

/**
 * Generate macOS .icns using ImageMagick + iconutil (no sharp dependency).
 * Applies Apple-style rounded squircle with proper padding.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = join(__dirname, '../build');
const INPUT = join(BUILD_DIR, 'icon.png');
const ICONSET_DIR = join(BUILD_DIR, 'icon.iconset');
const OUTPUT_ICNS = join(BUILD_DIR, 'icon.icns');

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

function run(cmd) {
  execSync(cmd, { stdio: 'pipe' });
}

function main() {
  console.log('Generating macOS .icns with ImageMagick...\n');

  if (!existsSync(INPUT)) {
    console.error(`Error: ${INPUT} not found`);
    process.exit(1);
  }

  // Clean & create iconset dir
  if (existsSync(ICONSET_DIR)) rmSync(ICONSET_DIR, { recursive: true });
  mkdirSync(ICONSET_DIR, { recursive: true });

  // Step 1: Create a 1024x1024 rounded squircle version
  // Content area: 824x824 with 100px padding, ~22% corner radius
  const contentSize = 824;
  const canvasSize = 1024;
  const padding = 100;
  const cornerRadius = Math.round(contentSize * 0.22); // ~181px

  const roundedSource = join(ICONSET_DIR, 'source-rounded.png');

  // Create rounded rectangle mask, composite content, place on transparent canvas
  const maskCmd = [
    'magick',
    '-size', `${contentSize}x${contentSize}`,
    'xc:none',
    '-draw', `"roundrectangle 0,0,${contentSize - 1},${contentSize - 1},${cornerRadius},${cornerRadius}"`,
    `"${join(ICONSET_DIR, 'mask.png')}"`
  ].join(' ');

  const compositeCmd = [
    'magick',
    `"${INPUT}"`,
    '-resize', `${contentSize}x${contentSize}!`,
    `"${join(ICONSET_DIR, 'mask.png')}"`,
    '-compose', 'DstIn',
    '-composite',
    `"${join(ICONSET_DIR, 'content.png')}"`
  ].join(' ');

  const canvasCmd = [
    'magick',
    '-size', `${canvasSize}x${canvasSize}`,
    'xc:none',
    `"${join(ICONSET_DIR, 'content.png')}"`,
    '-geometry', `+${padding}+${padding}`,
    '-composite',
    `"${roundedSource}"`
  ].join(' ');

  console.log('1. Creating rounded squircle...');
  run(maskCmd);
  run(compositeCmd);
  run(canvasCmd);
  console.log('   Done\n');

  // Step 2: Generate all icon sizes
  console.log('2. Generating icon sizes...');
  for (const { size, scale } of ICON_SIZES) {
    const actual = size * scale;
    const filename = scale === 1
      ? `icon_${size}x${size}.png`
      : `icon_${size}x${size}@${scale}x.png`;
    const outPath = join(ICONSET_DIR, filename);

    run(`magick "${roundedSource}" -resize ${actual}x${actual} "${outPath}"`);
    console.log(`   ${filename} (${actual}x${actual})`);
  }

  // Clean temp files
  for (const f of ['mask.png', 'content.png', 'source-rounded.png']) {
    const p = join(ICONSET_DIR, f);
    if (existsSync(p)) rmSync(p);
  }

  // Step 3: Create .icns
  console.log('\n3. Creating .icns...');
  run(`iconutil -c icns "${ICONSET_DIR}" -o "${OUTPUT_ICNS}"`);
  rmSync(ICONSET_DIR, { recursive: true });

  console.log(`   Created ${OUTPUT_ICNS}\n`);
  console.log('Done! Icon ready for packaging.');
}

main();
