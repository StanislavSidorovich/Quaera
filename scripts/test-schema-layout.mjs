/**
 * Тесты раскладки схемы данных — картинки, на которой видно, кто факт,
 * кто справочник и куда идёт стрелка.
 *
 * Зачем гейт на то, что и так видно глазом: видно только то, что схема
 * нарисована. Нарисованная не по тем связям выглядит ровно так же
 * убедительно — узлы на местах, стрелки красивые, — и отличить её от
 * честной, не сверяя каждую стрелку с внешними ключами руками, нельзя.
 * Это тот же класс дефекта, что закрывает test-chart-spec: ошибку
 * в рисовании видно за секунду, ошибку в утверждении о данных — никогда.
 *
 * Поэтому здесь сверяются два независимых источника: множество рёбер
 * раскладки против графа внешних ключей, прочитанного прямо из
 * `public/data/schema.json` этим файлом заново. Тот же приём, что
 * у verify-dataset (вывод по связям против префикса имени): два способа
 * получить один ответ обязаны сойтись.
 *
 * Запуск: npm run test:schema-layout (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'querium-schema-layout-'));

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name) => console.log(` ok    ${name}`);
const assertTrue = (name, cond, detail = '') => {
  if (!cond) fail(name, detail || 'условие ложно');
  else ok(name);
};
const assertEq = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(name, `ожидалось ${e}, получено ${a}`);
  else ok(name);
};

try {
  execSync(
    `npx tsc "${path.join(root, 'src/ui/schemaLayout.ts')}" ` +
      `--target ES2020 --module ES2020 --moduleResolution bundler ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  /*
   * tsc оставляет импорты без расширения (moduleResolution bundler — так
   * же, как их видит Vite), а node их не резолвит. Дописываем `.js`
   * в собранных файлах, а не в исходнике: расширение в импорте посреди
   * кода приложения выглядело бы как случайность и жило бы там ради
   * одного этого гейта. Отличие от test-chart-spec, где такого нет:
   * chartSpec ничего не импортирует в рантайме, а раскладка обязана
   * звать тот же groupTables, что и экран, — иначе гейт проверял бы
   * копию правила, а не правило.
   */
  const addJsExtension = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) addJsExtension(full);
      else if (entry.name.endsWith('.js')) {
        const src = readFileSync(full, 'utf8').replace(
          /(from\s+['"])(\.[^'"]*?)(['"])/g,
          (m, a, spec, b) => (path.extname(spec) ? m : `${a}${spec}.js${b}`)
        );
        writeFileSync(full, src);
      }
    }
  };
  addJsExtension(outDir);

  const { buildSchemaLayout, LAYOUT } = await import(
    pathToFileURL(path.join(outDir, 'ui', 'schemaLayout.js')).href
  );

  const doc = JSON.parse(readFileSync(path.join(root, 'public/data/schema.json'), 'utf8'));
  const layout = buildSchemaLayout(doc);

  /* --- граф связей, прочитанный независимо от раскладки --- */
  const fk = []; // [from, to] без ссылок на саму себя
  const selfRefs = new Set();
  const referencedBy = new Map();
  for (const table of doc.tables) {
    const seen = new Set();
    for (const column of table.columns) {
      const target = column.references?.table;
      if (!target) continue;
      if (target === table.table) {
        selfRefs.add(table.table);
        continue;
      }
      if (seen.has(target)) continue;
      seen.add(target);
      fk.push([table.table, target]);
      if (!referencedBy.has(target)) referencedBy.set(target, new Set());
      referencedBy.get(target).add(table.table);
    }
  }
  const groupOf = (table) => {
    const incoming = referencedBy.get(table)?.size ?? 0;
    if (incoming) return 'dimension';
    return fk.some(([from]) => from === table) ? 'fact' : 'standalone';
  };

  const byTable = new Map(layout.nodes.map((n) => [n.table, n]));

  /* --- 1. Все таблицы на схеме, по одному разу --- */
  assertEq(
    'каждая таблица нарисована ровно один раз',
    layout.nodes.map((n) => n.table).sort(),
    doc.tables.map((t) => t.table).sort()
  );

  /* --- 2. Группа узла совпадает с выводом по связям --- */
  const wrongGroup = layout.nodes.filter((n) => n.group !== groupOf(n.table));
  assertTrue(
    'группа узла выведена из связей, а не из имени',
    wrongGroup.length === 0,
    wrongGroup.map((n) => `${n.table}: нарисован как ${n.group}, по связям ${groupOf(n.table)}`).join('; ')
  );

  /* --- 3. Рёбра — ровно граф внешних ключей, ни больше, ни меньше --- */
  const drawn = layout.edges.map((e) => `${e.from}->${e.to}`).sort();
  const expected = fk.map(([from, to]) => `${from}->${to}`).sort();
  assertEq('нарисованы ровно те связи, что есть в схеме', drawn, expected);

  /* --- 4. Вид стрелки выводится из групп её концов --- */
  const wrongKind = layout.edges.filter((e) => {
    const kind = groupOf(e.from) === 'dimension' ? 'snowflake' : 'star';
    return e.kind !== kind;
  });
  assertTrue(
    'связь справочник→справочник помечена снежинкой, факт→справочник звездой',
    wrongKind.length === 0,
    wrongKind.map((e) => `${e.from}->${e.to}: ${e.kind}`).join('; ')
  );

  /* --- 5. Ссылка на саму себя показана значком и не сделала таблицу справочником --- */
  assertEq(
    'значок «ссылается на саму себя» стоит там и только там, где такая ссылка есть',
    layout.nodes.filter((n) => n.selfRef).map((n) => n.table).sort(),
    [...selfRefs].sort()
  );

  /* --- 6. Сырой слой не связан ничем --- */
  const standalone = layout.nodes.filter((n) => n.group === 'standalone').map((n) => n.table);
  const standaloneEdges = layout.edges.filter(
    (e) => standalone.includes(e.from) || standalone.includes(e.to)
  );
  assertTrue(
    'у сырого слоя нет ни одной связи',
    standaloneEdges.length === 0,
    standaloneEdges.map((e) => `${e.from}->${e.to}`).join('; ')
  );

  /* --- 7. Узлы не накладываются друг на друга --- */
  const overlaps = [];
  for (let i = 0; i < layout.nodes.length; i++) {
    for (let j = i + 1; j < layout.nodes.length; j++) {
      const a = layout.nodes[i];
      const b = layout.nodes[j];
      const apart =
        a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      if (!apart) overlaps.push(`${a.table} × ${b.table}`);
    }
  }
  assertTrue('узлы не накладываются', overlaps.length === 0, overlaps.join('; '));

  /* --- 8. Ничего не вылезло за холст --- */
  const outside = layout.nodes.filter(
    (n) => n.x < 0 || n.y < 0 || n.x + n.w > layout.width + 0.5 || n.y + n.h > layout.height + 0.5
  );
  assertTrue(
    'все узлы внутри объявленных размеров',
    outside.length === 0,
    outside.map((n) => `${n.table} @ ${n.x},${n.y}`).join('; ')
  );

  /* --- 9. Колонки: факты левее справочников, ни одного смешения --- */
  const factXs = new Set(layout.nodes.filter((n) => n.group === 'fact').map((n) => n.x));
  const dimXs = new Set(layout.nodes.filter((n) => n.group === 'dimension').map((n) => n.x));
  assertTrue(
    'факты стоят одной колонкой, справочники другой',
    factXs.size === 1 && dimXs.size === 1,
    `x фактов: ${[...factXs]}, x справочников: ${[...dimXs]}`
  );
  assertTrue(
    'колонка фактов левее колонки справочников',
    [...factXs][0] < [...dimXs][0],
    `${[...factXs][0]} против ${[...dimXs][0]}`
  );
  assertTrue(
    'между колонками остался зазор под стрелки',
    [...dimXs][0] - ([...factXs][0] + Math.max(...layout.nodes.filter((n) => n.group === 'fact').map((n) => n.w))) >= LAYOUT.colGap - 0.5,
    'колонки сошлись ближе, чем на colGap'
  );

  /* --- 10. Раскладка детерминирована: та же схема — та же картинка --- */
  assertEq(
    'повторный расчёт даёт ту же раскладку',
    buildSchemaLayout(doc),
    layout
  );

  /* --- 11. Ни одна связь не проходит сквозь чужой узел --- */
  /*
   * Замер, родившийся в браузере (getPointAtLength по каждому пути против
   * прямоугольников узлов) и перенесённый сюда: линия, прошедшая через
   * таблицу, читается как связь с ней, и на картинке это неотличимо от
   * настоящей стрелки. Здесь та же проверка без DOM — путь всегда одна
   * кубическая кривая известного вида, её достаточно разобрать регуляркой
   * и просэмплировать.
   */
  const cubic = (p0, p1, p2, p3, s) => {
    const u = 1 - s;
    return u * u * u * p0 + 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s * p3;
  };
  const through = [];
  for (const edge of layout.edges) {
    const m = edge.path.match(
      /^M (-?[\d.]+) (-?[\d.]+) C (-?[\d.]+) (-?[\d.]+), (-?[\d.]+) (-?[\d.]+), (-?[\d.]+) (-?[\d.]+)$/
    );
    if (!m) {
      through.push(`${edge.from}->${edge.to}: путь не разобран (${edge.path})`);
      continue;
    }
    const [x0, y0, x1, y1, x2, y2, x3, y3] = m.slice(1).map(Number);
    for (let i = 1; i < 40; i++) {
      const s = i / 40;
      const px = cubic(x0, x1, x2, x3, s);
      const py = cubic(y0, y1, y2, y3, s);
      for (const n of layout.nodes) {
        if (n.table === edge.from || n.table === edge.to) continue;
        if (px > n.x + 1 && px < n.x + n.w - 1 && py > n.y + 1 && py < n.y + n.h - 1) {
          through.push(`${edge.from}->${edge.to} проходит сквозь ${n.table}`);
        }
      }
    }
  }
  assertTrue(
    'связи не проходят сквозь чужие таблицы',
    through.length === 0,
    [...new Set(through)].join('; ')
  );

  /* --- 12. Каждый конец каждой стрелки — существующий узел --- */
  const dangling = layout.edges.filter((e) => !byTable.has(e.from) || !byTable.has(e.to));
  assertTrue(
    'у стрелок нет висящих концов',
    dangling.length === 0,
    dangling.map((e) => `${e.from}->${e.to}`).join('; ')
  );

  console.log('');
  console.log(
    `Схема: ${layout.nodes.length} таблиц, ${layout.edges.length} связей ` +
      `(${layout.edges.filter((e) => e.kind === 'star').length} звезда, ` +
      `${layout.edges.filter((e) => e.kind === 'snowflake').length} снежинка), ` +
      `холст ${layout.width}×${layout.height}.`
  );
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failed) {
  console.log('');
  console.log(`Провалено проверок: ${failed}`);
  process.exit(1);
}
console.log('Все проверки раскладки схемы пройдены.');
