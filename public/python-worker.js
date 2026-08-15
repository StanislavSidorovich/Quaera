/* eslint-disable no-restricted-globals */
/**
 * Воркер Python (Pyodide + pandas).
 *
 * Устроен по образцу sql-worker.js: классический воркер, importScripts,
 * тот же протокол {id, type, payload} и та же сверка с эталоном (grade-lib.js) —
 * задание одинаково устроено независимо от языка, меняется только исполнитель.
 *
 * Источник данных — тот же public/data/quaera.dataset, что и у SQL-трека:
 * Python открывает его через стандартный sqlite3 и грузит таблицы в pandas
 * через pd.read_sql. Два трека тренируются на одних и тех же данных,
 * и не нужно поддерживать вторую копию датасета в другом формате.
 *
 * Pyodide+pandas весят ~52 МБ — на два порядка больше, чем sql.js. Поэтому
 * загрузка не начинается сама по себе: воркер ждёт команду 'init' только
 * после того, как pythonClient.ts получил явное согласие пользователя
 * (см. LoadState 'consent' в engine/types.ts).
 */

importScripts('/grade-lib.js');

const DATASET_URL = '/data/quaera.dataset';
const PREVIEW_ROWS = 200;

let pyodide = null;

/** Тот же приём, что и в sql-worker.js: gzip определяется по сигнатуре байт, не по имени/заголовкам. */
async function fetchDataset(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить датасет: HTTP ${res.status}`);
  let buf = await res.arrayBuffer();
  if (buf.byteLength < 65536) {
    throw new Error(
      `Датасет пришёл обрезанным: ${buf.byteLength} байт вместо примерно 3.5 МБ. ` +
        'Обычно это менеджер загрузок (IDM, FDM) или расширение браузера, перехватывающее файл. ' +
        'Отключите перехват для этого адреса или откройте страницу в режиме инкогнито без расширений.'
    );
  }
  const magic = new Uint8Array(buf, 0, 2);
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Браузер не поддерживает распаковку gzip — обновите браузер');
    }
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  return buf;
}

/** Загружает датасет в pandas-таблицы, доступные коду задания по имени (fact_sellout, dim_product, ...). */
async function loadDataset(url) {
  const buf = await fetchDataset(url);
  pyodide.FS.writeFile('/data.sqlite', new Uint8Array(buf));

  await pyodide.runPythonAsync(`
import sqlite3
_con = sqlite3.connect('/data.sqlite')
_tables_list = [r[0] for r in _con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
_TABLES = {name: pd.read_sql(f"SELECT * FROM {name}", _con) for name in _tables_list}
_con.close()
`);
  const tables = pyodide.globals.get('_tables_list').toJs();
  return { tables, bytes: buf.byteLength };
}

async function ensurePyodide() {
  if (pyodide) return;
  importScripts('/pyodide/pyodide.js');
  pyodide = await loadPyodide({ indexURL: '/pyodide/' });
  await pyodide.loadPackage(['pandas', 'sqlite3']);
  const bootstrapRes = await fetch('/python-bootstrap.py');
  if (!bootstrapRes.ok) throw new Error(`Не удалось загрузить обвязку исполнителя: HTTP ${bootstrapRes.status}`);
  await pyodide.runPythonAsync(await bootstrapRes.text());
}

/** Запускает код в свежем пространстве имён (преподготовленные таблицы + pd) и возвращает {columns, rows, stdout} либо бросает с чистым traceback в message. */
async function runCell(code) {
  const started = Date.now();
  const runCellFn = pyodide.globals.get('_run_cell');
  let out;
  try {
    out = runCellFn(code).toJs({ dict_converter: Object.fromEntries });
  } finally {
    runCellFn.destroy();
  }
  const elapsedMs = Date.now() - started;
  if (!out.ok) {
    const err = new Error(out.message);
    err.traceback = out.traceback;
    err.stdout = out.stdout;
    throw err;
  }
  const table = out.table;
  return {
    columns: table.columns,
    // pyodide.toJs() превращает Python None в JS undefined, а не в null —
    // ResultTable.tsx умеет красиво показывать null («NULL»), а undefined
    // печатает буквальным словом «undefined» через String(v). Нормализуем
    // здесь же, а не в каждом месте, где рисуется таблица.
    rows: table.rows.map((row) => row.map((v) => (v === undefined ? null : v))),
    elapsedMs,
    stdout: out.stdout,
  };
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  const reply = (data) => self.postMessage({ id, ok: true, data });
  // traceback у runCell лежит на самом объекте ошибки (см. runCell выше) — прокидываем
  // его дальше, чтобы «Выполнить» показывал столько же, сколько «Проверить» (там —
  // отдельная явная сборка ответа status: 'code_error' ниже, не через fail()).
  const fail = (err) =>
    self.postMessage({
      id,
      ok: false,
      error: String(err && err.message ? err.message : err),
      traceback: (err && err.traceback) || '',
    });

  try {
    if (type === 'init') {
      await ensurePyodide();
      reply(await loadDataset(payload.url));
      return;
    }
    if (!pyodide) throw new Error('Python ещё не загружен');

    if (type === 'exec') {
      const r = await runCell(payload.code);
      reply({
        columns: r.columns,
        rows: r.rows.slice(0, PREVIEW_ROWS),
        totalRows: r.rows.length,
        truncated: r.rows.length > PREVIEW_ROWS,
        elapsedMs: r.elapsedMs,
        stdout: r.stdout,
      });
      return;
    }

    if (type === 'grade') {
      const started = Date.now();
      let user;
      try {
        user = await runCell(payload.userCode);
      } catch (err) {
        reply({
          status: 'code_error',
          message: String(err.message || err),
          traceback: err.traceback || '',
          elapsedMs: Date.now() - started,
        });
        return;
      }
      // Ошибка в эталонном решении — это баг в контенте, а не результат для ученика.
      const expected = await runCell(payload.solutionCode);
      const cmp = compare(
        { columns: user.columns, rows: user.rows },
        { columns: expected.columns, rows: expected.rows },
        payload.options || {}
      );
      reply({
        status: cmp.ok ? 'correct' : 'incorrect',
        comparison: cmp,
        elapsedMs: Date.now() - started,
        preview: {
          columns: user.columns,
          rows: user.rows.slice(0, PREVIEW_ROWS),
          totalRows: user.rows.length,
          truncated: user.rows.length > PREVIEW_ROWS,
          stdout: user.stdout,
        },
        expectedPreview: {
          columns: expected.columns,
          rows: expected.rows.slice(0, 8),
          totalRows: expected.rows.length,
        },
      });
      return;
    }

    throw new Error(`Неизвестная команда: ${type}`);
  } catch (err) {
    fail(err);
  }
};
