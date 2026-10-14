# 可取消的 HTTP 分块读取

`@songloft/plugin-sdk` 导出 `HTTPStream`、`HTTPStreamResponse` 和 `HTTPStreamOptions`；可选的 `songloft.net.httpStream` 类型兼容旧宿主。接口、权限、限制与示例以[宿主 API 文档](https://github.com/songloft-org/songloft/blob/main/docs/js-plugin-development-guide.md#songloftnethttpstream--可取消的分块-http-请求)为准。

构建与类型检查：在 `packages/plugin-sdk/` 执行 `npm run typecheck` 和 `npm run build`。开发验证可将本地 SDK 打包安装至测试依赖目录，不把 `/tmp` 或 `file:` 地址写入正式依赖和锁文件；正式使用新类型需发布配套 SDK 后更新消费方依赖。
