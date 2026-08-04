import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../content/types';
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

export interface TaskOutcome {
  correct: boolean;
  wrongAttempts: number;
  hintsUsed: number;
}

interface Props {
  task: Task;
  executor: Executor;
  schema: SchemaDoc | null;
  onDone: (o: TaskOutcome) => void;
  onOpenSchema: () => void;
}

export function TaskView({ task, executor, schema, onDone, onOpenSchema }: Props) {
  const { t, locale } = useI18n();
  const [code, setCode] = useState('');
  const [blanks, setBlanks] = useState<string[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [expected, setExpected] = useState<Preview | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [solved, setSolved] = useState(false);
  /** Решено верно или разобрано после сдачи — от этого зависит интервал повторения. */
  const [wasCorrect, setWasCorrect] = useState(false);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [waitLeft, setWaitLeft] = useState(HINT_DELAY_SEC);
  const startedAt = useRef(Date.now());

  // Сброс при переходе к следующему заданию: компонент переиспользуется.
  useEffect(() => {
    setCode(task.starter ?? '');
    setBlanks(new Array(task.template ? task.template.split('___').length - 1 : 0).fill(''));
    setChosen(null);
    setPreview(null);
    setExpected(null);
    setFeedback(null);
    setSolved(false);
    setWasCorrect(false);
    setWrongAttempts(0);
    setHintsShown(0);
    setWaitLeft(HINT_DELAY_SEC);
    startedAt.current = Date.now();
  }, [task.id]);

  useEffect(() => {
    if (waitLeft <= 0) return;
    const t = setInterval(() => {
      setWaitLeft(Math.max(0, HINT_DELAY_SEC - Math.floor((Date.now() - startedAt.current) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [waitLeft, task.id]);

  const suggestions = useMemo(() => {
    if (!schema) return [];
    const tables = schema.tables.map((t) => t.table);
    const columns = [...new Set(schema.tables.flatMap((t) => t.columns.map((c) => c.name)))];
    return [...tables, ...columns];
  }, [schema]);

  /** Финальный текст кода: для fill собирается из шаблона и введённых фрагментов. */
  const composedCode = useMemo(() => {
    if (task.mode !== 'fill' || !task.template) return code;
    const parts = task.template.split('___');
    return parts.reduce((acc, part, i) => acc + part + (blanks[i] ?? ''), '');
  }, [task.mode, task.template, code, blanks]);

  const canSubmit = task.mode === 'predict' ? chosen !== null : composedCode.trim().length > 0;

  /** Разбор ошибки исполнителя — разный по языку: SQLite и Python выдают разные тексты. */
  const diagnoseError = (message: string, traceback?: string): Feedback =>
    task.track === 'python' ? diagnosePythonError(message, suggestions, traceback) : diagnoseSqlError(message, suggestions);

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
        setFeedback(diagnoseComparison(res.comparison));
      }
    } catch (e) {
      const err = e as Error & { traceback?: string };
      setFeedback(diagnoseError(err.message, err.traceback));
    } finally {
      setRunning(false);
    }
  }

  const finish = () => onDone({ correct: wasCorrect, wrongAttempts, hintsUsed: hintsShown });

  /**
   * Вынесены в переменные, а не заинлайнены в JSX: в write/fill эти блоки
   * уезжают в правую колонку рядом с редактором (см. .task-work в styles.css),
   * а в predict остаются в общем потоке под вариантами ответа — один и тот же
   * узел не может физически стоять в двух местах разметки одновременно.
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

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span className="pill level">{t.task.levelLabel(task.level)}</span>
          <span className="pill">
            {task.mode === 'predict' ? t.task.modePredict : task.mode === 'fill' ? t.task.modeFill : t.task.modeWrite}
          </span>
          {/* Схема таблиц не нужна там, где запрос не пишут: задание про
              разговор с заказчиком к dim_product отношения не имеет. */}
          {!task.scenario && (
            <button className="pill" onClick={onOpenSchema} style={{ marginLeft: 'auto' }}>
              {t.task.schemaBtn}
            </button>
          )}
        </div>
        <h2 style={{ fontSize: 17 }}>{task.title}</h2>
        <p className="brief">{task.brief}</p>
        <div className="goal">{task.goal}</div>
      </div>

      {task.mode === 'predict' ? (
        <>
          <div className="card">
            {task.scenario ? <pre className="scenario">{task.scenario}</pre> : <pre className="sql-block">{task.predictSql}</pre>}
            <p style={{ fontSize: 15, fontWeight: 600, margin: '14px 0 10px' }}>{task.predictQuestion}</p>
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
        </>
      ) : (
        <div className="task-work">
          <div className="task-editor">
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
          <div className="task-results">
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
  return (
    <pre className="sql-block" style={{ whiteSpace: 'pre-wrap' }}>
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
