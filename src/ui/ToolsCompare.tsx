import { toolsCompareAnswers, toolsCompareQuestion, toolsCompareResult } from '../content/tools-compare';
import { useI18n } from '../i18n/context';
import { CodeBlock } from './CodeBlock';
import { ResultTable } from './ResultTable';

/**
 * «Один вопрос — три ответа»: SQL, pandas и мера DAX на одном вопросе
 * к датасету и общая таблица результата.
 *
 * Стоит на двух экранах с разными утверждениями, отсюда `variant`:
 *
 *  - `onboarding` («С чего начать») — выбирают инструмент, вес несут выводы
 *    под кодом (`note`), внизу подпись о том, что сборка сверяет фрагменты;
 *  - `brief` («О тренажёре») — отвечают на «что это такое», вес несёт
 *    таблица: одни данные, ответ сходится. Выводов у SQL и pandas нет,
 *    чтобы справочная страница не стала вторым экземпляром онбординга;
 *    у DAX вывод остаётся — он и есть объяснение, почему меру нечем
 *    проверить, а без него колонка стояла пустой рядом с таблицей.
 *
 * **Таблица стоит под двумя колонками, а не под тремя.** У DAX исполнителя
 * нет, и раскладка говорит это сама: колонка меры тянется вниз мимо
 * таблицы, к которой она не приложила руку. На узком контейнере порядок
 * тот же по смыслу — SQL, pandas, их общий ответ, потом DAX.
 *
 * Колонки включаются по ширине **карточки**, а не окна (контейнерный запрос
 * в styles.css): на «С чего начать» справа от 1280px стоит оглавление,
 * и одна и та же ширина окна даёт разную ширину карточке на двух экранах.
 * Код не переносится, а листается (см. .compare-item pre.sql-block), поэтому
 * колонка держится на потолке длины строки, который сверяет гейт.
 *
 * Код, выводы и таблица живут в content/tools-compare.json, проверяемом
 * сборкой; здесь только раскладка и подписи.
 */
export function ToolsCompare({ variant }: { variant: 'onboarding' | 'brief' }) {
  const { t, locale } = useI18n();
  const full = variant === 'onboarding';

  return (
    <div className="card compare">
      <h2>{full ? t.onboarding.compareTitle : t.onboarding.compareBriefTitle}</h2>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5 }}>
        {full ? t.onboarding.compareIntro : t.onboarding.compareBriefIntro}
      </p>
      <p className="muted" style={{ margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {t.onboarding.compareQuestionLabel}
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, fontWeight: 600 }}>
        {toolsCompareQuestion(locale)}
      </p>
      <div className="compare-list">
        {toolsCompareAnswers.map((answer) => (
          <div key={answer.track} className={`compare-item compare-${answer.track}`}>
            <div className="compare-head">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
                <span className={`chain-legend-dot track-${answer.track}`} aria-hidden />
                {t.tracks.names[answer.track]}
              </span>
              {/*
               * Пометка исполнимости — не украшение: во всём остальном
               * тренажёре код выполняется по-настоящему, и без явной
               * подписи читатель по привычке решит, что и мера DAX
               * прогнана по данным.
               *
               * Выделена та пилюля, которая говорит неожиданное: подсвечивать
               * исключение, а не правило, иначе подсветка перестаёт
               * что-либо значить.
               */}
              <span className={`pill${answer.runnable ? '' : ' warn'}`}>
                {answer.runnable ? t.onboarding.compareRunnable : t.onboarding.compareNotRunnable}
              </span>
            </div>
            <CodeBlock code={answer.code} style={{ marginTop: 8, fontSize: 12.5 }} />
            {/*
             * Вывод под кодом набран текстом, а не .muted: приглушённым он
             * читался подписью к коду, и глаз уносил «три способа написать
             * одно», а не то, чем они различаются.
             */}
            {(full || !answer.runnable) && (
              <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6 }}>{answer.note[locale]}</p>
            )}
          </div>
        ))}
        <div className="compare-result">
          <p className="compare-result-label">
            <span aria-hidden>✓ </span>
            {t.onboarding.compareResultLabel}
          </p>
          <ResultTable
            data={{
              columns: toolsCompareResult.columns,
              rows: toolsCompareResult.rows,
              totalRows: toolsCompareResult.rows.length,
            }}
          />
        </div>
      </div>
      {full && (
        <p className="muted" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          {t.onboarding.compareFooter}
        </p>
      )}
    </div>
  );
}
