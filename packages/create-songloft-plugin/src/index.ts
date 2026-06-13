import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { input, select, checkbox, confirm } from '@inquirer/prompts';

/**
 * CLI 入口：
 *   npx create-songloft-plugin <target-dir>
 *   pnpm create songloft-plugin <target-dir>
 *
 * 流程：
 * 1. 确定目标目录（命令行参数 > 交互输入）
 * 2. 交互式询问 name / description / author / entryPath / permissions / features / package-manager
 * 3. 根据选择的功能，合并 templates/base/ + 选中的叠加层到目标目录
 * 4. 将 {{name}} / {{entryPath}} 等占位符替换为实际值
 * 5. _gitignore 重命名为 .gitignore
 * 6. package.json 中的 workspace:^ 替换为实际 semver
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SDK_VERSION = '^2.5.1';
const BUILDER_VERSION = '^2.5.1';

const AVAILABLE_PERMISSIONS = [
  { name: 'storage (持久化存储 - storage API)', value: 'storage' },
  { name: 'songs.read (读取歌曲列表/元数据)', value: 'songs.read' },
  { name: 'songs.write (写入/修改歌曲元数据)', value: 'songs.write' },
  { name: 'playlists.read (读取歌单及歌单中的歌曲)', value: 'playlists.read' },
  { name: 'playlists.write (创建/修改/删除歌单及其歌曲)', value: 'playlists.write' },
  { name: 'inter-plugin (与其他插件通信)', value: 'inter-plugin' },
  { name: 'command (执行外部命令/管理可执行文件)', value: 'command' },
  { name: 'jsenv (创建/执行子 JS 沙箱环境)', value: 'jsenv' },
];

const AVAILABLE_FEATURES = [
  { name: '静态页面 (static/) — 包含 HTML 模板和入口 JS，公共资源由主程序自动注入', value: 'static' },
  { name: '可执行文件管理 (bin/) — 打包/下载/运行外部程序', value: 'bin' },
];

interface Answers {
  targetDir: string;
  name: string;
  entryPath: string;
  description: string;
  author: string;
  permissions: string[];
  features: string[];
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
    : await input({ message: '目标目录名称', default: 'my-songloft-plugin', validate: validateIdentifier });

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
    default: 'A Songloft plugin',
  });

  const author = await input({
    message: '作者',
    default: '',
  });

  const permissions = await checkbox({
    message: '选择插件需要的权限（可多选）',
    choices: AVAILABLE_PERMISSIONS,
  });

  const features = await checkbox({
    message: '选择附加功能（可多选，可跳过）',
    choices: AVAILABLE_FEATURES,
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

  return { targetDir, name, entryPath, description, author, permissions, features, packageManager };
}

function resolveTemplateDirs(features: string[]): string[] {
  const templatesRoot = resolve(__dirname, '..', 'templates');
  const dirs: string[] = [];

  const baseDir = join(templatesRoot, 'base');
  if (!existsSync(baseDir)) throw new Error(`模板目录不存在: ${baseDir}`);
  dirs.push(baseDir);

  if (features.includes('static')) {
    const staticDir = join(templatesRoot, 'with-static');
    if (existsSync(staticDir)) dirs.push(staticDir);
  }

  if (features.includes('bin')) {
    const binDir = join(templatesRoot, 'with-bin');
    if (existsSync(binDir)) dirs.push(binDir);
  }

  return dirs;
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

  const templateDirs = resolveTemplateDirs(answers.features);

  // 收集所有文件（后者覆盖前者的同名文件）
  const fileMap = new Map<string, string>(); // rel -> srcDir
  for (const dir of templateDirs) {
    const files: string[] = [];
    walk(dir, dir, files);
    for (const rel of files) {
      fileMap.set(rel, dir);
    }
  }

  const textExts = new Set(['.json', '.ts', '.js', '.md', '.yml', '.yaml', '.html', '.css']);
  const textBasenames = new Set(['_gitignore', '.gitignore', 'README', 'LICENSE']);

  const vars: Record<string, string> = {
    name: answers.name,
    entryPath: answers.entryPath,
    description: answers.description,
    author: answers.author,
    permissions: JSON.stringify(answers.permissions),
    year: String(new Date().getFullYear()),
  };

  for (const [rel, srcDir] of fileMap) {
    const src = join(srcDir, rel);
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

    if (base === 'package.json') {
      content = content
        .replace(/"@songloft\/plugin-sdk":\s*"workspace:\^?"/g, `"@songloft/plugin-sdk": "${SDK_VERSION}"`)
        .replace(/"@songloft\/plugin-builder":\s*"workspace:\^?"/g, `"@songloft/plugin-builder": "${BUILDER_VERSION}"`);
    }

    writeWithDirs(dst, content);
  }

  console.log('');
  console.log(`✅ 已创建 ${answers.targetDir}`);

  if (answers.features.length > 0) {
    console.log(`   附加功能: ${answers.features.join(', ')}`);
  }

  console.log('');
  console.log('下一步：');
  console.log(`  cd ${answers.targetDir}`);
  console.log(`  ${answers.packageManager} install`);
  console.log(`  ${answers.packageManager} run build`);
  console.log('');
  console.log('构建产物位于 dist/ 目录，可在 Songloft 后台上传。');
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
