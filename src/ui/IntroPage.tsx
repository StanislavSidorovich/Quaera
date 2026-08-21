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
 * **Картинки нарисованы разметкой, а не SVG.** Внутри них есть текст,
 * а текст в SVG сжимается вместе с viewBox и не растёт при увеличении
 * шрифта в приложении (A+/A++) — на этом уже обжигались на странице
 * разбора датасета. Таблицами и полосками они вдобавок выглядят как сам
 * тренажёр, а не как чужая иллюстрация. Единственный SVG на экране —
 * иконки карты вверху, и в них нет ни одной буквы: запрет касался текста,
 * а фигура размером в em растёт вместе со шрифтом.
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

      <MapFigure map={page.figures.map} />

      {page.blocks.map((block) => (
        <section className="card" key={block.id}>
          <h2>{block.title}</h2>
          <IntroBlockBody block={block} join={page.join} figures={page.figures} />
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

/**
 * Карта области: центр и восемь узлов вокруг него.
 *
 * **Сетка, а не круг по координатам.** Кружки на окружности — это
 * абсолютное позиционирование по фиксированным точкам, и разъезжается оно
 * ровно там, где подпись переносится на вторую строку: длинные русские
 * слова, английская локаль, A+/A++. В сетке подпись просто раздвигает
 * свою клетку. Поэтому же нет и кривых-соединителей: их геометрия
 * пережила бы только один размер шрифта из трёх.
 *
 * **Центр стоит в разметке первым.** На телефоне колонка одна, и «Аналитика
 * данных» обязана прочитаться до частей — иначе восемь плашек читаются как
 * список неизвестно чего. На широком экране центр явно посажен во вторую
 * клетку второго ряда, а восемь узлов сами разбираются по остальным
 * восьми: порядок чтения при этом остаётся тот же, слева направо.
 *
 * **Иконки — фигуры, внутри них нет ни одной буквы.** Запрет на SVG
 * на этой странице касался текста (он сжимается вместе с viewBox и не
 * растёт при A+/A++); фигура, размер которой задан в em, растёт вместе
 * со шрифтом и правилу не противоречит.
 */
function MapFigure({ map }: { map: ReturnType<typeof introPage>['figures']['map'] }) {
  return (
    <figure className="intro-map card">
      <div className="intro-map-grid">
        <div className="intro-map-hub">
          <span>{map.hub}</span>
        </div>

        {map.nodes.map((node, i) => (
          <div className="intro-map-node" key={node.label}>
            <span className="intro-map-icon" aria-hidden="true">
              <MapIcon index={i} />
            </span>
            <span className="intro-map-label">{node.label}</span>
            <span className="intro-map-note">{node.note}</span>
          </div>
        ))}
      </div>

      <figcaption>{map.caption}</figcaption>
    </figure>
  );
}

/**
 * Восемь фигур в одной системе координат 24×24: один и тот же наклон линий,
 * одна толщина, скруглённые концы. Рисуются `currentColor`, цвет приходит
 * из CSS — иначе тёмная тема получила бы восемь захардкоженных оттенков.
 */
function MapIcon({ index }: { index: number }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (index) {
    /* Источники: три стопки записей, лежащие порознь. */
    case 0:
      return (
        <svg {...common}>
          <rect x="3" y="4" width="7" height="7" rx="1.5" />
          <rect x="14" y="4" width="7" height="7" rx="1.5" />
          <rect x="8.5" y="14" width="7" height="6" rx="1.5" />
        </svg>
      );
    /* Сбор и связывание: два узла и связь между ними. */
    case 1:
      return (
        <svg {...common}>
          <circle cx="6" cy="7" r="3" />
          <circle cx="18" cy="17" r="3" />
          <path d="M8.4 9.2 L15.6 14.8" />
        </svg>
      );
    /* Очистка: сито, сквозь которое проходит не всё. */
    case 2:
      return (
        <svg {...common}>
          <path d="M3.5 5 H20.5 L14 12.5 V19 L10 21 V12.5 Z" />
        </svg>
      );
    /* Модель данных: центральная таблица и три вокруг — звезда. */
    case 3:
      return (
        <svg {...common}>
          <rect x="9" y="9" width="6" height="6" rx="1.2" />
          <path d="M12 9 V4 M9 12 H4 M15 15 L19 19" />
          <rect x="9" y="1.5" width="6" height="2.5" rx="1" />
          <rect x="1" y="10.5" width="3" height="3" rx="1" />
          <rect x="18.5" y="18.5" width="4" height="3" rx="1" />
        </svg>
      );
    /* Метрики: шкала со стрелкой — величина, у которой есть значение. */
    case 4:
      return (
        <svg {...common}>
          <path d="M3.5 17 A9 9 0 0 1 20.5 17" />
          <path d="M12 17 L16.5 11.5" />
          <circle cx="12" cy="17" r="1.4" />
        </svg>
      );
    /* Анализ: увеличительное стекло, а под ним линия, которая меняется. */
    case 5:
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.4 15.4 L21 21" />
          <path d="M7.5 12 L10 9.5 L12 11 L14 7.5" />
        </svg>
      );
    /* Дашборд: три столбика на общей оси. */
    case 6:
      return (
        <svg {...common}>
          <path d="M3.5 20 H20.5" />
          <path d="M7 20 V13 M12 20 V6 M17 20 V10" />
        </svg>
      );
    /* Решение: развилка, на которой выбран один путь. */
    default:
      return (
        <svg {...common}>
          <path d="M12 21 V13" />
          <path d="M12 13 L5 6" />
          <path d="M12 13 L19 6" />
          <circle cx="19" cy="4.5" r="2" />
        </svg>
      );
  }
}

function IntroBlockBody({
  block,
  join,
  figures,
}: {
  block: IntroBlock;
  join: ReturnType<typeof introPage>['join'];
  figures: ReturnType<typeof introPage>['figures'];
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
      {block.figure === 'scale' && <ScaleFigure caption={figures.scale} />}
      {block.figure === 'pipeline' && <PipelineFigure pipeline={figures.pipeline} />}

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
 * Стена записей: двести клеток, три из них — искомые.
 *
 * Показывает то, чего прозой не показать: «много» словами читается как
 * абстракция, а поле, в котором глаз не находит три отмеченные клетки без
 * усилия, — как опыт. Ровно это и есть довод существования профессии,
 * с которого начинается страница.
 *
 * Клетки рисуются здесь, а не лежат в контенте: их количество и три
 * отмеченных — параметры картинки, а не текст. Переводить в них нечего,
 * подпись приходит из контента.
 */
function ScaleFigure({ caption }: { caption: string }) {
  const CELLS = 200;
  /*
   * Отмеченные клетки заданы числами, а не случайны: случайные при каждой
   * отрисовке прыгали бы, а человек, вернувшийся на страницу, ждёт ту же
   * картинку. Разнесены по полю, чтобы искать пришлось по всей площади,
   * и ни одна не стоит с краю — с краю их находят сразу.
   */
  const marked = new Set([37, 118, 164]);
  return (
    <figure className="intro-scale">
      <div className="intro-scale-grid" aria-hidden>
        {Array.from({ length: CELLS }, (_, i) => (
          <span key={i} className={marked.has(i) ? 'is-marked' : undefined} />
        ))}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/**
 * Воронка работы: пять ступеней, каждая у́же предыдущей.
 *
 * Пять глаголов списком выше называют, что делает аналитик; картинка
 * говорит то, чего в списке нет, — что работа **сужает**, и на выходе
 * остаётся одна фраза. Это же и лечит блок, который в чтении был
 * слабейшим: список из пяти пунктов без формы читается как оглавление.
 */
function PipelineFigure({
  pipeline,
}: {
  pipeline: ReturnType<typeof introPage>['figures']['pipeline'];
}) {
  const n = pipeline.stages.length;
  return (
    <figure className="intro-pipeline">
      <ol className="intro-pipeline-steps">
        {pipeline.stages.map((stage, i) => (
          <li key={stage}>
            {/*
             * Ширина падает от 100% к 30% ровными долями. Числа не значат
             * ничего измеримого и не притворяются: подписи ступеней стоят
             * рядом, а величины у этой воронки нет вовсе — форма здесь
             * говорит «сужается», а не «во столько раз».
             */}
            <span className="intro-pipeline-bar" style={{ width: `${100 - (i * 70) / (n - 1)}%` }} />
            <span className="intro-pipeline-label">{stage}</span>
          </li>
        ))}
      </ol>
      <figcaption>{pipeline.caption}</figcaption>
    </figure>
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
