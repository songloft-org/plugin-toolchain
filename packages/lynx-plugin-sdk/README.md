# @songloft/lynx-plugin-sdk

Lynx 原生渲染插件的客户端 SDK。运行在子 `<frame>` bundle 内，通过 `NativeModules.SongloftPluginBridge` 与宿主通信。

## 安装

```bash
pnpm add @songloft/lynx-plugin-sdk
```

## 快速上手

```tsx
import { invokeHost, onPlayerState, onThemeChange, getTheme, getFrameId } from '@songloft/lynx-plugin-sdk'

// 调用宿主方法（返回 Promise）
const info = await invokeHost('host', 'getInfo')
await invokeHost('player', 'play', { id: 123 })

// 监听播放器状态
const unsub = onPlayerState((state) => {
  console.log(state.current_song, state.is_playing)
})

// 监听主题切换
onThemeChange((theme) => {
  console.log('theme:', theme) // 'light' | 'dark'
})

// 读取宿主注入的全局属性
const frameId = getFrameId()
const theme = getTheme()
```

## API

### `invokeHost(ns, method, params?): Promise<HostCallResult>`

向宿主发送一次 RPC 调用。宿主收到后通过 `hostReply` 回传结果。

- `ns` — 命名空间（如 `'host'`、`'player'`）
- `method` — 方法名
- `params` — 可选参数对象
- 返回 `{ ok: boolean; data?: unknown; error?: string }`
- 超时 10 秒自动返回 `{ ok: false, error: 'timeout' }`

### `onPlayerState(cb): () => void`

监听宿主推送的播放器状态。返回取消订阅函数。

`PlayerState` 包含：`queue`、`current_index`、`current_song`、`is_playing`、`current_time`、`duration`、`volume`、`play_mode`、`source_playlist_id`。

### 打开外链和全屏视频

使用 `invokeHost('plugin', 'openUrl', { url })` 打开绝对 HTTP(S) 链接，用 `invokeHost('player', 'openVideo', { id })` 全屏播放曲库视频。先通过 `host.getInfo` 检查 `plugin.openUrl` 或 `player.openVideo`。 [宿主接口文档](https://github.com/songloft-org/songloft-player-lynx/blob/main/docs/reference/plugin-client-sdk.md#插件外链和全屏视频)

### 播放音效

`host.getInfo` 公布 `player.audioEffects` 能力时，可通过 `invokeHost('player', 'getAudioEffects')` 获取会话和预设。沿用 `player` 命名空间的 `applyAudioEffects` 和 `clearAudioEffects` 操作该会话。类型定义为 `PlaybackAudioEffectsState`、`PlaybackAudioEffects` 和 `ApplyPlaybackAudioEffectsOptions`。见 [宿主接口文档](https://github.com/songloft-org/songloft-player-lynx/blob/main/docs/reference/plugin-client-sdk.md#插件播放音效)。

可组合应用宿主报告的 EQ、`reverb` 和 `stereoWidth` 预设。从 2.25.0 开始，SDK 包含立体声展宽的类型定义。组合音效会为生效的 EQ 预留增益余量，可能降低音量。

### `onThemeChange(cb): () => void`

监听宿主推送的主题变更（`'light'` / `'dark'`）。返回取消订阅函数。

### `onPush(cb): () => void`

监听所有宿主推送事件。`cb(event, data)` 中 `event` 为事件名，`data` 为原始 JSON 字符串。

事件订阅会注册子 frame，不要求先调用 RPC。原生宿主通过 `onPush` 推送 `event === 'lifecycle'`、`JSON.parse(data).state === 'resumed'`：首次订阅准备完成提供一次初始可见通知，此后每次恢复前台通知一次，插件自行重连/刷新快照。取消订阅后不再消费事件；宿主切换/关闭插件后停止推送。Web 使用浏览器可见性通知。已有插件需要用包含此注册逻辑的 SDK 重新构建，旧 bundle 不会自动获得这段 SDK 改动。

### `getGlobalProps(): Partial<PluginGlobalProps>`

读取宿主通过 `<frame>` 元素注入的全局属性。

### `getFrameId(): string`

返回当前 frame 的 ID（用于标识父子通信通道）。

### `getTheme(): 'light' | 'dark'`

返回当前主题，默认 `'light'`。

## 通信架构

```
┌─────────────────────┐         ┌────────────────────────┐
│   宿主 (Host App)    │         │  子 frame (Plugin)      │
│                     │         │                        │
│  registerHost(fid)  │◄────────│  registerChild(fid)    │
│                     │         │                        │
│  hostCall handler   │◄────────│  invokeHost(ns,method) │
│    ↓ process        │         │                        │
│  hostReply(callId)  │────────►│  Promise resolves      │
│                     │         │                        │
│  pushToChild(event) │────────►│  onPush / onPlayer...  │
└─────────────────────┘         └────────────────────────┘
```

通信通过 `SongloftPluginBridge` Native Module 中转，按 `frameId` 路由。三端（Android/iOS/HarmonyOS）实现一致，由契约测试锁住。

## 适用场景

此 SDK 仅用于 `renderEngine: "lynx"` 的插件。WebView 插件使用 `@songloft/plugin-sdk`。

创建 Lynx 插件：

```bash
pnpm create @songloft/songloft-plugin
# 选择 "Lynx 原生渲染" 模板
```

## 插件业务请求 / Plugin API requests

```ts
import { apiGet, apiPost, apiPut, apiDelete } from '@songloft/lynx-plugin-sdk'
const status = await apiGet<{ logged_in: boolean }>('/api/login/status')
await apiPost('/api/settings', { audio_quality: 'high' })
await apiPut('/api/settings', { audio_quality: 'lossless' })
await apiDelete('/api/groups?id=1')
```

请求通过 `plugin.apiRequest` 交给当前 frame 的宿主；宿主绑定插件身份，处理服务器子路径与认证。只接受 `/api` 下的 GET/POST/PUT/DELETE JSON 请求，禁止绝对地址、编码路径与路径穿越。成功返回业务数据，HTTP、桥接、超时或响应中的 `error` 会抛出异常。宿主请求上限 60 秒，SDK 等待回复上限 65 秒。旧宿主不支持时明确报错，需要更新 Lynx 客户端；Flutter/Web 回退需要更新服务端提供的 shim。插件不需要获取 Token。

Requests use `plugin.apiRequest`. The host binds the current frame's plugin identity and supplies the server base path and authentication. Only GET/POST/PUT/DELETE JSON requests under `/api` are accepted; absolute URLs, encoded route paths and traversal are rejected. Successful calls return business data. HTTP, bridge, timeout and response `error` failures throw. Host requests expire after 60 seconds; SDK replies expire after 65 seconds. Older hosts report an unsupported-call error: update the Lynx client, or the server-provided shim for Flutter/Web fallback. Plugins do not need access tokens.

## 发布 / Publishing

本包加入工具链统一发版（从 v2.20.0 起），`scripts/release.mjs` 同步版本和脚手架依赖，Release workflow 发布 npm 包。首次发布需先完成 npm 身份认证及后续 Trusted Publisher 配置，不能把仅推送 main 视为 npm 已发布。

This package participates in the unified toolchain release (starting with v2.20.0). The release script synchronizes package/template versions and the Release workflow publishes to npm. Initial publishing needs npm authentication and subsequent Trusted Publisher configuration; a main-branch push alone does not publish the package.


发布中途失败后，可以从 main 执行 `gh workflow run release.yml -f tag=v2.20.0` 恢复同一个 tag。源码仍固定到该 tag，发布工具取自工作流提交；已存在版本跳过，仅明确的 npm E404 才尝试发布，认证和网络失败会中止。首次发布 Lynx SDK 需 npm 账号完成浏览器验证，随后可在 npm 包设置中配置此仓库 `release.yml` 的 Trusted Publisher。

After a partial failure, run `gh workflow run release.yml -f tag=v2.20.0` from main to resume the same tag. Package sources remain pinned to the tag; publishing tools come from the workflow revision. Existing versions are skipped; only explicit npm E404 results permit publishing, while authentication/network errors stop the run. Initial SDK publishing requires browser verification through an npm account; configure this repository's `release.yml` as a Trusted Publisher in the package settings afterward.

## 文本连接 / Text sockets

```ts
import { PluginSocket } from '@songloft/lynx-plugin-sdk'
const socket = new PluginSocket('/status/ws?device_id=example')
socket.onopen = () => socket.send('refresh')
socket.onmessage = ({ data }) => console.log(data)
socket.onerror = () => console.log('connection failed')
socket.onclose = () => console.log('closed')
// Dispose on hide/unmount; create a fresh connection when resumed.
socket.close()
```

路径仅限当前插件的相对路径；宿主提供服务器地址、子路径与认证，按 frame 限八条连接并在释放时关闭。`readyState` 为 0/1/2/3；文本上行最多 65536 字符。需要配套新版 Android/iOS/HarmonyOS/Web 宿主或服务端回退 shim；源码存在不代表 npm 已发布。

Only relative paths within the current plugin are accepted. The host supplies server/base path/authentication, caps each frame at eight sockets and closes them on release. `readyState` is 0/1/2/3; outgoing text is limited to 65536 characters. Matching updated native/Web hosts or the server fallback shim are required. Source changes do not imply an npm publication.
