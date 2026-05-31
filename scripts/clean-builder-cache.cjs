const fs = require('fs');
const path = require('path');

function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    console.log(`[clean:builder-cache] skip (not found): ${targetPath}`);
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
  console.log(`[clean:builder-cache] removed: ${targetPath}`);
}

function main() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    console.log('[clean:builder-cache] LOCALAPPDATA is not set; nothing to clean.');
    return;
  }

  const cacheRoot = path.join(localAppData, 'electron-builder', 'Cache');
  const targets = ['nsis', 'nsis-resources', 'nsis-web'].map((name) => path.join(cacheRoot, name));
  for (const target of targets) {
    removeIfExists(target);
  }
}

main();
