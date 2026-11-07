/**
 * Общий подъём Pyodide для гейтов (verify-content, test-spot): один поднимается лениво и один раз
 * на процесс. Обвязка читается из public/python-bootstrap.py, того же файла, что и браузерный воркер:
 * гейт обязан видеть код так же, как его увидит ученик.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { loadPyodide } from 'pyodide';

let pyodidePromise = null;

export function getPyodide(root) {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const pyodide = await loadPyodide({ indexURL: path.join(root, 'public', 'pyodide') });
      await pyodide.loadPackage(['pandas', 'sqlite3']);
      let buf = readFileSync(path.join(root, 'public', 'data', 'quaera.dataset'));
      if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
      pyodide.FS.writeFile('/data.sqlite', new Uint8Array(buf));
      await pyodide.runPythonAsync(`
import pandas as pd
import sqlite3
_con = sqlite3.connect('/data.sqlite')
_tables_list = [r[0] for r in _con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
_TABLES = {name: pd.read_sql(f"SELECT * FROM {name}", _con) for name in _tables_list}
_con.close()
`);
      await pyodide.runPythonAsync(readFileSync(path.join(root, 'public', 'python-bootstrap.py'), 'utf8'));
      return pyodide;
    })();
  }
  return pyodidePromise;
}

/** Исполняет код контрактом `result=`; возвращает { ok, table, message } как _run_cell. */
export async function runCell(root, code) {
  const pyodide = await getPyodide(root);
  const runCellFn = pyodide.globals.get('_run_cell');
  try {
    return runCellFn(code).toJs({ dict_converter: Object.fromEntries });
  } finally {
    runCellFn.destroy();
  }
}
