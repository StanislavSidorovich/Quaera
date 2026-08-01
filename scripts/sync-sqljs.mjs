// Копирует рантайм sql.js в public/, чтобы Web Worker мог подключить его через importScripts.
// Классический воркер + importScripts — самый надёжный способ поднять SQLite WASM
// одинаково в dev, в проде и офлайн, без завязки на конкретный бандлер.
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.dirname(require.resolve('sql.js'));
const target = path.join(root, 'public', 'sqljs');

await mkdir(target, { recursive: true });
for (const file of ['sql-wasm.js', 'sql-wasm.wasm']) {
  await copyFile(path.join(dist, file), path.join(target, file));
  console.log(`sqljs: ${file} -> public/sqljs/${file}`);
}
