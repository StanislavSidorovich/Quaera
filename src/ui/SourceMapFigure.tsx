import { Fragment, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { architecture } from '../content/architecture';
import { useI18n } from '../i18n/context';
import type { Locale } from '../i18n/context';
import { Notes, rich } from './figureParts';

const sm = architecture.artifacts.sourceMap;

type System = (typeof sm.systems)[number];
type Value = string | number | null;

const tag = (locale: Locale) => (locale === 'ru' ? 'ru-RU' : 'en-US');
const int = (n: number, locale: Locale) => n.toLocaleString(tag(locale));
const money = (n: number, locale: Locale) =>
  n.toLocaleString(tag(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Имена колонок из SELECT запроса: без префикса таблицы, как их увидел бы человек в результате. */
const columnsOf = (sql: string) =>
  sql
    .replace(/^\s*SELECT\s+/i, '')
    .split(/\s+FROM\s+/i)[0]
    .split(',')
    .map((c) => c.trim().split('.').pop() as string);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sm-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** ERP: строка отгрузки как документ. Значения только из `preview.expect`, подписи из `preview.labels`. */
function ErpDoc({ s, locale }: { s: System; locale: Locale }) {
  const L = (k: string) => s.preview.labels[k][locale];
  const [id, orderDate, shipDate, distributor, sku, product, units, gross, discount, net] = s.preview.expect[0];
  return (
    <dl className="sm-doc">
      <Field label={L('ship')}>{String(id)}</Field>
      <Field label={L('dates')}>
        {String(orderDate)} → {String(shipDate)}
      </Field>
      <Field label={L('dist')}>{String(distributor)}</Field>
      <Field label={L('item')}>
        <code>{String(sku)}</code> {String(product)}
      </Field>
      <Field label={L('qty')}>
        {int(Number(units), locale)} {L('unit')}
      </Field>
      <Field label={L('sum')}>
        {money(Number(gross), locale)} {L('less')} {money(Number(discount), locale)} = <mark className="sm-mark">{money(Number(net), locale)}</mark>
      </Field>
    </dl>
  );
}

/** CRM: карточка клиента. */
function CrmCard({ s, locale }: { s: System; locale: Locale }) {
  const L = (k: string) => s.preview.labels[k][locale];
  const [name, chain, channel, city, opened, active, rep, team] = s.preview.expect[0];
  return (
    <div className="sm-card">
      <div className="sm-card-head">
        <span className="sm-avatar" aria-hidden="true">
          {String(name).charAt(0)}
        </span>
        <strong>{String(name)}</strong>
      </div>
      <dl className="sm-doc">
        <Field label={L('chain')}>
          {String(chain)} · <code>{String(channel)}</code>
        </Field>
        <Field label={L('city')}>{String(city)}</Field>
        <Field label={L('since')}>
          {String(opened)}
          {active === 1 ? ` · ${L('active')}` : ''}
        </Field>
        <Field label={L('rep')}>
          <mark className="sm-mark">{String(rep)}</mark> · {String(team)}
        </Field>
      </dl>
    </div>
  );
}

/** Лист Excel: заголовки и строки; `mark` называет колонку, которую нужно выделить. */
function Sheet({ heads, rows, mark, show }: { heads: string[]; rows: Value[][]; mark: number; show: (v: Value, i: number) => string }) {
  return (
    <div className="sm-sheet">
      <table>
        <thead>
          <tr>
            <td aria-hidden="true" />
            {heads.map((h, i) => (
              <th key={h} scope="col" className={i === mark ? 'is-mark' : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              <th scope="row" className="sm-rown">
                {ri + 1}
              </th>
              {r.map((v, i) => (
                <td key={i} className={i === mark ? 'is-mark' : undefined}>
                  {show(v, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Peek({ s, i, locale }: { s: System; i: number; locale: Locale }) {
  const p = s.preview;
  let mock: ReactNode;
  if (s.id === 'erp') mock = <ErpDoc s={s} locale={locale} />;
  else if (s.id === 'crm') mock = <CrmCard s={s} locale={locale} />;
  else if (s.id === 'dist') {
    const heads = columnsOf(p.sql);
    const show = (v: Value, i: number) => (v === null ? 'NULL' : typeof v === 'string' && i > 0 && heads[i] !== 'source_file' ? `"${v}"` : String(v));
    mock = <Sheet heads={heads} rows={p.expect} mark={0} show={show} />;
  } else {
    const L = (k: string) => p.labels[k][locale];
    const heads = [L('month'), L('rep'), L('division'), L('units'), L('revenue')];
    const show = (v: Value, i: number) => (typeof v === 'number' ? (i === 4 ? money(v, locale) : int(v, locale)) : String(v));
    mock = <Sheet heads={heads} rows={p.expect} mark={1} show={show} />;
  }
  return (
    <div className={`sm-peek sm-sys--${s.id}`} id={`sm-peek-${s.id}`} style={order(i, true)}>
      <p className="sm-peek-cap">{rich(p.caption[locale])}</p>
      <div className="sm-mock">{mock}</div>
      {p.after && <p className="sm-peek-cap">{p.after[locale]}</p>}
    </div>
  );
}

/**
 * Место в сетке через `order`: карточки стоят 10, 20, 30, 40. Макет в одну колонку идёт сразу
 * за своей карточкой (+5), в две колонки полосой под её рядом (25 или 45), чтобы сетка 2×2
 * не разъезжалась.
 */
const order = (i: number, peek: boolean) =>
  ({
    '--o-n': (i + 1) * 10 + (peek ? 5 : 0),
    '--o-w': peek ? (i < 2 ? 25 : 45) : (i + 1) * 10,
  }) as CSSProperties;

/**
 * Слой «Источники»: четыре карточки систем, у каждой её таблицы Kaiyo. Шапка карточки — кнопка,
 * она раскрывает под рядом макет настоящей строки датасета (значения из `preview.expect`, их сверяет
 * `test:architecture`). Раскрыта одна карточка за раз. Раскладка по системам типичная, а не
 * записанная в данных: об этом подзаголовок. Колонки решает контейнер (`.pf`), не окно.
 */
export function SourceMapFigure() {
  const { locale } = useI18n();
  const [open, setOpen] = useState<System['id'] | null>(null);

  return (
    <figure className="pf sm">
      <figcaption className="pf-title">{sm.title[locale]}</figcaption>
      <p className="muted sm-sub">{sm.sub[locale]}</p>
      <div className={`sm-grid${open ? ' has-open' : ''}`} role="group" aria-label={sm.aria[locale]}>
        {sm.systems.map((s, i) => {
          const isOpen = open === s.id;
          return (
            <Fragment key={s.id}>
              <div className={`sm-sys sm-sys--${s.id}${isOpen ? ' is-open' : ''}`} style={order(i, false)}>
                <button type="button" className="sm-head" aria-expanded={isOpen} aria-controls={`sm-peek-${s.id}`} onClick={() => setOpen(isOpen ? null : s.id)}>
                  <span className="sm-title">
                    <span className="sm-name">{s.name[locale]}</span>
                    <span className="sm-kind">{s.kind[locale]}</span>
                  </span>
                  <span className="sm-desc">{s.desc[locale]}</span>
                  <span className="sm-chips">
                    {s.tables.map((t, i) =>
                      s.id === 'dist' && i === 1 ? (
                        /* Стрелка держится за свой чип, чтобы при переносе не повиснуть в конце строки. */
                        <span key={t} className="sm-pair">
                          <span className="sm-then" aria-hidden="true">
                            →
                          </span>
                          <span className="sm-chip">{t}</span>
                        </span>
                      ) : (
                        <span key={t} className="sm-chip">
                          {t}
                        </span>
                      ),
                    )}
                  </span>
                  <span className="sm-more">
                    {sm.ui.more[locale]} <span aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
                  </span>
                </button>
              </div>
              {isOpen && <Peek s={s} i={i} locale={locale} />}
            </Fragment>
          );
        })}
      </div>
      <Notes notes={sm.notes} locale={locale} />
    </figure>
  );
}
