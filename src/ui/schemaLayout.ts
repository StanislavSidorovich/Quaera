import { groupTables, type TableGroup } from '../engine/schemaGroups';
import type { SchemaDoc } from '../engine/types';

/**
 * Раскладка схемы данных картинкой: где стоит таблица и куда идёт стрелка.
 *
 * Отделено от отрисовки по тому же принципу, что `chartSpec` от `Chart`:
 * ошибку в рисовании видно глазом за секунду, ошибку в решении — никогда.
 * Здесь «решение» — это утверждение о данных: кто факт, кто справочник,
 * кто на кого ссылается. Нарисованная не по тем связям схема выглядит
 * убедительно и не отличима от честной ничем, поэтому раскладка — чистая
 * функция от `SchemaDoc`, а её результат сверяется с графом связей гейтом
 * (`npm run test:schema-layout`).
 *
 * **Ни одного имени таблицы в коде.** Колонка, порядок строк и вид стрелки
 * выводятся из `groupTables`, то есть из внешних ключей. Это тот же довод,
 * что и у самого `groupTables`: трек `model` учит, что звезду задаёт
 * направление стрелок, и приложение, которое этому учит, обязано само
 * так считать. Захардкоженное «fact_sellout в середине» разъедется в тот
 * день, когда в датасете появится шестой факт, — и разъедется молча.
 *
 * **Локали здесь нет намеренно.** Имена таблиц одинаковы на обоих языках,
 * а подписи колонок («Факты», «Справочники») рисует компонент по координатам
 * `factLabelX` / `dimLabelX`. Иначе раскладка зависела бы от длины перевода,
 * и картинка на двух языках расходилась бы геометрией — при том что данные
 * под ней одни и те же.
 */

/**
 * Геометрия в пикселях, а не в долях: SVG рисуется в натуральную величину
 * и прокручивается по горизонтали на узком экране (см. .schema-map-wrap),
 * а не вписывается в ширину. Вписывание мельчило бы имена таблиц ровно там,
 * где экран и так узкий, — тот же довод, что у горизонтальной прокрутки
 * у примеров строк в TableDoc.
 */
export const LAYOUT = {
  /** Ширина знака моноширинного 12px — по ней считается ширина узла. */
  charWidth: 7.3,
  padX: 12,
  nodeH: 34,
  gapY: 14,
  /** Расстояние между колонками: на нём живут стрелки, и им нужен размах. */
  colGap: 148,
  /** Полоса сверху под подписи колонок, которые рисует компонент. */
  headerH: 26,
  /** Ширина значка «ссылается на саму себя» внутри узла. */
  selfBadge: 16,
  /** Вынос дуги «справочник → справочник» вправо от колонки и шаг вложения. */
  snowBase: 26,
  snowStep: 16,
  /** Отрыв сырого слоя от остальной схемы — он ни с чем не связан. */
  standaloneGap: 36,
  /** На столько стрелка не доходит до узла: ровно длина наконечника. */
  arrowGap: 8,
} as const;

export interface LayoutNode {
  table: string;
  group: TableGroup;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Сколько таблиц ссылается на эту — чем больше, тем ближе к центру звезды. */
  incoming: number;
  /**
   * Есть ли ссылка на саму себя. В `groupTables` она не в счёт (иначе
   * self-join делал бы справочником любую иерархию), но на картинке
   * показана: это единственное место, где видно, что справочник знает
   * про собственную вложенность.
   */
  selfRef: boolean;
}

export interface LayoutEdge {
  from: string;
  to: string;
  /**
   * `star` — факт на справочник, обычная связь звезды.
   * `snowflake` — справочник на справочник, то самое разложение измерения,
   * которое трек `model` разбирает под именем «снежинка». Вид стрелки
   * выводится из групп её концов, а не назначается вручную.
   */
  kind: 'star' | 'snowflake';
  path: string;
}

export interface SchemaLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  /** Куда компонент ставит локализованные подписи колонок. */
  factLabelX: number;
  dimLabelX: number;
  labelY: number;
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** Ширина колонки — по самому длинному имени в ней, чтобы узлы стояли ровно. */
function columnWidth(tables: string[], selfRef: (t: string) => boolean): number {
  return tables.reduce((max, table) => {
    const w = table.length * LAYOUT.charWidth + LAYOUT.padX * 2 + (selfRef(table) ? LAYOUT.selfBadge : 0);
    return Math.max(max, w);
  }, 0);
}

export function buildSchemaLayout(doc: SchemaDoc): SchemaLayout {
  const { group, incoming, outgoing } = groupTables(doc);

  const selfRefs = new Set(
    doc.tables
      .filter((t) => t.columns.some((c) => c.references?.table === t.table))
      .map((t) => t.table)
  );
  const hasSelfRef = (table: string) => selfRefs.has(table);

  const of = (kind: TableGroup) =>
    doc.tables.filter((t) => group.get(t.table) === kind).map((t) => t.table);

  /**
   * Факты сверху вниз — по числу связей: у кого их больше, тот выше.
   * Это не эстетика, а то же утверждение, что и в подписи справочника
   * («на него ссылаются N таблиц»): чем больше стрелок, тем центральнее
   * таблица в модели. Ничья разводится именем, иначе порядок зависел бы
   * от порядка в schema.json и картинка «прыгала» бы между сборками.
   */
  const facts = of('fact').sort(
    (a, b) => outgoing.get(b)!.length - outgoing.get(a)!.length || a.localeCompare(b)
  );

  /**
   * Справочники — по среднему положению фактов, которые на них ссылаются
   * (барицентр, один проход). Смысл в том, чтобы стрелки не пересекались
   * без нужды: справочник встаёт напротив своих фактов. Те, на кого
   * не ссылается ни один факт, — только другие справочники, — уходят вниз:
   * они и есть второй уровень снежинки.
   */
  const factIndex = new Map(facts.map((table, i) => [table, i]));
  const barycenter = (dim: string): number => {
    const parents = facts.filter((f) => outgoing.get(f)!.includes(dim));
    if (!parents.length) return Number.POSITIVE_INFINITY;
    return parents.reduce((sum, f) => sum + factIndex.get(f)!, 0) / parents.length;
  };
  const dims = of('dimension').sort((a, b) => {
    const ba = barycenter(a);
    const bb = barycenter(b);
    if (ba !== bb) return ba < bb ? -1 : 1;
    return incoming.get(b)! - incoming.get(a)! || a.localeCompare(b);
  });

  const standalone = of('standalone').sort((a, b) => a.localeCompare(b));

  const factW = columnWidth(facts, hasSelfRef);
  const dimW = columnWidth(dims, hasSelfRef);
  const factX = 0;
  const dimX = factW + LAYOUT.colGap;

  const columnHeight = (n: number) => (n ? n * LAYOUT.nodeH + (n - 1) * LAYOUT.gapY : 0);
  const factsH = columnHeight(facts.length);
  const dimsH = columnHeight(dims.length);
  const bodyH = Math.max(factsH, dimsH);

  const nodes: LayoutNode[] = [];
  const place = (tables: string[], x: number, w: number, top: number) => {
    tables.forEach((table, i) => {
      nodes.push({
        table,
        group: group.get(table)!,
        x,
        y: round(top + i * (LAYOUT.nodeH + LAYOUT.gapY)),
        w: round(w),
        h: LAYOUT.nodeH,
        incoming: incoming.get(table) ?? 0,
        selfRef: hasSelfRef(table),
      });
    });
  };

  // Короткая колонка центрируется по длинной: иначе схема читается как
  // «факты кончились раньше», хотя кончился только список.
  place(facts, factX, factW, LAYOUT.headerH + (bodyH - factsH) / 2);
  place(dims, dimX, dimW, LAYOUT.headerH + (bodyH - dimsH) / 2);

  const standaloneY = LAYOUT.headerH + bodyH + LAYOUT.standaloneGap;
  const standaloneW = columnWidth(standalone, hasSelfRef);
  place(standalone, factX, standaloneW, standaloneY);

  const at = new Map(nodes.map((n) => [n.table, n]));

  /**
   * Связи звезды — плавной кривой из правого края факта в левый край
   * справочника. Кривая, а не прямая: десять прямых из пяти точек в шесть
   * дают решётку, в которой не видно, какая откуда, — изгиб разводит их
   * у концов, где важнее всего.
   */
  const starEdges: LayoutEdge[] = [];
  for (const from of facts) {
    for (const to of outgoing.get(from)!) {
      const a = at.get(from)!;
      const b = at.get(to)!;
      const x1 = a.x + a.w;
      const y1 = a.y + a.h / 2;
      const x2 = b.x - LAYOUT.arrowGap;
      const y2 = b.y + b.h / 2;
      const c = Math.max(28, (x2 - x1) * 0.45);
      starEdges.push({
        from,
        to,
        kind: 'star',
        path: `M ${round(x1)} ${round(y1)} C ${round(x1 + c)} ${round(y1)}, ${round(x2 - c)} ${round(y2)}, ${round(x2)} ${round(y2)}`,
      });
    }
  }

  /**
   * Связи снежинки идут внутри одной колонки, поэтому вынесены дугой
   * вправо от неё. Дуги вкладываются одна в другую по длине пролёта:
   * самая длинная снаружи — иначе короткая уходила бы под чужой узел
   * и обрывалась на нём.
   */
  const snowPairs: { from: string; to: string; span: number }[] = [];
  for (const from of dims) {
    for (const to of outgoing.get(from)!) {
      const a = at.get(from);
      const b = at.get(to);
      if (!a || !b) continue;
      snowPairs.push({ from, to, span: Math.abs(a.y - b.y) });
    }
  }
  snowPairs.sort((p, q) => q.span - p.span || p.from.localeCompare(q.from) || p.to.localeCompare(q.to));

  const snowEdges: LayoutEdge[] = snowPairs.map((pair, i) => {
    const a = at.get(pair.from)!;
    const b = at.get(pair.to)!;
    const bulge = LAYOUT.snowBase + (snowPairs.length - 1 - i) * LAYOUT.snowStep;
    const x = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const y2 = b.y + b.h / 2;
    const xEnd = x + LAYOUT.arrowGap * 0.75;
    return {
      from: pair.from,
      to: pair.to,
      kind: 'snowflake',
      path: `M ${round(x)} ${round(y1)} C ${round(x + bulge)} ${round(y1)}, ${round(x + bulge)} ${round(y2)}, ${round(xEnd)} ${round(y2)}`,
    };
  });

  const maxBulge = snowPairs.length ? LAYOUT.snowBase + (snowPairs.length - 1) * LAYOUT.snowStep : 0;
  const width = Math.max(dimX + dimW + maxBulge, standaloneW);
  const height = standalone.length ? standaloneY + LAYOUT.nodeH : LAYOUT.headerH + bodyH;

  return {
    nodes,
    edges: [...starEdges, ...snowEdges],
    width: round(width),
    height: round(height),
    factLabelX: factX,
    dimLabelX: dimX,
    labelY: LAYOUT.headerH - 12,
  };
}
