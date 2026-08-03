import type { Preview } from '../engine/types';
import { useI18n } from '../i18n/context';

/**
 * Таблица результата. Горизонтальный скролл живёт внутри контейнера:
 * страница целиком ездить вбок не должна, иначе на телефоне теряется навигация.
 */
export function ResultTable({ data, caption }: { data: Preview; caption?: string }) {
  const { t, locale } = useI18n();
  const numberLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
  /**
   * Вывод print() показывается до таблицы и отдельно от неё: это не результат,
   * а то, что человек печатал по дороге, чтобы посмотреть на промежуточный шаг.
   * Есть только у исполнителей кода (Python) — у SQL всегда пусто.
   */
  const stdout = data.stdout?.trimEnd();

  if (!data.columns.length) {
    return (
      <div>
        {stdout && <pre className="sql-block">{stdout}</pre>}
        <p className="muted">{t.result.noColumns}</p>
      </div>
    );
  }

  return (
    <div>
      {stdout && (
        <>
          <p className="muted" style={{ margin: '0 0 6px' }}>{t.result.stdoutLabel}</p>
          <pre className="sql-block" style={{ marginBottom: 10 }}>{stdout}</pre>
        </>
      )}
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
                  <td
                    key={ci}
                    data-label={data.columns[ci]}
                    className={v === null ? 'null' : typeof v === 'number' ? 'num' : ''}
                  >
                    {v === null ? 'NULL' : typeof v === 'number' ? v.toLocaleString(numberLocale, { maximumFractionDigits: 4 }) : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        {t.result.rowsSuffix(data.totalRows.toLocaleString(numberLocale))}
        {data.truncated ? t.result.truncatedSuffix(data.rows.length) : ''}
      </p>
    </div>
  );
}
