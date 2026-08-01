import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../content/types';
import type { GradeResult, Preview, SchemaDoc } from '../engine/types';
import { execSql, gradeSql } from '../engine/sqlClient';
import { diagnoseComparison, diagnoseSqlError, type Feedback } from '../engine/diagnose';
import { ResultTable } from './ResultTable';
import { SqlEditor } from './SqlEditor';

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
  schema: SchemaDoc | null;
  onDone: (o: TaskOutcome) => void;
  onOpenSchema: () => void;
}

export function TaskView({ task, schema, onDone, onOpenSchema }: Props) {
  const [sql, setSql] = useState('');
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
    setSql(task.starter ?? '');
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

  /** Финальный текст запроса: для fill собирается из шаблона и введённых фрагментов. */
  const composedSql = useMemo(() => {
    if (task.mode !== 'fill' || !task.template) return sql;
    const parts = task.template.split('___');
    return parts.reduce((acc, part, i) => acc + part + (blanks[i] ?? ''), '');
  }, [task.mode, task.template, sql, blanks]);

  const canSubmit = task.mode === 'predict' ? chosen !== null : composedSql.trim().length > 0;

  async function handleRun() {
    setRunning(true);
    setFeedback(null);
    try {
      const r = await execSql(composedSql);
      setPreview(r);
    } catch (e) {
      setPreview(null);
      setFeedback(diagnoseSqlError(String((e as Error).message), suggestions));
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
          ? { tone: 'warn', title: 'Верно', body: '', nudges: [] }
          : { tone: 'warn', title: 'Не тот вариант', body: 'Разбор всех вариантов — ниже.', nudges: [] }
      );
      if (!correct) setWrongAttempts((n) => n + 1);
      return;
    }

    setRunning(true);
    try {
      const res: GradeResult = await gradeSql(composedSql, task.solution!, {
        orderMatters: task.orderMatters,
      });
      if (res.status === 'sql_error') {
        setPreview(null);
        setWrongAttempts((n) => n + 1);
        setFeedback(diagnoseSqlError(res.message, suggestions));
        return;
      }
      setPreview(res.preview);
      if (res.status === 'correct') {
        setSolved(true);
        setWasCorrect(true);
        setExpected(null);
        setFeedback({
          tone: 'warn',
          title: 'Верно',
          body: '',
          nudges: [],
          style: res.comparison.columnNamesDiffer
            ? `Результат сходится, но имена колонок отличаются от ожидаемых (${res.comparison.expectedCols.join(', ')}). В рабочем отчёте это важно: колонка должна называться так, как её назвал бы заказчик.`
            : undefined,
        });
      } else {
        setWrongAttempts((n) => n + 1);
        setExpected(res.expectedPreview);
        setFeedback(diagnoseComparison(res.comparison));
      }
    } catch (e) {
      setFeedback(diagnoseSqlError(String((e as Error).message), suggestions));
    } finally {
      setRunning(false);
    }
  }

  const finish = () => onDone({ correct: wasCorrect, wrongAttempts, hintsUsed: hintsShown });

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
      title: 'Разбираем вместе',
      body: 'Ниже — разбор и эталонное решение. Навык вернётся на повторение уже сегодня, на другой задаче.',
      nudges: [],
    });
  };

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span className="pill level">Уровень {task.level}</span>
          <span className="pill">
            {task.mode === 'predict' ? 'Предсказать результат' : task.mode === 'fill' ? 'Дописать запрос' : 'Написать запрос'}
          </span>
          <button className="pill" onClick={onOpenSchema} style={{ marginLeft: 'auto' }}>
            Схема данных
          </button>
        </div>
        <h2 style={{ fontSize: 17 }}>{task.title}</h2>
        <p className="brief">{task.brief}</p>
        <div className="goal">{task.goal}</div>
      </div>

      {task.mode === 'predict' ? (
        <div className="card">
          <pre className="sql-block">{task.predictSql}</pre>
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
              Проверить
            </button>
          )}
        </div>
      ) : (
        <div className="card">
          {task.mode === 'fill' && task.template ? (
            <FillTemplate template={task.template} blanks={blanks} onChange={setBlanks} disabled={solved} />
          ) : (
            <SqlEditor
              value={sql}
              onChange={setSql}
              schema={schema}
              level={task.level}
              disabled={solved}
              placeholder="Напишите запрос…"
            />
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn secondary" onClick={handleRun} disabled={running || !canSubmit || solved}>
              Выполнить
            </button>
            <button className="btn" onClick={handleCheck} disabled={running || !canSubmit || solved}>
              {running ? '…' : 'Проверить'}
            </button>
          </div>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
            «Выполнить» просто покажет результат — пробуйте, ошибки здесь ничего не стоят.
          </p>
        </div>
      )}

      {feedback && (
        <div className={`feedback ${solved && feedback.title === 'Верно' ? 'ok' : feedback.tone}`}>
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
      )}

      {preview && !solved && <div className="card"><ResultTable data={preview} caption="Ваш результат" /></div>}

      {expected && (
        <div className="card">
          <ResultTable
            data={expected}
            caption={`Так выглядит эталон (первые ${expected.rows.length} из ${expected.totalRows.toLocaleString('ru-RU')})`}
          />
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
                ? `Подсказка откроется через ${waitLeft} с — попробуйте сами`
                : `Показать подсказку (${hintsShown + 1} из ${task.hints.length})`}
            </button>
          )}
        </div>
      )}

      {solved && (
        <>
          <div className="card">
            <h2>Разбор</h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{task.explain}</p>
          </div>
          {task.mode !== 'predict' && (
            <details className="table-doc">
              <summary>Показать эталонное решение</summary>
              <pre className="sql-block" style={{ border: 'none', borderRadius: 0 }}>
                {task.solution}
              </pre>
            </details>
          )}
          <button className="btn" onClick={finish}>
            Дальше
          </button>
        </>
      )}

      {!solved && (
        <button className="btn secondary" onClick={giveUp}>
          Не получается — показать разбор
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
              aria-label={`Пропуск ${i + 1}`}
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
