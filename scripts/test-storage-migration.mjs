/**
 * Гейт переезда ключей localStorage (`src/migrateStorage.ts`).
 *
 * Поломка здесь — ровно тот класс, что и у слияния прогресса: молчаливый.
 * Приложение откроется, ничего не упадёт, просто у человека, занимавшегося
 * до переименования, будет пустой прогресс, сброшенная серия и заново
 * запрошенное согласие на 52 МБ рантайма. Увидеть это можно только на
 * устройстве со старыми данными — то есть не у себя, а у пользователя.
 *
 * Проверяются свойства, а не один сценарий: перенос, идемпотентность,
 * приоритет уже существующего нового ключа, отказ записи и то, что в коде
 * не осталось ключа со старым именем.
 *
 * Запуск: npm run test:storage-migration (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera-storage-migration-'));

const failures = [];
const check = (ok, what) => {
  if (!ok) failures.push(what);
};

/** Хранилище в памяти; `failOn` заставляет setItem отказать на заданном ключе (квота). */
function fakeStore(initial = {}, failOn = null) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (k === failOn) throw new Error('QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem: (k) => void map.delete(k),
    snapshot: () => Object.fromEntries([...map.entries()].sort()),
  };
}

try {
  execSync(
    `npx tsc "${path.join(root, 'src/migrateStorage.ts')}" ` +
      `--target ES2020 --module CommonJS --moduleResolution node ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}');

  const { migrateStorageKeys, STORAGE_RENAMES } = await import(
    pathToFileURL(path.join(outDir, 'migrateStorage.js')).href
  );

  // --- список пар ---
  check(STORAGE_RENAMES.length > 0, 'список переименований пуст');
  const olds = STORAGE_RENAMES.map(([o]) => o);
  const news = STORAGE_RENAMES.map(([, n]) => n);
  check(new Set(olds).size === olds.length, 'старый ключ встречается в списке дважды');
  check(new Set(news).size === news.length, 'новый ключ встречается в списке дважды');
  for (const [oldKey, newKey] of STORAGE_RENAMES) {
    check(oldKey.startsWith('querium'), `слева не старое имя: ${oldKey}`);
    check(newKey === oldKey.replace(/^querium/, 'quaera'), `пара не совпадает по хвосту: ${oldKey} → ${newKey}`);
  }

  // --- перенос ---
  {
    const store = fakeStore(Object.fromEntries(olds.map((k, i) => [k, `значение-${i}`])));
    const moved = migrateStorageKeys(store);
    check(moved.length === olds.length, `перенесено ${moved.length} из ${olds.length}`);
    for (const [i, [oldKey, newKey]] of STORAGE_RENAMES.entries()) {
      check(store.getItem(newKey) === `значение-${i}`, `не перенеслось значение ${oldKey}`);
      check(store.getItem(oldKey) === null, `старый ключ остался: ${oldKey}`);
    }
  }

  // --- идемпотентность ---
  {
    const store = fakeStore(Object.fromEntries(olds.map((k, i) => [k, `значение-${i}`])));
    migrateStorageKeys(store);
    const after = store.snapshot();
    const moved = migrateStorageKeys(store);
    check(moved.length === 0, 'второй прогон что-то перенёс');
    check(JSON.stringify(store.snapshot()) === JSON.stringify(after), 'второй прогон изменил хранилище');
  }

  // --- отсутствующий старый ключ не создаёт пустого нового ---
  {
    const store = fakeStore({});
    migrateStorageKeys(store);
    check(store.map.size === 0, 'перенос создал ключи на пустом хранилище');
  }

  // --- новый ключ уже есть: он свежее, перезаписывать нельзя ---
  {
    const [oldKey, newKey] = STORAGE_RENAMES[0];
    const store = fakeStore({ [oldKey]: 'старое', [newKey]: 'новое' });
    migrateStorageKeys(store);
    check(store.getItem(newKey) === 'новое', 'существующий новый ключ затёрт старым значением');
    check(store.getItem(oldKey) === null, 'старый ключ не убран, хотя новый уже был');
  }

  // --- отказ записи: старый ключ обязан уцелеть, соседи — переехать ---
  {
    const [firstOld, firstNew] = STORAGE_RENAMES[0];
    const [secondOld, secondNew] = STORAGE_RENAMES[1];
    const store = fakeStore({ [firstOld]: 'а', [secondOld]: 'б' }, firstNew);
    migrateStorageKeys(store);
    check(store.getItem(firstOld) === 'а', 'при отказе записи старый ключ удалён — данные потеряны');
    check(store.getItem(firstNew) === null, 'при отказе записи новый ключ всё-таки появился');
    check(store.getItem(secondNew) === 'б', 'отказ на одном ключе остановил перенос остальных');
  }

  // --- в коде не осталось ключа со старым именем ---
  {
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p) && !p.endsWith('migrateStorage.ts')) files.push(p);
      }
    };
    walk(path.join(root, 'src'));
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/const\s+[A-Za-z_]*KEY[A-Za-z_]*\s*=\s*'([^']+)'/g)) {
        check(
          !m[1].startsWith('querium'),
          `${path.relative(root, file)}: ключ ${m[1]} остался со старым именем`
        );
      }
    }
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error('Перенос хранилища сломан:\n' + failures.map((f) => `  — ${f}`).join('\n'));
  process.exit(1);
}
console.log('storage-migration: перенос ключей querium-* → quaera-* проверен по шести свойствам');
