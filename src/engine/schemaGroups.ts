import type { SchemaDoc } from './types';

/**
 * Разделение таблиц на факты, справочники и одиночек — вывод из графа связей,
 * а не из префикса имени.
 *
 * Соблазн был прочитать `dim_`/`fact_` и не думать, но это ровно та ошибка,
 * от которой лечит трек `model`: звезду задаёт направление стрелок, а не то,
 * как автор назвал таблицу. Приложение, которое учит первому, а само делает
 * второе, учит неправде — и разъедется в тот день, когда таблица получит
 * имя не по соглашению.
 *
 * Правило:
 * - на таблицу ссылается кто-то ещё → справочник (измерение);
 * - сама ссылается наружу, но на неё никто → факт;
 * - ни того, ни другого → отдельно стоящая (у нас это сырой слой staging).
 *
 * Собственные ссылки не в счёт: `dim_rep.manager_id → dim_rep` — это иерархия
 * внутри справочника, а не входящая стрелка от факта. Без этой оговорки
 * self-join делал бы справочником любую таблицу с иерархией.
 *
 * То, что вывод сходится с префиксами имён, проверяется гейтом
 * (см. verify-dataset.mjs): расхождение означает либо неверное имя,
 * либо забытый внешний ключ — и то и другое настоящий дефект.
 */
export type TableGroup = 'fact' | 'dimension' | 'standalone';

/**
 * Порядок групп на экране — от того, откуда берутся числа, к тому, что
 * ещё не приведено в порядок. Живёт здесь, а не в каждом экране своей
 * копией: порядок читается как утверждение о данных («сначала факты»),
 * и разойтись между экраном «Данные» и песочницей он не имеет права.
 */
export const GROUP_ORDER: TableGroup[] = ['fact', 'dimension', 'standalone'];

export interface GroupedTables {
  group: Map<string, TableGroup>;
  /** Сколько разных таблиц ссылается на эту — насколько она «центр» звезды. */
  incoming: Map<string, number>;
  /** На какие справочники ссылается таблица, в порядке колонок и без повторов. */
  outgoing: Map<string, string[]>;
}

export function groupTables(doc: SchemaDoc): GroupedTables {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const referencedBy = new Map<string, Set<string>>();

  for (const table of doc.tables) {
    const targets: string[] = [];
    for (const column of table.columns) {
      const target = column.references?.table;
      if (!target || target === table.table) continue;
      if (!targets.includes(target)) targets.push(target);
      if (!referencedBy.has(target)) referencedBy.set(target, new Set());
      referencedBy.get(target)!.add(table.table);
    }
    outgoing.set(table.table, targets);
  }

  const group = new Map<string, TableGroup>();
  for (const table of doc.tables) {
    const sources = referencedBy.get(table.table);
    incoming.set(table.table, sources?.size ?? 0);
    group.set(
      table.table,
      sources?.size ? 'dimension' : outgoing.get(table.table)!.length ? 'fact' : 'standalone'
    );
  }

  return { group, incoming, outgoing };
}
