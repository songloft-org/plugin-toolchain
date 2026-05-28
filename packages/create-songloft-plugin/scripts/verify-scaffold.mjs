// 模拟 create-songloft-plugin scaffold 的完整流程，验证生成物是否正确。
// 这不是发布产物的一部分，仅在本地手工验证时运行（node packages/create-songloft-plugin/scripts/verify-scaffold.mjs）。
import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const SDK_VERSION = '^0.3.0';
const BUILDER_VERSION = '^0.4.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_ROOT = join(__dirname, '..', 'templates', 'basic');
const TARGET = join(tmpdir(), 'verify-scaffold-output');

if (existsSync(TARGET)) rmSync(TARGET, { recursive: true });
mkdirSync(TARGET, { recursive: true });

const answers = {
  name: 'verify-plugin',
  entryPath: 'verify-plugin',
  description: 'scaffold verification',
  author: 'ci',
  permissions: ['storage', 'songs.read', 'playlists.read', 'playlists.write'],
};

const vars = {
  name: answers.name,
  entryPath: answers.entryPath,
  description: answers.description,
  author: answers.author,
  permissions: JSON.stringify(answers.permissions),
  year: '2026',
};

function walk(dir, base, out) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relative(base, abs);
    if (statSync(abs).isDirectory()) walk(abs, base, out);
    else out.push(rel);
  }
}

function renderTemplate(content, vars) {
  return content.replace(/\{\{(\w+)\}\}/g, (_m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : _m,
  );
}

const files = [];
walk(TEMPLATE_ROOT, TEMPLATE_ROOT, files);

const textExts = new Set(['.json', '.ts', '.js', '.md', '.yml', '.yaml', '.html', '.css']);
const textBasenames = new Set(['_gitignore', '.gitignore', 'README', 'LICENSE']);

for (const rel of files) {
  const src = join(TEMPLATE_ROOT, rel);
  const relRenamed = rel.split(/[\\/]/).map((s) => (s === '_gitignore' ? '.gitignore' : s)).join('/');
  const dst = join(TARGET, relRenamed);
  const dotIdx = rel.lastIndexOf('.');
  const ext = dotIdx >= 0 ? rel.slice(dotIdx).toLowerCase() : '';
  const base = rel.split(/[\\/]/).pop() ?? rel;
  const isText = textExts.has(ext) || textBasenames.has(base);

  mkdirSync(dirname(dst), { recursive: true });
  if (!isText) {
    copyFileSync(src, dst);
    continue;
  }
  let content = readFileSync(src, 'utf8');
  content = renderTemplate(content, vars);
  if (base === 'package.json') {
    content = content
      .replace(/"@songloft\/plugin-sdk":\s*"workspace:\^?"/g, `"@songloft/plugin-sdk": "${SDK_VERSION}"`)
      .replace(/"@songloft\/plugin-builder":\s*"workspace:\^?"/g, `"@songloft/plugin-builder": "${BUILDER_VERSION}"`);
  }
  writeFileSync(dst, content, 'utf8');
}

const pkg = JSON.parse(readFileSync(join(TARGET, 'package.json'), 'utf8'));
const plg = JSON.parse(readFileSync(join(TARGET, 'plugin.json'), 'utf8'));

const checks = [
  ['package.json devDep plugin-sdk matches SDK_VERSION', pkg.devDependencies['@songloft/plugin-sdk'] === SDK_VERSION],
  ['package.json devDep plugin-builder matches BUILDER_VERSION', pkg.devDependencies['@songloft/plugin-builder'] === BUILDER_VERSION],
  ['plugin.json name replaced', plg.name === answers.name],
  ['plugin.json entryPath replaced', plg.entryPath === answers.entryPath],
  ['plugin.json permissions replaced', JSON.stringify(plg.permissions) === JSON.stringify(answers.permissions)],
  ['no stale ^0.1.0 residue', !JSON.stringify(pkg).includes('^0.1.0')],
  ['no workspace:^ residue', !JSON.stringify(pkg).includes('workspace:')],
];

let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${label}`);
  if (!pass) ok = false;
}
console.log('');
console.log('Generated package.json:');
console.log(JSON.stringify(pkg, null, 2));
console.log('');
console.log('Generated plugin.json:');
console.log(JSON.stringify(plg, null, 2));
console.log('');
console.log(`Output dir: ${TARGET}`);
process.exit(ok ? 0 : 1);
