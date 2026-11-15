import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { isPublished, packages, publishMissing } from '../publish-missing.mjs';

test('registry checks distinguish existing versions, missing versions and transport/auth errors', () => {
  assert.equal(isPublished({ status: 0, stdout: '"2.20.0"' }, '2.20.0'), true);
  assert.equal(
    isPublished({ status: 1, stdout: '{"error":{"code":"E404"}}' }, '2.20.0'),
    false,
  );
  for (const result of [
    { status: 1, stdout: '{"error":{"code":"E403"}}' },
    { status: 1, stdout: '', stderr: 'network timeout' },
    { status: 0, stdout: '"2.19.0"' },
  ])
    assert.throws(
      () => isPublished(result, '2.20.0'),
      /Registry lookup failed/,
    );
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'toolchain-publish-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of packages) {
    mkdirSync(join(root, 'packages', dir), { recursive: true });
    writeFileSync(
      join(root, 'packages', dir, 'package.json'),
      JSON.stringify({ name: `@test/${dir}`, version: '2.20.0' }),
    );
  }
  return root;
}

test('partial recovery skips published packages and preserves dependency ordering', (t) => {
  const root = fixture(t),
    published = [];
  publishMissing(root, (command, args) => {
    if (command === 'npm')
      return args[1] === '@test/plugin-sdk@2.20.0'
        ? { status: 0, stdout: '"2.20.0"' }
        : { status: 1, stdout: '{"error":{"code":"E404"}}' };
    published.push(args[1]);
    assert.ok(args.includes('--provenance'));
    return { status: 0 };
  });
  assert.ok(!published.includes('./packages/plugin-sdk'));
  assert.ok(published.includes('./packages/lynx-plugin-sdk'));
  assert.ok(
    published.indexOf('./packages/jsc-linux-x64') <
      published.indexOf('./packages/jsc'),
  );
  assert.ok(
    published.indexOf('./packages/jsc') <
      published.indexOf('./packages/plugin-builder'),
  );
});

test('publish failure stops the remaining packages', (t) => {
  const root = fixture(t),
    attempted = [];
  assert.throws(
    () =>
      publishMissing(root, (command, args) => {
        if (command === 'npm')
          return { status: 1, stdout: '{"error":{"code":"E404"}}' };
        attempted.push(args[1]);
        return { status: 1 };
      }),
    /Publish failed/,
  );
  assert.equal(attempted.length, 1);
});
