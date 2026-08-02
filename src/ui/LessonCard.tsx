import { useState } from 'react';
import type { Lesson } from '../content/types';
import type { Preview } from '../engine/types';
import { execSql } from '../engine/sqlClient';
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

function RunnableSql({ sql, tone }: { sql: string; tone?: 'wrong' }) {
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await execSql(sql));
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
        {busy ? 'Выполняю…' : tone === 'wrong' ? 'Посмотреть, что вернёт' : 'Выполнить пример'}
      </button>
      {error && (
        <div className="feedback error" style={{ marginTop: 8 }}>
          <h3>Запрос не выполнился</h3>
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
  /** В занятии показываем кнопку перехода к задаче, в справочнике — нет. */
  onContinue?: () => void;
}

export function LessonCard({ lesson, onContinue }: Props) {
  return (
    <>
      <div className="card">
        <span className="pill level">Приём</span>
        <h2 style={{ fontSize: 18, marginTop: 10 }}>{lesson.title}</h2>
        <p className="brief" style={{ marginBottom: 0 }}>{lesson.why}</p>
      </div>

      <div className="card">
        <h2>Как это пишется</h2>
        <pre className="sql-block">{lesson.form}</pre>
      </div>

      <div className="card">
        <h2>Пример на наших данных</h2>
        <RunnableSql sql={lesson.example} />
        <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 14, lineHeight: 1.55 }}>
          {lesson.reads}
        </p>
      </div>

      <div className="card">
        <h2>Частая ошибка</h2>
        <RunnableSql sql={lesson.wrong} tone="wrong" />
        <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14, lineHeight: 1.55 }}>{lesson.wrongWhy}</p>
      </div>

      <div className="card">
        <h2>Как проверить себя</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{lesson.selfCheck}</p>
      </div>

      {onContinue && (
        <button className="btn" onClick={onContinue}>
          Перейти к задаче
        </button>
      )}
    </>
  );
}
