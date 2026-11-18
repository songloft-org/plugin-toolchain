/**
 * Auto-generated index.html for Lynx plugins — Flutter WebView fallback.
 *
 * When a plugin declares renderEngine: "lynx", the builder produces this HTML
 * alongside the .lynx.bundle and .web.bundle. Flutter's WebView loads this page,
 * which bootstraps @lynx-js/web-core + the .web.bundle, making one ReactLynx
 * codebase render everywhere.
 *
 * webBundleVersion 是 main.web.bundle 的内容哈希；带上后新版本服务端的
 * lynx-plugin-bridge-shim 会按声明加载带版本参数的 bundle 地址，插件更新后
 * 浏览器不会命中旧缓存。未提供时保持原有固定地址（旧宿主兼容路径）。
 */

export function generateLynxIndexHtml(entryPath: string, webBundleVersion?: string): string {
  const bundleAttr = webBundleVersion
    ? ` data-songloft-lynx-bundle="static/main.web.bundle?v=${webBundleVersion}"`
    : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <title>${entryPath}</title>
  <link href="../../jsplugin-assets/web-core/static/css/client.css" rel="stylesheet">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
    lynx-view { width: 100vw; height: 100vh; display: block; }
  </style>
</head>
<body>
  <lynx-view id="plugin-view"></lynx-view>
  <script type="module" src="../../jsplugin-assets/web-core/static/js/client.js"></script>
  <script type="module" src="../../jsplugin-assets/lynx-plugin-bridge-shim.js"${bundleAttr}></script>
</body>
</html>
`;
}
