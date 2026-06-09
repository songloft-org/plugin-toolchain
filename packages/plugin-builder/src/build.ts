// @songloft/plugin-builder — 核心 build 逻辑

import * as esbuild from 'esbuild';
import JSZip from 'jszip';
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, unlinkSync, readdirSync as readdirSyncTop } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readManifest, validateManifest } from './manifest.js';
import { computeEntryHash, computeCanonicalZipHash, sha256Hex } from './hash.js';
import { hashStaticAssets } from './static-assets.js';
import type { PluginManifest } from '@songloft/plugin-sdk';

export interface BuildOptions {
  cwd: string;
  outDir?: string;
  mode?: 'development' | 'production';
  sourcemap?: boolean;
}

export interface BuildResult {
  zipPath: string;
  manifest: PluginManifest;
  size: number;
  entryHash: string;
  zipHash: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: { field: string; message: string }[];
}

/**
 * 构建插件：TS/JS → QuickJS-compatible JS → .jsplugin.zip
 */
export async function buildPlugin(opts: BuildOptions): Promise<BuildResult> {
  const cwd = resolve(opts.cwd);
  const outDir = opts.outDir ? resolve(cwd, opts.outDir) : join(cwd, 'dist');
  const buildDir = join(outDir, '_build');
  const mode = opts.mode ?? 'production';

  // [1] 读取并校验 plugin.json
  const manifest = readManifest(cwd);
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    throw new Error(`Invalid plugin.json:\n${errors.map(e => `  - ${e.field}: ${e.message}`).join('\n')}`);
  }

  // [2] esbuild 打包 src/main.ts → build/main.js
  mkdirSync(buildDir, { recursive: true });
  const entryPoint = join(cwd, 'src', 'main.ts');
  const entryPointAlt = join(cwd, 'src', 'main.js');
  const actualEntry = existsSync(entryPoint) ? entryPoint : entryPointAlt;

  if (!existsSync(actualEntry)) {
    throw new Error(`Entry file not found: src/main.ts or src/main.js`);
  }

  await esbuild.build({
    entryPoints: [actualEntry],
    outfile: join(buildDir, 'main.js'),
    bundle: true,
    platform: 'neutral',
    format: 'iife',
    target: 'es2020',
    minify: mode === 'production',
    sourcemap: opts.sourcemap ? 'inline' : false,
    // 禁止使用 Node 内置模块
    plugins: [{
      name: 'no-node-builtins',
      setup(build) {
        build.onResolve({ filter: /^(fs|net|http|https|child_process|os|path|crypto|stream|util|events|buffer|url|querystring|zlib)$/ }, (args) => {
          return { errors: [{ text: `Node builtin "${args.path}" is not available in QuickJS runtime` }] };
        });
      },
    }],
  });

  // [3] 拷贝 static/ 到 build/（如果存在）
  const staticDir = join(cwd, 'static');
  if (existsSync(staticDir)) {
    cpSync(staticDir, join(buildDir, 'static'), { recursive: true });
  }

  // [3.0] 拷贝 bin/ 到 build/（如果存在，用于打包可执行文件）
  const binDir = join(cwd, 'bin');
  if (existsSync(binDir)) {
    cpSync(binDir, join(buildDir, 'bin'), { recursive: true });
  }

  // [3.1] 合并打包前端 JS（如果 static/js/app.js 存在）
  const staticJsAppPath = join(buildDir, 'static', 'js', 'app.js');
  if (existsSync(staticJsAppPath)) {
    const bundleOutPath = join(buildDir, 'static', 'js', 'app.bundle.js');
    await esbuild.build({
      entryPoints: [staticJsAppPath],
      outfile: bundleOutPath,
      bundle: true,
      platform: 'browser',
      format: 'iife',
      target: 'es2020',
      minify: mode === 'production',
    });

    // 删除 static/js/ 下除 app.bundle.js 外的所有 .js 文件
    const staticJsDir = join(buildDir, 'static', 'js');
    const jsFiles = readdirSyncTop(staticJsDir).filter(f => f.endsWith('.js') && f !== 'app.bundle.js');
    for (const f of jsFiles) {
      unlinkSync(join(staticJsDir, f));
    }

    // 更新 index.html 中的 script 引用：将 app.js 替换为打包后的 app.bundle.js
    // 匹配时兼容属性顺序不同、多空格、以及 src 中有无 static/ 前缀
    const indexHtmlPath = join(buildDir, 'static', 'index.html');
    if (existsSync(indexHtmlPath)) {
      let html = readFileSync(indexHtmlPath, 'utf-8');
      const before = html;
      html = html.replace(
        /<script\b[^>]*\bsrc="(?:static\/)?js\/app\.js"[^>]*><\/script>/,
        '<script src="static/js/app.bundle.js"></script>'
      );
      if (html === before) {
        throw new Error(
          'Failed to update script tag in static/index.html: ' +
          'expected <script ... src="static/js/app.js" ...> or <script ... src="js/app.js" ...> but pattern not found'
        );
      }
      writeFileSync(indexHtmlPath, html);
    }

    console.log(`  📦 static/js/ bundled → app.bundle.js (${jsFiles.length} files merged)`);
  }

  // [3.1.1] 为 static/ 下所有 JS/CSS/字体/图片注入内容 hash 到文件名，
  //         并改写 HTML/CSS 中的引用，防止插件更新后浏览器使用旧缓存。
  //         可在 plugin.json 中设置 "staticHash": false 关闭（用于前端已用
  //         Vite/Webpack 等工具自管理 hash 的场景）。
  const staticBuildDir = join(buildDir, 'static');
  let staticRenameMap: Map<string, string> | undefined;
  if (existsSync(staticBuildDir) && manifest.staticHash !== false) {
    const { renamed, renameMap } = hashStaticAssets(staticBuildDir);
    if (renamed > 0) {
      staticRenameMap = renameMap;
      console.log(`  🏷️  static assets hashed (${renamed} files)`);
    }
  }

  // [3.2] 编译 main.js 为 main.jsc 字节码（如果 jsc 工具可用）
  let mainFileName = 'main.js';
  const mainJsPath = join(buildDir, 'main.js');
  const mainJscPath = join(buildDir, 'main.jsc');
  try {
    const jscCmd = findJscBinary();
    if (!jscCmd) {
      throw new Error('jsc binary not found');
    }
    execFileSync(jscCmd, [mainJsPath, mainJscPath], { stdio: 'pipe' });
    // 编译成功，删除 main.js
    unlinkSync(mainJsPath);
    mainFileName = 'main.jsc';
    console.log(`  🔒 main.js compiled → main.jsc (via ${jscCmd})`);
  } catch {
    // jsc 不可用或编译失败，保留 main.js
    console.log(`  ⚠️  jsc not available, keeping main.js`);
  }

  // [4] 计算 entryHash
  const mainJsContent = readFileSync(join(buildDir, mainFileName));
  const entryHash = computeEntryHash(mainJsContent);

  // [5] 计算 zipHash（排除 plugin.json）
  const zipHash = computeCanonicalZipHash(buildDir);

  // [6] 写入最终 plugin.json（含 hash）
  const finalManifest: PluginManifest = {
    ...manifest,
    main: mainFileName,
    entryHash,
    zipHash,
  };
  // icon 字段回写：用 hash 后的实际文件名替换原始文件名
  if (finalManifest.icon && staticRenameMap) {
    const hashedIcon = staticRenameMap.get(finalManifest.icon);
    if (hashedIcon) {
      finalManifest.icon = hashedIcon;
    }
  }
  writeFileSync(join(buildDir, 'plugin.json'), JSON.stringify(finalManifest, null, 2));

  // [7] 打包为 .jsplugin.zip
  mkdirSync(outDir, { recursive: true });
  const zip = new JSZip();
  addDirToZip(zip, buildDir, '');
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const zipPath = join(outDir, `${manifest.entryPath}.jsplugin.zip`);
  writeFileSync(zipPath, zipBuffer);

  // [8] 输出报告
  const mainJsGzip = Buffer.byteLength(mainJsContent);
  console.log(`\n✅ Build successful!`);
  console.log(`  📦 ${zipPath} (${(zipBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`  📄 main.js: ${(mainJsGzip / 1024).toFixed(1)} KB`);
  console.log(`  🔑 entryHash: ${entryHash}`);
  console.log(`  🔑 zipHash:   ${zipHash}\n`);

  return { zipPath, manifest: finalManifest, size: zipBuffer.length, entryHash, zipHash };
}

/**
 * 校验已构建的插件
 */
export async function validatePlugin(cwd: string): Promise<ValidationResult> {
  const resolvedCwd = resolve(cwd);
  const errors: { field: string; message: string }[] = [];

  // 读取 manifest
  let manifest: PluginManifest;
  try {
    manifest = readManifest(resolvedCwd);
  } catch {
    return { valid: false, errors: [{ field: 'plugin.json', message: 'cannot read plugin.json' }] };
  }

  // 字段校验
  const fieldErrors = validateManifest(manifest);
  errors.push(...fieldErrors);

  // hash 校验
  if (!manifest.entryHash || !manifest.zipHash) {
    errors.push({ field: 'hash', message: 'entryHash and zipHash are required. Run `songloft-plugin build` first.' });
  }

  return { valid: errors.length === 0, errors };
}

// --- 工具 ---

import { getJscBinaryPath } from '@songloft/jsc';
import { readdirSync, statSync } from 'node:fs';

/**
 * 查找 jsc 二进制文件
 * 优先级：
 *   1. @songloft/jsc workspace 包中对应当前平台的预编译二进制
 *   2. PATH 中的 jsc 命令
 *   3. 项目根目录的 jsc 兼容旧路径
 */
function findJscBinary(): string | null {
  // 获取当前文件所在目录（兼容 ESM 和 CJS）
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // 1. 通过 @songloft/jsc 包定位预编译二进制
  try {
    const jscPath = getJscBinaryPath();
    if (existsSync(jscPath)) return jscPath;
  } catch {
    // 包未安装，继续尝试下一个路径
  }

  // 2. 检查 PATH 中的 jsc
  try {
    execFileSync('jsc', ['--help'], { stdio: 'pipe' });
    return 'jsc';
  } catch {
    // 继续尝试下一个路径
  }

  // 3. 兼容旧路径：项目根目录的 jsc (songloft/jsc)
  // 从 src/ 或 dist/ → plugin-builder/ → packages/ → plugin-toolchain/ → songloft/
  const projectJsc = join(currentDir, '..', '..', '..', '..', 'jsc');
  if (existsSync(projectJsc)) return projectJsc;

  return null;
}

function addDirToZip(zip: JSZip, dirPath: string, prefix: string) {
  const items = readdirSync(dirPath);
  for (const item of items) {
    const fullPath = join(dirPath, item);
    const zipPath = prefix ? `${prefix}/${item}` : item;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      addDirToZip(zip, fullPath, zipPath);
    } else {
      zip.file(zipPath, readFileSync(fullPath));
    }
  }
}
