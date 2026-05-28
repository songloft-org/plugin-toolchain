// @songloft/plugin-builder — CLI 入口
import { buildPlugin, validatePlugin } from './build.js';
import { runDev } from './dev.js';

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

async function main() {
  switch (command) {
    case 'build': {
      const mode = (getFlag('mode') as 'development' | 'production') ?? 'production';
      const sourcemap = hasFlag('sourcemap');
      await buildPlugin({ cwd: process.cwd(), mode, sourcemap });
      break;
    }
    case 'validate': {
      const result = await validatePlugin(process.cwd());
      if (!result.valid) {
        console.error('❌ Validation failed:');
        for (const err of result.errors) {
          console.error(`  - ${err.field}: ${err.message}`);
        }
        process.exit(1);
      } else {
        console.log('✅ Plugin is valid.');
      }
      break;
    }
    case 'dev': {
      await runDev({
        cwd: process.cwd(),
        host: getFlag('host') ?? process.env.SONGLOFT_HOST,
        username: getFlag('username') ?? process.env.SONGLOFT_USER,
        password: getFlag('password') ?? process.env.SONGLOFT_PASSWORD,
        token: getFlag('token') ?? process.env.SONGLOFT_TOKEN,
        once: hasFlag('once'),
        enable: !hasFlag('no-enable'),
      });
      break;
    }
    case 'publish': {
      console.log('⚠️  publish command not yet implemented (coming in v0.2)');
      break;
    }
    default:
      console.log(`Usage: songloft-plugin <command>

Commands:
  build       Build the plugin into a .jsplugin.zip
  validate    Validate plugin.json and hashes
  dev         Watch source + auto-build & upload to a local Songloft instance
  publish     Tag & trigger GitHub release (WIP)

Build options:
  --mode <mode>      Build mode: production (default) or development
  --sourcemap        Include inline source maps

Dev options:
  --host <url>       Songloft instance URL (default: http://localhost:58091,
                     also reads $SONGLOFT_HOST or .songloft-dev.json)
  --username <name>  Login username (or $SONGLOFT_USER)
  --password <pwd>   Login password (or $SONGLOFT_PASSWORD; prompt if absent)
  --token <jwt>      Use a pre-issued access token instead of username/password
                     (or $SONGLOFT_TOKEN)
  --once             Build + upload once and exit; skip watch mode
  --no-enable        Don't auto-enable the plugin after first-time install

On first run you'll be prompted for username and password; both are written to
.songloft-dev.json in the project root (added to .gitignore automatically) so
subsequent runs log in silently. Tokens are NOT cached — each session logs in
fresh, so you never have to deal with expired tokens. To rotate credentials,
edit (or delete) .songloft-dev.json.
`);
      if (command) {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
