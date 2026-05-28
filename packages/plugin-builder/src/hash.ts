// @songloft/plugin-builder — hash 计算模块
// 与后端 Go 版本 ComputeCanonicalZipHash / ComputeEntryHash 算法完全一致。

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, posix } from 'node:path';

/**
 * sha256 hex
 */
export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * 计算 entryHash（main.js 的 sha256）
 */
export function computeEntryHash(mainJsContent: Buffer | string): string {
  return sha256Hex(mainJsContent);
}

/**
 * 计算 canonical zipHash。
 *
 * 算法（与后端保持一致）：
 * 1. 枚举 buildDir 下所有文件（排除 plugin.json）
 * 2. 按路径 Unicode 升序排序（使用 posix 风格的路径分隔符）
 * 3. 对每个文件：hasher.write(path + "\n" + sha256Hex(content) + "\n")
 * 4. 对最终拼接串再 sha256
 */
export function computeCanonicalZipHash(buildDir: string): string {
  const entries: { path: string; hash: string }[] = [];

  function walk(dir: string) {
    const items = readdirSync(dir);
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        const relPath = posix.normalize(relative(buildDir, fullPath).replace(/\\/g, '/'));
        if (relPath === 'plugin.json') continue;
        const content = readFileSync(fullPath);
        entries.push({ path: relPath, hash: sha256Hex(content) });
      }
    }
  }

  walk(buildDir);
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const hasher = createHash('sha256');
  for (const e of entries) {
    hasher.update(e.path + '\n' + e.hash + '\n');
  }
  return hasher.digest('hex');
}
