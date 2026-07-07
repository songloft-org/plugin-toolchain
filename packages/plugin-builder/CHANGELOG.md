# @songloft/plugin-builder

## Unreleased

### Patch Changes

- 修复：`VALID_PERMISSIONS` 补齐后端已支持的 `net` 与 `persistent-storage` 权限，避免声明 UDP socket 权限的插件在 build/validate 阶段被拒。

## 0.4.0

### Minor Changes

- 6d210be: **BREAKING**：权限系统重构为对称的读写细粒度模型。

  之前 `playlists.*` 是唯一可声明的歌单权限（all-or-nothing，破坏最小权限原则），
  而 `songs` 已经按 `.read` / `.write` 细分。本次对齐到同一设计。

  - 新增合法权限：`playlists.read` / `playlists.write`
  - 新增通配符糖：`songs.*` / `playlists.*`（一把梭写法，配合前缀匹配）
  - 脚手架交互选项不再提供笼统的 `playlists.*`，改为 `playlists.read` + `playlists.write`
  - 文档与后端 `AllPermissions` 完全对齐

  完整权限集合：

  ```
  storage
  songs.read  songs.write  songs.*
  playlists.read  playlists.write  playlists.*
  inter-plugin  command
  ```

  后端 action 映射保证 runtime 严格按读/写细粒度校验：只声明 `playlists.read` 的
  插件调用 `mimusic.playlists.addSongs` 等写接口会被拒绝。

  > 声明 `playlists.*` 的旧插件依然工作（通配符语义不变），但建议迁移到细粒度。

### Patch Changes

- d58f89f: 修复：插件 `permissions` 白名单对齐 MiMusic 后端运行时。

  - `plugin-builder` 的 validator 去掉 `playlists.read` / `playlists.write`，改为 `playlists.*`（后端只以通配符形式暴露歌单权限）。
  - `create-songloft-plugin` 脚手架权限选项：删除后端未实现的 `network` / `config.read` / `config.write`；补齐缺失的 `storage` / `inter-plugin` / `command`；将 `playlists.read/write` 合并为 `playlists.*`。

  最终统一后的合法权限集合（与 `internal/jsplugin/permissions.go` 的 `AllPermissions` 严格一致）：

  ```
  storage  songs.read  songs.write  playlists.*  inter-plugin  command
  ```

  这修复了脚手架生成的 `plugin.json` 无法通过 build 校验，以及就算构建成功上传后端也会 `ValidatePermissions` 失败的问题。

## 0.3.0

### Minor Changes

- 00bf7c5: 发版本测试

## 0.2.0

### Minor Changes

- 版本发布
