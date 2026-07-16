#!/usr/bin/env node
/**
 * release.mjs — 极简版发版脚本（替代 changesets）
 *
 * 用法：
 *   node scripts/release.mjs <patch|minor|major|x.y.z> [--dry-run] [--yes]
 *
 * 流程：
 *   1. 读取三包当前版本（必须一致，因为 linked）
 *   2. 计算下一版本号
 *   3. 同步写回 packages/{plugin-sdk,plugin-builder,create-songloft-plugin,jsc,jsc-*}/package.json
 *   4. 同步 create-songloft-plugin/src/index.ts 中的 SDK_VERSION / BUILDER_VERSION 常量
 *   5. 校验 git 工作区干净 + 在 main 分支
 *   6. git commit -m "chore(release): vX.Y.Z" && git tag vX.Y.Z && git push --follow-tags
 *
 * tag 推送后由 .github/workflows/release.yml 拉起，做 build + npm publish + GitHub Release。
 */
import { readFileSync, writeFileSync, readSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const PKGS = [
  'packages/plugin-sdk/package.json',
  'packages/client-sdk/package.json',
  'packages/plugin-builder/package.json',
  'packages/create-songloft-plugin/package.json',
];
const JSC_MAIN_PKG = 'packages/jsc/package.json';
const JSC_PLATFORM_PKGS = [
  'packages/jsc-linux-x64/package.json',
  'packages/jsc-linux-arm64/package.json',
  'packages/jsc-darwin-x64/package.json',
  'packages/jsc-darwin-arm64/package.json',
  'packages/jsc-win32-x64/package.json',
  'packages/jsc-win32-arm64/package.json',
];
const ALL_PKGS = [...PKGS, JSC_MAIN_PKG, ...JSC_PLATFORM_PKGS];
const SCAFFOLD_INDEX = 'packages/create-songloft-plugin/src/index.ts';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const YES = args.includes('--yes') || args.includes('-y');
const bumpArg = args.find((a) => !a.startsWith('-'));

if (!bumpArg) {
  console.error('用法: node scripts/release.mjs <patch|minor|major|x.y.z> [--dry-run] [--yes]');
  process.exit(1);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function shInherit(cmd) {
  if (DRY) {
    console.log(`[dry-run] $ ${cmd}`);
    return;
  }
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

function writeJson(rel, obj) {
  if (DRY) {
    console.log(`[dry-run] write ${rel}: version=${obj.version}`);
    return;
  }
  writeFileSync(resolve(ROOT, rel), JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`非法 semver: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function bump(current, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const { major, minor, patch } = parseSemver(current);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`未知 bump 类型: ${kind}（应为 patch/minor/major 或 x.y.z）`);
}

// 1. 校验 git 工作区
const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  console.error(`❌ 当前分支为 "${branch}"，发版必须在 main 上进行。`);
  if (!DRY) process.exit(1);
}
const status = sh('git status --porcelain');
if (status) {
  console.error('❌ 工作区有未提交改动：');
  console.error(status);
  if (!DRY) process.exit(1);
}
if (!DRY) {
  shInherit('git fetch --tags origin main');
  const ahead = sh('git rev-list --count origin/main..HEAD');
  const behind = sh('git rev-list --count HEAD..origin/main');
  if (ahead !== '0' || behind !== '0') {
    console.error(`❌ 本地与 origin/main 不同步（ahead=${ahead}, behind=${behind}），请先同步。`);
    process.exit(1);
  }
}

// 2. 读取版本（允许不一致，取最高版作为 baseline 自动对齐）
const allPkgs = ALL_PKGS.map((p) => ({ path: p, json: readJson(p) }));
const versions = allPkgs.map((p) => p.json.version);
const uniqueVersions = [...new Set(versions)];
let current;
if (uniqueVersions.length === 1) {
  current = uniqueVersions[0];
} else {
  current = versions.slice().sort((a, b) => {
    const A = parseSemver(a);
    const B = parseSemver(b);
    return A.major - B.major || A.minor - B.minor || A.patch - B.patch;
  }).pop();
  console.warn('⚠️  各包版本不一致，将以最高版作为 baseline 自动对齐：');
  allPkgs.forEach((p) => console.warn(`   ${p.json.name}: ${p.json.version} → baseline ${current}`));
  console.warn('');
}
const next = bump(current, bumpArg);
const tag = `v${next}`;

// 3. 检查 tag 是否已存在
const existingTags = sh('git tag --list').split('\n');
if (existingTags.includes(tag)) {
  console.error(`❌ tag ${tag} 已存在。`);
  process.exit(1);
}

console.log('');
console.log(`📦 plugin-toolchain release: ${current} → ${next}  (tag: ${tag})`);
console.log(`   - @songloft/plugin-sdk`);
console.log(`   - @songloft/client-sdk`);
console.log(`   - @songloft/plugin-builder`);
console.log(`   - create-songloft-plugin`);
console.log(`   - @songloft/jsc`);
console.log(`   - @songloft/jsc-{linux-x64,linux-arm64,darwin-x64,darwin-arm64,win32-x64,win32-arm64}`);
console.log('');

if (!YES && !DRY) {
  // 简单确认
  process.stdout.write('继续？[y/N] ');
  const buf = Buffer.alloc(8);
  let n = 0;
  try {
    n = readSync(0, buf, 0, 8, null);
  } catch {
    // 非 TTY 环境跳过确认
  }
  const ans = buf.slice(0, n).toString('utf8').trim().toLowerCase();
  if (ans !== 'y' && ans !== 'yes') {
    console.log('已取消。');
    process.exit(0);
  }
}

// 4. 改 package.json（所有包统一 bump）
for (const p of allPkgs) {
  p.json.version = next;
  writeJson(p.path, p.json);
}

// 5. 同步 create-songloft-plugin 脚手架版本常量
const idxAbs = resolve(ROOT, SCAFFOLD_INDEX);
let idxSrc = readFileSync(idxAbs, 'utf8');
const sdkRe = /const SDK_VERSION = '\^[^']+';/;
const clientSdkRe = /const CLIENT_SDK_VERSION = '\^[^']+';/;
const builderRe = /const BUILDER_VERSION = '\^[^']+';/;
if (!sdkRe.test(idxSrc) || !clientSdkRe.test(idxSrc) || !builderRe.test(idxSrc)) {
  console.error(`❌ 在 ${SCAFFOLD_INDEX} 中找不到 SDK_VERSION/CLIENT_SDK_VERSION/BUILDER_VERSION 常量，发版前请人工同步。`);
  process.exit(1);
}
idxSrc = idxSrc
  .replace(sdkRe, `const SDK_VERSION = '^${next}';`)
  .replace(clientSdkRe, `const CLIENT_SDK_VERSION = '^${next}';`)
  .replace(builderRe, `const BUILDER_VERSION = '^${next}';`);
if (DRY) {
  console.log(`[dry-run] update ${SCAFFOLD_INDEX}: SDK_VERSION/CLIENT_SDK_VERSION/BUILDER_VERSION → ^${next}`);
} else {
  writeFileSync(idxAbs, idxSrc, 'utf8');
}

// 6. 重新生成 lockfile
console.log('📦 更新 pnpm-lock.yaml ...');
shInherit('pnpm install --no-frozen-lockfile');

// 7. commit + tag + push
shInherit(`git add ${ALL_PKGS.join(' ')} ${SCAFFOLD_INDEX} pnpm-lock.yaml`);
shInherit(`git commit -m "chore(release): ${tag}"`);
shInherit(`git tag -a ${tag} -m "Release ${tag}"`);
shInherit('git push --follow-tags');

console.log('');
console.log(`✅ 已推送 ${tag}，等待 GitHub Actions 完成 npm 发布与 Release 创建。`);
console.log(`   https://github.com/songloft-org/plugin-toolchain/actions`);
