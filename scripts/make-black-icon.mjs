#!/usr/bin/env node

/**
 * Convert the blue icon to a black version using ImageMagick.
 * - Blue tones → black/near-black
 * - White elements → stay white
 */

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = join(__dirname, '../build');
const INPUT = join(BUILD_DIR, 'icon-blue-original.png');
const OUTPUT = join(BUILD_DIR, 'icon.png');

// Use ImageMagick to:
// 1. Desaturate (remove blue)
// 2. Apply a sigmoidal contrast to push darks to black, keep whites white
// 3. Level adjust to deepen blacks
const cmd = [
  'magick',
  `"${INPUT}"`,
  '-modulate', '100,0,100',        // Remove all saturation (grayscale)
  '-brightness-contrast', '-40x60', // Darken midtones, boost contrast
  '-level', '0%,70%',               // Crush darks harder, keep highlights
  `"${OUTPUT}"`
].join(' ');

console.log('Converting icon to black...');
console.log(`Command: ${cmd}\n`);

try {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`\nDone! Black icon saved to ${OUTPUT}`);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
