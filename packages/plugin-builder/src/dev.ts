// @mimusic/plugin-builder — dev 命令：watch 源码 + 自动构建上传到本地 MiMusic 实例

import { existsSync, readFileSync, writeFileSync, watch } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { buildPlugin } from './build.js';
import type { PluginManifest } from '@mimusic/plugin-sdk';

const CONFIG_FILE = '.mimusic-dev.json';
const DEFAULT_HOST = 'http://localhost:58091';
const WATCH_DIRS = ['src', 'static'];
const WATCH_FILES = ['plugin.json'];
const DEBOUNCE_MS = 250;

export interface DevOptions {
  cwd: string;
  host?: string;
  username?: string;
  password?: string;
  token?: string;
  once?: boolean;
  enable?: boolean;
}

interface DevConfig {
  host?: string;
  username?: string;
  password?: string;
  pluginId?: number;
  entryPath?: string;
}

interface JSPluginInfo {
  id: number;
  entry_path: string;
  status: string;
}

interface UploadResult {
  file_name?: string;
  plugin?: JSPluginInfo;
  error?: string;
  success: boolean;
}

interface UploadResponse {
  total: number;
  success: number;
  failed: number;
  results: UploadResult[];
  message: string;
}

class AuthError extends Error {}

export async function runDev(opts: DevOptions): Promise<void> {
  const cwd = resolve(opts.cwd);
  const host = normalizeHost(opts.host ?? loadConfig(cwd).host ?? DEFAULT_HOST);

  const state = {
    config: loadConfig(cwd),
    token: '',
  };
  await ensureAuth(cwd, host, opts, state);

  let running = false;
  let pending = false;
  const runOnce = async (label: string): Promise<void> => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await doBuildUpload(cwd, host, opts, state, label);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        void runOnce('reload');
      }
    }
  };

  await runOnce('initial');

  if (opts.once) {
    console.log('\n✅ done (--once)');
    return;
  }

  console.log('\n👀 watching for changes... (Ctrl+C to exit)');
  startWatcher(cwd, () => {
    void runOnce('reload');
  });

  await new Promise<void>(() => {
    /* keep alive */
  });
}

async function doBuildUpload(
  cwd: string,
  host: string,
  opts: DevOptions,
  state: { config: DevConfig; token: string },
  label: string,
): Promise<void> {
  console.log(`\n🔧 [${label}] building...`);
  let result;
  try {
    result = await buildPlugin({ cwd, mode: 'development', sourcemap: true });
  } catch (err) {
    console.error(`❌ build failed: ${(err as Error).message}`);
    return;
  }

  try {
    const { plugin, isNew } = await uploadWithAuthRetry(cwd, host, opts, state, result.zipPath, result.manifest);
    state.config.pluginId = plugin.id;
    state.config.entryPath = plugin.entry_path;
    saveConfig(cwd, state.config);

    if (isNew) {
      console.log(`  📤 installed (id=${plugin.id})`);
      if (opts.enable !== false) {
        try {
          await enablePlugin(host, state.token, plugin.id);
          console.log('  ✅ plugin enabled');
        } catch (err) {
          console.warn(`  ⚠️  enable failed: ${(err as Error).message}`);
        }
      }
    } else {
      console.log(`  📤 updated (id=${plugin.id}), ${plugin.status === 'active' ? '♻️  hot-reloaded' : '⏸  inactive'}`);
    }

    console.log(`  🌐 ${host}/api/v1/jsplugin/${result.manifest.entryPath}/`);
  } catch (err) {
    console.error(`❌ upload failed: ${(err as Error).message}`);
  }
}

async function uploadWithAuthRetry(
  cwd: string,
  host: string,
  opts: DevOptions,
  state: { config: DevConfig; token: string },
  zipPath: string,
  manifest: PluginManifest,
): Promise<{ plugin: JSPluginInfo; isNew: boolean }> {
  try {
    return await uploadZip(host, state.token, zipPath, manifest.entryPath);
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    console.warn('  🔐 token expired, re-authenticating...');
    await doLogin(cwd, host, opts, state);
    return await uploadZip(host, state.token, zipPath, manifest.entryPath);
  }
}

// ============ session / auth ============
//
// 仅持久化账号密码到 .mimusic-dev.json；每次启动用它登录拿一个新 token，
// 不再缓存 token。这样用户无需关心 token 过期 / 刷新。

async function ensureAuth(
  cwd: string,
  host: string,
  opts: DevOptions,
  state: { config: DevConfig; token: string },
): Promise<void> {
  if (opts.token) {
    state.token = opts.token;
    return;
  }
  await doLogin(cwd, host, opts, state);
}

async function doLogin(
  cwd: string,
  host: string,
  opts: DevOptions,
  state: { config: DevConfig; token: string },
): Promise<void> {
  // 收集凭据，优先级：CLI > 配置文件 > 交互输入
  const username = opts.username ?? state.config.username ?? (await prompt('Username: '));
  const password =
    opts.password ?? state.config.password ?? (await prompt(`Password for ${username}: `, true));

  let accessToken: string;
  try {
    ({ accessToken } = await login(host, username, password));
  } catch (err) {
    // 缓存的密码可能已失效，清掉后让下次启动重新询问
    if (err instanceof AuthError && state.config.password) {
      state.config = { ...state.config, password: undefined };
      saveConfig(cwd, state.config);
      throw new Error(
        'cached password rejected by server; cleared .mimusic-dev.json, please re-run',
      );
    }
    throw err;
  }
  state.token = accessToken;

  // 凭据有变更（首次输入 / 修改密码）时落地
  const changed =
    state.config.host !== host ||
    state.config.username !== username ||
    state.config.password !== password;
  if (changed) {
    state.config = { ...state.config, host, username, password };
    saveConfig(cwd, state.config);
    console.log(`  💾 credentials saved to .mimusic-dev.json`);
  }
  console.log(`  🔑 logged in as ${username}`);
}

async function login(
  host: string,
  username: string,
  password: string,
): Promise<{ accessToken: string }> {
  const resp = await fetch(`${host}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (resp.status === 401) {
    throw new AuthError(`login rejected: ${await safeText(resp)}`);
  }
  if (!resp.ok) {
    throw new Error(`login failed: ${resp.status} ${await safeText(resp)}`);
  }
  const data = (await resp.json()) as { access_token: string };
  return { accessToken: data.access_token };
}

// ============ upload ============

// POST /api/v1/jsplugins/upload —— 后端在该路由上自动判断新装 vs 覆盖更新：
//   - 新装：HTTP 201（isNew=true，需要后续 enable）
//   - 覆盖更新：HTTP 200（isNew=false，原 active 状态会自动热重载）
// 失败时后端也返回 HTTP 200，但 results[0].success=false / error=…。
async function uploadZip(
  host: string,
  token: string,
  zipPath: string,
  entryPath: string,
): Promise<{ plugin: JSPluginInfo; isNew: boolean }> {
  const form = makeForm(zipPath, entryPath);
  const resp = await fetch(`${host}/api/v1/jsplugins/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (resp.status === 401) throw new AuthError('unauthorized');
  if (resp.status !== 200 && resp.status !== 201) {
    throw new Error(`upload failed: HTTP ${resp.status} ${await safeText(resp)}`);
  }
  const data = (await resp.json()) as UploadResponse;
  const first = data.results?.[0];
  if (!first || !first.success || !first.plugin) {
    const why = first?.error ?? data.message ?? 'unknown error';
    throw new Error(`upload failed: ${why}`);
  }
  return { plugin: first.plugin, isNew: resp.status === 201 };
}

async function enablePlugin(host: string, token: string, pluginId: number): Promise<void> {
  const resp = await fetch(`${host}/api/v1/jsplugins/${pluginId}/enable`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 401) throw new AuthError('unauthorized');
  if (!resp.ok) throw new Error(`enable failed: ${resp.status} ${await safeText(resp)}`);
}

function makeForm(zipPath: string, entryPath: string): FormData {
  const bytes = readFileSync(zipPath);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const blob = new Blob([arrayBuffer], { type: 'application/zip' });
  const form = new FormData();
  form.append('file', blob, `${entryPath}.jsplugin.zip`);
  return form;
}

async function safeText(resp: Response): Promise<string> {
  try {
    return (await resp.text()).slice(0, 200);
  } catch {
    return '';
  }
}

// ============ watcher ============

function startWatcher(cwd: string, onChange: () => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, DEBOUNCE_MS);
  };

  for (const dir of WATCH_DIRS) {
    const path = join(cwd, dir);
    if (!existsSync(path)) continue;
    try {
      watch(path, { recursive: true }, (_event, filename) => {
        if (filename && shouldIgnore(filename.toString())) return;
        debounced();
      });
    } catch (err) {
      console.warn(`  ⚠️  watch ${dir} failed: ${(err as Error).message}`);
    }
  }
  for (const file of WATCH_FILES) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;
    try {
      watch(path, () => debounced());
    } catch {
      // 忽略
    }
  }
}

function shouldIgnore(filename: string): boolean {
  return (
    filename.includes('node_modules') ||
    filename.startsWith('dist/') ||
    filename.includes('/dist/') ||
    filename.endsWith('.swp') ||
    filename.endsWith('~')
  );
}

// ============ config + gitignore ============

function loadConfig(cwd: string): DevConfig {
  const path = join(cwd, CONFIG_FILE);
  if (!existsSync(path)) return {};
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
  // 显式 pick 当前支持的字段，丢弃旧版残留（如 accessToken / refreshToken）。
  // 下次 saveConfig 时会以新结构覆写整个文件。
  const cfg: DevConfig = {};
  if (typeof raw.host === 'string') cfg.host = raw.host;
  if (typeof raw.username === 'string') cfg.username = raw.username;
  if (typeof raw.password === 'string') cfg.password = raw.password;
  if (typeof raw.pluginId === 'number') cfg.pluginId = raw.pluginId;
  if (typeof raw.entryPath === 'string') cfg.entryPath = raw.entryPath;
  return cfg;
}

function saveConfig(cwd: string, cfg: DevConfig): void {
  const path = join(cwd, CONFIG_FILE);
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
  ensureGitignore(cwd);
}

function ensureGitignore(cwd: string): void {
  const path = join(cwd, '.gitignore');
  if (!existsSync(path)) {
    writeFileSync(path, `${CONFIG_FILE}\n`);
    return;
  }
  const content = readFileSync(path, 'utf-8');
  if (content.split('\n').some((l) => l.trim() === CONFIG_FILE)) return;
  writeFileSync(path, content.replace(/\n*$/, '') + `\n${CONFIG_FILE}\n`);
}

// ============ helpers ============

function normalizeHost(host: string): string {
  let h = host.trim();
  if (!/^https?:\/\//.test(h)) h = `http://${h}`;
  return h.replace(/\/+$/, '');
}

function prompt(question: string, silent = false): Promise<string> {
  return new Promise((resolveAnswer) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (silent) {
      const out = (rl as unknown as { output: NodeJS.WriteStream }).output;
      const realWrite = out.write.bind(out);
      let promptShown = false;
      out.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
        if (!promptShown && typeof chunk === 'string' && chunk === question) {
          promptShown = true;
          return realWrite(chunk, ...(rest as []));
        }
        // 屏蔽用户输入的回显
        return true as unknown as boolean;
      }) as typeof out.write;
      rl.question(question, (answer) => {
        out.write = realWrite;
        process.stdout.write('\n');
        rl.close();
        resolveAnswer(answer);
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolveAnswer(answer.trim());
      });
    }
  });
}
