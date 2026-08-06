import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// WebF 插件前端构建配置。
//
// 产物直接写进 ../static，由 @songloft/plugin-builder 的 frontend/ 钩子调用
// （build 时先 `npm install`（仅当 node_modules 缺失）再 `npm run build`），
// 然后 builder 把 ../static 拷进 build/static 继续处理。
//
// ⚠️ 三条不能改的约束，都是 builder 与 WebF 的硬要求：
//
//   ① **必须只产出一个 JS 文件，且文件名恰好是 js/app.js**。
//      builder 会把 build/static/js/app.js 重打成 IIFE，然后删掉 js/ 下其它 .js，
//      并用正则把 index.html 里 `src="static/js/app.js"` 换掉 —— 匹配不到会直接 throw。
//      所以既不能改名，也不能让 rollup 分出 chunk（故 inlineDynamicImports）。
//   ② **产物文件名不要自带 hash**。builder 会给 static/ 下资源注入内容 hash 并改写引用。
//   ③ **HTML 里的资源引用必须是 `static/xxx` 形式**（见下面的 html-transform）。
//      WebF 不采纳 `<base href>`，插件页 URL 形如 `/api/v1/jsplugin/<entryPath>/`，
//      相对路径 `./js/app.js` 在那里解析不对。
export default defineConfig({
  base: './',
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // webf-ui 的原生元素是**自定义标签**，Vue 默认会当成未注册组件而告警。
          // 三个前缀：flutter-cupertino-*（宿主 webf_cupertino_ui）、
          // webf-*（webf 内建，如 webf-list-view）、songloft-*（宿主自有元素）。
          isCustomElement: (tag) =>
            tag.startsWith('flutter-') ||
            tag.startsWith('webf-') ||
            tag.startsWith('songloft-'),
        },
      },
    }),
    {
      name: 'html-transform',
      apply: 'build',
      transformIndexHtml(html) {
        // ./xxx → static/xxx（约束 ③）
        let out = html.replace(/"\.\//g, '"static/');
        // 去掉 Vite 注入的 crossorigin：插件资源与页面同源，不需要 CORS 模式，
        // 而 WebF 的 fetch 对该属性的处理未验证，去掉是零成本的保险。
        out = out.replace(/\s+crossorigin(?==|\s|>)/g, '');
        // 把 script 挪到 </body> 之前：宿主注入的 common.js 是 render-blocking 且在
        // <head>，我们的脚本必须在它之后跑（window.SongloftPlugin 才存在）。
        const m = out.match(/<script\b[^>]*\bsrc="static\/js\/app\.js"[^>]*><\/script>/);
        if (!m) {
          throw new Error(
            'html-transform: 没找到 <script src="static/js/app.js">，' +
              'builder 会因此 throw。检查 entryFileNames 是否仍是 js/app.js。',
          );
        }
        out = out.replace(m[0], '');
        out = out.replace('</body>', `${m[0]}\n  </body>`);
        return out;
      },
    },
  ],
  build: {
    outDir: '../static',
    emptyOutDir: true,
    // WebF 的 CSS 支持面接近 chrome61，别让 Vite 产出更新的语法
    cssTarget: 'chrome61',
    rollupOptions: {
      output: {
        // 约束 ①：单文件 + 固定名
        inlineDynamicImports: true,
        entryFileNames: 'js/app.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'css/style.css';
          }
          return 'assets/[name].[ext]';
        },
      },
    },
  },
  server: {
    proxy: {
      // 本地 vite dev 时把 API 打到后端。插件页真实运行时是同源的，不走这里。
      '/api': {
        target: 'http://127.0.0.1:58091',
        changeOrigin: true,
      },
    },
  },
});
