import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const packages = [
  'jsc-linux-x64',
  'jsc-linux-arm64',
  'jsc-darwin-x64',
  'jsc-darwin-arm64',
  'jsc-win32-x64',
  'jsc-win32-arm64',
  'jsc',
  'plugin-sdk',
  'client-sdk',
  'lynx-plugin-sdk',
  'plugin-builder',
  'create-songloft-plugin',
];

/** Only an explicit registry E404 permits publishing; network/auth failures stop. */
export function isPublished(result, version) {
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    /* handled below */
  }
  if (result.status === 0 && payload === version) return true;
  if (result.status !== 0 && payload?.error?.code === 'E404') return false;
  throw new Error(
    `Registry lookup failed: ${result.error?.message || result.stderr || result.stdout}`,
  );
}

export function publishMissing(root, run = spawnSync) {
  for (const dir of packages) {
    const { name, version } = JSON.parse(
      readFileSync(resolve(root, 'packages', dir, 'package.json'), 'utf8'),
    );
    const result = run(
      'npm',
      [
        'view',
        `${name}@${version}`,
        'version',
        '--json',
        '--registry=https://registry.npmjs.org/',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    if (isPublished(result, version)) {
      console.log(`Already published: ${name}@${version}`);
      continue;
    }
    console.log(`Publishing: ${name}@${version}`);
    const published = run(
      'pnpm',
      [
        '--filter',
        `./packages/${dir}`,
        'publish',
        '--access',
        'public',
        '--no-git-checks',
        '--registry=https://registry.npmjs.org/',
        '--provenance',
      ],
      {
        cwd: root,
        stdio: 'inherit',
        timeout: 300000,
      },
    );
    if (published.status !== 0)
      throw new Error(
        `Publish failed: ${name}@${version}: ${published.error?.message || published.status}`,
      );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  publishMissing(process.cwd());
}
