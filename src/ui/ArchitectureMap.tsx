import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { architecture } from '../content/architecture';
import type { ArchLayer, ArchStepExample, LensId } from '../content/architecture';
import { careerRole, careerStages } from '../content/career';
import { skillLevel } from '../career/readiness';
import type { Progress } from '../srs/store';
import { TraceFigure } from './TraceFigure';
import { useI18n } from '../i18n/context';
import { FAMILY, familyKaiyoLink, openFamilyLink } from '../links';
import { labShare, labUrl, openLab } from '../labLink';
import { useSchema } from './SchemaSheet';
import { ProjectFinishCard, ProjectStationCard } from './ProjectRoute';
import { LayerArtifact } from './LayerArtifact';
import { RoleNote } from './RoleNote';
import { ToolNote } from './ToolNote';
import { IconCompass } from './Sidebar';
import { PipelinePreview } from './PipelinePreview';

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

/**
 * Где карта стояла в последний раз: слой, шаг маршрута «одного вопроса», станция
 * «Проекта от и до» и отметки финиша. Читается только при возврате из занятия
 * (`restore`), обычный вход на карту открывается с начала.
 */
let lastPos: { picked: string; step: number | null; pstep: number | null; marks: Set<string> } | null = null;

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

/** Текст в обратных кавычках рисуется кодом, остальное как есть. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

/** Мини-пример шага: две сырые строки как пришли и одна после чистки с ключом точки. */
function StepExample({ ex }: { ex: ArchStepExample }) {
  const { locale } = useI18n();
  const L = ex.labels;
  const cols = ['raw_id', 'customer_name', 'source_file', 'customer_id'];
  const [first] = ex.expect;
  const rows: { stage: string; cells: (string | number | null)[] }[] = [
    ...ex.expect.map((r) => ({ stage: L.before[locale], cells: [r[0], r[1], r[2], null] })),
    { stage: L.after[locale], cells: [null, first[1], null, first[3]] },
  ];
  return (
    <div className="arch-example">
      <p className="muted arch-art-caption">
        <Rich text={ex.caption[locale]} />
      </p>
      <div className="arch-art-scroll">
        <table className="arch-art-table">
          <thead>
            <tr>
              <th scope="col" />
              {cols.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i === rows.length - 1 ? 'arch-example-after' : undefined}>
                <th scope="row">{r.stage}</th>
                {r.cells.map((v, j) => (
                  <td key={j} data-label={cols[j]} className={v === null ? 'arch-example-empty' : undefined}>
                    {v === null ? '' : typeof v === 'string' ? v : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
  restore = false,
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
  /** Вернуться на то место карты, откуда человек ушёл в занятие. */
  restore?: boolean;
}) {
  const { t, locale } = useI18n();
  const m = t.career.map;
  const schema = useSchema();

  const back = restore ? lastPos : null;
  const [picked, setPicked] = useState(() =>
    back?.picked ?? (initialLayer && architecture.layers.some((l) => l.id === initialLayer) ? initialLayer : DEFAULT_LAYER)
  );
  const [lens, setLensState] = useState<LensId>(lastLens);
  const setLens = (next: LensId) => {
    lastLens = next;
    setLensState(next);
  };
  const [step, setStep] = useState<number | null>(back ? back.step : startTrace ? 0 : null);
  /* Станция «Проекта от и до»: индекс; на единицу больше последней станции стоит финиш. Отметки финиша только в состоянии экрана. */
  const [pstep, setPstep] = useState<number | null>(back ? back.pstep : startProject ? 0 : null);
  const [marks, setMarks] = useState<Set<string>>(() => new Set(back?.marks));
  lastPos = { picked, step, pstep, marks };
  const [sqlOpen, setSqlOpen] = useState(false);
  const [labHref, setLabHref] = useState<string | null>(null);
  /* Открыта одна подсказка: инструмент или роль. */
  const [note, setNote] = useState<{ kind: 'tool' | 'role'; id: string } | null>(null);
  const wide = useWide();
  const detailRef = useRef<HTMLElement>(null);
  const touched = useRef(false);
  /* Узкий экран: второе нажатие на открытый слой сворачивает его карточку. На широком карточка всегда рядом. */
  const [collapsed, setCollapsed] = useState(false);

  const { trace, layers, project } = architecture;
  const current = step === null ? null : trace.steps[step];
  const pstation = pstep === null ? null : project.stations[Math.min(pstep, project.stations.length - 1)];
  const routing = current !== null || pstep !== null;
  const selectedId = current ? current.layer : pstation ? pstation.layer : picked;
  const layer = layers.find((l) => l.id === selectedId) ?? layers[0];

  /* Подсказка открыта, только пока инструмент есть в выбранном слое. */
  const openTool = note?.kind === 'tool' && layer.tools.includes(note.id) ? note.id : null;
  const toggleRole = (id: string) => setNote(note?.kind === 'role' && note.id === id ? null : { kind: 'role', id });
  const isRoleOpen = (id: string) => note?.kind === 'role' && note.id === id;

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
  }, [selectedId, step, pstep, wide, collapsed]);

  const pickLayer = (id: string) => {
    touched.current = true;
    if (!wide && !routing && id === picked && !collapsed) {
      setCollapsed(true);
      return;
    }
    setCollapsed(false);
    setStep(null);
    setPstep(null);
    setPicked(id);
  };
  const goStep = (i: number | null) => {
    touched.current = true;
    setCollapsed(false);
    setPstep(null);
    setStep(i);
  };
  const goProject = (i: number | null) => {
    touched.current = true;
    setCollapsed(false);
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
              <button type="button" className="arch-link" aria-expanded={isRoleOpen(id)} onClick={() => toggleRole(id)} title={m.roleLink(roleName(id))}>
                {roleName(id)}
              </button>
            </Fragment>
          ))}
          {note?.kind === 'role' && layer.roles.includes(note.id) && <RoleNote id={note.id} onMore={() => onOpenRole(note.id)} />}
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
                onClick={() => setNote(openTool === name ? null : { kind: 'tool', id: name })}
              >
                {name}
              </button>
            </Fragment>
          ))}
          {openTool && <ToolNote name={openTool} />}
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
                href={familyKaiyoLink(f.key, f.url).url}
                target="_blank"
                rel="noreferrer"
                // Уже открытый Flow получил бы только фокус, и пример бы не открылся.
                onClick={(e) => openFamilyLink(e.currentTarget, e.nativeEvent, f.key)}
              >
                {f.key === 'lab' ? t.nav.familyLabKaiyo : f.key === 'model' ? t.nav.familyModelKaiyo : f.key === 'flow' ? t.nav.familyFlowKaiyo : appName(f.key)} ↗
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
      <LayerArtifact layerId={layer.id} />
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
          <button type="button" className="arch-link" aria-expanded={isRoleOpen(current.role)} onClick={() => toggleRole(current.role!)} title={m.roleLink(roleName(current.role))}>
            {current.who[locale]}
          </button>
        ) : (
          <strong>{current.who[locale]}</strong>
        )}
      </p>
      {current.role && isRoleOpen(current.role) && <RoleNote id={current.role} onMore={() => onOpenRole(current.role!)} />}
      <p>
        <Rich text={current.text[locale]} />
      </p>
      {current.example && <StepExample ex={current.example} />}
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
    const on = l.id === layer.id && (wide || routing || !collapsed);
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

      {!routing && <PipelinePreview />}
    </div>
  );
}

/** Цвет слоя в мини-пути на главной: палитра «Теги» (источники) и полоски lakehouse, как в схемах карты. */
const TEASER_TONE: Record<string, string> = {
  sources: 'erp',
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
  serve: 'crm',
  meeting: 'dist',
};

/**
 * Вход на карту с главной: мини-путь из шести слоёв, под каждым кружки ролей, gold помечен
 * «вы здесь». Стоит первым в боковой колонке главной над картой навыков (аудит docs/audit-start-here-2026-11.md, D):
 * картина «как данные становятся решением» нужна раньше перечня навыков. Наведение или фокус на слое показывает одной фразой, кто там работает;
 * клик открывает карту сразу на этом слое, так что путь работает оглавлением.
 * `hereLayer` позволяет снаружи сказать, где человек сейчас; по умолчанию слой с `here` из данных.
 */
export function DataMapTeaser({
  onOpen,
  hereLayer,
}: {
  onOpen: (target: { layer?: string; trace?: boolean }) => void;
  hereLayer?: string;
}) {
  const { t, locale } = useI18n();
  const m = t.career.map;
  const [hot, setHot] = useState<string | null>(null);
  const here = hereLayer ?? architecture.layers.find((l) => l.here)?.id;
  const roleName = (id: string) => careerRole(id)?.title[locale] ?? id;
  const hotLayer = architecture.layers.find((l) => l.id === hot);
  return (
    <section className="card home-map" data-pair="career" data-guide="map" aria-labelledby="home-map-title">
      <h2 id="home-map-title">
        <span className="pair-ico" aria-hidden>
          <IconCompass />
        </span>
        {m.teaserTitle}
      </h2>
      <p className="muted">{m.teaserLead}</p>
      <ol className="home-map-chain">
        {architecture.layers.map((l) => (
          <li key={l.id} className={`tone-${TEASER_TONE[l.id] ?? 'erp'}${hot === l.id ? ' hot' : ''}`}>
            <button
              type="button"
              className={l.id === here ? 'here' : undefined}
              aria-label={m.teaserLayer(l.title[locale])}
              onClick={() => onOpen({ layer: l.id })}
              onMouseEnter={() => setHot(l.id)}
              onMouseLeave={() => setHot(null)}
              onFocus={() => setHot(l.id)}
              onBlur={() => setHot(null)}
            >
              <span className="home-map-name">{l.title[locale]}</span>
              {/* «Вы здесь» в строке с кружками ролей справа: отдельной строкой оно делало ряд слоёв с gold выше соседнего. */}
              <span className="home-map-roles">
                {l.roles.map((id) => (
                  <span key={id} className="home-map-role" title={roleName(id)} aria-hidden="true">
                    {id.toUpperCase()}
                  </span>
                ))}
                <span className="home-map-roles-text" aria-hidden="true">
                  {l.roles.map(roleName).join(', ')}
                </span>
                {l.id === here && <span className="arch-here">{m.hereBadge}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="home-map-who" aria-live="polite">
        {hotLayer ? m.teaserWho(hotLayer.roles.map(roleName).join(', ')) : m.teaserHint}
      </p>
      <div className="home-map-actions">
        <button type="button" className="btn primary" onClick={() => onOpen({ trace: true })}>
          {m.teaserTrace}
        </button>
        <button type="button" className="link-row" onClick={() => onOpen({})}>
          {m.teaserOpen}
        </button>
      </div>
    </section>
  );
}
