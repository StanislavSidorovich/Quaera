import { introPage } from '../content/intro';
import type { IntroBlock } from '../content/intro';
import { useI18n } from '../i18n/context';

/**
 * «Что такое аналитика данных» — экскурс для человека вне профессии.
 *
 * Экран ничему не учит и ничего не проверяет: он объясняет, чем занимаются
 * аналитики, зачем для этого отдельные инструменты и где такая работа нужна.
 * Задача — чтобы случайно зашедший ушёл понимающим, даже если больше
 * не вернётся. Вся проза лежит в content/intro.ts, здесь только раскладка.
 *
 * **Одна колонка, а не две балансируемые** (`.settings-column`, тот же
 * приём, что у «Аккаунта и данных»). Порядок здесь несущий: блоки читаются
 * подряд и каждый опирается на предыдущий — «почему одной таблицы мало»
 * бессмысленно раньше «как выглядит ответ». Поток `columns`, как
 * на «О тренажёре», расставил бы их по длине текста.
 *
 * **Обе картинки нарисованы разметкой, а не SVG.** Внутри них есть текст,
 * а текст в SVG сжимается вместе с viewBox и не растёт при увеличении
 * шрифта в приложении (A+/A++) — на этом уже обжигались на странице
 * разбора датасета. Таблицами и полосками они вдобавок выглядят как сам
 * тренажёр, а не как чужая иллюстрация.
 */
export function IntroPage({
  onOpenStoryMode,
  onOpenData,
}: {
  /**
   * null — кампания сейчас недоступна (её миссия не разрешается в задания).
   * Тогда дверь не рисуется вовсе: обещать вход, который никуда не ведёт,
   * хуже, чем не обещать.
   */
  onOpenStoryMode: (() => void) | null;
  onOpenData: () => void;
}) {
  const { locale } = useI18n();
  const page = introPage(locale);

  return (
    <div className="settings-column intro-page">
      <p className="intro-lead">{page.lead}</p>

      {page.blocks.map((block) => (
        <section className="card" key={block.id}>
          <h2>{block.title}</h2>
          <IntroBlockBody block={block} join={page.join} />
        </section>
      ))}

      {/*
       * Хвост — карточка того же вида, что и блоки, а не подвал: две двери
       * здесь такая же часть чтения, как и всё остальное, и выделять их
       * рамкой другого рода значило бы сказать «а теперь реклама».
       */}
      <section className="card">
        <h2>{page.closing.title}</h2>
        <p className="intro-quote">{page.closing.quote}</p>
        <p>{page.closing.question}</p>

        <div className="intro-doors">
          {onOpenStoryMode && (
            <button type="button" className="link-row intro-door" onClick={onOpenStoryMode}>
              <span className="intro-door-label">{page.closing.storyLabel} →</span>
              <span className="intro-door-note">{page.closing.storyNote}</span>
            </button>
          )}
          <button type="button" className="link-row intro-door" onClick={onOpenData}>
            <span className="intro-door-label">{page.closing.dataLabel} →</span>
            <span className="intro-door-note">{page.closing.dataNote}</span>
          </button>
        </div>

        <p className="muted intro-foot">{page.closing.foot}</p>
      </section>
    </div>
  );
}

function IntroBlockBody({
  block,
  join,
}: {
  block: IntroBlock;
  join: ReturnType<typeof introPage>['join'];
}) {
  return (
    <>
      {block.body.map((text, i) => (
        <p key={i}>{text}</p>
      ))}

      {block.rows && <Decomposition rows={block.rows} />}

      {block.list && (
        <ul className="intro-list">
          {block.list.map((item, i) => (
            <li key={i}>
              {item.label ? (
                <>
                  <b>{item.label}</b> — {item.text}
                </>
              ) : (
                item.text
              )}
            </li>
          ))}
        </ul>
      )}

      {block.figure === 'join' && <JoinFigure join={join} />}

      {block.after?.map((text, i) => (
        <p key={i}>{text}</p>
      ))}
    </>
  );
}

/**
 * Четыре величины и размер падения у каждой. Настоящая таблица, а не сетка
 * из div: скринридер обязан прочитать «средний чек, минус три процента»,
 * иначе весь смысл картинки (одна строка не как остальные) до него
 * не доходит вовсе. Полоса — вторая проекция того же числа и потому
 * aria-hidden.
 *
 * **Полоса растёт слева направо, от края, с которого начинается чтение.**
 * Первая версия соседней таблицы результата росла справа налево, и её
 * прочитали зеркальной диаграммой: взгляд встречал пустоту, длина которой
 * обратна величине (см. querium-style-rules).
 */
function Decomposition({ rows }: { rows: NonNullable<IntroBlock['rows']> }) {
  /*
   * Дорожка нормирована на самое большое падение, а не на 100%: при шкале
   * от нуля до сотни все четыре полосы стали бы короткими огрызками, и
   * разница между 18% и 3% — единственное, ради чего картинка существует, —
   * перестала бы читаться.
   */
  const max = Math.max(...rows.map((r) => r.share));
  return (
    <table className="intro-decomp">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className={row.accent ? 'is-accent' : undefined}>
            <th scope="row">{row.label}</th>
            <td className="intro-decomp-track" aria-hidden>
              <span style={{ width: `${Math.round((row.share / max) * 100)}%` }} />
            </td>
            <td className="intro-decomp-value">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Что значит «соединить таблицы»: две маленькие таблички, в которых стоит
 * один и тот же номер товара. Подсветка — на обоих вхождениях сразу,
 * иначе объяснять нечего.
 */
function JoinFigure({ join }: { join: ReturnType<typeof introPage>['join'] }) {
  return (
    <figure className="intro-join">
      <div className="intro-join-tables">
        {[join.left, join.right].map((table) => (
          <table key={table.title} className="intro-mini">
            <caption>{table.title}</caption>
            <thead>
              <tr>
                {table.columns.map((col) => (
                  <th key={col} scope="col">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {table.row.map((cell, i) => (
                  <td key={i} className={cell === join.match ? 'is-match' : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        ))}
      </div>
      <figcaption>{join.note}</figcaption>
    </figure>
  );
}
