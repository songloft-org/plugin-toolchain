import { execFileSync } from 'node:child_process';

/** Only fixed npm arguments enter cmd.exe; project paths use cwd, never shell interpolation. */
export function runFrontendNpm(cwd: string, action: 'install' | 'build'): void {
  execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    action === 'install' ? ['install'] : ['run', 'build'],
    { cwd, stdio: 'inherit', shell: process.platform === 'win32' },
  );
}
