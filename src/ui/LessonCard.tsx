import { useState } from 'react';
import { isFigureBlock } from '../content/figureBlock';
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
  /** В занятии показываем кнопку перехода к задаче, в справочнике — нет. */
  onContinue?: () => void;
  /** В справочнике — кнопка практики по теме вместо перехода к следующему шагу занятия. */
  onPractice?: () => void;
}

/**
 * Блок нетехнического трека: диаграмма или проза — решает содержимое, а не
 * трек (разбор и его цена — в src/content/figureBlock.ts). Жанр считается
 * у каждого поля отдельно: у одной и той же карточки `form` бывает схемой,
 * а `wrong` рядом с ней — цитатой заказчика в две строки.
 */
function ProseBlock({ text }: { text: string }) {
  return <pre className={isFigureBlock(text) ? 'lesson-figure' : 'lesson-prose'}>{text}</pre>;
}

export function LessonCard({ lesson, executor, runnable = true, onContinue, onPractice }: Props) {
  const { t } = useI18n();
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
         * блок со скроллом уместен как для кода. У остальных жанр решает
         * содержимое — см. ProseBlock выше.
         */}
        {runnable ? <pre className="sql-block">{lesson.form}</pre> : <ProseBlock text={lesson.form} />}
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
          {runnable ? <RunnableSql sql={lesson.example} executor={executor} /> : <ProseBlock text={lesson.example} />}
          <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 14, lineHeight: 1.55 }}>
            {lesson.reads}
          </p>
        </div>

        <div className="card">
          <h2>{t.lesson.wrongTitle}</h2>
          {runnable ? (
            <RunnableSql sql={lesson.wrong} tone="wrong" executor={executor} />
          ) : (
            <ProseBlock text={lesson.wrong} />
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
