import { Fragment, useEffect, useMemo, useState } from 'react';
import { architecture } from '../content/architecture';
import { useI18n } from '../i18n/context';
import { labShare, labUrl, openLab } from '../labLink';
import type { SchemaDoc } from '../engine/types';
import { Chart } from './Chart';
import type { ChartSpec } from './chartSpec';
import { SchemaMap } from './SchemaMap';
import { useSchema } from './SchemaSheet';

const { artifacts: art, project } = architecture;

/** Число с пробелами между тысячами на обеих локалях: цифры в таблицах читаются одинаково. */
const num = (n: number, locale: string) => n.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US');

/** Значение ячейки с запросом: текст в кавычках, чтобы пробелы вокруг названия было видно. */
const cell = (v: string | number | null, locale: string) =>
  v === null ? 'NULL' : typeof v === 'number' ? num(v, locale) : v;

/**
 * «Запрос» и «Открыть в Lab» под артефактом. Ссылка в Lab строится так же, как у
 * шага маршрута: таблицы берутся из схемы, текст запроса уезжает во фрагмент URL.
 */
function QueryBlock({ sql, title }: { sql: string; title: string }) {
  const { locale } = useI18n();
  const schema = useSchema();
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    setHref(null);
    if (!schema) return;
    let live = true;
    labUrl(labShare(title, sql, 'sql', schema.tables.map((tb) => tb.table))).then(
      (url) => live && setHref(url),
      () => live && setHref(null)
    );
    return () => {
      live = false;
    };
  }, [sql, title, schema]);

  return (
    <div className="arch-art-query">
      <div className="arch-sql-actions">
        <button type="button" className="btn secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? art.ui.hideQuery[locale] : art.ui.query[locale]}
        </button>
        {href && (
          <a className="link-row lab-open" href={href} target="_blank" rel="noopener" onClick={(e) => openLab(href, e)}>
            {art.ui.openLab[locale]} ↗
          </a>
        )}
      </div>
      {open && (
        <pre className="arch-sql">
          <code>{sql}</code>
        </pre>
      )}
    </div>
  );
}

/** Строка таблицы как пары «колонка: значение». */
function RowCard({ table, columns, row, label }: { table: string; columns: string[]; row: (string | number | null)[]; label: string }) {
  const { locale } = useI18n();
  return (
    <div className="arch-art-row">
      <p className="arch-art-tag">
        {label} <code>{table}</code>
      </p>
      <dl>
        {columns.map((c, i) => (
          <Fragment key={c}>
            <dt>{c}</dt>
            <dd>{cell(row[i], locale)}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

/** Источники: событие в работе компании слева, настоящая строка датасета справа. */
function SourcesArtifact() {
  const { locale } = useI18n();
  const a = art.sources;
  return (
    <>
      <h3 className="career-h3">{a.title[locale]}</h3>
      <div className="arch-art-pairs">
        {([a.sellin, a.sellout] as const).map((s) => (
          <div key={s.table} className="arch-art-pair">
            <p className="arch-art-event">{s.event[locale]}</p>
            <span className="arch-art-arrow" aria-hidden="true" />
            <RowCard table={s.table} columns={s.columns} row={s.expect[0]} label={art.ui.table[locale]} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Bronze: пять настоящих строк как есть. Значения в кавычках, чтобы пробелы и регистр были видны. */
function BronzeArtifact() {
  const { locale } = useI18n();
  const b = art.bronze;
  return (
    <>
      <h3 className="career-h3">{b.title[locale]}</h3>
      <p className="muted arch-art-caption">{b.caption[locale].split('`').map((p, i) => (i % 2 ? <code key={i}>{p}</code> : <Fragment key={i}>{p}</Fragment>))}</p>
      <div className="arch-art-scroll">
        <table className="arch-art-table">
          <thead>
            <tr>
              {b.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.expect.map((r) => (
              <tr key={String(r[0])}>
                {r.map((v, i) => (
                  <td key={i} data-label={b.columns[i]}>{typeof v === 'string' && i > 0 && b.columns[i] !== 'source_file' ? `"${v}"` : cell(v, locale)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <QueryBlock sql={b.sql} title={b.title[locale]} />
    </>
  );
}

const STEPS = ['trim', 'types', 'dedup'] as const;

/**
 * Silver: три переключателя и четыре числа. Комбинации посчитаны запросом заранее
 * и лежат в architecture.json; `test:architecture` выполняет запрос каждой из восьми
 * и сверяет числа, так что экран не расходится с данными молча.
 */
function SilverArtifact() {
  const { locale } = useI18n();
  const s = art.silver;
  const [on, setOn] = useState<boolean[]>([false, false, false]);
  const key = on.map((x) => (x ? '1' : '0')).join('');
  const c = s.combos[key];
  const base = s.combos['000'];
  const metrics = [
    { id: 'names', value: c.names, was: base.names },
    { id: 'codes', value: c.codes, was: base.codes },
    { id: 'rows', value: c.rows, was: base.rows },
    { id: 'dates', value: c.dates, was: base.dates },
  ] as const;
  return (
    <>
      <h3 className="career-h3">{s.title[locale]}</h3>
      <p className="muted arch-art-caption">{s.caption[locale].split('`').map((p, i) => (i % 2 ? <code key={i}>{p}</code> : <Fragment key={i}>{p}</Fragment>))}</p>
      <div className="arch-art-toggles" role="group" aria-label={s.title[locale]}>
        {STEPS.map((id, i) => (
          <label key={id} className="arch-mark">
            <input type="checkbox" checked={on[i]} onChange={() => setOn(on.map((x, j) => (j === i ? !x : x)))} />
            <span>{s.toggles[id][locale]}</span>
          </label>
        ))}
      </div>
      <dl className="arch-art-metrics" aria-live="polite">
        {metrics.map((m) => (
          <div key={m.id} className={m.value !== m.was ? 'changed' : undefined}>
            <dd>{num(m.value, locale)}</dd>
            <dt>{s.metrics[m.id][locale]}</dt>
          </div>
        ))}
      </dl>
      <p className="muted arch-art-caption">{s.note[locale].split('`').map((p, i) => (i % 2 ? <code key={i}>{p}</code> : <Fragment key={i}>{p}</Fragment>))}</p>
      <QueryBlock sql={c.sql} title={s.title[locale]} />
    </>
  );
}

/** Звезда вокруг fact_sellout: сам факт и справочники, на которые он ссылается, без остальных таблиц. */
function starDoc(doc: SchemaDoc, factName: string): { doc: SchemaDoc; names: string[] } {
  const fact = doc.tables.find((tb) => tb.table === factName);
  const names = fact ? [fact.table, ...new Set(fact.columns.map((col) => col.references?.table).filter((x): x is string => !!x))] : [];
  const keep = new Set(names);
  return {
    names,
    doc: {
      ...doc,
      tables: doc.tables
        .filter((tb) => keep.has(tb.table))
        .map((tb) => ({ ...tb, columns: tb.columns.map((col) => (col.references && !keep.has(col.references.table) ? { ...col, references: undefined } : col)) })),
    },
  };
}

/** Gold: компактная звезда и подпись зерна из schema.json. */
function GoldArtifact() {
  const { locale } = useI18n();
  const schema = useSchema();
  const g = art.gold;
  const star = useMemo(() => (schema ? starDoc(schema, g.table) : null), [schema, g.table]);
  const grain = schema?.tables.find((tb) => tb.table === g.table)?.grain;
  return (
    <>
      <h3 className="career-h3">{g.title[locale]}</h3>
      {grain && (
        <p className="arch-art-grain">
          {g.grain[locale]} <code>{g.table}</code>: <strong>{typeof grain === 'string' ? grain : grain[locale]}</strong>
          <span className="muted">
            {' '}
            · {num(g.expect[0][0] as number, locale)} {g.rowsLabel[locale]}
          </span>
        </p>
      )}
      {star && (
        <div className="arch-art-star">
          <SchemaMap doc={star.doc} legend={false} intro={false} />
        </div>
      )}
    </>
  );
}

/** Serve: мера DAX слева направо с результатом, тот же Chart, что у результата запроса в задании. */
function ServeArtifact() {
  const { locale } = useI18n();
  const v = art.serve;
  const { months, fact } = project.figure;
  const last = months.length - 1;
  const spec: ChartSpec = {
    kind: 'line',
    labels: months.map((x) => {
      const [y, mo] = x.split('-').map(Number);
      const text = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1)));
      return text.charAt(0).toUpperCase() + text.slice(1);
    }),
    positions: months.map((_, i) => i / last),
    views: [{ series: [{ column: v.chart[locale], values: fact }], min: 0, max: 60000 }],
  };
  return (
    <>
      <h3 className="career-h3">{v.title[locale]}</h3>
      <p className="muted arch-art-caption">{v.caption[locale]}</p>
      <pre className="arch-sql arch-art-dax" lang="dax">
        <code>{v.dax}</code>
      </pre>
      <figure className="arch-figure">
        <Chart spec={spec} numberLocale={locale} />
      </figure>
    </>
  );
}

/** Встреча: один слайд с фразой вывода, той же, что записана в слое. */
function MeetingArtifact() {
  const { locale } = useI18n();
  const m = art.meeting;
  return (
    <>
      <h3 className="career-h3">{m.title[locale]}</h3>
      <figure className="arch-art-slide">
        <figcaption>{m.kicker[locale]}</figcaption>
        <blockquote>{m.phrase[locale]}</blockquote>
      </figure>
    </>
  );
}

/** Артефакт слоя: что в слое реально лежит. У каждого слоя свой, показывается сверху обычной карточки. */
export function LayerArtifact({ layerId }: { layerId: string }) {
  let body = null;
  if (layerId === 'sources') body = <SourcesArtifact />;
  else if (layerId === 'bronze') body = <BronzeArtifact />;
  else if (layerId === 'silver') body = <SilverArtifact />;
  else if (layerId === 'gold') body = <GoldArtifact />;
  else if (layerId === 'serve') body = <ServeArtifact />;
  else if (layerId === 'meeting') body = <MeetingArtifact />;
  if (!body) return null;
  return <div className="arch-art">{body}</div>;
}
