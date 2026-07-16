# @songloft/client-sdk

Songloft **客户端 SDK**：让「在 Songloft Flutter 客户端 webview 中打开的插件页面」调用宿主客户端能力——改写正在播放队列、控制播放、订阅播放状态等。

> 与 [`@songloft/plugin-sdk`](../plugin-sdk) 的区别：`plugin-sdk` 面向**服务端 QuickJS 运行时**（`songloft.*` 全局，跑在后端）；本包面向**客户端 webview 页面**（`window.SongloftPlugin.*`，跑在 Flutter 客户端里打开的插件网页中）。

## 适用范围

- ✅ **Songloft Flutter 客户端**（Android / iOS / macOS / Windows / Linux）的 webview 中打开的插件页面
- ✅ **Web 端「Tab 内嵌插件页」**（宿主 iframe，走 postMessage 桥接）
- ❌ **Web 端「全屏插件页」**（在新浏览器标签独立打开，无宿主父窗口）—— `isClient()` 返回 `false`
- ❌ 服务端 QuickJS 运行时（用 `@songloft/plugin-sdk`）

> 无论走哪条链路，调用前都请用 `isClient()` / `host.isAvailable()` 先检测——不可用时调用会抛错。

运行时能力由宿主客户端注入到 `window.SongloftPlugin`。本包是**类型层 + 便捷封装**：所有调用都委托注入的全局对象，不含独立运行时。因此新能力可能受客户端版本限制，请在 `plugin.json` 设置合适的 `minHostVersion`，并用 `host.getInfo().capabilities` 做能力协商。

## 安装

```bash
npm install @songloft/client-sdk
```

## 用法

```ts
import { player, host, isClient } from '@songloft/client-sdk';

// 调用前先 feature-detect
if (isClient()) {
  // 用歌曲 id 替换正在播放队列并从第 0 首开始播
  await player.setQueue([101, 102, 103], { startIndex: 0 });

  // 追加到队列末尾（不打断当前播放）
  await player.addToQueue([104]);

  // 读取当前状态
  const state = await player.getState();
  console.log(state.current_song?.title, state.is_playing);

  // 订阅播放状态变更（返回取消订阅函数）
  const off = player.onStateChange((s) => {
    console.log('当前第', s.current_index, '首');
  });

  // 能力协商
  const info = await host.getInfo();
  if (info.capabilities.includes('player')) {
    /* ... */
  }
}
```

> 歌曲以 **id** 传入（宿主权威）。插件通过服务端 `songs.create` 创建的远程歌曲已持久化、带 id，可直接入队。

免构建的 vanilla 插件也可直接用注入的全局对象（无需引入本包，仅少了类型提示）：

```html
<script>
  window.SongloftPlugin.player.setQueue([101, 102]);
</script>
```

## API

### `isClient(): boolean`

同步检测当前是否运行在支持原生桥接的 Songloft 客户端 webview 内。

### `host`

- `host.isAvailable(): boolean` —— 同 `isClient()`
- `host.getInfo(): Promise<HostInfo>` —— 宿主版本 / 平台 / 能力列表

### `player`

| 方法 | 说明 |
|------|------|
| `getState()` | 获取播放器状态快照 |
| `setQueue(ids, { startIndex?, sourcePlaylistId? })` | 替换整个队列并播放 |
| `addToQueue(ids)` | 追加到队列末尾（去重，不播放） |
| `insertToQueue(index, id)` | 指定位置插入（不播放） |
| `removeFromQueue(index)` | 移除指定下标 |
| `reorderQueue(oldIndex, newIndex)` | 重排 |
| `clearQueue()` | 清空 |
| `play(id?)` | 播放指定歌曲 / 恢复播放 |
| `pause()` / `togglePlay()` | 暂停 / 切换 |
| `next()` / `prev()` | 下一首 / 上一首 |
| `seek(seconds)` | 跳转进度 |
| `setVolume(0-100)` | 音量 |
| `setPlayMode(mode)` | `order`/`loop`/`single`/`random`/`singlePlay` |
| `playPlaylistById(id)` | 直接播放服务端歌单 |
| `onStateChange(cb)` | 订阅状态变更，返回取消订阅函数 |

完整类型见包内 `.d.ts`（`ClientSong` / `ClientPlayerState` / `HostInfo` / `PlayMode` 等）。

## License

Apache-2.0
