import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(
  new URL('../src/lynx-index-html.ts', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function load() {
  const exports = {};
  new Function('exports', code)(exports);
  return exports;
}

test('generated fallback page declares versioned web bundle address', () => {
  const { generateLynxIndexHtml } = load();
  const html = generateLynxIndexHtml('miot', '370b41b23b7f9575');
  assert.match(
    html,
    /<script type="module" src="\.\.\/\.\.\/jsplugin-assets\/lynx-plugin-bridge-shim\.js" data-songloft-lynx-bundle="static\/main\.web\.bundle\?v=370b41b23b7f9575"><\/script>/,
  );
  assert.match(html, /<lynx-view id="plugin-view"><\/lynx-view>/);
});

test('omits the bundle attribute when no web bundle version is available', () => {
  const { generateLynxIndexHtml } = load();
  const html = generateLynxIndexHtml('miot');
  assert.ok(!html.includes('data-songloft-lynx-bundle'));
  assert.match(html, /<script type="module" src="\.\.\/\.\.\/jsplugin-assets\/lynx-plugin-bridge-shim\.js"><\/script>/);
});
