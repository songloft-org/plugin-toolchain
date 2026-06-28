# Songloft Plugin Toolchain

用于开发 [Songloft](https://github.com/songloft-org/songloft) JS 插件的工具链 monorepo。

## 包

| 包 | 说明 |
|---|------|
| [`@songloft/plugin-sdk`](./packages/plugin-sdk) | 全局类型声明 + 运行时 helper（路由、jsonResponse 等） |
| [`@songloft/plugin-builder`](./packages/plugin-builder) | CLI：`build` / `validate` / `dev` / `publish`（esbuild + zip 打包 + hash 生成） |
| [`create-songloft-plugin`](./packages/create-songloft-plugin) | `npx create-songloft-plugin@latest` 脚手架，交互式生成新插件项目 |

## 快速开始

```bash
# 脚手架创建插件（交互式）
npx create-songloft-plugin@latest
# 或使用 pnpm
pnpm create songloft-plugin

cd <你的插件目录>
npm install   # 或 pnpm install / yarn install（脚手架会询问包管理器偏好）
npm run build
# 产物：dist/<entryPath>.jsplugin.zip —— 到 Songloft 后台上传即可
```

脚手架会交互式引导你完成以下配置：

**前端开发模式**：

- `Vanilla JS`: 传统静态页面，原生 HTML/JS 开发，极简、无编译负担
- `Vue 3 + Vite`: 现代化前端栈，内置 Vue 3 与 Pinia，支持 Vite 代理调试与 HMR，自带 WebView 样式兼容与静态路由重写机制

**可选权限**（多选）：

| 权限 | 说明 |
|------|------|
| `network` | 网络请求 - fetch API |
| `storage` | 持久化存储 - storage API |
| `songs.read` | 读取歌曲列表/元数据 |
| `songs.write` | 写入/修改歌曲元数据 |
| `playlists.read` | 读取歌单及歌单中的歌曲 |
| `playlists.write` | 创建/修改/删除歌单及其歌曲 |
| `inter-plugin` | 与其他插件通信 |
| `command` | 执行外部命令/管理可执行文件 |
| `jsenv` | 创建/执行子 JS 沙箱环境 |

**附加功能模板**（多选，可跳过）：

| 功能 | 说明 |
|------|------|
| `static` | 静态页面 (`static/`) — 包含 HTML 模板和入口 JS；公共资源（CSS/字体/API 工具库）由主程序自动注入 |
| `bin` | 可执行文件管理 (`bin/`) — 打包/下载/运行外部程序 |

模板采用层叠合并设计：始终以 `base` 为基础骨架，再根据你选择的**前端模式**（Vanilla / Vue）以及选中的**附加功能**，智能组合出对应的初始化工程代码。

> 完整的插件开发指南（生命周期、API 参考、安全机制等）见 [JS 插件开发指南](https://github.com/songloft-org/songloft/blob/main/docs/js-plugin-development-guide.md)。

## 本地开发

```bash
pnpm install
pnpm --filter "./packages/*" build    # 构建三个发布包
pnpm --filter "./examples/*" build    # （可选）验证模板示例
```

> ⚠️ 首次 `pnpm install` 时 pnpm 会 WARN无法为 `examples/basic` 创建 `songloft-plugin` bin 链接（因为 `plugin-builder/dist/cli.js` 尚未构建），属正常现象。build 完成后如需构建 examples，先运行 `pnpm install --force` 刷新 bin 链接。

## 发版

极简流程：本地一句命令 bump + tag，推送后 GitHub Actions 自动发 npm + 建 GitHub Release（release notes 从 tag 区间的 git log 生成）。

三个包 `@songloft/plugin-sdk` / `@songloft/plugin-builder` / `create-songloft-plugin` 共享同一个版本号，一起发。

```bash
# 在 main 分支、工作区干净、本地与 origin/main 同步的前提下：
pnpm run release:patch       # 0.4.1 → 0.4.2
pnpm run release:minor       # 0.4.1 → 0.5.0
pnpm run release:major       # 0.4.1 → 1.0.0
node scripts/release.mjs 0.4.5   # 指定版本号
node scripts/release.mjs patch --dry-run   # 干跑查看改动
```

脚本会：
1. 校验三包版本一致 + tag 未占用 + 分支/工作区状态干净
2. 同步写回三个 `package.json` 的 `version`
3. 同步更新 `packages/create-songloft-plugin/src/index.ts` 的 `SDK_VERSION` / `BUILDER_VERSION` 常量
4. `git commit -m "chore(release): vX.Y.Z"` + `git tag -a vX.Y.Z` + `git push --follow-tags`

tag 推上后 [release.yml](./.github/workflows/release.yml) 会：
- 校验包版本与 tag 一致
- `pnpm publish` 到 npm（OIDC Trusted Publishing，无需 NPM_TOKEN）
- 拉上一个 tag 到本 tag 的 git log 作为 release notes，创建 GitHub Release

### 为什么不用 changesets

单人开发场景下，changesets 多了一道中间 PR、一堆 markdown 碎文件、一个外部依赖。现在 release notes 直接从 commit message 生成，只要 commit 写得干净就够。

## License

Apache-2.0
