/* eslint-disable no-restricted-globals */
/**
 * Воркер SQLite.
 *
 * Работает в отдельном потоке: на телефоне агрегация по 118 тысячам строк
 * занимает десятки миллисекунд, но если делать её в главном потоке,
 * подвисает ввод и анимации.
 *
 * Классический воркер + importScripts выбран сознательно: sql.js — UMD-модуль,
 * и такой способ подключения одинаково работает в dev, в проде и офлайн,
 * без зависимости от того, как бандлер обрабатывает воркеры.
 *
 * Сверка ответа с эталоном тоже происходит здесь: эталонный запрос может вернуть
 * десятки тысяч строк, и гонять их в главный поток ради сравнения бессмысленно.
 */

importScripts('/sqljs/sql-wasm.js');
importScripts('/grade-lib.js');

/**
 * Отказ, о котором воркер сообщает кодом, а не фразой.
 *
 * Воркер лежит вне бандла и локали не знает — а его текст доезжает до экрана
 * как есть: пока здесь стояли русские фразы, английский интерфейс отвечал
 * «Здесь выполняются только читающие запросы». Формат и список кодов —
 * WORKER_CODE / WorkerCode в src/engine/types.ts, фразы — в diagnoseText.ts.
 * Здесь литерал продублирован намеренно: импортировать оттуда нечего.
 */
const WORKER_ARG = String.fromCharCode(31); // U+001F, см. WORKER_ARG в src/engine/types.ts
const workerError = (code, ...args) => new Error(['__worker__:' + code, ...args].join(WORKER_ARG));

/** Сколько строк отдаём на превью. Полный результат остаётся в воркере. */
const PREVIEW_ROWS = 200;
/** Защита от запроса, который случайно свернул декартово произведение. */
const MAX_ROWS = 200000;

let db = null;

/** Убираем комментарии, чтобы проверка «только SELECT» не обходилась через `--`. */
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Разрешаем только читающие запросы. База живёт в памяти вкладки, так что
 * DROP TABLE ничего не сломал бы навсегда, но испортил бы сессию обучения
 * и сделал бы проверку заданий недетерминированной.
 */
function assertReadOnly(sql) {
  const clean = stripComments(sql).trim().replace(/;\s*$/, '');
  if (!clean) throw workerError('emptyQuery');
  if (clean.includes(';')) throw workerError('multiStatement');
  if (!/^(select|with)\b/i.test(clean)) {
    throw workerError('readOnly');
  }
  return clean;
}

function run(sql) {
  const clean = assertReadOnly(sql);
  const started = Date.now();
  const stmt = db.prepare(clean);
  const columns = [];
  const rows = [];
  try {
    while (stmt.step()) {
      if (!columns.length) columns.push(...stmt.getColumnNames());
      rows.push(stmt.get());
      if (rows.length > MAX_ROWS) {
        // Разряды числа разделяет локаль показа, а не воркер: у русской
        // и английской записи разделители разные.
        throw workerError('tooManyRows', MAX_ROWS);
      }
    }
    if (!columns.length) columns.push(...stmt.getColumnNames());
  } finally {
    stmt.free();
  }
  return { columns, rows, elapsedMs: Date.now() - started };
}

// Сравнение с эталоном (isNum, sameValue, rowKey, compare, ...) — в grade-lib.js.

// -------------------------------------------------------------- протокол

/**
 * Датасет лежит предсжатым. Часть серверов (в том числе dev-сервер Vite)
 * отдаёт .gz с заголовком Content-Encoding: gzip — тогда браузер распакует
 * его сам, и распаковывать второй раз нельзя. Другие отдают файл как есть.
 * Полагаться на расширение или на заголовки нельзя, поэтому смотрим
 * на сигнатуру самих байт: gzip начинается с 1f 8b, SQLite — с «SQLi».
 */
async function loadDatabase(url) {
  const res = await fetch(url);
  if (!res.ok) throw workerError('datasetHttp', res.status);
  let buf = await res.arrayBuffer();
  // Ответ на порядки меньше ожидаемого означает, что до нас запрос кто-то перехватил:
  // чаще всего это менеджер загрузок или блокировщик в браузере. Без явной проверки
  // это всплывает где-то глубже как невнятная ошибка про длину массива.
  if (buf.byteLength < 65536) {
    throw workerError('datasetTruncated', buf.byteLength);
  }
  const magic = new Uint8Array(buf, 0, 2);
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') {
      throw workerError('noGzip');
    }
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  const SQL = await initSqlJs({ locateFile: (f) => `/sqljs/${f}` });
  db = new SQL.Database(new Uint8Array(buf));
  db.run('PRAGMA case_sensitive_like = OFF');
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  return { tables: tables.length ? tables[0].values.map((v) => v[0]) : [], bytes: buf.byteLength };
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  const reply = (data) => self.postMessage({ id, ok: true, data });
  const fail = (err) => self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });

  try {
    if (type === 'init') {
      reply(await loadDatabase(payload.url));
      return;
    }
    if (!db) throw workerError('dbNotReady');

    if (type === 'exec') {
      const r = run(payload.sql);
      reply({
        columns: r.columns,
        rows: r.rows.slice(0, PREVIEW_ROWS),
        totalRows: r.rows.length,
        truncated: r.rows.length > PREVIEW_ROWS,
        elapsedMs: r.elapsedMs,
      });
      return;
    }

    if (type === 'grade') {
      const started = Date.now();
      let user;
      try {
        user = run(payload.userSql);
      } catch (err) {
        // Синтаксическая ошибка — это не «неверный ответ», а другой тип обратной связи.
        reply({ status: 'sql_error', message: String(err.message || err), elapsedMs: Date.now() - started });
        return;
      }
      const expected = run(payload.solutionSql);
      const cmp = compare(user, expected, payload.options || {});
      reply({
        status: cmp.ok ? 'correct' : 'incorrect',
        comparison: cmp,
        elapsedMs: Date.now() - started,
        preview: {
          columns: user.columns,
          rows: user.rows.slice(0, PREVIEW_ROWS),
          totalRows: user.rows.length,
          truncated: user.rows.length > PREVIEW_ROWS,
        },
        expectedPreview: {
          columns: expected.columns,
          rows: expected.rows.slice(0, 8),
          totalRows: expected.rows.length,
        },
      });
      return;
    }

    throw workerError('unknownCommand', type);
  } catch (err) {
    fail(err);
  }
};
