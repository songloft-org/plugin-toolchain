/**
 * Auto-generated index.html for Lynx plugins — Flutter WebView fallback.
 *
 * When a plugin declares renderEngine: "lynx", the builder produces this HTML
 * alongside the .lynx.bundle and .web.bundle. Flutter's WebView loads this page,
 * which bootstraps @lynx-js/web-core + the .web.bundle, making one ReactLynx
 * codebase render everywhere.
 */

export function generateLynxIndexHtml(entryPath: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <title>${entryPath}</title>
  <link href="/api/v1/jsplugin-assets/web-core/static/css/client.css" rel="stylesheet">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
    lynx-view { width: 100vw; height: 100vh; display: block; }
  </style>
</head>
<body>
  <lynx-view id="plugin-view" url="./main.web.bundle"></lynx-view>
  <script type="module" src="/api/v1/jsplugin-assets/web-core/static/js/client.js"></script>
  <script type="module" src="/api/v1/jsplugin-assets/lynx-plugin-bridge-shim.js"></script>
</body>
</html>
`
}
