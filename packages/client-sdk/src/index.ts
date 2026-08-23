// @songloft/client-sdk — 客户端 SDK
//
// 让「在 Songloft Flutter 客户端 webview 中打开的插件页面」调用宿主客户端能力
// （改写正在播放队列、控制播放、订阅播放状态等）。
//
// 架构：运行时能力由宿主注入到 `window.SongloftPlugin`（common.js + Flutter 宿主）。
// 传输由 common.js 按宿主环境自动选择，插件无需关心：
//   - native 客户端 + WebF 渲染引擎 → webf.methodChannel
//   - native 客户端 + 系统 WebView  → flutter_inappwebview.callHandler
//   - Web 端插件页（Tab 内嵌页与首页/全屏页均在宿主 iframe 内）→ postMessage
// 本包是**类型层 + 便捷封装**，所有调用都委托给注入的全局对象，因此：
//   - native 客户端 webview 插件页、Web 端 iframe 内嵌插件页内有效；
//   - 仅当用户通过「在浏览器中打开」将插件页在独立新标签打开（无宿主父窗口）、
//     或宿主版本过旧时，`isClient()` / `host.isAvailable()` 返回 false，调用会抛出明确错误，请先 feature-detect。
//
// 用法：
//   import { player, host, isClient } from '@songloft/client-sdk';
//   if (isClient()) {
//     await player.setQueue([101, 102], { startIndex: 0 });
//     player.onStateChange((s) => console.log(s.current_index));
//   }
//
// 免构建的 vanilla 插件可直接用注入的全局对象：
//   window.SongloftPlugin.player.setQueue([101, 102]);

// ===== 数据模型 =====

/** 播放模式（与宿主一致）。 */
export type PlayMode = 'order' | 'loop' | 'single' | 'random' | 'singlePlay';

/**
 * 队列中的歌曲对象（宿主返回值，字段为 snake_case，与后端 JSON 一致）。
 * 只列出常用字段；宿主可能返回更多字段。
 */
export interface ClientSong {
  id: number;
  type: 'local' | 'remote' | 'radio';
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  url?: string;
  cover_url?: string;
  lyric_url?: string;
  is_live?: boolean;
  [key: string]: unknown;
}

/** 播放器状态快照（`player.getState()` / `onStateChange` 回调）。 */
export interface ClientPlayerState {
  /** 正在播放队列 */
  queue: ClientSong[];
  /** 当前歌曲在队列中的下标；无歌曲时为 -1 */
  current_index: number;
  /** 当前歌曲；无歌曲时为 null */
  current_song: ClientSong | null;
  is_playing: boolean;
  /** 当前播放进度（秒） */
  current_time: number;
  /** 当前歌曲总时长（秒） */
  duration: number;
  /** 音量 0-100 */
  volume: number;
  play_mode: PlayMode;
  /** 队列来源的服务端歌单 id（如有） */
  source_playlist_id?: number | null;
}

/** 宿主信息与能力协商结果（`host.getInfo()`）。 */
export interface HostInfo {
  /** 客户端应用版本，如 "2.12.0" */
  version: string;
  /** 运行平台：android / ios / macos / windows / linux / web */
  platform: string;
  /** 宿主支持的能力命名空间，如 ["player"]，用于向前兼容的能力协商 */
  capabilities: string[];
}

/** `setQueue` 的可选参数。 */
export interface SetQueueOptions {
  /** 从队列的哪一首开始播放，默认 0 */
  startIndex?: number;
  /** 标记队列来源的服务端歌单 id（可选，仅用于 UI 展示归属） */
  sourcePlaylistId?: number;
}

// ===== 注入的全局对象类型（window.SongloftPlugin） =====

/** 宿主客户端能力：播放器命名空间。 */
export interface SongloftPluginPlayer {
  /** 获取当前播放器状态快照 */
  getState(): Promise<ClientPlayerState>;
  /** 用歌曲 id 列表替换整个正在播放队列并开始播放 */
  setQueue(ids: number[], options?: SetQueueOptions): Promise<void>;
  /** 追加歌曲到队列末尾（去重，不改变当前播放） */
  addToQueue(ids: number[]): Promise<void>;
  /** 在队列指定位置插入一首歌（不触发播放） */
  insertToQueue(index: number, id: number): Promise<void>;
  /** 移除队列中指定下标的歌曲 */
  removeFromQueue(index: number): Promise<void>;
  /** 重排队列 */
  reorderQueue(oldIndex: number, newIndex: number): Promise<void>;
  /** 清空队列 */
  clearQueue(): Promise<void>;
  /** 播放：传 id 则播放该歌曲（不在队列则追加），不传则恢复播放 */
  play(id?: number): Promise<void>;
  /** 暂停 */
  pause(): Promise<void>;
  /** 播放/暂停切换 */
  togglePlay(): Promise<void>;
  /** 下一首 */
  next(): Promise<void>;
  /** 上一首 */
  prev(): Promise<void>;
  /** 跳转到指定进度（秒） */
  seek(seconds: number): Promise<void>;
  /** 设置音量 0-100 */
  setVolume(volume: number): Promise<void>;
  /** 设置播放模式 */
  setPlayMode(mode: PlayMode): Promise<void>;
  /** 直接播放服务端歌单（按歌单 id） */
  playPlaylistById(playlistId: number): Promise<void>;
  /**
   * 订阅播放状态变更。返回取消订阅函数。
   * 注意：状态推送经过节流，`current_time` 可能不是每秒更新。
   */
  onStateChange(handler: (state: ClientPlayerState) => void): () => void;
}

/** 宿主客户端能力：host 命名空间。 */
export interface SongloftPluginHost {
  /** 同步 feature-detect：当前是否运行在支持原生桥接的 Songloft 客户端 webview 内 */
  isAvailable(): boolean;
  /** 获取宿主信息与能力列表 */
  getInfo(): Promise<HostInfo>;
}

/** 宿主客户端能力：favorite 命名空间。 */
export interface SongloftPluginFavorite {
  /**
   * 通知宿主刷新收藏状态缓存。
   *
   * 插件自己改完收藏（如直接 POST `/playlists/1/songs`）后必须调一次：服务端
   * 数据是对的，但 Flutter 侧曲库的红心读的是 `FavoriteNotifier` 的内存缓存，
   * 不会自动跟着变。
   *
   * **能带参就带参**——带参是增量更新，宿主只改这一首的归属；不带参是全量重载，
   * 曲库上千首时是一次完整的往返。
   *
   * @param songId 歌曲 ID；省略则全量重载
   * @param isFavorited 操作后的收藏态；省略则全量重载
   */
  refresh(songId?: number, isFavorited?: boolean): Promise<void>;
}

/**
 * 注入到页面的 `window.SongloftPlugin` 全局对象。
 * 由主程序 common.js 注入到所有插件 HTML 页面。此处仅声明本 SDK 依赖的成员，
 * 现有的 apiGet/apiPost/getTheme 等成员见插件开发指南。
 *
 * ⚠️ **这份声明必须与 `common.js` 末尾那个对象字面量保持一致**，它才是公开成员的
 * 唯一真实来源。别在插件里另手写一份宿主 API 声明：曾经有插件自己声明了
 * `invokeHost?`（当时它只存在于内部句柄 `window.__SongloftInternal`），于是
 * `SongloftPlugin?.invokeHost?.(...)` 通过 TS 编译、运行时被可选调用静默吞掉，
 * 整个功能一个字节都没发出去（songloft-org/songloft-plugin-miot#86）。
 */
export interface SongloftPluginGlobal {
  host?: SongloftPluginHost;
  player?: SongloftPluginPlayer;
  favorite?: SongloftPluginFavorite;
  /**
   * 通用宿主调用出口。`host` / `player` / `favorite` / `getCookies` 都是它的
   * typed wrapper；公开它是为了让插件能触达尚未被 wrapper 覆盖的 namespace
   * （宿主分发表在客户端侧，可能比服务端那份 common.js 更新）。
   *
   * ⚠️ 没有 wrapper 那层类型约束，`ns` / `method` 拼错只会在运行时 reject。
   * 有对应 wrapper 时优先用 wrapper。
   */
  invokeHost?(ns: string, method: string, params?: Record<string, unknown>): Promise<unknown>;
  /**
   * 读取宿主 WebView Cookie Store 中指定 origin 的 Cookie。
   * 原生层读取，不受浏览器同源策略 / HttpOnly 限制。
   *
   * 仅原生客户端（Android/iOS/macOS/Windows/Linux）可用，Web 端调用会 reject。
   *
   * @param origin 目标站点 origin，例如 "https://example.com"（含协议 + 主机 + 端口）
   * @returns name → value 映射；该 origin 无 Cookie 时返回空对象 {}
   */
  getCookies?(origin: string): Promise<Record<string, string>>;
  // 现有成员（主题 / API 工具）——保留为可选，避免与旧宿主冲突。
  getTheme?(): 'light' | 'dark';
  onThemeChange?(cb: (theme: 'light' | 'dark') => void): void;
  apiGet?(path: string): Promise<unknown>;
  apiPost?(path: string, body: unknown): Promise<unknown>;
  apiPut?(path: string, body: unknown): Promise<unknown>;
  apiDelete?(path: string): Promise<unknown>;
  [key: string]: unknown;
}

declare global {
  interface Window {
    SongloftPlugin?: SongloftPluginGlobal;
  }
}

// ===== 便捷封装（委托注入的全局对象） =====

const NOT_AVAILABLE_MSG =
  '[@songloft/client-sdk] 宿主客户端桥接不可用：请确保插件页在 Songloft 客户端（非 Web）的 webview 中打开，且客户端版本支持客户端 SDK。可用 isClient() 预先检测。';

function getGlobal(): SongloftPluginGlobal | undefined {
  return typeof window !== 'undefined' ? window.SongloftPlugin : undefined;
}

/**
 * 是否运行在支持原生桥接的 Songloft 客户端 webview 内。
 * 调用任何 player/host 方法前建议先检测。
 */
export function isClient(): boolean {
  const g = getGlobal();
  return !!(g && g.host && typeof g.host.isAvailable === 'function' && g.host.isAvailable());
}

function requirePlayer(): SongloftPluginPlayer {
  const g = getGlobal();
  if (!g || !g.player) throw new Error(NOT_AVAILABLE_MSG);
  return g.player;
}

function requireHost(): SongloftPluginHost {
  const g = getGlobal();
  if (!g || !g.host) throw new Error(NOT_AVAILABLE_MSG);
  return g.host;
}

/** 播放器控制。所有方法委托注入的 `window.SongloftPlugin.player`。 */
export const player: SongloftPluginPlayer = {
  getState: () => requirePlayer().getState(),
  setQueue: (ids, options) => requirePlayer().setQueue(ids, options),
  addToQueue: (ids) => requirePlayer().addToQueue(ids),
  insertToQueue: (index, id) => requirePlayer().insertToQueue(index, id),
  removeFromQueue: (index) => requirePlayer().removeFromQueue(index),
  reorderQueue: (oldIndex, newIndex) => requirePlayer().reorderQueue(oldIndex, newIndex),
  clearQueue: () => requirePlayer().clearQueue(),
  play: (id) => requirePlayer().play(id),
  pause: () => requirePlayer().pause(),
  togglePlay: () => requirePlayer().togglePlay(),
  next: () => requirePlayer().next(),
  prev: () => requirePlayer().prev(),
  seek: (seconds) => requirePlayer().seek(seconds),
  setVolume: (volume) => requirePlayer().setVolume(volume),
  setPlayMode: (mode) => requirePlayer().setPlayMode(mode),
  playPlaylistById: (playlistId) => requirePlayer().playPlaylistById(playlistId),
  onStateChange: (handler) => requirePlayer().onStateChange(handler),
};

/** 宿主信息与能力协商。委托注入的 `window.SongloftPlugin.host`。 */
export const host: SongloftPluginHost = {
  isAvailable: () => isClient(),
  getInfo: () => requireHost().getInfo(),
};

function requireFavorite(): SongloftPluginFavorite {
  const g = getGlobal();
  if (!g || !g.favorite) throw new Error(NOT_AVAILABLE_MSG);
  return g.favorite;
}

/** 收藏状态同步。委托注入的 `window.SongloftPlugin.favorite`。 */
export const favorite: SongloftPluginFavorite = {
  refresh: (songId, isFavorited) => requireFavorite().refresh(songId, isFavorited),
};

/**
 * 读取宿主 WebView Cookie Store 中指定 origin 的 Cookie。
 * 仅原生客户端可用，Web 端调用会 reject。
 *
 * @param origin 目标站点 origin，例如 "https://example.com"
 * @returns name → value 映射
 */
export function getCookies(origin: string): Promise<Record<string, string>> {
  const g = getGlobal();
  if (!g || typeof g.getCookies !== 'function') {
    return Promise.reject(new Error('getCookies is not available on this platform (requires native client)'));
  }
  return g.getCookies(origin);
}

/**
 * 通用宿主调用。上面的 `player` / `host` / `favorite` / `getCookies` 都是它的
 * typed wrapper —— **有 wrapper 时优先用 wrapper**，这里没有那层类型约束，
 * `ns` / `method` 拼错只会在运行时 reject。
 *
 * 留这个出口是因为宿主分发表在客户端侧，可能比服务端那份 `common.js` 更新，
 * 插件需要能触达尚未被 wrapper 覆盖的 namespace。
 *
 * @param ns 命名空间，如 "favorite"
 * @param method 方法名，如 "refresh"
 * @param params 参数对象，可省略
 */
export function invokeHost(
  ns: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const g = getGlobal();
  if (!g || typeof g.invokeHost !== 'function') {
    return Promise.reject(new Error(NOT_AVAILABLE_MSG));
  }
  return g.invokeHost(ns, method, params);
}
