// @songloft/plugin-builder — public API
export { buildPlugin, validatePlugin } from './build.js';
export type { BuildOptions, BuildResult, ValidationResult } from './build.js';
export { computeEntryHash, computeCanonicalZipHash, sha256Hex } from './hash.js';
export { readManifest, validateManifest } from './manifest.js';
export type { ManifestValidationError } from './manifest.js';
