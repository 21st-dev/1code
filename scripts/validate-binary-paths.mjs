#!/usr/bin/env node

/**
 * Validate Claude binary paths after electron-builder packaging
 *
 * This script ensures each architecture build has the correct binary.
 * It does NOT copy binaries - it validates they are already correct.
 *
 * If validation fails, the build should fail with helpful error messages.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release');

const platform = process.platform;
const binaryName = platform === 'win32' ? 'claude.exe' : 'claude';

console.log(`[validate-binary-paths] Platform: ${platform}`);

// Check if release directory exists
if (!fs.existsSync(releaseDir)) {
  console.log('[validate-binary-paths] No release directory found - skipping validation');
  process.exit(0);
}

// Platform-specific validation
let appBundles = [];

if (platform === 'darwin') {
  // macOS: Check both arm64 and x64 builds
  const macBuilds = [
    { dir: 'mac-arm64', expectedArch: 'arm64', name: 'ARM64 (Apple Silicon)' },
    { dir: 'mac', expectedArch: 'x86_64', name: 'x64 (Intel)' }
  ];

  for (const build of macBuilds) {
    const appPath = path.join(releaseDir, build.dir, '1Code.app');
    if (fs.existsSync(appPath)) {
      appBundles.push({
        ...build,
        path: appPath,
        binPath: path.join(appPath, 'Contents', 'Resources', 'bin', binaryName)
      });
    }
  }
} else if (platform === 'win32') {
  // Windows builds
  const winBuild = path.join(releaseDir, 'win-unpacked');
  if (fs.existsSync(winBuild)) {
    appBundles.push({
      dir: 'win-unpacked',
      expectedArch: 'x86-64',
      name: 'Windows x64',
      path: winBuild,
      binPath: path.join(winBuild, 'resources', 'bin', binaryName)
    });
  }
} else if (platform === 'linux') {
  // Linux builds
  const linuxBuild = path.join(releaseDir, 'linux-unpacked');
  if (fs.existsSync(linuxBuild)) {
    appBundles.push({
      dir: 'linux-unpacked',
      expectedArch: 'x86-64',
      name: 'Linux x64',
      path: linuxBuild,
      binPath: path.join(linuxBuild, 'resources', 'bin', binaryName)
    });
  }
}

if (appBundles.length === 0) {
  console.log('[validate-binary-paths] No packaged builds found - skipping validation');
  process.exit(0);
}

console.log(`[validate-binary-paths] Validating ${appBundles.length} build(s)...\n`);

let hasErrors = false;

for (const bundle of appBundles) {
  console.log(`Checking ${bundle.name} (${bundle.dir})...`);

  // Check if binary exists
  if (!fs.existsSync(bundle.binPath)) {
    console.error(`  ❌ ERROR: Binary not found at ${bundle.binPath}`);
    console.error(`  → Run: bun run claude:download:all`);
    hasErrors = true;
    continue;
  }

  // Check binary size
  const stats = fs.statSync(bundle.binPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

  if (stats.size < 1024 * 1024) {
    console.error(`  ❌ ERROR: Binary is too small (${sizeMB} MB)`);
    console.error(`  → Binary might be corrupted`);
    hasErrors = true;
    continue;
  }

  // Check binary architecture (macOS and Linux only)
  if (platform !== 'win32') {
    try {
      const fileOutput = execSync(`file "${bundle.binPath}"`, { encoding: 'utf-8' });
      const isCorrectArch = fileOutput.includes(bundle.expectedArch);

      if (!isCorrectArch) {
        console.error(`  ❌ ERROR: Wrong architecture!`);
        console.error(`  → Expected: ${bundle.expectedArch}`);
        console.error(`  → Got: ${fileOutput.trim()}`);
        console.error(`  → Run: bun run claude:download:all`);
        hasErrors = true;
        continue;
      }

      console.log(`  ✓ Binary found: ${sizeMB} MB, ${bundle.expectedArch}`);
    } catch (err) {
      console.warn(`  ⚠ Warning: Could not verify architecture: ${err.message}`);
      console.log(`  ✓ Binary found: ${sizeMB} MB (architecture check skipped)`);
    }
  } else {
    console.log(`  ✓ Binary found: ${sizeMB} MB`);
  }

  // Check if binary is executable (Unix only)
  if (platform !== 'win32') {
    const mode = stats.mode;
    const isExecutable = (mode & 0o111) !== 0;

    if (!isExecutable) {
      console.error(`  ❌ ERROR: Binary is not executable`);
      hasErrors = true;
      continue;
    }
  }
}

console.log('');

if (hasErrors) {
  console.error('❌ Binary validation FAILED!');
  console.error('');
  console.error('This usually means the binaries were not downloaded before building.');
  console.error('Please run: bun run claude:download:all');
  console.error('Then rebuild: bun run build && bun run package:mac');
  process.exit(1);
}

console.log('✅ All binaries validated successfully!');
