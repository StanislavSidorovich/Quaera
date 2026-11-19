/**
 * Гейт «голых» операторов в прозе.
 *
 * Хозяин: «чтобы глаз цеплялся за то, чему учим сейчас». Операторы сравнения и логики
 * (`>`, `>=`, `<`, `<=`, `=`, `==`, `<>`, `!=`, AND, OR, NOT, IN, BETWEEN, LIKE), стоящие
 * в предложении голым текстом, теряются среди слов. В прозе они берутся в одинарные
 * обратные кавычки (плашка кода, src/ui/ProseOps.tsx); оператор, стоящий один,
 * при первом появлении на экране получает рядом смысл словами (src/content/proseOps.ts).
 *
 * **Что проверяется.** Проза сюжета (ru и en): реплики брифа и беседы, подводки шагов,
 * реплика после задания, рефлексия, зацепка. Проза паков (ru и en): `brief`, `goal`,
 * `hints` задания и его шагов, `goal` шага. Всё это рендерится через разметку кода.
 * Не проверяется: `explain`, карточки приёмов (`*-lessons.json`), `found` дня: там
 * разметка кода не подключена, и обратные кавычки показались бы как есть.
 *
 * **Правило ловли** (bareOperators в proseOps.ts): заглавные AND, OR, NOT, IN, BETWEEN,
 * LIKE отдельным словом (английские and, or, in строчными не трогаем); символы `>`, `>=`,
 * `<`, `<=`, `<>`, `!=`, `==`; знак `=` только с пробелами с обеих сторон и только рядом
 * с кодоподобным словом (имя с `_`, число, кавычка, скобка): «колонка = значение», но не
 * «Штуки = число точек», и не именованный аргумент `on='k'`. Стрелки `->`, `=>`, `→`
 * не операторы. Тройная ограда и однострочный код в обратных кавычках вырезаются.
 *
 * **Должен уметь падать:** `node scripts/test-bare-operators.mjs --self` подкладывает
 * голую строку и требует, чтобы проверка её нашла (запускается и в обычном прогоне).
 *
 * Запуск: npm run test:bare-operators (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera-bare-ops-'));
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
  if (!ok) {
    failed++;
    if (detail) console.log('       ' + detail);
  }
}

try {
  execSync(
    `npx tsc "${path.join(root, 'src/content/storymode.ts')}" "${path.join(root, 'src/content/proseOps.ts')}" ` +
      `--target ES2020 --module ES2020 --moduleResolution bundler ` +
      `--jsx react-jsx --rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  const { storyCampaign } = await import(pathToFileURL(path.join(outDir, 'content', 'storymode.js')).href);
  const { bareOperators, OP_MEANINGS, splitCodeByOps, chipOperators } = await import(pathToFileURL(path.join(outDir, 'content', 'proseOps.js')).href);

  /* Сама проверка обязана падать на голой строке и молчать на размеченной. */
  const bad = [
    'Строго больше — это > и ничего другого.',
    'Список проверяет IN, а не цепочка OR.',
    'Условие: WHERE list_price > 100.',
    'Equality: distributor_id = 1 picks one distributor.',
    'Not equal is <> in SQL.',
    'В pandas равенство пишут ==, а не =.',
  ];
  const good = [
    'Строго больше — это `>` и ничего другого.',
    'Список проверяет `IN`, а не цепочка `OR`.',
    'Условие: `WHERE list_price > 100`.',
    'Пример:\n\n```\nWHERE a > 1 AND b IN (2)\n```\n\nи дальше без операторов.',
    'Units = number of outlets × sales per outlet; in the end, one or two.',
    'Стрелка -> и → не оператор; as_index=False и on=\'k\' тоже нет.',
    'Каждый шаг: A → B => C.',
  ];
  check('самопроверка: голые строки ловятся', bad.every((s) => bareOperators(s).length > 0), bad.filter((s) => bareOperators(s).length === 0).join(' | '));
  check('самопроверка: размеченные строки проходят', good.every((s) => bareOperators(s).length === 0), good.filter((s) => bareOperators(s).length > 0).map((s) => `${s} -> ${bareOperators(s)}`).join(' | '));
  /* Фаза 2: оператор из прозы подсвечивается в коде, соседи по тексту нет. */
  const parts = splitCodeByOps('WHERE price >= 100 AND brand IN (1)', chipOperators(['Знак `>=` и `AND`, а `IN` не называем.']).filter((o) => o !== 'IN'));
  check(
    'подсветка в коде: только названные операторы',
    parts.filter((p) => p.op).map((p) => p.text).join('|') === '>=|AND' && parts.map((p) => p.text).join('') === 'WHERE price >= 100 AND brand IN (1)'
  );
  const MEANING_KEYS = ['>', '>=', '<', '<=', '=', '==', '<>', '!=', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE'];
  check(
    'словарь смыслов: все операторы, ru и en непустые',
    MEANING_KEYS.every((k) => OP_MEANINGS[k]?.ru && OP_MEANINGS[k]?.en),
    MEANING_KEYS.filter((k) => !(OP_MEANINGS[k]?.ru && OP_MEANINGS[k]?.en)).join(', ')
  );

  /* Проза сюжета. */
  for (const locale of ['ru', 'en']) {
    const campaign = storyCampaign(locale);
    const hits = [];
    const scan = (where, text) => {
      const ops = bareOperators(text);
      if (ops.length) hits.push(`${where}: [${ops.join(' ')}] ${text.replace(/\n/g, ' ').slice(0, 90)}`);
    };
    for (const m of campaign.missions) {
      m.messages.forEach((x, i) => scan(`${m.id}/бриф ${i + 1}`, x.text));
      (m.reflection ?? []).forEach((x, i) => scan(`${m.id}/рефлексия ${i + 1}`, x));
      (m.hook ?? []).forEach((x, i) => scan(`${m.id}/зацепка ${i + 1}`, x));
      m.steps.forEach((s, si) => {
        (s.intro?.paras ?? []).forEach((x, i) => scan(`${m.id}/шаг ${si + 1} подводка ${i + 1}`, x));
        if (s.after) scan(`${m.id}/шаг ${si + 1} реплика после`, s.after.text);
        (s.interlude?.messages ?? []).forEach((x, i) => scan(`${m.id}/шаг ${si + 1} беседа ${i + 1}`, x.text));
      });
    }
    check(`${locale}: проза сюжета без голых операторов`, hits.length === 0, `${hits.length} мест:\n        ` + hits.join('\n        '));
  }

  /* Проза паков. */
  const dir = path.join(root, 'src/content/packs');
  const packHits = [];
  let scanned = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.includes('-lessons'))) {
    const pack = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    const scan = (where, text) => {
      if (typeof text !== 'string') return;
      scanned++;
      const ops = bareOperators(text);
      if (ops.length) packHits.push(`${f} ${where}: [${ops.join(' ')}] ${text.replace(/\n/g, ' ').slice(0, 90)}`);
    };
    for (const t of pack.tasks ?? []) {
      scan(`${t.id}/brief`, t.brief);
      scan(`${t.id}/goal`, t.goal);
      (t.hints ?? []).forEach((h, i) => scan(`${t.id}/hint ${i + 1}`, h));
      (t.steps ?? []).forEach((s, si) => {
        scan(`${t.id}/шаг ${si + 1} goal`, s.goal);
        (s.hints ?? []).forEach((h, i) => scan(`${t.id}/шаг ${si + 1} hint ${i + 1}`, h));
      });
    }
  }
  check(`паки (brief, goal, hints; проверено строк: ${scanned}) без голых операторов`, packHits.length === 0, `${packHits.length} мест:\n        ` + packHits.join('\n        '));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${failed} проверок упало.`);
  process.exit(1);
}
console.log('\nВсе проверки пройдены.');
