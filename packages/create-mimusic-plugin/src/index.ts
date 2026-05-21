import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { input, select, checkbox, confirm } from '@inquirer/prompts';

/**
 * CLI 入口：
 *   npx create-mimusic-plugin <target-dir>
 *   pnpm create mimusic-plugin <target-dir>
 *
 * 流程：
 * 1. 确定目标目录（命令行参数 > 交互输入）
 * 2. 交互式询问 name / description / author / entryPath / permissions / package-manager
 * 3. 从 templates/basic/ 拷贝文件到目标目录
 * 4. 将 {{name}} / {{entryPath}} / {{description}} / {{author}} / {{permissions}} / {{year}} 占位符替换为实际值
 * 5. _gitignore 重命名为 .gitignore
 * 6. package.json 中的 workspace:^ 替换为实际 semver（开发期使用，发布后为正常版本号）
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 发布版依赖版本（与 monorepo 同步发布，维护时需跟随 npm 最新稳定版）
const SDK_VERSION = '^0.8.1';
const BUILDER_VERSION = '^0.8.1';

const AVAILABLE_PERMISSIONS = [
  { name: 'storage (持久化存储 - storage API)', value: 'storage' },
  { name: 'songs.read (读取歌曲列表/元数据)', value: 'songs.read' },
  { name: 'songs.write (写入/修改歌曲元数据)', value: 'songs.write' },
  { name: 'playlists.read (读取歌单及歌单中的歌曲)', value: 'playlists.read' },
  { name: 'playlists.write (创建/修改/删除歌单及其歌曲)', value: 'playlists.write' },
  { name: 'inter-plugin (与其他插件通信)', value: 'inter-plugin' },
  { name: 'command (执行宿主提供的指令)', value: 'command' },
];

interface Answers {
  targetDir: string;
  name: string;
  entryPath: string;
  description: string;
  author: string;
  permissions: string[];
  packageManager: 'pnpm' | 'npm' | 'yarn';
}

function parseArgs(argv: string[]): { targetDir?: string } {
  const args = argv.slice(2);
  const out: { targetDir?: string } = {};
  for (const a of args) {
    if (!a.startsWith('-')) {
      out.targetDir = a;
      break;
    }
  }
  return out;
}

function validateIdentifier(v: string): string | true {
  if (!v || !v.trim()) return '不能为空';
  if (v.length > 64) return '最长 64 个字符';
  return true;
}

function validateEntryPath(v: string): string | true {
  if (!v || !v.trim()) return '不能为空';
  if (!/^[a-z0-9][a-z0-9\-_]*$/.test(v)) return '仅允许小写字母、数字、连字符、下划线，且必须以字母数字开头';
  if (v.length > 64) return '最长 64 个字符';
  return true;
}

async function prompt(initialTarget?: string): Promise<Answers> {
  const targetDir = initialTarget
    ? initialTarget
    : await input({ message: '目标目录名称', default: 'my-mimusic-plugin', validate: validateIdentifier });

  const defaultEntryPath = targetDir
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-') || 'my-plugin';

  const name = await input({
    message: '插件显示名称 (name)',
    default: targetDir,
    validate: validateIdentifier,
  });

  const entryPath = await input({
    message: '插件入口路径 entryPath (URL 路径段，唯一标识)',
    default: defaultEntryPath,
    validate: validateEntryPath,
  });

  const description = await input({
    message: '插件简介',
    default: 'A MiMusic plugin',
  });

  const author = await input({
    message: '作者',
    default: '',
  });

  const permissions = await checkbox({
    message: '选择插件需要的权限（可多选）',
    choices: AVAILABLE_PERMISSIONS,
  });

  const packageManager = (await select({
    message: '选择包管理器',
    choices: [
      { name: 'pnpm', value: 'pnpm' },
      { name: 'npm', value: 'npm' },
      { name: 'yarn', value: 'yarn' },
    ],
    default: 'pnpm',
  })) as 'pnpm' | 'npm' | 'yarn';

  return { targetDir, name, entryPath, description, author, permissions, packageManager };
}

function resolveTemplateRoot(): string {
  // 发布后 dist/index.js 在 package 根目录 dist 下，模板在 package 根目录 templates/basic 下
  const candidate = resolve(__dirname, '..', 'templates', 'basic');
  if (existsSync(candidate)) return candidate;
  throw new Error(`模板目录不存在: ${candidate}`);
}

function walk(dir: string, base: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relative(base, abs);
    if (statSync(abs).isDirectory()) {
      walk(abs, base, out);
    } else {
      out.push(rel);
    }
  }
}

function renderTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : _m;
  });
}

function writeWithDirs(targetFile: string, content: string | Buffer): void {
  mkdirSync(dirname(targetFile), { recursive: true });
  if (typeof content === 'string') {
    writeFileSync(targetFile, content, 'utf8');
  } else {
    writeFileSync(targetFile, content);
  }
}

async function scaffold(answers: Answers): Promise<void> {
  const cwd = process.cwd();
  const targetAbs = resolve(cwd, answers.targetDir);

  if (existsSync(targetAbs)) {
    const items = readdirSync(targetAbs);
    if (items.length > 0) {
      const ok = await confirm({
        message: `目录 ${answers.targetDir} 非空，是否继续（已有同名文件会被覆盖）?`,
        default: false,
      });
      if (!ok) {
        console.log('已取消。');
        process.exit(1);
      }
    }
  } else {
    mkdirSync(targetAbs, { recursive: true });
  }

  const templateRoot = resolveTemplateRoot();
  const files: string[] = [];
  walk(templateRoot, templateRoot, files);

  // 纯文本后缀（会进行变量替换 + workspace 依赖重写）
  const textExts = new Set(['.json', '.ts', '.js', '.md', '.yml', '.yaml', '.html', '.css']);
  // 视为无后缀纯文本的特殊文件名
  const textBasenames = new Set(['_gitignore', '.gitignore', 'README', 'LICENSE']);

  const vars: Record<string, string> = {
    name: answers.name,
    entryPath: answers.entryPath,
    description: answers.description,
    author: answers.author,
    permissions: JSON.stringify(answers.permissions),
    year: String(new Date().getFullYear()),
  };

  for (const rel of files) {
    const src = join(templateRoot, rel);
    // _gitignore -> .gitignore
    const relRenamed = rel.split(/[\\/]/).map((seg) => (seg === '_gitignore' ? '.gitignore' : seg)).join('/');
    const dst = join(targetAbs, relRenamed);

    const dotIdx = rel.lastIndexOf('.');
    const ext = dotIdx >= 0 ? rel.slice(dotIdx).toLowerCase() : '';
    const base = rel.split(/[\\/]/).pop() ?? rel;
    const isText = textExts.has(ext) || textBasenames.has(base);

    if (!isText) {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
      continue;
    }

    let content = readFileSync(src, 'utf8');
    content = renderTemplate(content, vars);

    // package.json 特殊处理：workspace:^ → 实际发布版本
    if (base === 'package.json') {
      content = content
        .replace(/"@mimusic\/plugin-sdk":\s*"workspace:\^?"/g, `"@mimusic/plugin-sdk": "${SDK_VERSION}"`)
        .replace(/"@mimusic\/plugin-builder":\s*"workspace:\^?"/g, `"@mimusic/plugin-builder": "${BUILDER_VERSION}"`);
    }

    writeWithDirs(dst, content);
  }

  console.log('');
  console.log(`✅ 已创建 ${answers.targetDir}`);
  console.log('');
  console.log('下一步：');
  console.log(`  cd ${answers.targetDir}`);
  console.log(`  ${answers.packageManager} install`);
  console.log(`  ${answers.packageManager} run build`);
  console.log('');
  console.log('构建产物位于 dist/ 目录，可在 MiMusic 后台上传。');
}

async function main(): Promise<void> {
  const { targetDir } = parseArgs(process.argv);
  try {
    const answers = await prompt(targetDir);
    await scaffold(answers);
  } catch (err) {
    if (err instanceof Error && err.name === 'ExitPromptError') {
      console.log('\n已取消。');
      process.exit(130);
    }
    console.error('创建失败:', err);
    process.exit(1);
  }
}

void main();
