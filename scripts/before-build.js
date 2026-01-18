/**
 * Before Build Hook for electron-builder
 * @author Danz17 (https://github.com/Danz17)
 *
 * This hook skips the default @electron/rebuild process and manually rebuilds
 * only better-sqlite3. node-pty uses NAPI prebuilds that are compatible with
 * Electron without recompilation.
 *
 * Why this is needed on Windows:
 * - Python 3.14 removed distutils module causing node-gyp compilation to hang
 * - node-pty's NAPI prebuilds work out-of-the-box without recompilation
 * - Skipping node-pty rebuild prevents infinite hang during packaging
 *
 * @param {Object} context - The build context from electron-builder
 * @returns {Promise<boolean>} - Return false to skip default rebuild
 */
const { execSync } = require('child_process');

module.exports = async function beforeBuild(context) {
  const { appDir, electronVersion, arch } = context;

  console.log(`\n[beforeBuild] Manually rebuilding native modules for Electron ${electronVersion} (${arch})`);
  console.log(`[beforeBuild] App directory: ${appDir}`);

  try {
    // @Danz17: Only rebuild better-sqlite3 - node-pty uses NAPI prebuilds
    const cmd = `npx @electron/rebuild -f -v ${electronVersion} -a ${arch} --only better-sqlite3`;
    console.log(`[beforeBuild] Running: ${cmd}`);

    execSync(cmd, {
      cwd: appDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_arch: arch,
        npm_config_target_arch: arch,
      }
    });

    console.log('[beforeBuild] Native module rebuild completed successfully');
  } catch (error) {
    console.error('[beforeBuild] Failed to rebuild native modules:', error.message);
    throw error;
  }

  // @Danz17: Return false to skip electron-builder's default rebuild (which hangs on node-pty)
  return false;
};
