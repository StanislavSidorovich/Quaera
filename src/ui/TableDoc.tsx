import { useEffect, useRef, useState } from 'react';
import type { SchemaDoc } from '../engine/types';
import { useI18n } from '../i18n/context';

/**
 * Одна таблица схемы: заголовок с гранулярностью, список колонок со связями
 * и несколько настоящих строк.
 *
 * Вынесено из SchemaSheet, когда появился экран «Данные»: две точки входа
 * в схему (шторка поверх задания и полноэкранный обзор) обязаны показывать
 * таблицу одинаково — иначе человек, посмотревший её на экране, а потом
 * в шторке, видит два разных описания одного и того же и не знает, какому
 * верить. Хосты отличаются раскладкой вокруг, а не содержимым внутри.
 */

type Table = SchemaDoc['tables'][number];

interface Props {
  table: Table;
  /** Раскрыта ли по умолчанию — приходит от хоста (фокус в шторке, поиск на экране). */
  open?: boolean;
  /** Ссылка на <details> — хосту нужна для прокрутки к таблице. */
  detailsRef?: React.Ref<HTMLDetailsElement>;
  /**
   * Колонки, попавшие в поиск. Подсвечиваются, чтобы найденное не пришлось
   * выискивать глазами среди одиннадцати строк — ровно то трение, ради
   * снятия которого поиск и добавлялся.
   */
  highlightColumns?: Set<string>;
  /**
   * Связи таблицы — рисуются внутри summary, под гранулярностью.
   *
   * Снаружи их ставить нельзя, и это выяснилось на скриншоте: <details>
   * в закрытом виде показывает только summary, поэтому блок связей, стоящий
   * над карточкой, визуально прилипал к предыдущей таблице — чипы
   * `→ dim_customer → dim_product` от fact_sellin читались как продолжение
   * fact_sellout. Внутри summary принадлежность однозначна.
   */
  links?: React.ReactNode;
}

export function TableDoc({ table, open, detailsRef, highlightColumns, links }: Props) {
  const { t, locale } = useI18n();
  const numberLocale = locale === 'ru' ? 'ru-RU' : 'en-US';

  /**
   * Копирование имени колонки по клику — набирать `commercial_category_id`
   * руками с телефона долго и с опечатками. Ключ вида `table.column`,
   * а не просто имя: одинаковые имена (`revenue`, `product_id`) встречаются
   * в нескольких таблицах, и без таблицы в ключе клик по одной подсветил бы
   * «Скопировано» сразу у всех тёзок на экране.
   */
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  function copyColumn(name: string) {
    navigator.clipboard?.writeText(name).catch(() => undefined);
    setCopiedKey(`${table.table}.${name}`);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedKey(null), 1200);
  }

  return (
    <details ref={detailsRef} open={open || undefined} className="table-doc">
      <summary>
        <code style={{ color: 'var(--code)' }}>{table.table}</code> — {table.title[locale]}
        <small>{t.schema.grainLabel(table.grain[locale], table.row_count.toLocaleString(numberLocale))}</small>
        {links}
      </summary>
      {table.columns.map((c) => {
        const copied = copiedKey === `${table.table}.${c.name}`;
        return (
          <div className={`col-doc${highlightColumns?.has(c.name) ? ' hit' : ''}`} key={c.name}>
            <button
              type="button"
              className="col-name"
              onClick={() => copyColumn(c.name)}
              aria-label={t.schema.copyAria(c.name)}
            >
              <code>{c.name}</code>
              {/*
               * Опциональный доступ, не лишняя осторожность: schema.json
               * отдаётся по некешируемому по хешу пути `/data/schema.json`,
               * и в окне между обновлением JS-бандла и переключением
               * service worker'а (см. sw.js — старый воркер отвечает своим
               * кешем, пока клиента не забрал новый) сюда мог прилететь
               * документ прошлой версии без поля type. Без этой проверки
               * `undefined.toLowerCase()` ронял всё дерево без экрана ошибки.
               */}
              {c.type && <small className="col-type">{c.type.toLowerCase()}</small>}
            </button>
            <span>
              {copied ? (
                t.schema.copied
              ) : (
                <>
                  {/*
                    * Связь показываем отдельной строкой перед описанием,
                    * а не оставляем внутри него: «→ dim_region.region_id»
                    * посреди прозы читается только если описание прочитать
                    * целиком, а нужна она ровно в тот момент, когда человек
                    * ищет глазами, по чему соединять — то есть до чтения.
                    */}
                  {c.references && (
                    <span className="col-fk">
                      → <code>{c.references.table}.{c.references.column}</code>
                    </span>
                  )}
                  {c.description[locale]}
                </>
              )}
            </span>
          </div>
        );
      })}
      {table.note && <div className="note">{table.note[locale]}</div>}
      {/*
       * Несколько настоящих строк под описанием колонок.
       *
       * Своя горизонтальная прокрутка у обёртки обязательна: у dim_customer
       * одиннадцать колонок, и без неё таблица распирала бы хост.
       * NULL печатаем словом, а не пустой ячейкой, — пустая читается как
       * «здесь ничего не поместилось», а разница между NULL и пустой
       * строкой в этом датасете отдельная тема (sql-null).
       */}
      {table.sample?.length > 0 && (
        <div className="sample-wrap">
          <div className="sample-caption">{t.schema.sampleCaption(table.sample.length)}</div>
          <table className="sample">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c.name}>{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.sample.map((row, i) => (
                <tr key={i}>
                  {row.map((v, j) => (
                    <td key={j} className={v === null ? 'null' : undefined}>
                      {v === null ? 'NULL' : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
