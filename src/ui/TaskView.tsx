import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task, TaskStep } from '../content/types';
import { taskTables } from '../content';
import type { Executor, GradeResult, Preview, SchemaDoc } from '../engine/types';
import { diagnoseComparison, diagnosePythonError, diagnoseSqlError, type Feedback } from '../engine/diagnose';
import { gradeBlanks } from '../engine/textGrade';
import { useI18n } from '../i18n/context';
import { CodeEditor } from './CodeEditor';
import { ResultTable } from './ResultTable';

/**
 * Экран задания.
 *
 * Три режима ввода — не украшение, а адаптация к обстоятельствам: predict
 * читается одной рукой в дороге, fill даёт строительные леса на новом приёме,
 * write требует полного восстановления из памяти. Один и тот же навык
 * проходит все три ступени по мере освоения.
 *
 * Экран разделён на две части, и граница между ними — не косметика.
 * `TaskView` — оболочка задания: шапка, счётчик шагов, разбор и переход
 * дальше; она же держит состояние **между** шагами. `StepView` — один шаг:
 * редактор или варианты ответа, проверка, подсказки, сдача. Одношаговое
 * задание — тот же массив на один элемент (см. resolveSteps), поэтому двух
 * реализаций одного экрана не существует: 232 существующих задания
 * и двухэтапное проигрываются одним и тем же кодом.
 */

/** Первая подсказка открывается не сразу: пауза на самостоятельную попытку. */
const HINT_DELAY_SEC = 20;

/** Сколько секунд паузы осталось до первой подсказки — считается от первого показа шага, а не от монтирования. */
const remainingWait = (startedAt: number) =>
  Math.max(0, HINT_DELAY_SEC - Math.floor((Date.now() - startedAt) / 1000));

export interface TaskOutcome {
  correct: boolean;
  wrongAttempts: number;
  hintsUsed: number;
}

/**
 * Черновик одного шага — всё, что человек успел сделать на нём и что обязано
 * пережить уход на карточку теории и возврат обратно.
 *
 * Хранится не здесь, а в App (см. taskDrafts): экран задания перемонтируется
 * на каждом переходе по шагам занятия, и любое состояние внутри него уходит
 * вместе с набранным запросом. Пока вернуться на шаг было нельзя, этого не
 * было видно; с появлением возврата это стало главным способом потерять работу.
 *
 * `running` в черновик не входит намеренно: незавершённый запрос к исполнителю
 * уезжает вместе с экраном, и восстановленное «идёт проверка» было бы враньём
 * про процесс, которого уже нет.
 */
export interface StepDraft {
  code: string;
  blanks: string[];
  chosen: number | null;
  /**
   * Текущий порядок пунктов шага `order` — индексы `step.items` слева направо.
   *
   * Пустой массив у всех прочих шагов, и он же — «порядок ещё не разложен».
   * Восстановление из хранилища и правка контента лечатся одним и тем же
   * условием на экране (длина не сошлась — разложить заново), поэтому
   * версия хранилища не двигается и старое незаконченное занятие не теряется.
   */
  arrangement: number[];
  preview: Preview | null;
  expected: Preview | null;
  feedback: Feedback | null;
  solved: boolean;
  wasCorrect: boolean;
  wrongAttempts: number;
  hintsShown: number;
  /** Момент первого показа шага: пауза перед первой подсказкой не начинается заново при возврате. */
  startedAt: number;
  mobilePanel: 'brief' | 'work' | 'results';
}

/**
 * Черновик задания: где человек внутри задания и что он сделал на каждом шаге.
 *
 * Массив, а не одно состояние на задание, — ровно то, ради чего заводился
 * многошаговый тип: шаг интерпретации обязан видеть результат расчётного шага,
 * а возврат назад — застать свой запрос там, где его оставили. Шаги, до
 * которых человек не дошёл, в массиве отсутствуют: черновик заводится
 * в момент первого входа на шаг, иначе двадцатисекундная пауза перед
 * подсказкой оказалась бы уже истёкшей к моменту, когда шаг наконец открыли.
 */
export interface TaskDraft {
  stepIndex: number;
  steps: StepDraft[];
}

export interface TaskDraftStore {
  read: (taskId: string) => TaskDraft | undefined;
  write: (taskId: string, draft: TaskDraft) => void;
}

/**
 * Шаги задания. Одношаговое поднимается в тот же массив на один элемент.
 *
 * Подъём, а не развилка «если steps есть — новый экран, иначе старый»:
 * развилка означала бы две реализации проверки, подсказок и черновика,
 * и они разошлись бы молча — тем же способом, каким в этом проекте уже
 * расходились бы второй счёт мастерства и второй список связей таблиц.
 */
export function resolveSteps(task: Task): TaskStep[] {
  if (task.steps?.length) return task.steps;
  if (task.mode === 'order') {
    return [
      {
        kind: 'order',
        question: task.orderQuestion ?? '',
        items: task.items ?? [],
        scenario: task.scenario,
        hints: task.hints,
      },
    ];
  }
  if (task.mode === 'predict') {
    return [
      {
        kind: 'interpret',
        question: task.predictQuestion ?? '',
        options: task.options ?? [],
        hints: task.hints,
        predictSql: task.predictSql,
        scenario: task.scenario,
      },
    ];
  }
  return [
    {
      kind: 'compute',
      mode: task.mode,
      goal: '',
      starter: task.starter,
      template: task.template,
      blanks: task.blanks,
      solution: task.solution ?? '',
      orderMatters: task.orderMatters,
      hints: task.hints,
    },
  ];
}

/**
 * Раскладка пунктов на экране: перестановка, детерминированная от id задания.
 *
 * Детерминированная — чтобы возврат на шаг не перетасовывал список заново
 * (человек запомнил, где что лежало, и второй показ обязан выглядеть так же).
 *
 * **И заведомо не тождественная**: последней строкой перестановка, случайно
 * совпавшая с правильной, поворачивается на один. Иначе существовал бы
 * класс заданий, решаемых бездействием, и ловить его пришлось бы гейтом —
 * то есть проверять свойство, которое дешевле сделать невозможным.
 */
export function shuffledOrder(seed: string, n: number): number[] {
  const idx = [...Array(n).keys()];
  // FNV-1a по строке id — нужна воспроизводимость, а не качество хеша.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  if (n > 1 && idx.every((v, i) => v === i)) idx.push(idx.shift() as number);
  return idx;
}

/** Пустой черновик шага — то самое состояние, с которого шаг начинается впервые. */
export function blankStepDraft(step: TaskStep): StepDraft {
  const template = step.kind === 'compute' ? step.template : undefined;
  return {
    code: step.kind === 'compute' ? step.starter ?? '' : '',
    blanks: new Array(template ? template.split('___').length - 1 : 0).fill(''),
    chosen: null,
    arrangement: [],
    preview: null,
    expected: null,
    feedback: null,
    solved: false,
    wasCorrect: false,
    wrongAttempts: 0,
    hintsShown: 0,
    startedAt: Date.now(),
    mobilePanel: 'brief',
  };
}

/** Пустой черновик задания: первый шаг заведён, остальные — по мере входа на них. */
export function blankDraft(task: Task): TaskDraft {
  return { stepIndex: 0, steps: [blankStepDraft(resolveSteps(task)[0])] };
}

interface Props {
  task: Task;
  executor: Executor;
  schema: SchemaDoc | null;
  /** Хранилище черновиков занятия — см. TaskDraft. */
  drafts: TaskDraftStore;
  /** Название навыка задания — для пилюли рядом с уровнем. */
  skillTitle: string;
  onDone: (o: TaskOutcome) => void;
  /** Открывает шторку схемы; с именем таблицы — сразу раскрытой на ней (чип). */
  onOpenSchema: (table?: string) => void;
  /**
   * Открыть карточку приёма этого навыка. Отсутствует, если в очереди
   * занятия её не было (навык уже введён раньше), — тогда пилюля навыка
   * остаётся текстом без клика, а не ведёт наружу из занятия.
   */
  onOpenLesson?: () => void;
  /**
   * Реплика персонажа про сданный результат — только у заданий режима
   * истории (см. StoryStep.after). Стоит рядом с разбором, потому что это
   * то же место разговора: разбор объясняет решение, реплика показывает,
   * что с ним стало дальше. Своего экрана ей не дают намеренно — в дне
   * из семи экранов восьмой ради одной фразы читался бы как заминка.
   */
  afterNote?: { from: string; text: string };
}

export function TaskView({
  task,
  executor,
  schema,
  drafts,
  skillTitle,
  onDone,
  onOpenSchema,
  onOpenLesson,
  afterNote,
}: Props) {
  const { t } = useI18n();
  const steps = useMemo(() => resolveSteps(task), [task]);
  /**
   * Стартовое состояние берётся из черновика этого задания, а не из пустоты:
   * человек, ушедший на карточку теории и вернувшийся, застаёт свой запрос,
   * открытые подсказки и результат проверки ровно там, где их оставил.
   */
  const [draft, setDraft] = useState<TaskDraft>(() => drafts.read(task.id) ?? blankDraft(task));

  /**
   * Смена задания без перемонтирования. Сейчас её не бывает — App рендерит
   * экран с `key={task.id}`, — но компонент не должен на это полагаться:
   * состояние принадлежит заданию, а не позиции в дереве. Эффект нарочно
   * ничего не делает на монтировании (сравнение с shownTaskId): иначе он
   * затирал бы только что восстановленный черновик пустыми значениями.
   */
  const shownTaskId = useRef(task.id);
  useEffect(() => {
    if (shownTaskId.current === task.id) return;
    shownTaskId.current = task.id;
    setDraft(drafts.read(task.id) ?? blankDraft(task));
  }, [task, drafts]);

  /**
   * Черновик пишется после каждого рендера, без списка зависимостей.
   *
   * Хранилище — обычный Map в ref у App: запись в него ничего не
   * перерисовывает, поэтому дешевле писать всегда, чем перечислять
   * зависимости и завести лишний источник ошибок — забытое поле здесь
   * означало бы молча потерянную работу человека.
   */
  useEffect(() => {
    drafts.write(task.id, draft);
  });

  /** Заводит черновики всех шагов до i включительно — см. TaskDraft про ленивое заведение. */
  const grown = (list: StepDraft[], i: number): StepDraft[] => {
    const next = [...list];
    while (next.length <= i) next.push(blankStepDraft(steps[next.length]));
    return next;
  };

  const patchStep = (i: number, p: Partial<StepDraft> | ((d: StepDraft) => Partial<StepDraft>)) =>
    setDraft((d) => {
      const list = grown(d.steps, i);
      list[i] = { ...list[i], ...(typeof p === 'function' ? p(list[i]) : p) };
      return { ...d, steps: list };
    });

  const goStep = (i: number) => {
    setDraft((d) => ({ ...d, stepIndex: i, steps: grown(d.steps, i) }));
    window.scrollTo({ top: 0 });
  };

  const index = Math.min(draft.stepIndex, steps.length - 1);
  const step = steps[index];
  const stepDraft = draft.steps[index] ?? blankStepDraft(step);
  const last = index === steps.length - 1;

  /**
   * Что интерпретируется на шаге `interpret`: результат предыдущего расчётного
   * шага. Свой — когда расчёт сошёлся; эталонный — когда нет.
   *
   * Второго варианта не должно было бы существовать, если бы шаг
   * интерпретации открывался только после верного расчёта. Он открывается
   * всегда: интерпретация — ценная половина задания, и человек, застрявший
   * на запросе, иначе ни разу не увидит, ради чего этот запрос писался.
   * Цена решения — честная подпись под таблицей, а не тихая подмена.
   */
  const prevStep = index > 0 ? steps[index - 1] : null;
  const prevDraft = index > 0 ? draft.steps[index - 1] : undefined;
  const carried = step.kind === 'interpret' ? prevDraft?.preview ?? prevDraft?.expected ?? null : null;
  /*
   * Подпись под таблицей выведена из того, сошёлся ли расчёт, а не из того,
   * откуда взялась таблица. Разница видна ровно в одном месте и стоила бы
   * вранья: после перезагрузки своя таблица не восстанавливается (она
   * производная), эталон догружается заново — и человек, решивший шаг верно,
   * прочитал бы под своими же числами «расчёт не сошёлся». Когда расчёт
   * сошёлся, обе таблицы совпадают по определению — на этом и стоит весь тип.
   */
  const carriedIsReference = step.kind === 'interpret' && prevDraft !== undefined && !prevDraft.wasCorrect;

  /**
   * Таблица в черновик не сохраняется (она производная, см. StoredDraft),
   * поэтому после перезагрузки интерпретировать было бы нечего — выполняем
   * эталон предыдущего шага один раз. Ref, а не состояние: повторный запуск
   * ничего бы не изменил, а гонку с первым завёл бы.
   */
  const fetching = useRef(false);
  useEffect(() => {
    if (step.kind !== 'interpret' || carried || !prevStep || prevStep.kind !== 'compute') return;
    if (fetching.current || !prevStep.solution) return;
    fetching.current = true;
    executor
      .exec(prevStep.solution)
      .then((r) => patchStep(index - 1, { expected: r }))
      .catch(() => undefined)
      .finally(() => {
        fetching.current = false;
      });
  }, [step, carried, prevStep, index, executor]);

  /** Таблицы этого задания — для чипов над условием, см. taskTables. */
  const tables = useMemo(() => taskTables(task, schema), [task, schema]);

  // Только расчётный шаг: интерпретация уже держит данные и ответ рядом двумя
  // колонками (.task-situation/.task-answer), и той же тройной развязки
  // там не нужно.
  const tabbed = step.kind === 'compute';
  const mobilePanel = stepDraft.mobilePanel;

  /**
   * Итог задания — сумма по шагам. Верно только тогда, когда верны все шаги:
   * посчитал и не понял, что посчитал, — это не решённое задание, и интервал
   * повторения обязан это отражать.
   */
  const finish = () =>
    onDone({
      correct: draft.steps.length === steps.length && draft.steps.every((s) => s.wasCorrect),
      wrongAttempts: draft.steps.reduce((n, s) => n + s.wrongAttempts, 0),
      hintsUsed: draft.steps.reduce((n, s) => n + s.hintsShown, 0),
    });

  return (
    <>
      {tabbed && (
        <div className="tabs task-mobile-tabs" role="tablist">
          <button
            role="tab"
            aria-pressed={mobilePanel === 'brief'}
            onClick={() => patchStep(index, { mobilePanel: 'brief' })}
          >
            {t.task.mobileTabBrief}
          </button>
          <button
            role="tab"
            aria-pressed={mobilePanel === 'work'}
            onClick={() => patchStep(index, { mobilePanel: 'work' })}
          >
            {t.task.mobileTabWork}
          </button>
          <button
            role="tab"
            aria-pressed={mobilePanel === 'results'}
            onClick={() => patchStep(index, { mobilePanel: 'results' })}
          >
            {t.task.mobileTabResults}
          </button>
        </div>
      )}

      <div className="card" data-mobile-hidden={tabbed && mobilePanel !== 'brief'}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span className="pill level">{t.task.levelLabel(task.level)}</span>
          {/*
           * Название навыка задания — раньше в шапке экрана стояло только
           * «Занятие», и понять, какая тема сейчас проходится, было неоткуда.
           * Кликабельна, только если карточка приёма этого навыка есть
           * в очереди занятия (см. onOpenLesson в App): иначе клик уводил бы
           * из занятия наружу без возможности продолжить с того же места.
           */}
          {skillTitle && (onOpenLesson ? (
            <button className="pill" onClick={onOpenLesson}>
              {skillTitle}
            </button>
          ) : (
            <span className="pill">{skillTitle}</span>
          ))}
          {/*
           * Режим показывается по шагу, а не по заданию: на двухэтапном они
           * разные, и пилюля «Написать запрос» над вариантами ответа была бы
           * прямой ложью про то, что сейчас делают.
           */}
          <span className="pill">
            {step.kind === 'interpret'
              ? t.task.modePredict
              : step.kind === 'order'
                ? t.task.modeOrder
                : step.mode === 'fill'
                  ? t.task.modeFill
                  : t.task.modeWrite}
          </span>
          {steps.length > 1 && <span className="pill">{t.task.stepLabel(index + 1, steps.length)}</span>}
          {/* Схема таблиц не нужна там, где запрос не пишут: задание про
              разговор с заказчиком к dim_product отношения не имеет. */}
          {!task.scenario && step.kind !== 'order' && (
            <button className="pill" onClick={() => onOpenSchema()} style={{ marginLeft: 'auto' }}>
              {t.task.schemaBtn}
            </button>
          )}
        </div>
        {/*
         * Таблицы этого задания — выведены из его же кода (см. taskTables),
         * не переписаны отдельным полем: второй источник правды разошёлся бы
         * при первой же правке запроса. Клик по имени открывает схему сразу
         * на этой таблице, а не общий список — незачем искать её среди
         * двенадцати. Пусто у domain (там нет кода вовсе) и у горстки заданий,
         * где данные собраны прямо в CTE, без обращения к таблицам датасета.
         */}
        {tables.length > 0 && (
          <div className="table-chips">
            {tables.map((name) => (
              <button key={name} className="table-chip" onClick={() => onOpenSchema(name)}>
                <code>{name}</code>
              </button>
            ))}
          </div>
        )}
        <h2 style={{ fontSize: 17 }}>{task.title}</h2>
        <p className="brief">{task.brief}</p>
        <div className="goal">{task.goal}</div>
      </div>

      <StepView
        key={index}
        task={task}
        step={step}
        draft={stepDraft}
        patch={(p) => patchStep(index, p)}
        executor={executor}
        schema={schema}
        carried={carried}
        carriedIsReference={carriedIsReference}
      />

      {stepDraft.solved && (
        <>
          {/* Разбор — про задание целиком, поэтому только после последнего шага. */}
          {last && (
            <div className="card">
              <h2>{t.task.explainTitle}</h2>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{task.explain}</p>
            </div>
          )}
          {last && afterNote && (
            <div className="card story-after">
              <p className="story-mode-from">{afterNote.from}</p>
              <p className="story-mode-text">{afterNote.text}</p>
            </div>
          )}
          {step.kind === 'compute' && (
            <details className="table-doc">
              <summary>{t.task.solutionSummary}</summary>
              <pre className="sql-block" style={{ border: 'none', borderRadius: 0 }}>
                {step.solution}
              </pre>
            </details>
          )}
          <button className="btn" onClick={last ? finish : () => goStep(index + 1)}>
            {last ? t.task.nextBtn : t.task.nextStepBtn}
          </button>
        </>
      )}

      {/*
       * Назад по шагам задания — как и назад по шагам занятия: перечитать
       * своё решение перед тем, как отвечать про его смысл. Переиграть шаг
       * это не даёт — закрытый шаг остаётся закрытым. На первом шаге кнопки
       * нет: назад оттуда ведёт наружу из задания, и для этого есть шапка.
       */}
      {index > 0 && (
        <button className="btn secondary" onClick={() => goStep(index - 1)}>
          {t.task.prevStepBtn}
        </button>
      )}
    </>
  );
}

/**
 * Один шаг задания: ввод или выбор, проверка, подсказки, сдача.
 *
 * Управляемый компонент — всё, что переживает уход с экрана, лежит в `draft`
 * у оболочки, а `patch` пишет туда же. Своё состояние здесь только то, что
 * не должно переживать ничего: идёт ли проверка прямо сейчас, запускали ли
 * зачтённый запрос ещё раз, какие пропуски подсвечены по последней проверке.
 */
function StepView({
  task,
  step,
  draft,
  patch,
  executor,
  schema,
  carried,
  carriedIsReference,
}: {
  task: Task;
  step: TaskStep;
  draft: StepDraft;
  patch: (p: Partial<StepDraft> | ((d: StepDraft) => Partial<StepDraft>)) => void;
  executor: Executor;
  schema: SchemaDoc | null;
  /** Результат предыдущего расчётного шага — то, что интерпретируется. */
  carried: Preview | null;
  /** Показанная таблица — эталон, а не результат человека (расчёт не сошёлся). */
  carriedIsReference: boolean;
}) {
  const { t, locale } = useI18n();
  const [running, setRunning] = useState(false);
  /**
   * Зачтённое задание запускали заново. Не сохраняется и не восстанавливается
   * намеренно: это состояние одного взгляда на свой запрос, а не результат,
   * от которого что-то зависит дальше.
   */
  const [explored, setExplored] = useState(false);
  /** Пропуски, разошедшиеся с эталоном на последней проверке, — для подсветки полей. */
  const [wrongBlanks, setWrongBlanks] = useState<number[]>([]);
  const [waitLeft, setWaitLeft] = useState(() => remainingWait(draft.startedAt));

  useEffect(() => {
    if (waitLeft <= 0) return;
    const id = setInterval(() => setWaitLeft(remainingWait(draft.startedAt)), 1000);
    return () => clearInterval(id);
  }, [waitLeft, draft.startedAt]);

  const suggestions = useMemo(() => {
    if (!schema) return [];
    const tables = schema.tables.map((s) => s.table);
    const columns = [...new Set(schema.tables.flatMap((s) => s.columns.map((c) => c.name)))];
    return [...tables, ...columns];
  }, [schema]);

  /** Финальный текст кода: для fill собирается из шаблона и введённых фрагментов. */
  const composedCode = useMemo(() => {
    if (step.kind !== 'compute') return '';
    if (step.mode !== 'fill' || !step.template) return draft.code;
    const parts = step.template.split('___');
    return parts.reduce((acc, part, i) => acc + part + (draft.blanks[i] ?? ''), '');
  }, [step, draft.code, draft.blanks]);

  /**
   * Исполнителя может не быть вовсе (трек model, см. executors.ts). Тогда
   * задание в режиме fill проверяется сверкой текста, а «Выполнить» просто
   * нечему выполнять — кнопки быть не должно.
   */
  /*
   * Раскладка пунктов: своя, если она сошлась по длине с контентом, иначе
   * свежая. Второе случается ровно в двух случаях — шаг открыт впервые
   * и черновик пуст; либо задание правили, и сохранённая раскладка ссылается
   * на пункты, которых больше нет.
   */
  const arrangement =
    step.kind === 'order' && draft.arrangement.length === step.items.length
      ? draft.arrangement
      : step.kind === 'order'
        ? shuffledOrder(task.id, step.items.length)
        : [];
  const runsCode = executor.runsCode !== false;

  /*
   * Там, где код исполняется, пустой пропуск оставлен допустимым намеренно:
   * SQLite и Python на нём дают настоящую ошибку, а `diagnose` превращает её
   * в содержательную подсказку — это работающая часть обучения, и отбирать
   * её у 19 существующих заданий незачем.
   *
   * Там, где сверка идёт текстом, такой ошибки не существует: пустой пропуск
   * дал бы просто «неверно» за недописанное. Поэтому здесь — и только здесь —
   * проверка ждёт, пока заполнены все поля.
   */
  const canSubmit =
    step.kind === 'order'
      ? true
      : step.kind === 'interpret'
        ? draft.chosen !== null
        : !runsCode && step.mode === 'fill'
          ? draft.blanks.length > 0 && draft.blanks.every((b) => b.trim().length > 0)
          : composedCode.trim().length > 0;

  /** Разбор ошибки исполнителя — разный по языку: SQLite и Python выдают разные тексты. */
  const diagnoseError = (message: string, traceback?: string): Feedback =>
    task.track === 'python'
      ? diagnosePythonError(message, suggestions, traceback ?? '', locale)
      : diagnoseSqlError(message, suggestions, locale);

  async function handleRun() {
    if (step.kind !== 'compute') return;
    setRunning(true);
    // После зачёта «Верно» не стираем: оно относится к проверенному ответу,
    // а не к текущему прогону, и человек не должен решить, что потерял зачёт.
    // Ошибку исполнения ниже это не глушит — она перезапишет обратную связь.
    if (!draft.solved) patch({ feedback: null });
    if (draft.solved) setExplored(true);
    try {
      const r = await executor.exec(composedCode);
      patch({ preview: r });
    } catch (e) {
      const err = e as Error & { traceback?: string };
      patch({ preview: null, feedback: diagnoseError(err.message, err.traceback) });
    } finally {
      setRunning(false);
      // На узком экране Run/Check и есть момент, когда естественно
      // посмотреть результат, — переключаем вкладку сами, а не заставляем
      // тянуться до неё пальцем. На ноутбуке состояние ни на что не влияет.
      patch({ mobilePanel: 'results' });
    }
  }

  /** Обмен соседей: единственная операция над порядком — см. довод у кнопок ниже. */
  function move(from: number, to: number) {
    if (draft.solved || to < 0 || to >= arrangement.length) return;
    const next = [...arrangement];
    [next[from], next[to]] = [next[to], next[from]];
    patch({ arrangement: next });
  }

  async function handleCheck() {
    if (step.kind === 'order') {
      /*
       * Всё или ничего, и без указания, какие пункты уже на местах.
       *
       * Число верных позиций превращает задание в перебор: двигаешь пункт,
       * смотришь на счётчик, повторяешь — и рассуждение, ради которого вид
       * задания и заводился, пропадает целиком. Незнающему остаются подсказки,
       * они здесь и есть штатный путь.
       */
      const correct = arrangement.every((v, i) => v === i);
      patch((d) => ({
        arrangement,
        solved: correct,
        wasCorrect: correct,
        wrongAttempts: d.wrongAttempts + (correct ? 0 : 1),
        feedback: correct
          ? { tone: 'warn', title: t.task.correctTitle, body: '', nudges: [] }
          : { tone: 'warn', title: t.task.orderWrongTitle, body: t.task.orderWrongBody, nudges: [] },
      }));
      return;
    }

    if (step.kind === 'interpret') {
      const correct = step.options[draft.chosen ?? -1]?.correct === true;
      patch((d) => ({
        solved: true,
        wasCorrect: correct,
        wrongAttempts: d.wrongAttempts + (correct ? 0 : 1),
        feedback: correct
          ? { tone: 'warn', title: t.task.correctTitle, body: '', nudges: [] }
          : { tone: 'warn', title: t.task.wrongOptionTitle, body: t.task.wrongOptionBody, nudges: [] },
      }));
      return;
    }

    /*
     * Третий путь проверки — сверка текста, без исполнения (см. textGrade.ts).
     * Живёт до обращения к executor намеренно: у трека без движка вызов
     * grade() бросил бы исключение, и «проверка» превратилась бы в ошибку.
     */
    if (!runsCode && step.mode === 'fill' && step.blanks) {
      const verdict = gradeBlanks(draft.blanks, step.blanks);
      setWrongBlanks(verdict.wrongIndexes);
      if (verdict.correct) {
        patch({
          solved: true,
          wasCorrect: true,
          feedback: { tone: 'warn', title: t.task.correctTitle, body: '', nudges: [] },
        });
      } else {
        patch((d) => ({
          wrongAttempts: d.wrongAttempts + 1,
          feedback: {
            tone: 'warn',
            title: t.task.blanksWrongTitle(verdict.wrongIndexes.length),
            body: t.task.blanksWrongBody(verdict.wrongIndexes.map((i) => i + 1)),
            nudges: [],
          },
        }));
      }
      patch({ mobilePanel: 'results' });
      return;
    }

    setRunning(true);
    try {
      const res: GradeResult = await executor.grade(composedCode, step.solution, {
        orderMatters: step.orderMatters,
      });
      if (res.status === 'sql_error' || res.status === 'code_error') {
        patch((d) => ({
          preview: null,
          wrongAttempts: d.wrongAttempts + 1,
          feedback: diagnoseError(res.message, res.status === 'code_error' ? res.traceback : undefined),
        }));
        return;
      }
      if (res.status === 'correct') {
        patch({
          preview: res.preview,
          solved: true,
          wasCorrect: true,
          expected: null,
          feedback: {
            tone: 'warn',
            title: t.task.correctTitle,
            body: '',
            nudges: [],
            style: res.comparison.columnNamesDiffer
              ? t.task.columnNameNote(res.comparison.expectedCols.join(', '))
              : undefined,
          },
        });
      } else {
        patch((d) => ({
          preview: res.preview,
          wrongAttempts: d.wrongAttempts + 1,
          expected: res.expectedPreview,
          feedback: diagnoseComparison(res.comparison, locale),
        }));
      }
    } catch (e) {
      const err = e as Error & { traceback?: string };
      patch({ feedback: diagnoseError(err.message, err.traceback) });
    } finally {
      setRunning(false);
      patch({ mobilePanel: 'results' });
    }
  }

  const rowsTotal = (p: Preview) => p.totalRows.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US');

  /**
   * Вынесены в переменные, а не заинлайнены в JSX: обратная связь нужна
   * в двух разных ветках разметки (write/fill — рядом с редактором,
   * interpret — под вариантами ответа), а один и тот же узел не может
   * физически стоять в двух местах одновременно.
   */
  const feedbackBlock = draft.feedback && (
    <div
      className={`feedback ${draft.solved && draft.feedback.title === t.task.correctTitle ? 'ok' : draft.feedback.tone}`}
    >
      <h3>{draft.feedback.title}</h3>
      {draft.feedback.body && <p>{draft.feedback.body}</p>}
      {draft.feedback.nudges.length > 0 && (
        <ul>
          {draft.feedback.nudges.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {draft.feedback.style && <div className="style-note">{draft.feedback.style}</div>}
    </div>
  );

  // После зачёта своя таблица прячется: она совпала с эталоном, и две
  // одинаковые рядом только мешают. Но если зачтённое задание запустили
  // заново (explored), результат снова единственное, ради чего запускали.
  const previewBlock = draft.preview && (!draft.solved || explored) && (
    <div className="card">
      <ResultTable data={draft.preview} caption={t.task.yourResult} />
    </div>
  );

  const expectedBlock = draft.expected && !draft.wasCorrect && (
    <div className="card">
      <ResultTable
        data={draft.expected}
        caption={t.task.expectedResult(draft.expected.rows.length, rowsTotal(draft.expected))}
      />
    </div>
  );

  /**
   * Сдаться — легальный ход, а не наказание: разбор и эталон показываются сразу.
   * Задание при этом засчитывается как нерешённое, и навык вернётся уже
   * в этой же сессии — застревание не должно ни блокировать, ни проходить даром.
   */
  const giveUp = () =>
    patch({
      solved: true,
      wasCorrect: false,
      hintsShown: step.hints.length,
      feedback: { tone: 'warn', title: t.task.giveUpTitle, body: t.task.giveUpBody, nudges: [] },
    });

  return (
    <>
      {step.kind === 'interpret' ? (
        /*
         * Данные слева, вопрос и варианты справа — той же сеткой, что
         * редактор и результат в write/fill.
         *
         * Раньше это была одна карточка в столбик: выдержка из переписки
         * с цифрами, под ней вопрос, под ним четыре развёрнутых варианта.
         * На ноутбуке строка ситуации растягивалась на всю ширину экрана,
         * а варианты уезжали под сгиб — выбирая ответ, человек уже не видел
         * данных, по которым выбирает, и прокручивал вверх-вниз. Это ровно
         * тот случай, где рабочая ситуация и решение по ней должны стоять
         * рядом. На телефоне колонка снова одна, порядок прежний.
         */
        <div className="task-work">
          <div className="task-situation">
            <div className="card">
              {step.scenario ? (
                <pre className="scenario">{step.scenario}</pre>
              ) : step.predictSql ? (
                <pre className="sql-block">{step.predictSql}</pre>
              ) : carried ? (
                <>
                  <ResultTable
                    data={carried}
                    caption={
                      carriedIsReference ? t.task.expectedResult(carried.rows.length, rowsTotal(carried)) : t.task.yourResult
                    }
                  />
                  {carriedIsReference && (
                    <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                      {t.task.interpretOnReference}
                    </p>
                  )}
                </>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {t.task.interpretLoading}
                </p>
              )}
            </div>
          </div>
          <div className="task-answer">
            <div className="card">
              <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>{step.question}</p>
              {step.options.map((o, i) => (
                <button
                  key={i}
                  className="option"
                  onClick={() => !draft.solved && patch({ chosen: i })}
                  disabled={draft.solved}
                  aria-pressed={draft.chosen === i}
                  data-state={draft.solved ? (o.correct ? 'correct' : draft.chosen === i ? 'wrong' : undefined) : undefined}
                  style={!draft.solved && draft.chosen === i ? { borderColor: 'var(--accent)' } : undefined}
                >
                  {o.label}
                  {draft.solved && <span className="why">{o.why}</span>}
                </button>
              ))}
              {!draft.solved && (
                <button className="btn" style={{ marginTop: 4 }} onClick={handleCheck} disabled={draft.chosen === null}>
                  {t.task.checkBtn}
                </button>
              )}
            </div>
            {feedbackBlock}
          </div>
        </div>
      ) : step.kind === 'order' ? (
        /*
         * Та же сетка, что у интерпретации: ситуация слева, ответ справа.
         * Своей раскладки этот вид задания не заводит — читать условие
         * и раскладывать шаги нужно рядом ровно по тому же доводу.
         */
        <div className="task-work">
          <div className="task-situation">
            <div className="card">
              {step.scenario ? (
                <pre className="scenario">{step.scenario}</pre>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {task.brief}
                </p>
              )}
            </div>
          </div>
          <div className="task-answer">
            <div className="card">
              <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>{step.question}</p>
              {/*
               * Инструкция уходит вместе со стрелками: после зачёта порядок
               * уже не перепутан и двигать в нём нечего, а строка «расставьте
               * стрелками» продолжала бы просить о действии, которого больше
               * нет ни одной кнопки сделать.
               */}
              {!draft.solved && (
                <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
                  {t.task.orderNote}
                </p>
              )}
              <ol className="order-list">
                {arrangement.map((itemIndex, pos) => (
                  <li key={itemIndex} className="order-item" data-state={draft.solved ? 'correct' : undefined}>
                    <span className="order-rank">{pos + 1}</span>
                    <span className="order-body">
                      {step.items[itemIndex].label}
                      {draft.solved && <span className="why">{step.items[itemIndex].why}</span>}
                    </span>
                    {/*
                     * Две кнопки со стрелками, а не перетаскивание.
                     *
                     * Приоритет здесь телефон, а drag на тач-экране спорит
                     * с прокруткой страницы и требует своей реализации поверх
                     * жестов; кнопки же работают и пальцем, и с клавиатуры,
                     * и под скринридером, и не заводят ни одного нового
                     * правила раскладки.
                     */}
                    {!draft.solved && (
                      <span className="order-moves">
                        <button
                          type="button"
                          className="order-move"
                          onClick={() => move(pos, pos - 1)}
                          disabled={pos === 0}
                          aria-label={t.task.moveUp(pos + 1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="order-move"
                          onClick={() => move(pos, pos + 1)}
                          disabled={pos === arrangement.length - 1}
                          aria-label={t.task.moveDown(pos + 1)}
                        >
                          ↓
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {!draft.solved && (
                <button className="btn" style={{ marginTop: 12 }} onClick={handleCheck}>
                  {t.task.checkBtn}
                </button>
              )}
            </div>
            {feedbackBlock}
          </div>
        </div>
      ) : (
        <div className="task-work">
          <div className="task-editor" data-mobile-hidden={draft.mobilePanel !== 'work'}>
            <div className="card">
              {/*
               * Постановка шага — только у многошагового задания: у одношагового
               * она одна на всё задание и уже стоит в шапке.
               */}
              {step.goal && (
                <div className="goal" style={{ marginBottom: 12 }}>
                  {step.goal}
                </div>
              )}
              {step.mode === 'fill' && step.template ? (
                <FillTemplate
                  template={step.template}
                  blanks={draft.blanks}
                  onChange={(b) => {
                    patch({ blanks: b });
                    // Подсветка относится к прошлой проверке: как только поле
                    // правят, она перестаёт быть правдой.
                    if (wrongBlanks.length) setWrongBlanks([]);
                  }}
                  disabled={draft.solved}
                  wrongIndexes={wrongBlanks}
                />
              ) : (
                <CodeEditor
                  value={draft.code}
                  onChange={(v) => patch({ code: v })}
                  schema={schema}
                  level={task.level}
                  track={task.track}
                  placeholder={t.task.placeholder(task.track)}
                />
              )}
              <div className="row" style={{ marginTop: 12 }}>
                {/* Без исполнителя запускать нечего — кнопки нет, а не «есть и падает». */}
                {/*
                  * После зачёта «Выполнить» остаётся, «Проверить» — нет.
                  * Запуск ничего не записывает (см. handleRun), а проверка
                  * выставляет вердикт и двигает интервал повторения; второй
                  * раз за один ответ его двигать нельзя — этот дефект уже
                  * чинили через recordedTasksRef.
                  */}
                {runsCode && (
                  <button className="btn secondary" onClick={handleRun} disabled={running || !canSubmit}>
                    {t.task.runBtn}
                  </button>
                )}
                {!draft.solved && (
                  <button className="btn" onClick={handleCheck} disabled={running || !canSubmit}>
                    {running ? '…' : t.task.checkBtn}
                  </button>
                )}
              </div>
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                {draft.solved && runsCode ? t.task.solvedRunNote : runsCode ? t.task.runNote : t.task.checkTextNote}
              </p>
            </div>
          </div>
          <div className="task-results" data-mobile-hidden={draft.mobilePanel !== 'results'}>
            {feedbackBlock}
            {previewBlock}
            {expectedBlock}
          </div>
        </div>
      )}

      {/*
       * Между диагнозом и подсказкой: диагноз (feedbackBlock выше) уже назвал
       * причину расхождения, подсказка ниже уже даёт готовую мысль — здесь
       * стоит вопрос, после которого думает человек, а не мы. Только у
       * write/fill: у interpret расхождение с эталоном не считается,
       * там неверный ответ разбирается вариантами, а не diagnoseComparison.
       */}
      {!draft.solved && draft.feedback?.reflexive && (
        <div className="reflexive">
          <span className="reflexive-label">{t.task.reflexiveLabel}</span>
          {draft.feedback.reflexive}
        </div>
      )}

      {!draft.solved && step.hints.length > 0 && (
        <div>
          {step.hints.slice(0, draft.hintsShown).map((h, i) => (
            <div className="hint" key={i}>
              {h}
            </div>
          ))}
          {draft.hintsShown < step.hints.length && (
            <button
              className="hint-btn"
              disabled={waitLeft > 0 && draft.hintsShown === 0}
              onClick={() => patch((d) => ({ hintsShown: d.hintsShown + 1 }))}
            >
              {waitLeft > 0 && draft.hintsShown === 0
                ? t.task.hintWait(waitLeft)
                : t.task.hintShow(draft.hintsShown + 1, step.hints.length)}
            </button>
          )}
        </div>
      )}

      {!draft.solved && (
        <button className="btn secondary" onClick={giveUp}>
          {t.task.giveUpBtn}
        </button>
      )}
    </>
  );
}

/**
 * Шаблон с пропусками. Поля ввода стоят прямо в тексте запроса, чтобы
 * не терялась связь между фрагментом и его местом в конструкции.
 */
function FillTemplate({
  template,
  blanks,
  onChange,
  disabled,
  wrongIndexes = [],
}: {
  template: string;
  blanks: string[];
  onChange: (b: string[]) => void;
  disabled?: boolean;
  /** Пропуски, разошедшиеся с эталоном: обводка ведёт глаз к месту ошибки, а не к формуле целиком. */
  wrongIndexes?: number[];
}) {
  const { t } = useI18n();
  const parts = template.split('___');
  // pre-wrap здесь больше не нужен точечно — он теперь у самого .sql-block.
  return (
    <pre className="sql-block">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <input
              value={blanks[i] ?? ''}
              disabled={disabled}
              onChange={(e) => {
                const next = [...blanks];
                next[i] = e.target.value;
                onChange(next);
              }}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              aria-label={t.task.blankAriaLabel(i + 1)}
              // Ошибка помечается не только цветом: цвет один не доходит
              // до тех, кто его не различает, и до чтения с экрана.
              aria-invalid={wrongIndexes.includes(i) || undefined}
              style={{
                width: `${Math.max(4, (blanks[i] ?? '').length + 2)}ch`,
                font: 'inherit',
                color: 'var(--text)',
                background: 'var(--bg-raised)',
                border: `1px solid ${wrongIndexes.includes(i) ? 'var(--err)' : 'var(--accent)'}`,
                borderRadius: 6,
                padding: '2px 6px',
                textAlign: 'center',
              }}
            />
          )}
        </span>
      ))}
    </pre>
  );
}
