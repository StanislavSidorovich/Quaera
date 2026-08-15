/**
 * Достраивает service worker после сборки.
 *
 * Имена бандлов содержат хеш и заранее неизвестны, поэтому список ассетов
 * для предзагрузки подставляется здесь. Без этого при первом визите бандлы
 * не попадают в кеш: браузер запрашивает их раньше, чем service worker
 * успевает взять страницу под контроль, и офлайн начинает работать только
 * со второго запуска.
 *
 * Заодно проставляется идентификатор сборки — по нему при активации
 * удаляются кеши предыдущих версий.
 *
 * Запускается автоматически из npm run build.
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const swPath = path.join(dist, 'sw.js');

/** Рекурсивный обход: пути нужны ровно в том виде, в каком их запросит браузер. */
async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = `${base}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

const all = await walk(dist);

// Датасет намеренно не предзагружаем: он весит 3.5 МБ, и приложение всё равно
// запрашивает его при старте. Достаточно, чтобы этот запрос прошёл через
// service worker — за это отвечает ожидание готовности в main.tsx.
const assets = all.filter(
  (p) => (p.startsWith('/assets/') || p.startsWith('/icons/')) && !p.endsWith('.map')
);

const buildId = `v${Date.now().toString(36)}`;

/**
 * Версия Pyodide — из его собственного lock-файла, а не из версии сборки.
 *
 * Кеш рантайма (51 МБ) намеренно переживает деплои: иначе каждая новая сборка
 * заставляла бы человека, уже согласившегося на загрузку, качать всё заново
 * (см. VENDOR в public/sw.js). Сбрасывать этот кеш должно ровно одно событие —
 * смена самой версии Pyodide, потому что пути внутри /pyodide/ при этом
 * не меняются и содержимое иначе осталось бы старым навсегда.
 */
const pyodideLock = JSON.parse(await readFile(path.join(dist, 'pyodide', 'pyodide-lock.json'), 'utf8'));
const vendorId = pyodideLock.info?.version;
if (!vendorId) throw new Error('В dist/pyodide/pyodide-lock.json нет info.version — проверьте npm run sync:pyodide');

let sw = await readFile(swPath, 'utf8');

if (!sw.includes('__BUILD_ASSETS__') || !sw.includes('__BUILD_ID__') || !sw.includes('__VENDOR_ID__')) {
  throw new Error('В dist/sw.js нет плейсхолдеров — проверьте public/sw.js');
}

sw = sw
  .replace('/* __BUILD_ASSETS__ */', assets.map((a) => JSON.stringify(a)).join(', '))
  .replace('__BUILD_ID__', buildId)
  // Глобально: плейсхолдер стоит дважды — у текущего имени кеша и у прежнего,
  // из которого рантайм переносится после переименования (LEGACY_VENDOR в sw.js).
  .replaceAll('__VENDOR_ID__', vendorId);

await writeFile(swPath, sw, 'utf8');

const { size } = await stat(path.join(dist, 'data', 'quaera.dataset'));
console.log(`sw: сборка ${buildId}, в предзагрузке ${assets.length} файлов`);
console.log(`sw: рантайм Python кешируется отдельно от сборки — quaera-pyodide-${vendorId}`);
console.log(`sw: датасет ${(size / 1024 / 1024).toFixed(2)} МБ кешируется при первом запросе`);
