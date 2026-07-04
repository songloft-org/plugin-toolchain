// @songloft/plugin-sdk — 全局类型声明
// 该文件由 SDK 包安装后自动生效，为 QuickJS 运行时注入的全局对象提供类型。

// ===== 数据模型 =====

/** 歌曲对象 */
export interface Song {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  filePath?: string;
  url?: string;
  coverPath?: string;
  type: 'local' | 'remote' | 'radio';
  fingerprint?: string;
  fingerprint_duration?: number;
}

/** 歌单对象 */
export interface Playlist {
  id: number;
  name: string;
  type: 'normal' | 'radio';
  coverPath?: string;
  coverUrl?: string;
  songCount: number;
}

/** 插件清单（plugin.json） */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  license?: string;
  entryPath: string;
  main: string;
  minHostVersion?: string;
  permissions: string[];
  /**
   * 无需 JWT 认证的路径前缀列表。
   * 声明后，匹配的请求路径将绕过全局 AuthMiddleware 直接转发给插件处理。
   * 插件需自行实现认证逻辑（如 Subsonic 的 u/t/s 参数验证）。
   * 示例：`["/rest"]` 使 `/api/v1/jsplugin/{entryPath}/rest/*` 无需 JWT。
   */
  publicPaths?: string[];
  /** 插件图标文件名，相对于 static/ 目录（如 "icon.svg"）。构建时自动回写为带 hash 的文件名。 */
  icon?: string;
  updateUrl?: string;
  download_url?: string;
  entryHash: string;
  zipHash: string;
  /**
   * 是否对 static/ 下的 JS/CSS/字体/图片注入内容 hash 到文件名，
   * 并改写 HTML/CSS 中的引用（防止旧缓存）。默认 true。
   * 设为 false 适用于前端已用 Vite/Webpack 等工具自管理 hash 的场景。
   */
  staticHash?: boolean;
}

// ===== HTTP 请求/响应 =====

/** 插件收到的 HTTP 请求 */
export interface HTTPRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Uint8Array | null;
  query: string;
}

/** serveFile 指令：指示 Go 层直接 serve 文件（绕过 QuickJS string 管道） */
export interface ServeFileDirective {
  /** serve 系统内歌曲（需 songs.read 权限） */
  songId?: number;
  /**
   * serve 文件路径。解析规则：
   * - 不以 "/" 开头 → 相对于插件 data 目录（需 fs 权限）
   * - 以 "/" 开头 → 绝对路径，需在 fs:external 配置的目录内
   * - "music://xxx" → 解析为 music_path 下的路径（需 fs:music 权限）
   */
  filePath?: string;
}

/** 插件返回的 HTTP 响应 */
export interface HTTPResponse {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /**
   * 指示 Go 层直接 serve 文件（零拷贝，支持 Range 请求和 HTTP 缓存）。
   * 设置此字段时 body 会被忽略。
   */
  serveFile?: ServeFileDirective;
}

// ===== 入站 WebSocket =====

/** 插件收到的 WebSocket upgrade 请求 */
export interface WebSocketRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: string;
  remoteAddr: string;
}

/** 入站 WebSocket 消息事件 */
export interface InboundWebSocketMessageEvent {
  type: 'message';
  target: InboundWebSocket;
  data: string | Uint8Array;
  isBinary: boolean;
}

/** 入站 WebSocket 关闭事件 */
export interface InboundWebSocketCloseEvent {
  type: 'close';
  target: InboundWebSocket;
  code: number;
  reason: string;
  wasClean: boolean;
}

/** 入站 WebSocket 错误事件 */
export interface InboundWebSocketErrorEvent {
  type: 'error';
  target: InboundWebSocket;
  message: string;
}

/** 由 Songloft 托管的入站 WebSocket 连接 */
export interface InboundWebSocket {
  id: string;
  readyState: 0 | 1 | 2 | 3;
  readonly CONNECTING: 0;
  readonly OPEN: 1;
  readonly CLOSING: 2;
  readonly CLOSED: 3;
  onmessage: ((event: InboundWebSocketMessageEvent) => void | Promise<void>) | null;
  onclose: ((event: InboundWebSocketCloseEvent) => void | Promise<void>) | null;
  onerror: ((event: InboundWebSocketErrorEvent) => void | Promise<void>) | null;
  send(data: string | Uint8Array | ArrayBuffer): Promise<void>;
  close(code?: number, reason?: string): Promise<void>;
  onMessage(handler: (event: InboundWebSocketMessageEvent) => void | Promise<void>): void;
  onClose(handler: (event: InboundWebSocketCloseEvent) => void | Promise<void>): void;
  onError(handler: (event: InboundWebSocketErrorEvent) => void | Promise<void>): void;
  addEventListener(type: 'message', handler: (event: InboundWebSocketMessageEvent) => void | Promise<void>): void;
  addEventListener(type: 'close', handler: (event: InboundWebSocketCloseEvent) => void | Promise<void>): void;
  addEventListener(type: 'error', handler: (event: InboundWebSocketErrorEvent) => void | Promise<void>): void;
  removeEventListener(type: 'message', handler: (event: InboundWebSocketMessageEvent) => void | Promise<void>): void;
  removeEventListener(type: 'close', handler: (event: InboundWebSocketCloseEvent) => void | Promise<void>): void;
  removeEventListener(type: 'error', handler: (event: InboundWebSocketErrorEvent) => void | Promise<void>): void;
}

// ===== songloft 全局 API =====

export interface SongloftLog {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

// 设计：所有 songloft.* 接口统一返回 Promise，与 fetch 真异步语义一致。
// 调用方必须 await。这样底层 Go 侧可以在 goroutine 中处理桥接调用，
// 而不阻塞 QuickJS 单 VM 锁，是"插件不可用"问题的核心修复点。

export interface SongloftStorage {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface SongloftPersistentStorage {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface SongDownloadResult {
  path: string;
  status: string;
  error?: string;
}

/** 创建远程歌曲的输入 */
export interface CreateSongInput {
  url?: string;
  title: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  duration?: number;
  sourceData?: string;
  dedupKey?: string;
  lyric?: string;
  lyricSource?: string;
  lyricRemoteUrl?: string;
}

/** 更新歌曲的可选字段 */
export interface UpdateSongFields {
  title?: string;
  artist?: string;
  album?: string;
  url?: string;
  coverUrl?: string;
  duration?: number;
}

export interface SongloftSongs {
  list(options?: { limit?: number; offset?: number }): Promise<Song[]>;
  getById(id: number): Promise<Song | null>;
  search(query: string): Promise<Song[]>;
  download(songId: number, options?: {
    target_dir?: string;
    path_template?: string;
    embed_metadata?: boolean;
  }): Promise<SongDownloadResult>;
  /** 批量创建远程歌曲（自动关联到当前插件） */
  create(songs: CreateSongInput[]): Promise<Song[]>;
  /** 更新歌曲元数据（仅更新传入的字段） */
  update(id: number, fields: UpdateSongFields): Promise<Song>;
  /** 删除歌曲（含封面和缓存清理） */
  delete(id: number): Promise<void>;
}

/** 创建歌单的输入 */
export interface CreatePlaylistInput {
  name: string;
  type?: 'normal' | 'radio';
  description?: string;
  coverUrl?: string;
}

/** 更新歌单的可选字段 */
export interface UpdatePlaylistFields {
  name?: string;
  description?: string;
  coverUrl?: string;
}

/** addSongs 的返回结果 */
export interface AddSongsResult {
  added: number;
  skipped: number;
}

export interface SongloftPlaylists {
  list(): Promise<Playlist[]>;
  getById(id: number): Promise<Playlist | null>;
  /**
   * 获取歌单中的歌曲。`options` 可选 limit/offset 控制分页；
   * 不传 options 时返回最多 100000 条。
   */
  getSongs(playlistId: number, options?: { limit?: number; offset?: number }): Promise<Song[]>;
  /** 搜索歌单（按名称关键词） */
  search(query: string, options?: { limit?: number; offset?: number }): Promise<Playlist[]>;
  /** 创建歌单 */
  create(playlist: CreatePlaylistInput): Promise<Playlist>;
  /** 更新歌单（仅更新传入的字段；内置歌单只允许更新封面） */
  update(id: number, fields: UpdatePlaylistFields): Promise<Playlist>;
  /** 删除歌单（内置歌单不可删除） */
  delete(id: number): Promise<void>;
  /** 批量添加歌曲到歌单（类型不兼容或已存在的歌曲计入 skipped） */
  addSongs(playlistId: number, songIds: number[]): Promise<AddSongsResult>;
  /** 批量移除歌单中的歌曲 */
  removeSongs(playlistId: number, songIds: number[]): Promise<void>;
  /** 重排序歌单中的歌曲（songIds 长度必须等于歌单内现有歌曲数） */
  reorder(playlistId: number, songIds: number[]): Promise<void>;
}

export interface SongloftComm {
  /** 发送单向消息到另一个插件（Promise 在投递完成时 resolve） */
  send(to: string, action: string, payload: unknown): Promise<void>;
  /** RPC 调用另一个插件并等待响应 */
  call(to: string, action: string, payload: unknown, timeoutMs?: number): Promise<unknown>;
  /** 注册消息处理器（handler 可返回值或 Promise，框架自动 await） */
  onMessage(action: string, handler: (payload: unknown, from: string) => unknown | Promise<unknown>): void;
}

export interface SongloftPlugin {
  /** 获取插件的 JWT Token（用于访问宿主 API） */
  getToken(): Promise<string>;
  /** 获取宿主服务的基础 URL */
  getHostUrl(): Promise<string>;
  /**
   * 获取文件的可访问 URL（含 access_token）。
   * 路径规则同 ServeFileDirective.filePath。
   * 返回的 URL 可直接用于 <audio src="..."> 等场景。
   */
  getFileUrl(filePath: string): Promise<string>;
  /** 获取本机局域网可达的 IPv4 地址列表（排除回环、Docker 虚拟网桥等） */
  getNetworkAddresses(): Promise<string[]>;
}

// ===== 子 JS 环境（songloft.jsenv） =====

/** 子 env 内通过 __go_send 抛出的事件 */
export interface SongloftJSEnvEvent {
  /** 事件名（lx.send 的 eventName） */
  name: string;
  /** 事件 payload，已 JSON.stringify */
  data: string;
}

/** execute / executeWait 的返回值 */
export interface SongloftJSEnvResult {
  /** 最后表达式 toString 的结果 */
  result: string;
  /** 本次执行收集到的事件 */
  events: SongloftJSEnvEvent[];
  /** 执行错误（脚本抛异常 / 超时 / env 不存在等）；正常时为空字符串 */
  error?: string;
}

/** 给 executeParallel 用的单次调用描述 */
export interface SongloftJSEnvCall {
  /** plugin-local env 名（不能含 :: 或 /） */
  name: string;
  /** 待执行 JS 代码 */
  code: string;
  /** 超时（毫秒），默认 30000 */
  timeoutMs?: number;
  /** 等待哪些事件名（命中任一即返回），空数组等价于 execute */
  waitEvents?: string[];
}

/** executeParallel 的返回值；successIndex < 0 表示全部失败 */
export interface SongloftJSEnvParallelResult {
  successIndex: number;
  result?: SongloftJSEnvResult;
  errors: string[];
}

/**
 * 子 JS 环境管理 API。
 * 每个子 env 是独立的 QuickJS VM，与父插件的全局对象完全隔离。
 * 跨 env 真并行（同 env 串行）。
 *
 * 已知约束：
 * - 子 env 默认无 songloft.* 桥接（只用于跑用户脚本，无需访问 storage 等）；
 *   fetch / setTimeout / Buffer / crypto / zlib 都自动可用，fetch 是真异步。
 * - 子 env 没有专用 timer goroutine：setTimeout/setInterval 仅在 executeWait
 *   的 polling loop 内被驱动（够用于 dispatch 流程，不适合 setInterval 后台任务）。
 * - 插件停止/重载时，所有子 env 会按 pluginID 自动回收（DestroyPluginEnvs）。
 *
 * 所有方法都返回 Promise；调用方必须 await。
 */
export interface SongloftJSEnv {
  /** 创建子 JS 环境；name 是 plugin-local，重名时 reject */
  create(name: string, initCode?: string): Promise<string>;
  /** 同步 eval（无 wait），适合纯计算或代码注入 */
  execute(name: string, code: string, timeoutMs?: number): Promise<SongloftJSEnvResult>;
  /** eval + 驱动 Promise/setTimeout 直到 waitEvents 之一到达或超时 */
  executeWait(name: string, code: string, timeoutMs: number, waitEvents: string[]): Promise<SongloftJSEnvResult>;
  /** 多 env 并行竞速；首个非 error 胜出，successIndex<0 表示全部失败 */
  executeParallel(calls: SongloftJSEnvCall[], maxConcurrent?: number): Promise<SongloftJSEnvParallelResult>;
  /** 销毁子 env，best-effort（不存在不报错） */
  destroy(name: string): Promise<void>;
  /** 列出本插件所有子 env（plugin-local name） */
  list(): Promise<string[]>;
}

// ===== 文件系统（songloft.fs） =====

export interface FsStatResult {
  size: number;
  modTime: number;
  isDir: boolean;
}

export interface FsDirEntry {
  name: string;
  isDir: boolean;
}

/**
 * 插件数据目录内的文件读写 API。
 *
 * 所有 path 参数为相对路径，根目录为插件数据目录
 * （`data/jsplugins_data/{entryPath}/`）。
 * 路径不允许包含 `..`，不允许逃逸出数据目录。
 * 文件大小上限 10MB。
 *
 * 所有方法都返回 Promise；调用方必须 await。
 */
export interface SongloftFS {
  readFile(path: string, options?: { encoding?: 'utf8' | 'base64' }): Promise<string>;
  writeFile(path: string, data: string, options?: { encoding?: 'utf8' | 'base64' }): Promise<void>;
  appendFile(path: string, data: string, options?: { encoding?: 'utf8' | 'base64' }): Promise<void>;
  readdir(path: string): Promise<FsDirEntry[]>;
  unlink(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  stat(path: string): Promise<FsStatResult>;
  rename(oldPath: string, newPath: string): Promise<void>;
}

// ===== 外部命令 / 可执行文件管理（songloft.command） =====

export interface CommandExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * 外部命令与可执行文件管理 API。
 *
 * - exec: 一次性运行命令并等待结束（最长 300s）
 * - start/stop/isRunning: 后台进程生命周期管理
 * - download/deleteBin/listBin/exists: 插件 bin/ 目录文件管理
 *
 * program 解析顺序：插件 bin/ 目录 → 系统 PATH。
 * 所有方法都返回 Promise；调用方必须 await。
 */
export interface SongloftCommand {
  exec(program: string, args?: string[], options?: {
    timeout?: number; stdin?: string; env?: Record<string, string>;
  }): Promise<CommandExecResult>;
  start(name: string, program: string, args?: string[], options?: {
    env?: Record<string, string>;
  }): Promise<{ pid: number }>;
  stop(name: string): Promise<void>;
  isRunning(name: string): Promise<boolean>;
  download(url: string, filename: string, options?: {
    extract?: 'tgz';
    extractTarget?: string;
  }): Promise<void>;
  deleteBin(filename: string): Promise<void>;
  listBin(): Promise<string[]>;
  exists(filename: string): Promise<boolean>;
}

// ===== 播放事件（songloft.events） =====

/** 播放事件中的歌曲信息 */
export interface PlayEventSong {
  id: number;
  title: string;
  artist: string;
}

/** 播放事件数据 */
export interface PlayEvent {
  type: 'play' | 'finish' | 'skip';
  song: PlayEventSong;
  /** 调用来源标识，如 "songloft-player"（官方客户端）、"miot"（小爱音箱插件）等 */
  source: string;
  /** Unix 毫秒时间戳 */
  timestamp: number;
}

/**
 * 事件订阅 API。
 *
 * 插件通过 `songloft.events.onPlayEvent(fn)` 动态订阅播放事件，
 * 通过 `songloft.events.offPlayEvent()` 取消订阅。
 * 可在任意时刻调用（onInit、onHTTPRequest、定时器回调等），
 * 支持设置页面的开关场景。
 *
 * 未订阅的插件不会收到广播。插件休眠后订阅自动清除，
 * 懒加载恢复时需在 onInit 中重新注册。
 */
export interface SongloftEvents {
  /** 订阅播放事件 */
  onPlayEvent(handler: (event: PlayEvent) => void | Promise<void>): void;
  /** 取消订阅播放事件 */
  offPlayEvent(): void;
}

/**
 * 歌词提供者注册（songloft.lyrics）。
 *
 * 插件通过 `songloft.lyrics.registerProvider()` 声明自己是歌词提供者，
 * 之后宿主在歌曲没有歌词时会通过 InvokeHTTP 调用插件的 `/lyric-search` 端点。
 * 插件需自行实现该 HTTP 路由。
 */
export interface SongloftLyrics {
  /** 注册当前插件为歌词提供者 */
  registerProvider(): void;
  /** 取消注册 */
  unregisterProvider(): void;
}

// ===== 网络 socket（songloft.net） =====

/** UDP socket 绑定结果 */
export interface UDPBindResult {
  socketId: string;
  localAddr: string;
}

/** UDP 数据接收事件（Go 侧 readLoop 推送） */
export interface NetDataEvent {
  socketId: string;
  /** base64 编码的原始数据 */
  data: string;
  /** 发送方地址 "ip:port" */
  remoteAddr: string;
}

/**
 * 网络 socket API（当前仅 UDP）。
 *
 * 典型用途：SSDP 设备发现（DLNA/UPnP）、mDNS、自定义 UDP 协议。
 * 数据接收采用推送模式：Go 侧 readLoop goroutine 读取 UDP 包后，
 * 通过 scheduler 消息队列异步推送到 JS 回调。
 *
 * 安全限制：
 * - 每插件最多 8 个 socket
 * - 插件卸载/休眠时自动关闭所有 socket
 * - 需要 "net" 权限
 *
 * 所有方法都返回 Promise；调用方必须 await。
 */
export interface SongloftNet {
  /**
   * 创建并绑定 UDP socket。
   * @param options.address 绑定地址，如 ":0"（随机端口）或 "0.0.0.0:1900"
   */
  udpBind(options?: { address?: string }): Promise<UDPBindResult>;
  /**
   * 发送 UDP 数据。data 为原始字符串（JS 侧自动 btoa 编码传输）。
   * @param addr 目标地址 "host:port"，如 "239.255.255.250:1900"
   */
  udpSend(socketId: string, data: string, addr: string): Promise<void>;
  /** 加入 UDP 多播组（自动在所有可用网络接口上加入） */
  udpJoinMulticast(socketId: string, group: string): Promise<void>;
  /** 离开 UDP 多播组 */
  udpLeaveMulticast(socketId: string, group: string): Promise<void>;
  /** 获取 socket 的本地绑定地址 */
  udpGetLocalAddr(socketId: string): Promise<{ localAddr: string }>;
  /** 关闭 UDP socket（自动清理回调） */
  udpClose(socketId: string): Promise<void>;
  /**
   * 注册数据接收回调（推送模式）。
   * Go 侧 readLoop 收到 UDP 包后自动调用注册的 handler。
   * event.data 为 base64 编码，使用 atob() 解码为原始字符串。
   */
  onData(socketId: string, handler: (event: NetDataEvent) => void | Promise<void>): void;
}

export interface Songloft {
  log: SongloftLog;
  storage: SongloftStorage;
  persistentStorage: SongloftPersistentStorage;
  songs: SongloftSongs;
  playlists: SongloftPlaylists;
  comm: SongloftComm;
  plugin: SongloftPlugin;
  jsenv: SongloftJSEnv;
  command: SongloftCommand;
  fs: SongloftFS;
  events: SongloftEvents;
  lyrics: SongloftLyrics;
  net: SongloftNet;
}

export interface SongloftCryptoBuffer {
  _hex: string;
  toString(format?: string): string;
  length?: number;
}

export type SongloftCryptoInput = string | SongloftCryptoBuffer;

export interface SongloftCrypto {
  /** MD5 哈希，输入 UTF-8 字符串，返回 hex 字符串 */
  md5(str: string): string;
  /** SHA1 哈希，输入 UTF-8 字符串，返回 hex 字符串 */
  sha1(str: string): string;
  /** SHA256 哈希，输入任意二进制 Buffer-like 数据，返回 Buffer-like 结果 */
  sha256Bytes(buffer: SongloftCryptoInput): SongloftCryptoBuffer;
  /** RC4 流加密/解密，默认 toString("base64") */
  rc4(key: SongloftCryptoInput, data: SongloftCryptoInput): SongloftCryptoBuffer;
  /** AES 加密，支持 CBC/ECB + PKCS7 padding，默认 toString("base64") */
  aesEncrypt(buffer: SongloftCryptoInput, mode: 'cbc' | 'ecb' | string, key: SongloftCryptoInput, iv?: SongloftCryptoInput): SongloftCryptoBuffer;
  /** AES 解密，支持 CBC/ECB + PKCS7 unpadding；字符串密文默认按 base64 解析 */
  aesDecrypt(buffer: SongloftCryptoInput, mode: 'cbc' | 'ecb' | string, key: SongloftCryptoInput, iv?: SongloftCryptoInput): SongloftCryptoBuffer;
  /** RSA 公钥加密 (PKCS1v15)，默认 toString("base64") */
  rsaEncrypt(buffer: SongloftCryptoInput, publicKeyPEM: string): SongloftCryptoBuffer;
  /** 生成随机字节，默认 toString("hex") */
  randomBytes(size: number): SongloftCryptoBuffer & { length: number };
}

// ===== 全局声明 =====

declare global {
  /** Songloft 插件专属 API 命名空间 */
  const songloft: Songloft;

  /** 插件生命周期：初始化（可返回 Promise，框架会 await） */
  function onInit(): void | Promise<void>;
  /** 插件生命周期：销毁（可返回 Promise，框架会 await） */
  function onDeinit(): void | Promise<void>;
  /**
   * 插件 HTTP 路由处理器。
   * 实现可以是 async function；框架的事件循环会等待返回的 Promise settle 后
   * 再把响应序列化为 HTTP 应答。
   */
  function onHTTPRequest(req: HTTPRequest): HTTPResponse | Promise<HTTPResponse>;
  /**
   * 插件入站 WebSocket 处理器。
   *
   * 当客户端连接 `/api/v1/jsplugin/{entryPath}/...` 并发起 WebSocket upgrade 时调用。
   * 插件需声明 `"websocket"` 权限。handler 应注册 message/close/error 回调后返回，
   * 长连接生命周期由宿主托管。
   */
  function onWebSocket(req: WebSocketRequest, socket: InboundWebSocket): void | Promise<void>;
  /**
   * 播放事件回调（通过 songloft.events.onPlayEvent 注册后生效）。
   * 客户端播放完一首歌后由后端广播调用。
   */
  function onPlayEvent(event: PlayEvent): void | Promise<void>;

  // 由 polyfill 注入的标准全局 API（与浏览器/Node 对齐）。
  // fetch 是真异步（Go 侧 goroutine 跑 HTTP，JS 侧通过原生 Promise 等待）。
  function fetch(input: string, init?: RequestInit): Promise<Response>;
  function setTimeout(fn: () => void, ms: number): number;
  function clearTimeout(id: number): void;
  function setInterval(fn: () => void, ms: number): number;
  function clearInterval(id: number): void;

  /** QuickJS 运行时注入的轻量 crypto 工具；与 DOM Crypto 接口做声明合并。 */
  interface Crypto extends SongloftCrypto {}

  // ===== Go 桥接函数（由 QuickJS 运行时注入） =====
  // 注意：__go_fetch_sync 已移除；HTTP 请求统一通过 fetch（真异步）。

  /** 当前时间戳（毫秒） */
  function __go_now_ms(): number;

  /** Buffer.from 桥接: 将 data 按 encoding(utf8/base64/hex/latin1) 转为 hex 内部表示 */
  function __go_buffer_from(data: string, encoding: string): string;

  /** Buffer.toString 桥接: 将 hex 内部表示转为指定编码(utf8/base64/hex/latin1)字符串 */
  function __go_buffer_to_string(dataHex: string, encoding: string): string;

  /** MD5 哈希，输入 UTF-8 字符串，返回 hex 字符串 */
  function __go_crypto_md5(str: string): string;

  /** SHA256 哈希，输入 UTF-8 字符串，返回 hex 字符串 */
  function __go_crypto_sha256(str: string): string;

  /** SHA1 哈希，输入 UTF-8 字符串，返回 hex 字符串 */
  function __go_crypto_sha1(str: string): string;

  /** SHA256 哈希，输入任意二进制 hex，返回 hex 字符串 */
  function __go_crypto_sha256_bytes(dataHex: string): string;

  /** RC4 流加密/解密，keyHex/dataHex 输入，返回 hex 字符串 */
  function __go_crypto_rc4(keyHex: string, dataHex: string): string;

  /** 生成随机字节，返回 hex 字符串 */
  function __go_crypto_random_bytes(size: number): string;

  /** AES 加密 (mode: "cbc"|"ecb", PKCS7 padding)，所有参数和返回值均为 hex */
  function __go_crypto_aes_encrypt(dataHex: string, mode: string, keyHex: string, ivHex: string): string;

  /** AES 解密 (mode: "cbc"|"ecb", PKCS7 unpadding)，所有参数和返回值均为 hex */
  function __go_crypto_aes_decrypt(dataHex: string, mode: string, keyHex: string, ivHex: string): string;

  /** RSA 公钥加密 (PKCS1v15)，dataHex 为 hex 数据，keyPEM 为 PEM 格式公钥，返回 hex */
  function __go_crypto_rsa_encrypt(dataHex: string, keyPEM: string): string;

  /** Zlib 解压，输入输出均为 hex */
  function __go_zlib_inflate(dataHex: string): string;

  /** Zlib 压缩，输入输出均为 hex */
  function __go_zlib_deflate(dataHex: string): string;

  /** Raw DEFLATE 解压（无 zlib 头），输入输出均为 hex，用于 ZIP 文件解析 */
  function __go_raw_inflate(dataHex: string): string;
}

export {};
