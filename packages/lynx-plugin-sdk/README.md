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
