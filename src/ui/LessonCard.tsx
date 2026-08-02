import { useState } from 'react';
import type { Lesson } from '../content/types';
import type { Executor, Preview } from '../engine/types';
import { ru } from '../i18n/ru';
import { ResultTable } from './ResultTable';

/**
 * Карточка приёма.
 *
 * Оба запроса — и правильный, и ошибочный — можно выполнить прямо отсюда.
 * Это и есть главный смысл: увидеть, что антипример возвращает одиннадцать
 * регионов вместо шестнадцати, убедительнее любого объяснения. Поэтому
 * проверка контента и требует, чтобы антипример был целым запросом, а не
 * фрагментом, и чтобы его результат действительно отличался от правильного.
 */

function RunnableSql({ sql, tone, executor }: { sql: string; tone?: 'wrong'; executor: Executor }) {
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await executor.exec(sql));
    } catch (e) {
      // Для антипримера ошибка — это и есть демонстрация, а не сбой.
      setError(String((e as Error).message));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <pre className="sql-block">{sql}</pre>
      <button className="hint-btn" style={{ marginTop: 8 }} onClick={run} disabled={busy}>
        {busy ? ru.lesson.running : tone === 'wrong' ? ru.lesson.runWrong : ru.lesson.runExample}
      </button>
      {error && (
        <div className="feedback error" style={{ marginTop: 8 }}>
          <h3>{ru.lesson.errorTitle}</h3>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      )}
      {result && (
        <div style={{ marginTop: 8 }}>
          <ResultTable data={result} />
        </div>
      )}
    </div>
  );
}

interface Props {
  lesson: Lesson;
  executor: Executor;
  /** В занятии показываем кнопку перехода к задаче, в справочнике — нет. */
  onContinue?: () => void;
}

export function LessonCard({ lesson, executor, onContinue }: Props) {
  return (
    <>
      <div className="card">
        <span className="pill level">{ru.lesson.pill}</span>
        <h2 style={{ fontSize: 18, marginTop: 10 }}>{lesson.title}</h2>
        <p className="brief" style={{ marginBottom: 0 }}>{lesson.why}</p>
      </div>

      <div className="card">
        <h2>{ru.lesson.formTitle}</h2>
        <pre className="sql-block">{lesson.form}</pre>
      </div>

      <div className="card">
        <h2>{ru.lesson.exampleTitle}</h2>
        <RunnableSql sql={lesson.example} executor={executor} />
        <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 14, lineHeight: 1.55 }}>
          {lesson.reads}
        </p>
      </div>

      <div className="card">
        <h2>{ru.lesson.wrongTitle}</h2>
        <RunnableSql sql={lesson.wrong} tone="wrong" executor={executor} />
        <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14, lineHeight: 1.55 }}>{lesson.wrongWhy}</p>
      </div>

      <div className="card">
        <h2>{ru.lesson.selfCheckTitle}</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{lesson.selfCheck}</p>
      </div>

      {onContinue && (
        <button className="btn" onClick={onContinue}>
          {ru.lesson.continueBtn}
        </button>
      )}
    </>
  );
}
