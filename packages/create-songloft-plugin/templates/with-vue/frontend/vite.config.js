import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    vue(),
    {
      name: 'html-transform',
      apply: 'build',
      transformIndexHtml(html) {
        let newHtml = html.replace(/"\.\//g, '"static/');
        const scriptRegex = /<script\b[^>]*\bsrc="static\/js\/app\.js"[^>]*><\/script>/;
        const match = newHtml.match(scriptRegex);
        if (match) {
          newHtml = newHtml.replace(match[0], '');
          newHtml = newHtml.replace('</body>', match[0] + '\n  </body>');
        }
        return newHtml;
      }
    }
  ],
  build: {
    outDir: '../static',
    emptyOutDir: true,
    cssTarget: 'chrome61',
    rollupOptions: {
      output: {
        entryFileNames: 'js/app.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.css')) return 'css/style.css';
          return 'assets/[name].[ext]';
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        // Change to your Songloft backend IP address for local development
        target: 'http://127.0.0.1:58091',
        changeOrigin: true
      }
    }
  }
});
