import { useState } from 'react';
import type { Lesson } from '../content/types';
import type { Executor, Preview } from '../engine/types';
import { useI18n } from '../i18n/context';
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
  const { t } = useI18n();
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
        {busy ? t.lesson.running : tone === 'wrong' ? t.lesson.runWrong : t.lesson.runExample}
      </button>
      {error && (
        <div className="feedback error" style={{ marginTop: 8 }}>
          <h3>{t.lesson.errorTitle}</h3>
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
  /**
   * Можно ли выполнить example/wrong как код. Ложь для треков без исполнителя
   * (domain, model): там example/wrong — иллюстративный текст или цифры
   * из готового расчёта, а не запрос, который стоит запускать по кнопке.
   */
  runnable?: boolean;
  /**
   * У треков без исполнителя form/example/wrong бывают двух разных жанров,
   * и путать их вёрстку нельзя (см. .lesson-figure и .lesson-prose
   * в styles.css): domain — диаграмма, выровненная пробелами и стрелками,
   * model — проза на 200-300+ знаков. Ложь по умолчанию — жанр «проза»
   * безопаснее при незаданном значении, потому что перенос по ширине
   * не ломает верно выровненный текст (только не улучшает диаграмму),
   * а моноширинный pre без переноса сломал бы длинное предложение молча.
   */
  figure?: boolean;
  /** В занятии показываем кнопку перехода к задаче, в справочнике — нет. */
  onContinue?: () => void;
  /** В справочнике — кнопка практики по теме вместо перехода к следующему шагу занятия. */
  onPractice?: () => void;
}

export function LessonCard({ lesson, executor, runnable = true, figure = false, onContinue, onPractice }: Props) {
  const { t } = useI18n();
  const proseClass = figure ? 'lesson-figure' : 'lesson-prose';
  return (
    <>
      <div className="card">
        <span className="pill level">{t.lesson.pill}</span>
        <h2 style={{ fontSize: 18, marginTop: 10 }}>{lesson.title}</h2>
        <p className="brief" style={{ marginBottom: 0 }}>{lesson.why}</p>
      </div>

      <div className="card">
        <h2>{t.lesson.formTitle}</h2>
        {/*
         * У runnable-треков (sql, python) form — скелет синтаксиса
         * («SELECT колонка FROM таблица»), короткие строки, моноширинный
         * блок со скроллом уместен как для кода. У остальных двух жанров —
         * см. комментарий к proseClass выше и .lesson-figure/.lesson-prose
         * в styles.css.
         */}
        {runnable ? <pre className="sql-block">{lesson.form}</pre> : <pre className={proseClass}>{lesson.form}</pre>}
      </div>

      {/*
       * Пример и антипример — рядом, а не друг под другом.
       *
       * Смысл карточки в контрасте: увидеть, что антипример возвращает
       * одиннадцать регионов вместо шестнадцати. Пока блоки шли колонкой,
       * этот контраст приходилось удерживать в памяти через полтора экрана
       * прокрутки — а после запуска обоих запросов между ними вставали ещё
       * и две таблицы результата. На широком экране оба варианта и оба
       * результата видны одновременно, и сравнение делают глазами.
       *
       * На телефоне колонка снова одна, порядок прежний: сначала как надо,
       * потом как не надо.
       */}
      <div className="lesson-compare">
        <div className="card">
          <h2>{t.lesson.exampleTitle}</h2>
          {runnable ? <RunnableSql sql={lesson.example} executor={executor} /> : <pre className={proseClass}>{lesson.example}</pre>}
          <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 14, lineHeight: 1.55 }}>
            {lesson.reads}
          </p>
        </div>

        <div className="card">
          <h2>{t.lesson.wrongTitle}</h2>
          {runnable ? (
            <RunnableSql sql={lesson.wrong} tone="wrong" executor={executor} />
          ) : (
            <pre className={proseClass}>{lesson.wrong}</pre>
          )}
          <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14, lineHeight: 1.55 }}>{lesson.wrongWhy}</p>
        </div>
      </div>

      <div className="card">
        <h2>{t.lesson.selfCheckTitle}</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{lesson.selfCheck}</p>
      </div>

      {onContinue && (
        <button className="btn" onClick={onContinue}>
          {t.lesson.continueBtn}
        </button>
      )}
      {onPractice && (
        <button className="btn" onClick={onPractice}>
          {t.lesson.practiceBtn}
        </button>
      )}
    </>
  );
}
