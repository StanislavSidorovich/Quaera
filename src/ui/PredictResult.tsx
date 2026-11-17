import { useEffect, useState } from 'react';
import type { Executor, Preview } from '../engine/types';
import { useI18n } from '../i18n/context';
import { ResultTable } from './ResultTable';
import './predictResult.css';

/** Сколько строк реального результата показываем во вставке. */
const INSET_ROWS = 5;

/*
 * Вставка «Что вернёт запрос» на экране ответа у заданий-предсказаний
 * (interpret с predictSql). Строки настоящие: запрос выполняется тем же
 * исполнителем, что и задания трека, ничего не сочиняется. Монтируется
 * только после проверки ответа, поэтому до неё результат подсказкой не
 * служит. Если запрос не выполнился (воркер не загрузился, ошибка), вставки
 * нет вовсе: пустая рамка хуже её отсутствия. Нулевой результат показывается
 * словами, а не пустой таблицей; NULL рисует ResultTable; широкие строки
 * скроллятся внутри `.table-wrap`, страница вбок не ездит.
 */
export function PredictResult({ executor, sql }: { executor: Executor; sql: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<Preview | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    executor
      .exec(sql)
      .then((r) => alive && setData({ columns: r.columns, rows: r.rows, totalRows: r.totalRows, truncated: r.truncated }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [executor, sql]);

  if (!data) return null;
  const cut = data.rows.length > INSET_ROWS;
  const shown: Preview = {
    ...data,
    rows: data.rows.slice(0, INSET_ROWS),
    truncated: cut || data.truncated,
  };
  return (
    <div className="card predict-result">
      <h3>{t.task.resultInsetTitle}</h3>
      {data.rows.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>{t.task.resultInsetEmpty}</p>
      ) : (
        <ResultTable data={shown} />
      )}
    </div>
  );
}
