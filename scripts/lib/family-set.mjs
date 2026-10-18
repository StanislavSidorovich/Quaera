/**
 * Общий код набора family/: состав файлов, хеши, блок данных переключателя.
 * Его читают scripts/family-sync.mjs и scripts/test-family.mjs, чтобы состав
 * и способ хеширования не разошлись между копированием и проверкой.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const BEGIN = '/* @family-data:begin */';
export const END = '/* @family-data:end */';
const TEXT = new Set(['.css', '.js', '.json', '.svg', '.txt', '.html']);

/** Файлы набора относительно family/, без MANIFEST.json и без demo.html (образец не копируется). */
export function listSetFiles(dir) {
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (r !== 'MANIFEST.json' && r !== 'demo.html') out.push(r);
    }
  };
  walk('');
  return out.sort();
}

/** sha256; у текстовых файлов CRLF приводится к LF, иначе autocrlf в Windows меняет хеш. */
export function hashFile(file) {
  let buf = readFileSync(file);
  if (TEXT.has(path.extname(file))) buf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  return createHash('sha256').update(buf).digest('hex');
}

/** Блок данных переключателя: family.json плюс svg из marks/. */
export function buildDataBlock(dir) {
  const fam = JSON.parse(readFileSync(path.join(dir, 'family.json'), 'utf8'));
  const apps = fam.apps.map((a) => ({
    ...a,
    svg: readFileSync(path.join(dir, 'marks', `${a.id}.svg`), 'utf8').trim(),
  }));
  return `${BEGIN}\n  const APPS = ${JSON.stringify(apps, null, 2).replace(/\n/g, '\n  ')};\n  ${END}`;
}

export function currentDataBlock(src) {
  const a = src.indexOf(BEGIN);
  const b = src.indexOf(END);
  return a < 0 || b < 0 ? null : src.slice(a, b + END.length);
}

export function buildManifest(dir) {
  const fam = JSON.parse(readFileSync(path.join(dir, 'family.json'), 'utf8'));
  const files = {};
  for (const f of listSetFiles(dir)) files[f] = hashFile(path.join(dir, f));
  return { version: fam.version, files };
}
