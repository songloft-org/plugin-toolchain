import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(
  new URL('../src/frontend-npm.ts', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
for (const platform of ['win32', 'linux', 'darwin']) {
  test(`npm launches frontend tasks on ${platform} with a literal cwd`, () => {
    const calls = [],
      exports = {};
    new Function('require', 'exports', 'process', code)(
      () => ({ execFileSync: (...args) => calls.push(args) }),
      exports,
      { platform },
    );
    const cwd = 'project with spaces & symbols/frontend';
    exports.runFrontendNpm(cwd, 'install');
    exports.runFrontendNpm(cwd, 'build');
    assert.deepEqual(calls, [
      [
        platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install'],
        { cwd, stdio: 'inherit', shell: platform === 'win32' },
      ],
      [
        platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'build'],
        { cwd, stdio: 'inherit', shell: platform === 'win32' },
      ],
    ]);
  });
}
test('real npm frontend build works in a path with spaces and shell characters', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'songloft frontend & build '));
  try {
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ private: true, scripts: { build: 'node build.cjs' } }),
    );
    writeFileSync(
      join(cwd, 'build.cjs'),
      "require('node:fs').writeFileSync('built.txt', 'ok');",
    );
    const exports = {};
    new Function('require', 'exports', 'process', code)(
      require,
      exports,
      process,
    );
    exports.runFrontendNpm(cwd, 'build');
    assert.ok(existsSync(join(cwd, 'built.txt')));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
