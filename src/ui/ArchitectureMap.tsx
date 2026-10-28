import { Fragment, useEffect, useState } from 'react';
import { architecture } from '../content/architecture';
import type { ArchLayer, LensId } from '../content/architecture';
import { careerRole, careerStages } from '../content/career';
import { useI18n } from '../i18n/context';
import { FAMILY } from '../links';
import { labShare, labUrl, openLab } from '../labLink';
import { useSchema } from './SchemaSheet';

const DEFAULT_LAYER = architecture.layers.find((l) => l.here)?.id ?? architecture.layers[0].id;

/** Текст в обратных кавычках рисуется кодом, остальное как есть. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

/**
 * «Карта данных компании»: путь данных от источников до встречи, роли на нём
 * и маршрут одного вопроса («Nettora») сквозь все слои.
 *
 * Весь текст приходит из content/architecture.ts, роли и этапы берутся из
 * career.json по id; здесь только раскладка и состояние выбора. Своего
 * хранилища нет: выбранный слой и шаг маршрута живут, пока открыта вкладка.
 */
export function ArchitectureMap({
  skillTitle,
  onStartSkill,
  onOpenRole,
}: {
  skillTitle: (id: string) => string;
  onStartSkill: (skillId: string) => void;
  /** Роль на том же экране: вкладка «Путь к роли», карточка роли. */
  onOpenRole: (roleId: string) => void;
}) {
  const { t, locale } = useI18n();
  const m = t.career.map;
  const schema = useSchema();

  const [picked, setPicked] = useState(DEFAULT_LAYER);
  const [lens, setLens] = useState<LensId>('roles');
  const [step, setStep] = useState<number | null>(null);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [labHref, setLabHref] = useState<string | null>(null);

  const { trace, layers } = architecture;
  const current = step === null ? null : trace.steps[step];
  const selectedId = current ? current.layer : picked;
  const layer = layers.find((l) => l.id === selectedId) ?? layers[0];

  const roleName = (id: string) => careerRole(id)?.title[locale] ?? id;
  const moneyTitle = (kind: string) => architecture.money.find((x) => x.id === kind)?.title[locale] ?? kind;
  const appName = (key: 'model' | 'flow' | 'pandas' | 'lab') =>
    ({ model: t.nav.familyModel, flow: t.nav.familyFlow, pandas: t.nav.familyPandas, lab: t.nav.familyLab })[key];
  const modeName = (mode: 'hands' | 'described') => (mode === 'hands' ? m.modeHands : m.modeDescribed);

  const caption = (l: ArchLayer): string => {
    if (lens === 'roles') return l.roles.map(roleName).join(', ');
    if (lens === 'quaera') return modeName(l.practice.mode);
    return moneyTitle(l.money.kind);
  };

  /* Ссылка в Lab у шага с запросом: таблицы берутся из схемы, как у «Открыть в Lab» в задании. */
  const sql = current?.sql;
  useEffect(() => {
    setSqlOpen(false);
    setLabHref(null);
    if (!sql || !schema) return;
    let live = true;
    labUrl(labShare(trace.title[locale], sql, 'sql', schema.tables.map((tb) => tb.table))).then(
      (url) => live && setLabHref(url),
      () => live && setLabHref(null)
    );
    return () => {
      live = false;
    };
  }, [sql, schema, locale, trace.title]);

  const pickLayer = (id: string) => {
    setStep(null);
    setPicked(id);
  };

  /* Группа подряд идущих слоёв lakehouse обводится одной рамкой. */
  const groups: ArchLayer[][] = [];
  for (const l of layers) {
    const last = groups[groups.length - 1];
    if (last && last[0].lake === l.lake && l.lake) last.push(l);
    else groups.push([l]);
  }

  const layerButton = (l: ArchLayer) => {
    const on = l.id === layer.id;
    const dim = current !== null && !on;
    return (
      <button
        key={l.id}
        type="button"
        aria-pressed={on}
        className={`arch-layer${on ? ' on' : ''}${dim ? ' dim' : ''}`}
        onClick={() => pickLayer(l.id)}
      >
        <span className="arch-layer-title">
          {l.title[locale]}
          {l.here && <span className="arch-here">{m.hereBadge}</span>}
        </span>
        <span className="arch-layer-caption">{caption(l)}</span>
      </button>
    );
  };

  const stages = careerStages.filter((s) => layer.stages.includes(s.id));
  const apps = FAMILY.filter((f) => layer.practice.apps.includes(f.key));

  return (
    <div className="arch">
      <p className="intro-lead">{m.lead}</p>

      <div className="tabs arch-lenses" role="group" aria-label={m.lensesAria}>
        {architecture.lenses.map((ln) => (
          <button key={ln.id} type="button" aria-pressed={lens === ln.id} onClick={() => setLens(ln.id)}>
            {ln.title[locale]}
          </button>
        ))}
      </div>

      <div className="arch-grid">
        <div className="arch-layers" role="group" aria-label={m.layersAria}>
          {groups.map((g) =>
            g[0].lake ? (
              <div key={g[0].id} className="arch-lake">
                <p className="arch-lake-title">{architecture.lake.title[locale]}</p>
                {g.map(layerButton)}
                <p className="arch-lake-note">{architecture.lake.note[locale]}</p>
              </div>
            ) : (
              layerButton(g[0])
            )
          )}
        </div>

        <section className="card arch-card" aria-live="polite">
          <h2>
            {layer.title[locale]}
            {layer.here && <span className="arch-here">{m.hereBadge}</span>}
          </h2>
          <p>{layer.what[locale]}</p>
          <h3 className="career-h3">{m.kaiyoTitle}</h3>
          <p>
            <Rich text={layer.kaiyo[locale]} />
          </p>
          <dl className="career-dl">
            <dt>{m.rolesTitle}</dt>
            <dd>
              {layer.roles.map((id, i) => (
                <Fragment key={id}>
                  {i > 0 && ', '}
                  <button type="button" className="arch-link" onClick={() => onOpenRole(id)} title={m.roleLink(roleName(id))}>
                    {roleName(id)}
                  </button>
                </Fragment>
              ))}
            </dd>
            <dt>{m.stagesTitle}</dt>
            <dd>{stages.map((s) => s.title[locale]).join(', ')}</dd>
            <dt>{m.toolsTitle}</dt>
            <dd>{layer.tools.join(', ')}</dd>
            <dt>{m.moneyTitle}</dt>
            <dd>
              <strong>{moneyTitle(layer.money.kind)}.</strong> {layer.money.text[locale]}
            </dd>
          </dl>
          <h3 className="career-h3">
            {m.practiceTitle}: <span className="arch-mode">{modeName(layer.practice.mode)}</span>
          </h3>
          <p>
            <Rich text={layer.practice.text[locale]} />
          </p>
          {layer.practice.skills.length > 0 && (
            <div className="career-gap-actions">
              {layer.practice.skills.map((id) => (
                <button key={id} type="button" className="btn secondary career-skill-btn" onClick={() => onStartSkill(id)}>
                  {skillTitle(id)}
                </button>
              ))}
            </div>
          )}
          {apps.length > 0 && (
            <div className="career-apps">
              {apps.map((f) => (
                <a
                  key={f.key}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => window.quaeraOpenApp?.(e.currentTarget, e.nativeEvent, f.key)}
                >
                  {appName(f.key)} ↗
                </a>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card arch-trace">
        <h2>{trace.title[locale]}</h2>
        {current === null ? (
          <button type="button" className="btn" onClick={() => setStep(0)}>
            {trace.title[locale]}
          </button>
        ) : (
          <>
            <p className="muted arch-step-n">{m.traceStep(step! + 1, trace.steps.length)}</p>
            <div className="arch-dots" role="group" aria-label={m.traceDots}>
              {trace.steps.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className={i === step ? 'on' : i < step! ? 'past' : ''}
                  aria-label={m.traceGoto(i + 1)}
                  aria-current={i === step ? 'step' : undefined}
                  onClick={() => setStep(i)}
                />
              ))}
            </div>
            <p className="arch-who">
              {current.role ? (
                <button type="button" className="arch-link" onClick={() => onOpenRole(current.role!)} title={m.roleLink(roleName(current.role))}>
                  {current.who[locale]}
                </button>
              ) : (
                <strong>{current.who[locale]}</strong>
              )}
            </p>
            <p>
              <Rich text={current.text[locale]} />
            </p>
            {current.sql && (
              <>
                <div className="arch-sql-actions">
                  <button type="button" className="btn secondary" aria-expanded={sqlOpen} onClick={() => setSqlOpen(!sqlOpen)}>
                    {sqlOpen ? m.hideSql : m.showSql}
                  </button>
                  {labHref && (
                    <a
                      className="link-row lab-open"
                      href={labHref}
                      target="_blank"
                      rel="noopener"
                      title={m.openLabTitle}
                      onClick={(e) => openLab(labHref, e)}
                    >
                      {m.openLab} ↗
                    </a>
                  )}
                </div>
                {sqlOpen && (
                  <pre className="arch-sql">
                    <code>{current.sql}</code>
                  </pre>
                )}
              </>
            )}
            <div className="arch-nav">
              <button type="button" className="btn secondary" disabled={step === 0} onClick={() => setStep(step! - 1)}>
                {m.back}
              </button>
              {step === trace.steps.length - 1 ? (
                <button type="button" className="btn" onClick={() => setStep(null)}>
                  {m.done}
                </button>
              ) : (
                <button type="button" className="btn" onClick={() => setStep(step! + 1)}>
                  {m.next}
                </button>
              )}
              <button type="button" className="btn secondary" onClick={() => setStep(null)}>
                {m.traceStop}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
