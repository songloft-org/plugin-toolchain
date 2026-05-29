// @songloft/plugin-builder — manifest 校验模块

import type { PluginManifest } from '@songloft/plugin-sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ManifestValidationError {
  field: string;
  message: string;
}

const ENTRY_PATH_REGEX = /^[a-z][a-z0-9-]*$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+/;
// 权限白名单，需与后端 internal/jsplugin/permissions.go 的 AllPermissions 保持一致。
// songs.* / playlists.* 为声明层的通配符糖（一把梭）。
const VALID_PERMISSIONS = [
  'storage',
  'songs.read',
  'songs.write',
  'songs.*',
  'playlists.read',
  'playlists.write',
  'playlists.*',
  'inter-plugin',
  'command',
  'jsenv',
];

/**
 * 从 cwd 读取 plugin.json
 */
export function readManifest(cwd: string): PluginManifest {
  const raw = readFileSync(join(cwd, 'plugin.json'), 'utf-8');
  return JSON.parse(raw) as PluginManifest;
}

/**
 * 校验 plugin.json 字段
 */
export function validateManifest(m: PluginManifest): ManifestValidationError[] {
  const errors: ManifestValidationError[] = [];

  if (!m.name || m.name.length < 2 || m.name.length > 50) {
    errors.push({ field: 'name', message: 'name must be 2-50 characters' });
  }
  if (!m.version || !SEMVER_REGEX.test(m.version)) {
    errors.push({ field: 'version', message: 'version must be valid semver (x.y.z)' });
  }
  if (!m.entryPath || !ENTRY_PATH_REGEX.test(m.entryPath)) {
    errors.push({ field: 'entryPath', message: 'entryPath must be lowercase kebab-case starting with a letter' });
  }
  if (!m.main || (!m.main.endsWith('.js') && !m.main.endsWith('.jsc'))) {
    errors.push({ field: 'main', message: 'main must end with .js or .jsc' });
  }
  if (!Array.isArray(m.permissions)) {
    errors.push({ field: 'permissions', message: 'permissions must be an array' });
  } else {
    for (const perm of m.permissions) {
      if (!VALID_PERMISSIONS.includes(perm)) {
        errors.push({ field: 'permissions', message: `unknown permission: ${perm}` });
      }
    }
  }

  return errors;
}
