import { Fragment } from 'react';
import { overviewPage } from '../content/overview';
import type { OverviewBlock, OverviewTaskFigure } from '../content/overview';
import type { SchemaDoc } from '../engine/types';
import { I18nContext, useI18n } from '../i18n/context';
import { en } from '../i18n/en';
import { SchemaMap } from './SchemaMap';

/**
 * «Quaera at a glance» — брошюра для того, кто решает, отдавать ли ссылку
 * группе или тратить на неё вечер, а не для занимающегося.
 *
 * Открывается только прямой ссылкой (`?overview`) или печатью того, кому её
 * прислали, — в боковое меню не поставлена намеренно, см. src/content/overview.ts.
 * Раскладка и печать — код; вся проза, включая подписи внутри картинок и то,
 * какие числа настоящие, живёт в модуле контента и разобрана там.
 *
 * **Шапка распечатки видна только на бумаге.** На экране имя приложения уже
 * стоит в топбаре и в шапке бокового меню, и третья копия читалась бы как
 * задвоение; при печати `.topbar` и `.sidebar` гасятся целиком, и без своей
 * шапки распечатка осталась бы без имени и без знака вовсе.
 *
 * **Разбивка на печатные листы — атрибутом `data-block`, а не догадкой
 * браузера.** `break-before: page` в CSS стоит перед блоками `task`, `limits`,
 * разделителем `.overview-divider` и блоком `gap`. Отсюда пять листов:
 * 1 — что это плюс четыре трека, 2 — как проверяется задание, 3 — границы
 * и как отдать группе (на этом самодостаточная часть кончается), 4 — датасет
 * и схема, 5 — зачем это нужно плюс условия.
 *
 * **Адрес сайта стоит в надзаголовке каждого раздела и только на печати.**
 * Читатель PDF получает лист, на котором адрес есть, какой бы лист ему
 * ни переслали; на экране он был бы шестой копией того, что уже в адресной
 * строке.
 */
export function OverviewPage({
  schema,
  onOpenApp,
  onOpenIntro,
}: {
  schema: SchemaDoc | null;
  onOpenApp: () => void;
  onOpenIntro: () => void;
}) {
  const { locale } = useI18n();
  const page = overviewPage(locale);

  return (
    <div className="settings-column overview-page">
      <header className="overview-masthead">
        <BrandMark />
        <div>
          <span className="overview-masthead-word">{page.masthead.word}</span>
          <span className="overview-masthead-tagline">{page.masthead.tagline}</span>
        </div>
      </header>

      <p className="intro-lead">{page.lead}</p>

      <button type="button" className="link-row overview-print-btn no-print" onClick={() => window.print()}>
        {page.printLabel}
      </button>

      <StatsRow stats={page.stats} />

      {page.blocks.map((block) => (
        <Fragment key={block.id}>
          {block.id === 'data' && (
            <div className="overview-divider">
              <h2>{page.dividerTitle}</h2>
              <p>{page.dividerNote}</p>
            </div>
          )}

          <section className="card" data-block={block.id}>
            <p className="overview-kicker">
              <span className="overview-kicker-num">{block.kicker}</span>
              <span className="overview-kicker-url">{page.siteUrl}</span>
            </p>
            <h2 className="overview-h2">{block.title}</h2>
            <OverviewBlockBody block={block} page={page} schema={schema} />

            {block.id === 'closing' && (
              <>
                {/*
                 * На экране двери — единственный путь отсюда в приложение
                 * и в экскурс. На бумаге они дублируют QR ниже и стоили
                 * лишних 119px печатного листа, поэтому `no-print`.
                 */}
                <div className="intro-doors no-print">
                  <button type="button" className="link-row intro-door" onClick={onOpenApp}>
                    <span className="intro-door-label">{page.closing.appLabel} →</span>
                    <span className="intro-door-note">{page.closing.appNote}</span>
                  </button>
                  <button type="button" className="link-row intro-door" onClick={onOpenIntro}>
                    <span className="intro-door-label">{page.closing.introLabel} →</span>
                    <span className="intro-door-note">{page.closing.introNote}</span>
                  </button>
                </div>

                {/*
                 * Только для печати: тот же адрес, что у appNote (?overview,
                 * а не главная) — читатель распечатки получает живую версию
                 * того же листа, а не другую страницу.
                 */}
                <p className="overview-print-qr">
                  <img src="/overview-qr.svg" alt="" width={96} height={96} />
                  <span>{page.closing.qrCaption}</span>
                </p>
              </>
            )}

            {/*
             * Условия и подпись автора стоят в конце последнего раздела,
             * а не отдельной карточкой: на самодостаточных листах 1-3 они
             * заняли бы место, которое там дороже, а тому, кто дочитал
             * до конца, они нужны в одном месте.
             */}
            {block.id === 'gap' && (
              <>
                <h3 className="overview-terms-title">{page.closing.termsTitle}</h3>
                <ul className="overview-list">
                  {page.closing.terms.map((item, i) => (
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
                <p className="muted overview-author">{page.closing.author}</p>
              </>
            )}
          </section>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Знак приложения: три растущих столбца и каретка запроса под ними. Та же
 * геометрия и те же цвета, что у `drawMark` в scripts/gen-icons.mjs, но
 * разметкой, а не картинкой: PNG-иконка нарисована на тёмном фоне приложения
 * и на белом листе печаталась бы тёмным квадратом.
 */
function BrandMark() {
  const bars = [
    { x: 6, y: 44, h: 30, fill: '#38bdf8' },
    { x: 36.5, y: 26, h: 48, fill: '#818cf8' },
    { x: 67, y: 8, h: 66, fill: '#4ade80' },
  ];
  return (
    <svg className="overview-mark" viewBox="0 0 100 100" width="40" height="40" aria-hidden focusable="false">
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={bar.y} width="19" height={bar.h} rx="3" fill={bar.fill} />
      ))}
      <rect x="6" y="83" width="50" height="6" rx="3" fill="#94a3b8" />
      <rect x="62" y="83" width="20" height="6" rx="3" fill="#cbd5e1" />
    </svg>
  );
}

function StatsRow({ stats }: { stats: ReturnType<typeof overviewPage>['stats'] }) {
  return (
    <div className="overview-stats" role="list">
      {stats.map((s) => (
        <div className="overview-stat" role="listitem" key={s.label}>
          <span className="overview-stat-value">{s.value}</span>
          <span className="overview-stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function OverviewBlockBody({
  block,
  page,
  schema,
}: {
  block: OverviewBlock;
  page: ReturnType<typeof overviewPage>;
  schema: SchemaDoc | null;
}) {
  return (
    <>
      {block.body.map((text, i) => (
        <p key={i}>{text}</p>
      ))}

      {block.figure === 'gap' && <GapFigure gap={page.gap} />}
      {block.figure === 'tracks' && <TracksFigure tracks={page.tracks} />}
      {block.figure === 'task' && <TaskFigure task={page.task} />}
      {block.figure === 'schema' && <SchemaFigure schema={schema} caption={page.schemaCaption} />}

      {block.list && (
        <ul className="overview-list">
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

      {block.after?.map((text, i) => (
        <p key={i}>{text}</p>
      ))}

      {block.omits && (
        <ul className="overview-list overview-omits">
          {block.omits.map((item, i) => (
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
    </>
  );
}

/**
 * Полоса дней между занятием и моментом, когда навык понадобился.
 * Ячейки заданы в контенте (их число — часть высказывания), здесь только
 * цвет по `kind` и подпись у первой и последней.
 */
function GapFigure({ gap }: { gap: ReturnType<typeof overviewPage>['gap'] }) {
  return (
    <figure className="overview-gap">
      <div className="overview-gap-row" aria-hidden>
        {gap.cells.map((cell, i) => (
          <span key={i} className={`overview-gap-cell is-${cell.kind}`} />
        ))}
      </div>
      <div className="overview-gap-labels">
        <span>{gap.cells[0]?.label}</span>
        <span>{gap.cells[gap.cells.length - 1]?.label}</span>
      </div>
      <figcaption>{gap.caption}</figcaption>
    </figure>
  );
}

/** Четыре трека карточками — числа и заметка из контента, раскладка здесь. */
function TracksFigure({ tracks }: { tracks: ReturnType<typeof overviewPage>['tracks'] }) {
  return (
    <ul className="overview-tracks">
      {tracks.map((track) => (
        <li key={track.name}>
          <div className="overview-track-head">
            <b>{track.name}</b>
            <span className="overview-track-count">{track.count}</span>
          </div>
          <p>{track.note}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Задание целиком: условие, запрос, результат, зачёт, промах.
 *
 * Числа в `rows` настоящие и сняты запросом к тому же файлу, который
 * скачивает браузер (см. шапку src/content/overview.ts) — здесь их нельзя
 * поправить, не разойдясь с датасетом.
 */
function TaskFigure({ task }: { task: OverviewTaskFigure }) {
  return (
    <figure className="overview-task">
      <p className="overview-task-prompt">
        <b>{task.promptLabel}:</b> {task.prompt}
      </p>
      <pre className="sql-block">{task.query.join('\n')}</pre>
      <table className="overview-task-table">
        <thead>
          <tr>
            {task.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {task.rows.map((row, i) => (
            <Fragment key={i}>
              {i === Math.ceil(task.rows.length / 2) && (
                <tr className="overview-task-ellipsis">
                  <td colSpan={task.columns.length}>{task.ellipsis}</td>
                </tr>
              )}
              <tr>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="feedback ok">
        <h3>{task.verdict}</h3>
        <p>{task.verdictNote}</p>
      </div>
      <div className="feedback warn">
        <h3>{task.missTitle}</h3>
        <p>{task.missNote}</p>
      </div>
      <figcaption>{task.caption}</figcaption>
    </figure>
  );
}

/**
 * Живая схема — тот же компонент и тот же документ, что на экране «Данные»,
 * а не снимок: числа строк всегда сегодняшние, а не протухший скриншот
 * (см. шапку модуля контента про восемь снимков в docs/screenshots).
 *
 * `onOpenTable` — заглушка: карточка таблицы, которую SchemaMap открывает
 * по клику, здесь не нужна, брошюра показывает форму, а не читает столбцы.
 *
 * `SchemaMap` сам читает язык из `useI18n()`, а брошюра обязана оставаться
 * английской независимо от переключателя в шапке (тот виден на этой же
 * странице) — иначе подписи схемы («FACTS», легенда) переключаются на
 * русский, а весь текст вокруг них из `overview.ts` остаётся английским.
 * Значение контекста подменено локально, без побочных эффектов
 * `I18nProvider` (`document.documentElement.lang` и `<title>` не трогает).
 */
function SchemaFigure({ schema, caption }: { schema: SchemaDoc | null; caption: string }) {
  if (!schema) return null;
  return (
    <I18nContext.Provider value={{ locale: 'en', t: en, setLocale: () => undefined }}>
      <figure className="overview-schema">
        <SchemaMap doc={schema} />
        <figcaption>{caption}</figcaption>
      </figure>
    </I18nContext.Provider>
  );
}
