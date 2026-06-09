// @songloft/plugin-builder — 前端静态资源 hash 处理
//
// 为 static/ 目录下的 JS/CSS/字体/图片等资源注入内容 hash 到文件名，
// 并改写 HTML 中的 <script src> / <link href> 与 CSS 中的 url() 引用，
// 防止插件版本更新后浏览器仍命中旧缓存。
//
// 处理顺序（按依赖反向）：
//   1. 叶子资源（字体/图片/媒体）先 hash
//   2. CSS 改写内部 url(...) 后再 hash
//   3. JS 单独 hash（不扫描内部内容）
//   4. HTML 改写 <script src> / <link href> 等引用

import { readFileSync, writeFileSync, renameSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, posix, relative } from 'node:path';
import { sha256Hex } from './hash.js';

const ASSET_EXT = /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico|mp3|mp4|wav|ogg)$/i;
const CSS_EXT = /\.css$/i;
const JS_EXT = /\.m?js$/i;
const HTML_EXT = /\.html?$/i;

const HASH_LEN = 8;

/**
 * 文件名"看起来已经 hash 过"的检测。
 * 匹配 `name.<8+位 url-safe base64/hex>.ext` 或 `name-<同上>.ext`，
 * 用于跳过已由 Vite/Webpack/Rollup 等工具自管理 hash 的产物。
 *
 * 注意：要保留至少一段"语义名"，避免把 `roboto-400.woff2`（400 仅 3 位）
 * 或纯 hash 文件名误判。
 */
const HASHED_NAME_RE = /^(.+)[.-]([A-Za-z0-9_-]{8,})\.[^.]+$/;
function looksAlreadyHashed(filename: string): boolean {
  const m = HASHED_NAME_RE.exec(filename);
  if (!m) return false;
  const seg = m[2];
  // 必须同时含字母和数字，避免把 `style-12345678.css` 这种数字版本号误判
  return /[A-Za-z]/.test(seg) && /\d/.test(seg);
}

/**
 * 入口：hash static 目录下的资源并改写引用。
 * staticBuildDir 必须存在；不存在时由调用方判断后再传入。
 */
export function hashStaticAssets(staticBuildDir: string): { renamed: number; renameMap: Map<string, string> } {
  const all = walk(staticBuildDir);
  const rel = (p: string) => toPosix(relative(staticBuildDir, p));

  const assets = all.filter(p => ASSET_EXT.test(p));
  const cssList = all.filter(p => CSS_EXT.test(p));
  const jsList = all.filter(p => JS_EXT.test(p));
  const htmlList = all.filter(p => HTML_EXT.test(p));

  // 先扫描所有 CSS/HTML/JS，把"被绝对路径（含 /static/）引用"的资源加入
  // pinned 集合——这些文件不能改名，否则会破坏运行时引用。
  const pinned = collectPinnedAssets([...htmlList, ...cssList, ...jsList], rel, staticBuildDir);
  const notPinned = (p: string) => !pinned.has(rel(p));

  // 原相对路径 → 新相对路径（含 hash），均为 posix 风格
  const renameMap = new Map<string, string>();

  // 1. 叶子资源
  for (const file of assets.filter(notPinned)) {
    const newRel = renameWithHash(staticBuildDir, rel(file));
    renameMap.set(rel(file), newRel);
  }

  // 2. CSS：先改写 url()，再 hash
  for (const file of cssList) {
    const relPath = rel(file);
    const content = readFileSync(file, 'utf-8');
    const rewritten = rewriteCssUrls(content, relPath, renameMap);
    if (rewritten !== content) writeFileSync(file, rewritten);
    if (pinned.has(relPath)) continue;
    const newRel = renameWithHash(staticBuildDir, relPath);
    renameMap.set(relPath, newRel);
  }

  // 3. JS
  for (const file of jsList.filter(notPinned)) {
    const newRel = renameWithHash(staticBuildDir, rel(file));
    renameMap.set(rel(file), newRel);
  }

  // 4. HTML：改写引用
  for (const file of htmlList) {
    const relPath = rel(file);
    const html = readFileSync(file, 'utf-8');
    const rewritten = rewriteHtmlRefs(html, relPath, renameMap);
    if (rewritten !== html) writeFileSync(file, rewritten);
  }

  return { renamed: renameMap.size, renameMap };
}

// --- 内部工具 ---

/**
 * 扫描指定文件（CSS/HTML/JS），找出"被含 /static/ 的绝对路径引用"的资源，
 * 比如 CSS 里 url('/api/v1/plugin/lxmusic/static/fonts/roboto.woff2')。
 * 这些资源不能改名，否则运行时绝对路径会 404。
 *
 * 返回的 set 包含相对 staticDir 的 posix 路径。
 */
function collectPinnedAssets(
  files: string[],
  rel: (p: string) => string,
  staticDir: string,
): Set<string> {
  const pinned = new Set<string>();
  // 匹配引号内或 url(...) 内出现的、含 /static/<rest> 的串
  const re = /\/(?:[^\s"')]*\/)?static\/([A-Za-z0-9_\-./]+?)(?=["')?#\s]|$)/g;
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const m of content.matchAll(re)) {
      const candidate = m[1].replace(/\/+$/, '');
      if (!candidate) continue;
      // 仅当该路径在 static 下真实存在
      const abs = join(staticDir, candidate);
      try {
        if (statSync(abs).isFile()) pinned.add(candidate);
      } catch {
        // 不存在，忽略
      }
    }
  }
  return pinned;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const item of readdirSync(dir)) {
    const full = join(dir, item);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function toPosix(p: string): string {
  return p.split(/[\\/]/).join('/');
}

/**
 * 重命名文件：name.ext → name.<hash>.ext。返回新相对路径（posix）。
 * 若文件名已经包含可识别的 hash（来自 Vite/Webpack 等），则原路径直接返回，不动文件。
 */
function renameWithHash(rootDir: string, relPath: string): string {
  const base = basename(relPath);
  if (looksAlreadyHashed(base)) return relPath;
  const abs = join(rootDir, relPath);
  const hash = sha256Hex(readFileSync(abs)).slice(0, HASH_LEN);
  const dir = dirname(relPath);
  const dot = base.lastIndexOf('.');
  const newBase = dot <= 0
    ? `${base}.${hash}`
    : `${base.slice(0, dot)}.${hash}${base.slice(dot)}`;
  const newRel = dir === '.' || dir === '' ? newBase : posix.join(toPosix(dir), newBase);
  renameSync(abs, join(rootDir, newRel));
  return newRel;
}

interface ResolvedRef {
  /** 相对 static 根的路径，用作 renameMap key */
  staticRel: string;
  /** ?query#hash 后缀 */
  suffix: string;
  /** 原 url 是否带 "static/" 前缀（HTML 中常见） */
  hadStaticPrefix: boolean;
  /** 原 url 是否以 ./ 或 ../ 开头 */
  isExplicitRelative: boolean;
}

/**
 * 把出现在 fromFile（相对 static 根的路径）中的 url 解析为
 * 相对 static 根的资源路径，便于在 renameMap 中查找。
 *
 * 支持：
 *   - "static/css/style.css"   ——  HTML 中从插件根访问
 *   - "css/style.css"          ——  从当前文件同目录访问
 *   - "./x.png" / "../foo"
 *
 * 不处理：绝对路径（/...）、协议（http://、data:、blob: 等）、
 * 锚点（#xxx）、空 url。
 */
function resolveRef(url: string, fromFile: string): ResolvedRef | null {
  if (!url) return null;
  if (/^(?:[a-z]+:|\/\/|#|data:|blob:|mailto:)/i.test(url)) return null;
  if (url.startsWith('/')) return null;

  let bare = url;
  let suffix = '';
  const qIdx = bare.search(/[?#]/);
  if (qIdx >= 0) {
    suffix = bare.slice(qIdx);
    bare = bare.slice(0, qIdx);
  }

  const hadStaticPrefix = bare.startsWith('static/');
  const isExplicitRelative = bare.startsWith('./') || bare.startsWith('../');

  let staticRel: string;
  if (hadStaticPrefix) {
    staticRel = bare.slice('static/'.length);
  } else {
    const fromDir = toPosix(dirname(fromFile));
    staticRel = fromDir === '.' || fromDir === ''
      ? bare.replace(/^\.\//, '')
      : posix.normalize(posix.join(fromDir, bare));
  }
  if (staticRel.startsWith('..')) return null;
  return { staticRel, suffix, hadStaticPrefix, isExplicitRelative };
}

/**
 * 根据 renameMap 重新组装引用字符串。renameMap 未命中时返回 null。
 */
function applyRename(
  ref: ResolvedRef,
  renameMap: Map<string, string>,
  fromFile: string,
): string | null {
  const renamed = renameMap.get(ref.staticRel);
  if (!renamed) return null;

  let out: string;
  if (ref.hadStaticPrefix) {
    out = `static/${renamed}`;
  } else {
    const fromDir = toPosix(dirname(fromFile));
    if (fromDir === '.' || fromDir === '') {
      out = renamed;
    } else {
      out = toPosix(relative(fromDir, renamed));
    }
    if (ref.isExplicitRelative && !out.startsWith('.')) out = `./${out}`;
  }
  return out + ref.suffix;
}

function tryRewrite(url: string, fromFile: string, renameMap: Map<string, string>): string | null {
  const ref = resolveRef(url, fromFile);
  if (!ref) return null;
  return applyRename(ref, renameMap, fromFile);
}

/** 改写 HTML 中的 src=/href= 引用 */
function rewriteHtmlRefs(html: string, fromFile: string, renameMap: Map<string, string>): string {
  return html.replace(/\b(src|href)\s*=\s*(["'])([^"']+)\2/gi, (full, attr, quote, url) => {
    const replaced = tryRewrite(url, fromFile, renameMap);
    return replaced == null ? full : `${attr}=${quote}${replaced}${quote}`;
  });
}

/** 改写 CSS 中的 url(...) 与 @import "..." */
function rewriteCssUrls(css: string, fromFile: string, renameMap: Map<string, string>): string {
  css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, url) => {
    const replaced = tryRewrite(url, fromFile, renameMap);
    return replaced == null ? full : `url(${quote}${replaced}${quote})`;
  });
  css = css.replace(/@import\s+(['"])([^'"]+)\1/gi, (full, quote, url) => {
    const replaced = tryRewrite(url, fromFile, renameMap);
    return replaced == null ? full : `@import ${quote}${replaced}${quote}`;
  });
  return css;
}
