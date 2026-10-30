import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { architecture } from '../content/architecture';
import type { ArchLayer, LensId } from '../content/architecture';
import { careerRole, careerStages } from '../content/career';
import { skillLevel } from '../career/readiness';
import type { Progress } from '../srs/store';
import { Chart } from './Chart';
import type { ChartSpec } from './chartSpec';
import { useI18n } from '../i18n/context';
import { FAMILY } from '../links';
import { labShare, labUrl, openLab } from '../labLink';
import { useSchema } from './SchemaSheet';
import { ProjectFinishCard, ProjectStationCard } from './ProjectRoute';

const DEFAULT_LAYER = architecture.layers.find((l) => l.here)?.id ?? architecture.layers[0].id;
const WIDE = '(min-width: 1240px)';

type BlockId = 'kaiyo' | 'work' | 'money' | 'practice';
const BLOCKS: BlockId[] = ['kaiyo', 'work', 'money', 'practice'];
/** Блок карточки, который линза ставит первым; остальные идут в обычном порядке. */
const FIRST_BLOCK: Record<LensId, BlockId> = { roles: 'work', quaera: 'practice', money: 'money' };

/**
 * Линза, на которой карта была в последний раз: кнопка навыка уводит в занятие,
 * а возврат ставит экран заново. Тот же приём, что у `lastTab` в CareerPage.
 */
let lastLens: LensId = 'roles';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Цепочка в строку, карточка под ней; уже порога цепочка в столбец, карточка под своим слоем. Порог продублирован в styles.css. */
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * График под текстом шага маршрута. Данные лежат в architecture.json и
 * сверяются гейтом с запросом шага; рисует тот же Chart, что и результат
 * запроса в задании, без своих цветов.
 */
function TraceFigure({ kind }: { kind: 'line' | 'split' }) {
  const { locale } = useI18n();
  const { months, outlets, units, names } = architecture.trace.figure;
  const fmt = (month: string, long: boolean) => {
    const [y, mo] = month.split('-').map(Number);
    const text = new Intl.DateTimeFormat(locale, { month: long ? 'long' : 'short', year: long ? undefined : 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, mo - 1, 1))
    );
    return cap(text);
  };
  const last = months.length - 1;

  if (kind === 'line') {
    const spec: ChartSpec = {
      kind: 'line',
      labels: months.map((x) => fmt(x, false)),
      positions: months.map((_, i) => i / last),
      views: [{ series: [{ column: names.units[locale], values: units }], min: 0, max: 5000 }],
    };
    return (
      <div className="arch-figure">
        <Chart spec={spec} numberLocale={locale} />
      </div>
    );
  }

  const ends = [0, last];
  const perOutlet = ends.map((i) => Math.round((units[i] / outlets[i]) * 10) / 10);
  const bars = (column: string, values: number[], max: number): ChartSpec => ({
    kind: 'bar',
    labels: ends.map((i) => fmt(months[i], true)),
    views: [{ series: [{ column, values }], min: 0, max }],
  });
  return (
    <div className="arch-figure arch-figure-split">
      <Chart spec={bars(names.outlets[locale], ends.map((i) => outlets[i]), 80)} numberLocale={locale} />
      <Chart spec={bars(`× ${names.perOutlet[locale]}`, perOutlet, 50)} numberLocale={locale} />
      <Chart spec={bars(`= ${names.units[locale]}`, ends.map((i) => units[i]), 2500)} numberLocale={locale} />
    </div>
  );
}

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
  skills,
  skillTitle,
  onStartSkill,
  onOpenRole,
  initialLayer,
  startTrace = false,
  startProject = false,
}: {
  /** Прогресс по навыкам: тот же `progress.skills`, что считает вкладка «Путь к роли». */
  skills: Progress['skills'];
  skillTitle: (id: string) => string;
  onStartSkill: (skillId: string) => void;
  /** Роль на том же экране: вкладка «Путь к роли», карточка роли. */
  onOpenRole: (roleId: string) => void;
  /** Слой, на котором открыться (клик по слою в карточке на главной). */
  initialLayer?: string;
  /** Открыться сразу на первом шаге маршрута. */
  startTrace?: boolean;
  /** Открыться сразу на первой станции маршрута «Проект от и до». */
  startProject?: boolean;
}) {
  const { t, locale } = useI18n();
  const m = t.career.map;
  const schema = useSchema();

  const [picked, setPicked] = useState(() =>
    initialLayer && architecture.layers.some((l) => l.id === initialLayer) ? initialLayer : DEFAULT_LAYER
  );
  const [lens, setLensState] = useState<LensId>(lastLens);
  const setLens = (next: LensId) => {
    lastLens = next;
    setLensState(next);
  };
  const [step, setStep] = useState<number | null>(startTrace ? 0 : null);
  /* Станция «Проекта от и до»: индекс; на единицу больше последней станции стоит финиш. Отметки финиша только в состоянии экрана. */
  const [pstep, setPstep] = useState<number | null>(startProject ? 0 : null);
  const [marks, setMarks] = useState<Set<string>>(() => new Set());
  const [sqlOpen, setSqlOpen] = useState(false);
  const [labHref, setLabHref] = useState<string | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  const wide = useWide();
  const detailRef = useRef<HTMLElement>(null);
  const touched = useRef(false);

  const { trace, layers, project } = architecture;
  const current = step === null ? null : trace.steps[step];
  const pstation = pstep === null ? null : project.stations[Math.min(pstep, project.stations.length - 1)];
  const routing = current !== null || pstep !== null;
  const selectedId = current ? current.layer : pstation ? pstation.layer : picked;
  const layer = layers.find((l) => l.id === selectedId) ?? layers[0];

  /* Подсказка открыта, только пока инструмент есть в выбранном слое. */
  const openTool = tool && layer.tools.includes(tool) ? tool : null;

  const roleName = (id: string) => careerRole(id)?.title[locale] ?? id;
  const moneyTitle = (kind: string) => architecture.money.find((x) => x.id === kind)?.title[locale] ?? kind;
  const appName = (key: 'model' | 'flow' | 'pandas' | 'lab') =>
    ({ model: t.nav.familyModel, flow: t.nav.familyFlow, pandas: t.nav.familyPandas, lab: t.nav.familyLab })[key];
  const modeName = (mode: 'hands' | 'described') => (mode === 'hands' ? m.modeHands : m.modeDescribed);

  /* Содержимое узла зависит от линзы. Внутри кнопки только span: блоки в ней недопустимы. */
  const nodeBody = (l: ArchLayer) => {
    if (lens === 'roles') {
      return (
        <span className="arch-node-roles">
          {l.roles.map((id) => (
            <span key={id}>{roleName(id)}</span>
          ))}
        </span>
      );
    }
    if (lens === 'money') return <span className="arch-node-money">{cap(moneyTitle(l.money.kind))}</span>;
    const levels = l.practice.skills.map((id) => skillLevel(skills[id]));
    return (
      <span className="arch-node-progress">
        <span className="arch-node-count">{m.nodeProgress(levels.filter((n) => n >= 1).length, levels.length)}</span>
        <span className="arch-node-meter" aria-hidden="true">
          {levels.map((n, i) => (
            <i key={i} className={n >= 1 ? 'on' : ''} />
          ))}
        </span>
        {l.practice.mode === 'described' && <span className="arch-node-described">{m.nodeDescribed}</span>}
      </span>
    );
  };

  const tierClass = (l: ArchLayer) => (l.lake ? ` arch-tier-${l.id}` : '');

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

  /*
   * Карточка или шаг маршрута должны оказаться в поле зрения после клика:
   * на узком экране карточка переезжает под выбранный слой, и без прокрутки
   * шаг маршрута уходил бы за край. При первом показе вкладки не трогаем.
   */
  useEffect(() => {
    if (!touched.current) return;
    /* На узком экране к верху встаёт сам слой, под ним карточка: видно, где шаг. */
    const target = wide ? detailRef.current : detailRef.current?.previousElementSibling;
    target?.scrollIntoView({ block: wide ? 'nearest' : 'start', behavior: 'smooth' });
  }, [selectedId, step, pstep, wide]);

  const pickLayer = (id: string) => {
    touched.current = true;
    setStep(null);
    setPstep(null);
    setPicked(id);
  };
  const goStep = (i: number | null) => {
    touched.current = true;
    setPstep(null);
    setStep(i);
  };
  const goProject = (i: number | null) => {
    touched.current = true;
    setStep(null);
    setPstep(i);
  };
  const toggleMark = (id: string) =>
    setMarks((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /* Группа подряд идущих слоёв lakehouse обводится одной общей зоной. */
  const groups: ArchLayer[][] = [];
  for (const l of layers) {
    const last = groups[groups.length - 1];
    if (last && last[0].lake === l.lake && l.lake) last.push(l);
    else groups.push([l]);
  }

  const stages = careerStages.filter((s) => layer.stages.includes(s.id));
  const apps = FAMILY.filter((f) => layer.practice.apps.includes(f.key));

  const blocks: Record<BlockId, ReactNode> = {
    kaiyo: (
      <>
        <h3 className="career-h3">{m.kaiyoTitle}</h3>
        <p>
          <Rich text={layer.kaiyo[locale]} />
        </p>
      </>
    ),
    work: (
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
        <dd>
          {layer.tools.map((name, i) => (
            <Fragment key={name}>
              {i > 0 && ', '}
              <button
                type="button"
                className="arch-tool"
                aria-expanded={openTool === name}
                title={m.toolAbout(name)}
                onClick={() => setTool(openTool === name ? null : name)}
              >
                {name}
              </button>
            </Fragment>
          ))}
          {openTool && (
            <p className="arch-tool-note" role="note">
              <strong>{openTool}.</strong> {architecture.tools[openTool][locale]}
            </p>
          )}
        </dd>
      </dl>
    ),
    money: (
      <dl className="career-dl">
        <dt>{m.moneyTitle}</dt>
        <dd>
          <strong>{cap(moneyTitle(layer.money.kind))}.</strong> {layer.money.text[locale]}
        </dd>
      </dl>
    ),
    practice: (
      <>
        <h3 className="career-h3">
          {m.practiceTitle}: <span className="arch-mode">{modeName(layer.practice.mode)}</span>
        </h3>
        <p>
          <Rich text={layer.practice.text[locale]} />
        </p>
        {layer.practice.skills.length > 0 && (
          <div className="career-gap-actions">
            {layer.practice.skills.map((id) => {
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
      </>
    ),
  };
  const first = FIRST_BLOCK[lens];

  /*
   * Заголовок и «что происходит» держат карточку на месте, линза переставляет блоки под ними.
   * На узкой раскладке карточка стоит прямо под кнопкой своего слоя с тем же названием и
   * меткой, поэтому заголовок там не повторяется; имя для чтения с экрана берёт aria-label.
   */
  const layerCard = (
    <>
      {wide && (
        <h2>
          {layer.title[locale]}
          {layer.here && <span className="arch-here">{m.hereBadge}</span>}
        </h2>
      )}
      <p className="arch-what">{layer.what[locale]}</p>
      <div className="arch-blocks">
        {[first, ...BLOCKS.filter((b) => b !== first)].map((b) => (
          <div key={b} className="arch-block">
            {blocks[b]}
          </div>
        ))}
      </div>
    </>
  );

  /* Шаг маршрута встаёт на место карточки слоя: так подсвеченный слой и текст шага видны вместе. */
  const traceCard = current && (
    <>
      <h2>{trace.title[locale]}</h2>
      <p className="muted arch-step-n">
        {m.traceStep(step! + 1, trace.steps.length)} · {layer.title[locale]}
      </p>
      <div className="arch-dots" role="group" aria-label={m.traceDots}>
        {trace.steps.map((s, i) => (
          <button
            key={i}
            type="button"
            className={i === step ? 'on' : i < step! ? 'past' : ''}
            aria-label={m.traceGoto(i + 1)}
            aria-current={i === step ? 'step' : undefined}
            onClick={() => goStep(i)}
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
      {current.figure && <TraceFigure kind={current.figure} />}
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
        <button type="button" className="btn secondary" disabled={step === 0} onClick={() => goStep(step! - 1)}>
          {m.back}
        </button>
        {step === trace.steps.length - 1 ? (
          <button type="button" className="btn" onClick={() => goStep(null)}>
            {m.done}
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => goStep(step! + 1)}>
            {m.next}
          </button>
        )}
        <button type="button" className="btn secondary" onClick={() => goStep(null)}>
          {m.traceStop}
        </button>
      </div>
    </>
  );

  const projectCard =
    pstep === null ? null : pstep >= project.stations.length ? (
      <ProjectFinishCard
        marks={marks}
        onToggle={toggleMark}
        onGo={goProject}
        onClose={() => goProject(null)}
        onOpenRole={onOpenRole}
        onNext={() => goStep(0)}
      />
    ) : (
      <ProjectStationCard
        key={pstep}
        index={pstep}
        skills={skills}
        skillTitle={skillTitle}
        onStartSkill={onStartSkill}
        onOpenRole={onOpenRole}
        onGo={goProject}
        onClose={() => goProject(null)}
      />
    );

  const detail = (
    <section ref={detailRef} className={`card arch-card${tierClass(layer)}${routing ? ' arch-trace' : ''}`} aria-live={pstep === null ? 'polite' : undefined} aria-label={!routing && !wide ? layer.title[locale] : undefined}>
      {projectCard || traceCard || layerCard}
    </section>
  );

  /* Стрелка между слоями: направление задаёт CSS, вправо в строке и вниз в столбце. */
  const arrow = <span className="arch-arrow" aria-hidden="true" />;

  /* На узком экране карточка раскрывается прямо под выбранным слоем. */
  const layerButton = (l: ArchLayer, i: number) => {
    const on = l.id === layer.id;
    const dim = routing && !on;
    return (
      <Fragment key={l.id}>
        {i > 0 && arrow}
        <button
          type="button"
          aria-pressed={on}
          className={`arch-layer${tierClass(l)}${on ? ' on' : ''}${dim ? ' dim' : ''}`}
          onClick={() => pickLayer(l.id)}
        >
          <span className="arch-layer-title">
            {l.title[locale]}
            {l.here && <span className="arch-here">{m.hereBadge}</span>}
          </span>
          <span className="arch-layer-caption">{nodeBody(l)}</span>
        </button>
        {on && !wide && detail}
      </Fragment>
    );
  };

  return (
    <div className="arch">
      <p className="intro-lead">{m.lead}</p>

      {/* Единственное сплошное действие экрана: своё место над картой, чтобы маршрут мог вырасти в главный проход. */}
      {!routing && (
        <div className="arch-route">
          <button type="button" className="btn arch-trace-start" onClick={() => goProject(0)}>
            {project.title[locale]}
          </button>
          <button type="button" className="btn secondary arch-trace-start" onClick={() => goStep(0)}>
            {trace.title[locale]}
          </button>
        </div>
      )}

      <div className="tabs arch-lenses" role="group" aria-label={m.lensesAria}>
        {architecture.lenses.map((ln) => (
          <button key={ln.id} type="button" aria-pressed={lens === ln.id} onClick={() => setLens(ln.id)}>
            {ln.title[locale]}
          </button>
        ))}
      </div>

      <div className="arch-grid">
        <div className="arch-layers" role="group" aria-label={m.layersAria}>
          {groups.map((g, gi) =>
            g[0].lake ? (
              <Fragment key={g[0].id}>
                {gi > 0 && arrow}
                <div className="arch-lake">
                  <p className="arch-lake-title">{architecture.lake.title[locale]}</p>
                  <div className="arch-lake-row">{g.map(layerButton)}</div>
                  <p className="arch-lake-note">{architecture.lake.note[locale]}</p>
                </div>
              </Fragment>
            ) : (
              layerButton(g[0], gi)
            )
          )}
        </div>

        {wide && detail}
      </div>
    </div>
  );
}

/**
 * Вход на карту с главной: цепочка слоёв одной строкой, gold помечен «вы здесь».
 * Стоит внизу главной над семьёй Quaera: верх главной держит кнопку занятия
 * на первом экране, а здесь карточка объясняет блок под собой (где в работе
 * компании живут Lab, Model, Flow и Pandas). Слой в цепочке открывает карту
 * сразу на нём, так что цепочка работает оглавлением.
 */
export function DataMapTeaser({ onOpen }: { onOpen: (target: { layer?: string; trace?: boolean }) => void }) {
  const { t, locale } = useI18n();
  const m = t.career.map;
  return (
    <section className="card home-map" aria-labelledby="home-map-title">
      <h2 id="home-map-title">{m.teaserTitle}</h2>
      <p className="muted">{m.teaserLead}</p>
      <ol className="home-map-chain">
        {architecture.layers.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              className={l.here ? 'here' : undefined}
              aria-label={m.teaserLayer(l.title[locale])}
              onClick={() => onOpen({ layer: l.id })}
            >
              {l.title[locale]}
              {l.here && <span className="arch-here">{m.hereBadge}</span>}
            </button>
          </li>
        ))}
      </ol>
      <div className="row">
        <button type="button" className="btn secondary" onClick={() => onOpen({})}>
          {m.teaserOpen}
        </button>
        <button type="button" className="btn secondary" onClick={() => onOpen({ trace: true })}>
          {architecture.trace.title[locale]}
        </button>
      </div>
    </section>
  );
}
