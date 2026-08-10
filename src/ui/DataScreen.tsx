import { useMemo, useState } from 'react';
import { GROUP_ORDER, groupTables, type GroupedTables } from '../engine/schemaGroups';
import type { SchemaDoc } from '../engine/types';
import { useI18n } from '../i18n/context';
import { TableDoc } from './TableDoc';

/**
 * Экран «Данные» — обзор всего датасета до того, как человек сядет решать.
 *
 * Шторка схемы отвечает на вопрос «как называется колонка», когда задание
 * уже открыто. На вопрос «что здесь вообще за данные и как они связаны»
 * она не отвечала никогда: двенадцать таблиц шли плоским списком, и понять
 * по нему, где события, а где справочники, можно было только зная заранее,
 * что значат префиксы имён.
 *
 * Постоянной панелью сбоку это делать нельзя, и это посчитано, а не на вкус:
 * боковое меню занимает 248px, под содержимое на мониторе 1280 остаётся
 * 976px, а .dashboard раскладывается в две колонки только от 780px
 * (см. styles.css). Третья постоянная колонка схлопнула бы главную обратно
 * в одну колонку на самой ходовой ширине. Поэтому — свой экран во всю ширину.
 */

export function DataScreen({ doc }: { doc: SchemaDoc | null }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');

  const { group, incoming, outgoing } = useMemo<GroupedTables>(
    () =>
      doc
        ? groupTables(doc)
        : { group: new Map(), incoming: new Map(), outgoing: new Map() },
    [doc]
  );

  /**
   * Поиск идёт и по колонкам, а не только по именам таблиц: человек помнит,
   * что где-то была «выручка», и не помнит, в fact_sellout она или
   * в fact_sellin, — это и есть типичный запрос к схеме.
   *
   * Найденные колонки возвращаются отдельным множеством, чтобы TableDoc их
   * подсветил: иначе поиск по «brand» раскрывает dim_product на одиннадцать
   * строк, и нужную всё равно приходится искать глазами.
   */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!doc) return new Map<string, Set<string>>();
    const found = new Map<string, Set<string>>();
    for (const table of doc.tables) {
      if (!q) {
        found.set(table.table, new Set());
        continue;
      }
      const columns = table.columns.filter((c) => c.name.toLowerCase().includes(q));
      /*
       * Название ищется в текущей локали, а не в обеих: человек набирает то,
       * что видит на экране. Поиск сразу по двум дал бы находку без видимой
       * причины — таблица нашлась бы по слову, которого на ней не написано.
       */
      const tableHit =
        table.table.toLowerCase().includes(q) || table.title[locale].toLowerCase().includes(q);
      if (tableHit || columns.length) found.set(table.table, new Set(columns.map((c) => c.name)));
    }
    return found;
  }, [doc, query, locale]);

  if (!doc) return <p className="muted">{t.schema.loading}</p>;

  const searching = query.trim().length > 0;
  const visible = doc.tables.filter((table) => matches.has(table.table));

  return (
    <>
      {/*
       * Без заголовка «Данные» внутри карточки: он уже стоит в шапке экрана,
       * в паре десятков пикселей выше, — тот же задвоенный заголовок, что
       * когда-то был с логотипом в шапке главной.
       */}
      <div className="card">
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
          {doc.company[locale]}. {t.schema.periodLabel(doc.period.from, doc.period.to)}.
        </p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{t.data.intro(doc.tables.length)}</p>
      </div>

      <div className="card data-search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.data.searchPlaceholder}
          aria-label={t.data.searchAria}
        />
        {searching && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
            {visible.length ? t.data.searchFound(visible.length) : t.data.searchEmpty(query)}
          </p>
        )}
      </div>

      {GROUP_ORDER.map((kind) => {
        const tables = visible.filter((table) => group.get(table.table) === kind);
        if (!tables.length) return null;
        return (
          <div className="card" key={kind}>
            <div className={`data-group-head group-${kind}`}>
              <h2>{t.data.groups[kind].title}</h2>
              <span className="pill">{t.data.tableCount(tables.length)}</span>
            </div>
            <p className="muted" style={{ margin: '2px 0 12px', fontSize: 13, lineHeight: 1.55 }}>
              {t.data.groups[kind].body}
            </p>
            {tables.map((table) => (
              <TableDoc
                key={table.table}
                table={table}
                open={searching}
                highlightColumns={matches.get(table.table)}
                /*
                 * Место таблицы в звезде — единственное, что видно, пока она
                 * свёрнута. У факта показываем, куда он ссылается; у справочника —
                 * сколько таблиц ссылаются на него: чем больше, тем ближе
                 * он к центру. У сырого слоя нет ни того, ни другого, и это
                 * само по себе ответ — он ни с чем не связан.
                 */
                links={
                  kind === 'fact' && outgoing.get(table.table)?.length ? (
                    <span className="data-links">
                      {outgoing.get(table.table)!.map((target) => (
                        <span className="data-link" key={target}>
                          → <code>{target}</code>
                        </span>
                      ))}
                    </span>
                  ) : kind === 'dimension' && incoming.get(table.table) ? (
                    <span className="data-links">
                      <span className="data-link">
                        {t.data.incomingLabel(incoming.get(table.table)!)}
                      </span>
                    </span>
                  ) : null
                }
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
