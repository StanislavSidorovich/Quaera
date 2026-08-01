import type { Preview } from '../engine/types';

/**
 * Таблица результата. Горизонтальный скролл живёт внутри контейнера:
 * страница целиком ездить вбок не должна, иначе на телефоне теряется навигация.
 */
export function ResultTable({ data, caption }: { data: Preview; caption?: string }) {
  if (!data.columns.length) return <p className="muted">Запрос не вернул колонок.</p>;

  return (
    <div>
      {caption && <p className="muted" style={{ margin: '0 0 6px' }}>{caption}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {data.columns.map((c, i) => (
                <th key={`${c}-${i}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((v, ci) => (
                  <td key={ci} className={v === null ? 'null' : typeof v === 'number' ? 'num' : ''}>
                    {v === null ? 'NULL' : typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: 4 }) : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        {data.totalRows.toLocaleString('ru-RU')} строк
        {data.truncated ? ` · показаны первые ${data.rows.length}` : ''}
      </p>
    </div>
  );
}
