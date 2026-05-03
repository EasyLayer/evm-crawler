import { defineConfig } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import alias from '@rollup/plugin-alias';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const findNodeModules = (...pkg) => {
  const local = resolve(__dirname, 'node_modules', ...pkg);
  const hoisted = resolve(__dirname, '..', 'node_modules', ...pkg);
  return existsSync(local) ? local : hoisted;
};

const nodeShimsPlugin = {
  name: 'node-shims',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'perf_hooks') return '\0shim:perf_hooks';
    if (id === 'crypto') return '\0shim:crypto';
    if (id === 'os') return '\0shim:os';
    if (id === 'tty') return '\0shim:tty';
    if (id === 'readline') return '\0shim:readline';
  },
  load(id) {
    if (id === '\0shim:perf_hooks') return `export const performance = globalThis.performance; export const PerformanceObserver = globalThis.PerformanceObserver ?? null;`;
    if (id === '\0shim:crypto') return `
      export function createHash() { return { _data: '', update(data) { this._data += String(data); return this; }, digest(encoding) { let hash = 2166136261; for (let i = 0; i < this._data.length; i++) { hash ^= this._data.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; } const hex = hash.toString(16).padStart(8, '0'); if (encoding === 'base64') return btoa(hex); return hex; } }; }
      export function randomBytes(size) { const arr = new Uint8Array(size); globalThis.crypto.getRandomValues(arr); return arr; }
      export const webcrypto = globalThis.crypto;
      export default { createHash, randomBytes, webcrypto };
    `;
    if (id === '\0shim:os') return `export const platform = () => 'browser'; export const EOL = '\n'; export default { platform, EOL };`;
    if (id === '\0shim:tty') return `export const isatty = () => false; export default { isatty };`;
    if (id === '\0shim:readline') return `export default {}; export const createInterface = () => ({});`;
  },
};

export default defineConfig({
  input: './dist/esm/browser/index.js',
  output: {
    file: './dist/browser/index.js',
    format: 'es',
    sourcemap: false,
    inlineDynamicImports: true,
    banner: `import { Buffer as __Buffer__ } from 'buffer';`,
    intro: `
if (!globalThis.Buffer) globalThis.Buffer = __Buffer__;
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis.self;
if (!globalThis.process) globalThis.process = {};
if (!globalThis.process.env) globalThis.process.env = { NODE_ENV: 'production' };
if (!globalThis.process.version) globalThis.process.version = 'v18.0.0';
if (!globalThis.process.browser) globalThis.process.browser = true;
if (!globalThis.process.stdout) globalThis.process.stdout = { write: (s) => console.log(s) };
if (!globalThis.process.stderr) globalThis.process.stderr = { write: (s) => console.error(s) };
if (!globalThis.process.nextTick) globalThis.process.nextTick = (fn, ...args) => queueMicrotask(() => fn(...args));
    `.trim(),
  },
  external(id) {
    if (id === 'electron' || /[/\\]node_modules[/\\]electron[/\\]/.test(id)) return true;
    if (id === '@sqlite.org/sqlite-wasm' || id.includes('sqlite3-worker')) return true;
    const nodeOnly = ['better-sqlite3', 'sqlite3', 'pg', 'pg-native', 'pg-query-stream', 'react-native-sqlite-storage', 'async_hooks', 'fs', 'path', 'stream'];
    return nodeOnly.some((pkg) => id === pkg || id.startsWith(pkg + '/'));
  },
  onwarn(warning, warn) { if (warning.code === 'THIS_IS_UNDEFINED' || warning.code === 'CIRCULAR_DEPENDENCY') return; warn(warning); },
  plugins: [
    nodeShimsPlugin,
    alias({
      entries: [
        { find: 'typeorm', replacement: 'typeorm/browser' },
        { find: /^@easylayer\/common\/(.+)$/, replacement: (_, sub) => findNodeModules('@easylayer', 'common', sub, 'dist', 'esm', 'browser', 'index.js') },
        { find: '@easylayer/evm', replacement: findNodeModules('@easylayer', 'evm', 'dist', 'esm', 'browser', 'index.js') },
        { find: '@easylayer/transport-sdk', replacement: findNodeModules('@easylayer', 'transport-sdk', 'dist', 'esm', 'browser', 'index.js') },
      ],
    }),
    json(),
    commonjs({ transformMixedEsModules: true, ignore: ['electron'] }),
    nodeResolve({ browser: true, exportConditions: ['browser', 'module', 'default'], preferBuiltins: false }),
  ],
});
