import { useEffect, useRef, useState } from 'react';
import type { SchemaDoc } from '../engine/types';
import { useI18n } from '../i18n/context';
import { insertViaTarget } from './insertTarget';

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
  /**
   * Колонки, участвующие в связи между таблицами (см. keyColumns
   * в engine/schemaGroups.ts) — ключ вида `table.column`, посчитан один раз
   * хостом на весь документ схемы, а не здесь на каждую таблицу отдельно.
   */
  keyColumns?: Set<string>;
}

export function TableDoc({ table, open, detailsRef, highlightColumns, links, keyColumns }: Props) {
  const { t, locale } = useI18n();

  /**
   * Клик по имени колонки — набирать `commercial_category_id` руками
   * с телефона долго и с опечатками. Если есть активное поле запроса
   * (задание или песочница открыты и в них есть фокус — см. insertTarget.ts),
   * имя вставляется прямо туда, тем же способом, что и токен-панель.
   * Если цели нет (экран «Данные», где рядом нет редактора вовсе) —
   * имя уходит в буфер обмена, как было изначально.
   *
   * Ключ подписи вида `table.column`, а не просто имя: одинаковые имена
   * (`revenue`, `product_id`) встречаются в нескольких таблицах, и без
   * таблицы в ключе клик по одной подсветил бы «Скопировано» сразу
   * у всех тёзок на экране.
   */
  const [flash, setFlash] = useState<{ key: string; kind: 'copied' | 'inserted' } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  function pickColumn(name: string) {
    const key = `${table.table}.${name}`;
    if (insertViaTarget(name)) {
      setFlash({ key, kind: 'inserted' });
    } else {
      navigator.clipboard?.writeText(name).catch(() => undefined);
      setFlash({ key, kind: 'copied' });
    }
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1200);
  }

  return (
    <details ref={detailsRef} open={open || undefined} className="table-doc">
      <summary>
        <code style={{ color: 'var(--code)' }}>{table.table}</code> — {table.title[locale]}
        <small>{t.schema.grainLabel(table.grain[locale], table.row_count)}</small>
        {links}
      </summary>
      {table.columns.map((c) => {
        const key = `${table.table}.${c.name}`;
        const isKey = keyColumns?.has(key) ?? false;
        return (
          <div className={`col-doc${highlightColumns?.has(c.name) ? ' hit' : ''}`} key={c.name}>
            <button
              type="button"
              className="col-name"
              onClick={() => pickColumn(c.name)}
              aria-label={t.schema.copyAria(c.name)}
            >
              <code>{c.name}</code>
              {/* Колонка, по которой соединяют таблицы — и внешний ключ, и то, на что он ссылается (см. keyColumns). */}
              {isKey && <span className="col-key" title={t.schema.keyTitle} aria-hidden="true">🔑</span>}
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
              {flash?.key === key ? (
                t.schema[flash.kind]
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
