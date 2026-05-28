# Songloft Plugin Toolchain

用于开发 [Songloft](https://github.com/songloft-org/songloft) JS 插件的工具链 monorepo。

## 包

| 包 | 说明 |
|---|------|
| [`@songloft/plugin-sdk`](./packages/plugin-sdk) | 全局类型声明 + 运行时 helper（路由、jsonResponse 等） |
| [`@songloft/plugin-builder`](./packages/plugin-builder) | CLI：`build` / `validate` / `dev` / `publish`（esbuild + zip 打包 + hash 生成） |
| [`create-songloft-plugin`](./packages/create-songloft-plugin) | `pnpm create songloft-plugin` 脚手架，从模板生成新插件项目 |

## 快速开始（发布后）

```bash
# 脚手架创建插件
pnpm create songloft-plugin my-plugin
cd my-plugin
pnpm install
pnpm run build
# 产物：dist/<entryPath>.jsplugin.zip —— 到 Songloft 后台上传即可
```

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
