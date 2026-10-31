import { Fragment, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { architecture } from '../content/architecture';
import type { ProjectExternal, ProjectQuery, ProjectStation } from '../content/architecture';
import { careerRole } from '../content/career';
import { skillLevel } from '../career/readiness';
import type { Progress } from '../srs/store';
import { Chart } from './Chart';
import type { ChartSpec } from './chartSpec';
import { useI18n } from '../i18n/context';
import { FAMILY, familyKaiyoLink } from '../links';
import { labShare, labUrl, openLab } from '../labLink';
import { useSchema } from './SchemaSheet';

const project = architecture.project;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Текст в обратных кавычках рисуется кодом, остальное как есть. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

/** Свёрнутый по умолчанию блок с числом пунктов в заголовке, как блок большого файла. */
function Fold({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="arch-block arch-fold">
      <button type="button" className="arch-link" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {title} ({count})
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function useDate() {
  const { locale } = useI18n();
  return (iso: string) => {
    const [y, mo, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, d)));
  };
}

/** План и факт 2025 по месяцам: две линии на одной оси, тот же Chart, что у заданий. */
function PlanFactFigure() {
  const { t, locale } = useI18n();
  const { months, fact, plan, names } = project.figure;
  const last = months.length - 1;
  const spec: ChartSpec = {
    kind: 'line',
    labels: months.map((x) => {
      const [y, mo] = x.split('-').map(Number);
      return cap(new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1))));
    }),
    positions: months.map((_, i) => i / last),
    views: [
      {
        series: [
          { column: names.fact[locale], values: fact },
          { column: names.plan[locale], values: plan },
        ],
        min: 0,
        max: 60000,
      },
    ],
  };
  return (
    <figure className="arch-figure">
      <figcaption className="muted">{t.career.map.project.figureTitle}</figcaption>
      <Chart spec={spec} numberLocale={locale} />
    </figure>
  );
}

/** Запрос станции: показать текст и открыть в Lab. Ожидаемые числа `expect` не показываются, это проверка гейта. */
function QueryBlock({ query }: { query: ProjectQuery }) {
  const { t, locale } = useI18n();
  const m = t.career.map;
  const schema = useSchema();
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    setHref(null);
    if (!schema) return;
    let live = true;
    labUrl(labShare(query.title[locale], query.sql, 'sql', schema.tables.map((tb) => tb.table))).then(
      (url) => live && setHref(url),
      () => live && setHref(null)
    );
    return () => {
      live = false;
    };
  }, [query, schema, locale]);

  return (
    <div className="arch-query">
      <p className="arch-query-title">{query.title[locale]}</p>
      <div className="arch-sql-actions">
        <button type="button" className="btn secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? m.hideSql : m.showSql}
        </button>
        {href && (
          <a className="link-row lab-open" href={href} target="_blank" rel="noopener" title={m.openLabTitle} onClick={(e) => openLab(href, e)}>
            {m.openLab} ↗
          </a>
        )}
      </div>
      {open && (
        <pre className="arch-sql">
          <code>{query.sql}</code>
        </pre>
      )}
    </div>
  );
}

function ExternalBlock({ ext }: { ext: ProjectExternal }) {
  const { t, locale } = useI18n();
  const p = t.career.map.project;
  const date = useDate();
  /* Без даты проверки условия не показываются. */
  if (!ext.checked) return null;
  return (
    <div className="arch-external">
      <p>
        <a href={ext.url} target="_blank" rel="noreferrer">
          <strong>{ext.name}</strong> ↗
        </a>{' '}
        <span className="muted">{p.checked(date(ext.checked))}</span>
      </p>
      <p>
        <Rich text={ext.terms[locale]} />
      </p>
      {ext.unconfirmed && (
        <p className="arch-unconfirmed">
          <strong>{p.unconfirmed}.</strong> <Rich text={ext.unconfirmed[locale]} />
        </p>
      )}
    </div>
  );
}

/** Карточка одной станции маршрута «Проект от и до». */
export function ProjectStationCard({
  index,
  skills,
  skillTitle,
  onStartSkill,
  onOpenRole,
  onGo,
  onClose,
}: {
  index: number;
  skills: Progress['skills'];
  skillTitle: (id: string) => string;
  onStartSkill: (skillId: string) => void;
  onOpenRole: (roleId: string) => void;
  onGo: (i: number) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const m = t.career.map;
  const p = m.project;
  const date = useDate();
  const [tool, setTool] = useState<string | null>(null);
  const [bigOpen, setBigOpen] = useState(false);

  const stations = project.stations;
  const s: ProjectStation = stations[index];
  const layer = architecture.layers.find((l) => l.id === s.layer);
  const roleName = (id: string) => careerRole(id)?.title[locale] ?? id;
  const label = project.labels.find((l) => l.id === s.label)!;
  const appName = (key: 'model' | 'flow' | 'pandas' | 'lab') =>
    ({ model: t.nav.familyModel, flow: t.nav.familyFlow, pandas: t.nav.familyPandas, lab: t.nav.familyLab })[key];
  const roleButton = (id: string) => (
    <button type="button" className="arch-link" onClick={() => onOpenRole(id)} title={m.roleLink(roleName(id))}>
      {roleName(id)}
    </button>
  );

  const next = stations[index + 1];
  const afterNext = next?.optional ? stations[index + 2] : undefined;
  const app = s.action.app ? FAMILY.find((f) => f.key === s.action.app) : undefined;
  const href = s.action.href;
  const hrefIsApp = !!(app && href && href.startsWith(app.url));
  const appLink = app ? familyKaiyoLink(app.key, app.url) : undefined;
  const appLabel = app && appLink ? (app.key === 'lab' ? t.nav.familyLabKaiyo : app.key === 'model' ? t.nav.familyModelKaiyo : p.openApp(appName(app.key))) : '';
  const externals = (s.action.externals ?? [])
    .map((id) => project.external.find((e) => e.id === id))
    .filter((e): e is ProjectExternal => !!e);

  return (
    <>
      <h2>{project.title[locale]}</h2>
      <p className="muted arch-step-n">
        {p.stationOf(index + 1, stations.length)} · {layer?.title[locale]}{index === 0 && ` · ${p.minutes(project.minutes)}`}
      </p>
      <div className="arch-dots" role="group" aria-label={p.dots}>
        {stations.map((st, i) => (
          <button
            key={st.id}
            type="button"
            className={i === index ? 'on' : i < index ? 'past' : ''}
            aria-label={p.goto(i + 1, st.title[locale])}
            aria-current={i === index ? 'step' : undefined}
            onClick={() => onGo(i)}
          />
        ))}
      </div>

      {index === 0 && (
        <>
          <div className="arch-case">
            <p className="arch-case-who muted">
              {project.case.who[locale]} {p.question}:
            </p>
            <p className="arch-case-q">{project.case.question[locale]}</p>
          </div>
          <p>{project.intro[locale]}</p>
        </>
      )}

      <h3 className="career-h3 arch-station-title">
        {s.title[locale]}
      </h3>

      <span className={`arch-label arch-label-${s.label}`} title={label.note[locale]}>
        {label.title[locale]}
      </span>
      <p className="muted arch-label-note">{label.note[locale]}</p>

      <dl className="career-dl arch-station-dl">
        <dt>{p.role}</dt>
        <dd>
          {roleButton(s.role)}
          {s.also && s.also.length > 0 && (
            <>
              {'. '}
              {p.also}:{' '}
              {s.also.map((id, i) => (
                <Fragment key={id}>
                  {i > 0 && ', '}
                  {roleButton(id)}
                </Fragment>
              ))}
            </>
          )}
        </dd>
        <dt>{!s.receives.from ? p.receivedBusiness : s.receives.from === s.role ? p.continues : p.receivedFrom(roleName(s.receives.from))}</dt>
        <dd>
          <Rich text={s.receives.text[locale]} />
        </dd>
        <dt>{p.does}</dt>
        <dd>
          <Rich text={s.does[locale]} />
        </dd>
        <dt>{p.tools}</dt>
        <dd>
          {s.tools.map((name, i) => (
            <Fragment key={name}>
              {i > 0 && ', '}
              <button
                type="button"
                className="arch-tool"
                aria-expanded={tool === name}
                title={m.toolAbout(name)}
                onClick={() => setTool(tool === name ? null : name)}
              >
                {name}
              </button>
            </Fragment>
          ))}
          {tool && s.tools.includes(tool) && architecture.tools[tool] && (
            <p className="arch-tool-note" role="note">
              <strong>{tool}.</strong> {architecture.tools[tool][locale]}
            </p>
          )}
        </dd>
        <dt>{!s.hands.to ? p.handedBusiness : s.hands.to === s.role ? p.carriesOn : p.handedTo(roleName(s.hands.to))}</dt>
        <dd>
          <Rich text={s.hands.text[locale]} />
        </dd>
      </dl>

      {s.figure === 'planVsFact' && <PlanFactFigure />}

      {s.queries && s.queries.length > 0 && (
        <div className="arch-queries">
          <h3 className="career-h3">{p.queriesTitle}</h3>
          {s.queries.map((q) => (
            <QueryBlock key={q.id} query={q} />
          ))}
        </div>
      )}

      <div className="arch-block arch-action">
        <h3 className="career-h3">{p.actionTitle}</h3>
        <p>
          <Rich text={s.action.text[locale]} />
        </p>
        {s.action.skills.length > 0 && (
          <div className="career-gap-actions">
            {s.action.skills.map((id) => {
              const lvl = skillLevel(skills[id]);
              return (
                <button key={id} type="button" className="btn secondary career-skill-btn" onClick={() => onStartSkill(id)}>
                  <span className="career-dots" role="img" aria-label={t.career.skillLevelAria(lvl)}>
                    {[1, 2].map((n) => (
                      <i key={n} className={lvl >= n ? 'on' : ''} />
                    ))}
                  </span>
                  {skillTitle(id)}
                </button>
              );
            })}
          </div>
        )}
        {(app || href) && (
          <div className="career-apps">
            {app && (
              <a
                href={appLink!.kaiyo ? appLink!.url : hrefIsApp ? href : app.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => window.quaeraOpenApp?.(e.currentTarget, e.nativeEvent, app.key)}
              >
                {appLink!.kaiyo ? `${appLabel} ↗` : appLabel}
              </a>
            )}
            {href && !hrefIsApp &&
              (href.startsWith('/') ? (
                <a href={href} download>
                  {p.download}
                </a>
              ) : (
                <a href={href} target="_blank" rel="noreferrer">
                  {p.openLink}
                </a>
              ))}
          </div>
        )}
        {s.label === 'outside' && externals.length > 0 && (
          <Fold title={p.conditions} count={externals.length}>
            {externals.map((e) => (
              <ExternalBlock key={e.id} ext={e} />
            ))}
          </Fold>
        )}
      </div>

      {s.lessons && s.lessons.length > 0 && (
        <Fold title={p.lessonsTitle} count={s.lessons.length}>
          <ul className="arch-lessons">
            {s.lessons.map((ls, i) => {
              const src = ls.source ? project.external.find((e) => e.id === ls.source) : undefined;
              return (
                <li key={i}>
                  <Rich text={ls.text[locale]} />
                  {src && (
                    <>
                      {' '}
                      <a href={src.url} target="_blank" rel="noreferrer" title={`${src.name}. ${p.checked(date(src.checked))}`}>
                        {p.source}: {src.name} ↗
                      </a>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Fold>
      )}

      {s.bigFile && (
        <div className="arch-block arch-bigfile">
          <button type="button" className="arch-link" aria-expanded={bigOpen} onClick={() => setBigOpen(!bigOpen)}>
            {bigOpen ? '▾' : '▸'} {s.bigFile.title[locale] || p.bigFile}
          </button>
          {bigOpen && (
            <div>
              <ul className="arch-lessons">
                {s.bigFile.methods.map((mt) => {
                  const src = mt.source ? project.external.find((e) => e.id === mt.source) : undefined;
                  return (
                    <li key={mt.id}>
                      <strong>{src ? <a href={src.url} target="_blank" rel="noreferrer">{mt.name} ↗</a> : mt.name}.</strong>{' '}
                      <Rich text={mt.when[locale]} />
                    </li>
                  );
                })}
              </ul>
              <p>
                <strong>{p.bigFileLab}.</strong> <Rich text={s.bigFile.labLimit.text[locale]} />{' '}
                <span className="muted">{p.checked(date(s.bigFile.labLimit.checked))}</span>
              </p>
            </div>
          )}
        </div>
      )}

      <div className="arch-nav">
        <button type="button" className="btn secondary" disabled={index === 0} onClick={() => onGo(index - 1)}>
          {m.back}
        </button>
        <button type="button" className="btn" onClick={() => onGo(index + 1)}>
          {m.next}
        </button>
        {next?.optional && afterNext && (
          <button type="button" className="btn secondary" onClick={() => onGo(index + 2)}>
            {p.skip(next.title[locale])}
          </button>
        )}
        <button type="button" className="btn secondary" onClick={onClose}>
          {p.close}
        </button>
      </div>
    </>
  );
}

/** Финиш маршрута: отметки станций подсвечивают роли. Отметки живут только в состоянии экрана. */
export function ProjectFinishCard({
  marks,
  onToggle,
  onGo,
  onClose,
  onOpenRole,
  onNext,
}: {
  marks: Set<string>;
  onToggle: (id: string) => void;
  onGo: (i: number) => void;
  onClose: () => void;
  onOpenRole: (roleId: string) => void;
  onNext: () => void;
}) {
  const { t, locale } = useI18n();
  const m = t.career.map;
  const p = m.project;
  const { finish, stations } = project;
  const roleName = (id: string) => careerRole(id)?.title[locale] ?? id;

  const hits = finish.roles
    .map((r) => ({ ...r, count: r.stations.filter((id) => marks.has(id)).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const nextTrace = architecture.trace;

  return (
    <>
      <h2>{project.title[locale]}</h2>
      <p className="muted arch-step-n">{p.finishTitle}</p>
      <h3 className="career-h3">{finish.title[locale]}</h3>
      <p>{finish.text[locale]}</p>

      <fieldset className="arch-marks">
        <legend>{p.finishPick}</legend>
        {stations.map((st) => (
          <label key={st.id} className="arch-mark">
            <input type="checkbox" checked={marks.has(st.id)} onChange={() => onToggle(st.id)} />
            <span>{st.title[locale]}</span>
          </label>
        ))}
      </fieldset>

      <div aria-live="polite">
        {hits.length === 0 ? (
          <p className="muted">{p.finishNone}</p>
        ) : (
          <>
            <h4 className="arch-h4">{p.finishRoles}</h4>
            <ul className="arch-roles">
              {hits.map((r) => (
                <li key={r.role}>
                  <button type="button" className="arch-link" onClick={() => onOpenRole(r.role)} title={p.finishOpen(roleName(r.role))}>
                    {roleName(r.role)}
                  </button>
                  . {r.why[locale]}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="arch-block arch-next">
        <h3 className="career-h3">{p.finishNext}</h3>
        <p>{finish.next.text[locale]}</p>
        <button type="button" className="btn" onClick={onNext}>
          {nextTrace.title[locale]}
        </button>
      </div>

      <div className="arch-nav">
        <button type="button" className="btn secondary" onClick={() => onGo(stations.length - 1)}>
          {m.back}
        </button>
        <button type="button" className="btn secondary" onClick={onClose}>
          {p.close}
        </button>
      </div>
    </>
  );
}
