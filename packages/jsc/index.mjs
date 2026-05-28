import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const PLATFORMS = {
  'linux-x64': '@songloft/jsc-linux-x64',
  'linux-arm64': '@songloft/jsc-linux-arm64',
  'darwin-x64': '@songloft/jsc-darwin-x64',
  'darwin-arm64': '@songloft/jsc-darwin-arm64',
  'win32-x64': '@songloft/jsc-win32-x64',
  'win32-arm64': '@songloft/jsc-win32-arm64',
};

export function getJscBinaryPath() {
  const key = `${process.platform}-${process.arch}`;
  const pkg = PLATFORMS[key];

  if (!pkg) {
    throw new Error(`Unsupported platform: ${key}. Supported: ${Object.keys(PLATFORMS).join(', ')}`);
  }

  try {
    // 通过 require 找到已安装的平台子包
    return require(pkg);
  } catch {
    // Fallback: 本地开发时可能在 bin/ 目录有预编译
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const platform = process.platform === 'win32' ? 'windows' : process.platform;
    const arch = process.arch === 'x64' ? 'amd64' : process.arch;
    const ext = process.platform === 'win32' ? '.exe' : '';
    const localBin = join(__dirname, 'bin', `jsc-${platform}-${arch}${ext}`);
    if (existsSync(localBin)) return localBin;

    throw new Error(`Cannot find jsc binary. Install @songloft/jsc for your platform or run 'node build.mjs' to build locally.`);
  }
}
