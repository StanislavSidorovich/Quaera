import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../content/types';
import { taskTables } from '../content';
import type { Executor, GradeResult, Preview, SchemaDoc } from '../engine/types';
import { diagnoseComparison, diagnosePythonError, diagnoseSqlError, type Feedback } from '../engine/diagnose';
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
 */

/** Первая подсказка открывается не сразу: пауза на самостоятельную попытку. */
const HINT_DELAY_SEC = 20;

/** Сколько секунд паузы осталось до первой подсказки — считается от первого показа задания, а не от монтирования. */
const remainingWait = (startedAt: number) =>
  Math.max(0, HINT_DELAY_SEC - Math.floor((Date.now() - startedAt) / 1000));

export interface TaskOutcome {
  correct: boolean;
  wrongAttempts: number;
  hintsUsed: number;
}

/**
 * Черновик шага занятия — всё, что человек успел сделать на задании и что
 * обязано пережить уход на карточку теории и возврат обратно.
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
export interface TaskDraft {
  code: string;
  blanks: string[];
  chosen: number | null;
  preview: Preview | null;
  expected: Preview | null;
  feedback: Feedback | null;
  solved: boolean;
  wasCorrect: boolean;
  wrongAttempts: number;
  hintsShown: number;
  /** Момент первого показа задания: пауза перед первой подсказкой не начинается заново при возврате. */
  startedAt: number;
  mobilePanel: 'brief' | 'work' | 'results';
}

export interface TaskDraftStore {
  read: (taskId: string) => TaskDraft | undefined;
  write: (taskId: string, draft: TaskDraft) => void;
}

/** Пустой черновик — то самое состояние, с которого задание начинается впервые. */
export function blankDraft(task: Task): TaskDraft {
  return {
    code: task.starter ?? '',
    blanks: new Array(task.template ? task.template.split('___').length - 1 : 0).fill(''),
    chosen: null,
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
}

export function TaskView({ task, executor, schema, drafts, skillTitle, onDone, onOpenSchema, onOpenLesson }: Props) {
  const { t, locale } = useI18n();
  /**
   * Стартовое состояние берётся из черновика этого задания, а не из пустоты:
   * человек, ушедший на карточку теории и вернувшийся, застаёт свой запрос,
   * открытые подсказки и результат проверки ровно там, где их оставил.
   */
  const [initial] = useState(() => drafts.read(task.id) ?? blankDraft(task));
  const [code, setCode] = useState(initial.code);
  const [blanks, setBlanks] = useState<string[]>(initial.blanks);
  const [chosen, setChosen] = useState<number | null>(initial.chosen);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(initial.preview);
  const [expected, setExpected] = useState<Preview | null>(initial.expected);
  const [feedback, setFeedback] = useState<Feedback | null>(initial.feedback);
  const [solved, setSolved] = useState(initial.solved);
  /** Решено верно или разобрано после сдачи — от этого зависит интервал повторения. */
  const [wasCorrect, setWasCorrect] = useState(initial.wasCorrect);
  const [wrongAttempts, setWrongAttempts] = useState(initial.wrongAttempts);
  const [hintsShown, setHintsShown] = useState(initial.hintsShown);
  const [waitLeft, setWaitLeft] = useState(() => remainingWait(initial.startedAt));
  const startedAt = useRef(initial.startedAt);
  /**
   * Переключатель «Условие / Код / Результат» — только для write/fill
   * и только на узком экране (см. .task-mobile-tabs в styles.css, порог
   * 1024px тот же, что у остального десктопного layout). На ноутбуке
   * состояние существует, но ни на что не влияет: там условие, редактор
   * и результат уже стоят рядом в .task-work, а сама вкладочная панель
   * скрыта через CSS, не через JS-развилку по ширине.
   */
  const [mobilePanel, setMobilePanel] = useState<'brief' | 'work' | 'results'>(initial.mobilePanel);

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
    const d = drafts.read(task.id) ?? blankDraft(task);
    setCode(d.code);
    setBlanks(d.blanks);
    setChosen(d.chosen);
    setPreview(d.preview);
    setExpected(d.expected);
    setFeedback(d.feedback);
    setSolved(d.solved);
    setWasCorrect(d.wasCorrect);
    setWrongAttempts(d.wrongAttempts);
    setHintsShown(d.hintsShown);
    setMobilePanel(d.mobilePanel);
    startedAt.current = d.startedAt;
    setWaitLeft(remainingWait(d.startedAt));
  }, [task, drafts]);

  /**
   * Черновик пишется после каждого рендера, без списка зависимостей.
   *
   * Хранилище — обычный Map в ref у App: запись в него ничего не
   * перерисовывает, поэтому дешевле писать всегда, чем перечислять
   * двенадцать зависимостей и завести тринадцатый источник ошибок —
   * забытое поле здесь означало бы молча потерянную работу человека.
   */
  useEffect(() => {
    drafts.write(task.id, {
      code,
      blanks,
      chosen,
      preview,
      expected,
      feedback,
      solved,
      wasCorrect,
      wrongAttempts,
      hintsShown,
      startedAt: startedAt.current,
      mobilePanel,
    });
  });

  useEffect(() => {
    if (waitLeft <= 0) return;
    const t = setInterval(() => {
      setWaitLeft(remainingWait(startedAt.current));
    }, 1000);
    return () => clearInterval(t);
  }, [waitLeft, task.id]);

  const suggestions = useMemo(() => {
    if (!schema) return [];
    const tables = schema.tables.map((t) => t.table);
    const columns = [...new Set(schema.tables.flatMap((t) => t.columns.map((c) => c.name)))];
    return [...tables, ...columns];
  }, [schema]);

  /** Таблицы этого задания — для чипов над условием, см. taskTables. */
  const tables = useMemo(() => taskTables(task, schema), [task, schema]);

  /** Финальный текст кода: для fill собирается из шаблона и введённых фрагментов. */
  const composedCode = useMemo(() => {
    if (task.mode !== 'fill' || !task.template) return code;
    const parts = task.template.split('___');
    return parts.reduce((acc, part, i) => acc + part + (blanks[i] ?? ''), '');
  }, [task.mode, task.template, code, blanks]);

  const canSubmit = task.mode === 'predict' ? chosen !== null : composedCode.trim().length > 0;

  /** Разбор ошибки исполнителя — разный по языку: SQLite и Python выдают разные тексты. */
  const diagnoseError = (message: string, traceback?: string): Feedback =>
    task.track === 'python'
      ? diagnosePythonError(message, suggestions, traceback ?? '', locale)
      : diagnoseSqlError(message, suggestions, locale);

  async function handleRun() {
    setRunning(true);
    setFeedback(null);
    try {
      const r = await executor.exec(composedCode);
      setPreview(r);
    } catch (e) {
      setPreview(null);
      const err = e as Error & { traceback?: string };
      setFeedback(diagnoseError(err.message, err.traceback));
    } finally {
      setRunning(false);
      // На узком экране Run/Check и есть момент, когда естественно
      // посмотреть результат, — переключаем вкладку сами, а не заставляем
      // тянуться до неё пальцем. На ноутбуке состояние ни на что не влияет.
      setMobilePanel('results');
    }
  }

  async function handleCheck() {
    if (task.mode === 'predict') {
      const correct = task.options?.[chosen ?? -1]?.correct === true;
      setSolved(true);
      setWasCorrect(correct);
      setFeedback(
        correct
          ? { tone: 'warn', title: t.task.correctTitle, body: '', nudges: [] }
          : { tone: 'warn', title: t.task.wrongOptionTitle, body: t.task.wrongOptionBody, nudges: [] }
      );
      if (!correct) setWrongAttempts((n) => n + 1);
      return;
    }

    setRunning(true);
    try {
      const res: GradeResult = await executor.grade(composedCode, task.solution!, {
        orderMatters: task.orderMatters,
      });
      if (res.status === 'sql_error' || res.status === 'code_error') {
        setPreview(null);
        setWrongAttempts((n) => n + 1);
        setFeedback(diagnoseError(res.message, res.status === 'code_error' ? res.traceback : undefined));
        return;
      }
      setPreview(res.preview);
      if (res.status === 'correct') {
        setSolved(true);
        setWasCorrect(true);
        setExpected(null);
        setFeedback({
          tone: 'warn',
          title: t.task.correctTitle,
          body: '',
          nudges: [],
          style: res.comparison.columnNamesDiffer
            ? t.task.columnNameNote(res.comparison.expectedCols.join(', '))
            : undefined,
        });
      } else {
        setWrongAttempts((n) => n + 1);
        setExpected(res.expectedPreview);
        setFeedback(diagnoseComparison(res.comparison, locale));
      }
    } catch (e) {
      const err = e as Error & { traceback?: string };
      setFeedback(diagnoseError(err.message, err.traceback));
    } finally {
      setRunning(false);
      setMobilePanel('results');
    }
  }

  const finish = () => onDone({ correct: wasCorrect, wrongAttempts, hintsUsed: hintsShown });

  /**
   * Вынесены в переменные, а не заинлайнены в JSX: обратная связь нужна
   * в двух разных ветках разметки (write/fill — рядом с редактором,
   * predict — под вариантами ответа), а один и тот же узел не может
   * физически стоять в двух местах одновременно.
   */
  const feedbackBlock = feedback && (
    <div className={`feedback ${solved && feedback.title === t.task.correctTitle ? 'ok' : feedback.tone}`}>
      <h3>{feedback.title}</h3>
      {feedback.body && <p>{feedback.body}</p>}
      {feedback.nudges.length > 0 && (
        <ul>
          {feedback.nudges.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {feedback.style && <div className="style-note">{feedback.style}</div>}
    </div>
  );

  const previewBlock = preview && !solved && (
    <div className="card">
      <ResultTable data={preview} caption={t.task.yourResult} />
    </div>
  );

  const expectedBlock = expected && (
    <div className="card">
      <ResultTable
        data={expected}
        caption={t.task.expectedResult(expected.rows.length, expected.totalRows.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US'))}
      />
    </div>
  );

  /**
   * Сдаться — легальный ход, а не наказание: разбор и эталон показываются сразу.
   * Задание при этом засчитывается как нерешённое, и навык вернётся уже
   * в этой же сессии — застревание не должно ни блокировать, ни проходить даром.
   */
  const giveUp = () => {
    setSolved(true);
    setWasCorrect(false);
    setHintsShown(task.hints.length);
    setFeedback({
      tone: 'warn',
      title: t.task.giveUpTitle,
      body: t.task.giveUpBody,
      nudges: [],
    });
  };

  // Только write/fill: predict уже держит ситуацию и ответ рядом двумя
  // колонками (.task-situation/.task-answer), и той же тройной развязки
  // там не нужно.
  const tabbed = task.mode !== 'predict';

  return (
    <>
      {tabbed && (
        <div className="tabs task-mobile-tabs" role="tablist">
          <button role="tab" aria-pressed={mobilePanel === 'brief'} onClick={() => setMobilePanel('brief')}>
            {t.task.mobileTabBrief}
          </button>
          <button role="tab" aria-pressed={mobilePanel === 'work'} onClick={() => setMobilePanel('work')}>
            {t.task.mobileTabWork}
          </button>
          <button role="tab" aria-pressed={mobilePanel === 'results'} onClick={() => setMobilePanel('results')}>
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
          <span className="pill">
            {task.mode === 'predict' ? t.task.modePredict : task.mode === 'fill' ? t.task.modeFill : t.task.modeWrite}
          </span>
          {/* Схема таблиц не нужна там, где запрос не пишут: задание про
              разговор с заказчиком к dim_product отношения не имеет. */}
          {!task.scenario && (
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

      {task.mode === 'predict' ? (
        /*
         * Ситуация слева, вопрос и варианты справа — той же сеткой, что
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
              {task.scenario ? <pre className="scenario">{task.scenario}</pre> : <pre className="sql-block">{task.predictSql}</pre>}
            </div>
          </div>
          <div className="task-answer">
            <div className="card">
              <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>{task.predictQuestion}</p>
              {task.options?.map((o, i) => (
                <button
                  key={i}
                  className="option"
                  onClick={() => !solved && setChosen(i)}
                  disabled={solved}
                  aria-pressed={chosen === i}
                  data-state={solved ? (o.correct ? 'correct' : chosen === i ? 'wrong' : undefined) : undefined}
                  style={!solved && chosen === i ? { borderColor: 'var(--accent)' } : undefined}
                >
                  {o.label}
                  {solved && <span className="why">{o.why}</span>}
                </button>
              ))}
              {!solved && (
                <button className="btn" style={{ marginTop: 4 }} onClick={handleCheck} disabled={chosen === null}>
                  {t.task.checkBtn}
                </button>
              )}
            </div>
            {feedbackBlock}
          </div>
        </div>
      ) : (
        <div className="task-work">
          <div className="task-editor" data-mobile-hidden={mobilePanel !== 'work'}>
            <div className="card">
              {task.mode === 'fill' && task.template ? (
                <FillTemplate template={task.template} blanks={blanks} onChange={setBlanks} disabled={solved} />
              ) : (
                <CodeEditor
                  value={code}
                  onChange={setCode}
                  schema={schema}
                  level={task.level}
                  track={task.track}
                  disabled={solved}
                  placeholder={t.task.placeholder(task.track)}
                />
              )}
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn secondary" onClick={handleRun} disabled={running || !canSubmit || solved}>
                  {t.task.runBtn}
                </button>
                <button className="btn" onClick={handleCheck} disabled={running || !canSubmit || solved}>
                  {running ? '…' : t.task.checkBtn}
                </button>
              </div>
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                {t.task.runNote}
              </p>
            </div>
          </div>
          <div className="task-results" data-mobile-hidden={mobilePanel !== 'results'}>
            {feedbackBlock}
            {previewBlock}
            {expectedBlock}
          </div>
        </div>
      )}

      {!solved && task.hints.length > 0 && (
        <div>
          {task.hints.slice(0, hintsShown).map((h, i) => (
            <div className="hint" key={i}>
              {h}
            </div>
          ))}
          {hintsShown < task.hints.length && (
            <button
              className="hint-btn"
              disabled={waitLeft > 0 && hintsShown === 0}
              onClick={() => setHintsShown((n) => n + 1)}
            >
              {waitLeft > 0 && hintsShown === 0
                ? t.task.hintWait(waitLeft)
                : t.task.hintShow(hintsShown + 1, task.hints.length)}
            </button>
          )}
        </div>
      )}

      {solved && (
        <>
          <div className="card">
            <h2>{t.task.explainTitle}</h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{task.explain}</p>
          </div>
          {task.mode !== 'predict' && (
            <details className="table-doc">
              <summary>{t.task.solutionSummary}</summary>
              <pre className="sql-block" style={{ border: 'none', borderRadius: 0 }}>
                {task.solution}
              </pre>
            </details>
          )}
          <button className="btn" onClick={finish}>
            {t.task.nextBtn}
          </button>
        </>
      )}

      {!solved && (
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
}: {
  template: string;
  blanks: string[];
  onChange: (b: string[]) => void;
  disabled?: boolean;
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
              style={{
                width: `${Math.max(4, (blanks[i] ?? '').length + 2)}ch`,
                font: 'inherit',
                color: 'var(--text)',
                background: 'var(--bg-raised)',
                border: '1px solid var(--accent)',
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
