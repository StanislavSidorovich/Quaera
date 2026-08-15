// Копирует рантайм Pyodide в public/, чтобы Web Worker мог подключить его через
// importScripts — тот же приём, что и sync-sqljs.mjs, и по той же причине:
// офлайн-режим требует, чтобы всё отдавалось с собственного origin.
//
// Ядро (pyodide.js, .asm.wasm, python_stdlib.zip) идёт из node_modules/pyodide —
// npm-пакет их содержит. А pandas, numpy и их зависимости — нет: npm-пакет
// несёт только рантайм, пакеты грузятся отдельно с CDN Pyodide той же версии.
// Поэтому они не «синкаются», а один раз докачиваются и проверяются по sha256
// из pyodide-lock.json, после чего лежат в репозитории как обычный вендор-ассет
// (как public/data/quaera.dataset) — сборка их больше не трогает.
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pyodideDir = path.dirname(require.resolve('pyodide/package.json'));
const target = path.join(root, 'public', 'pyodide');

await mkdir(target, { recursive: true });

// pyodide.asm.js — CommonJS-код (там есть require()), а весь остальной проект — ESM
// ("type": "module" в package.json). Без локального package.json Node ищет ближайший
// вверх по дереву, находит корневой с "module" и падает на асинхронном коде внутри asm.js
// с ERR_AMBIGUOUS_MODULE_SYNTAX — это нужно только для scripts/verify-content.mjs,
// который грузит Pyodide в Node, но живёт в public/, а не в scripts/, из-за воркера.
await writeFile(path.join(target, 'package.json'), JSON.stringify({ type: 'commonjs' }) + '\n');

const CORE_FILES = ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
for (const file of CORE_FILES) {
  await copyFile(path.join(pyodideDir, file), path.join(target, file));
  console.log(`pyodide: ${file} -> public/pyodide/${file}`);
}

const lock = JSON.parse(await readFile(path.join(pyodideDir, 'pyodide-lock.json'), 'utf8'));
const version = lock.info.version;
const cdnBase = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;

// pandas тянет numpy/python-dateutil/pytz/six транзитивно; sqlite3 нужен отдельно,
// чтобы читать тот же quaera.dataset, которым уже пользуется SQL-трек.
const PACKAGES = ['pandas', 'numpy', 'python-dateutil', 'pytz', 'six', 'sqlite3'];

for (const name of PACKAGES) {
  const meta = lock.packages[name];
  if (!meta) throw new Error(`pyodide-lock.json не знает пакет ${name} — проверьте версию Pyodide`);
  const dest = path.join(target, meta.file_name);

  let cached = false;
  try {
    await stat(dest);
    cached = true;
  } catch {
    // файла нет — качаем
  }
  if (cached) {
    const buf = await readFile(dest);
    if (createHash('sha256').update(buf).digest('hex') === meta.sha256) {
      console.log(`pyodide: ${meta.file_name} уже на месте, sha256 совпал`);
      continue;
    }
    console.log(`pyodide: ${meta.file_name} на месте, но sha256 разошёлся — перекачиваю`);
  }

  const res = await fetch(cdnBase + meta.file_name);
  if (!res.ok) throw new Error(`Не удалось скачать ${meta.file_name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = createHash('sha256').update(buf).digest('hex');
  if (actual !== meta.sha256) {
    throw new Error(`${meta.file_name}: sha256 не совпал с pyodide-lock.json (ожидали ${meta.sha256}, получили ${actual})`);
  }
  await writeFile(dest, buf);
  console.log(`pyodide: ${meta.file_name} скачан и проверен (${(buf.length / 1e6).toFixed(2)} МБ)`);
}
