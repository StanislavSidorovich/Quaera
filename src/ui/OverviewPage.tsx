import { Fragment } from 'react';
import { overviewPage } from '../content/overview';
import type { OverviewBlock, OverviewTaskFigure } from '../content/overview';
import type { SchemaDoc } from '../engine/types';
import { useI18n } from '../i18n/context';
import { SchemaMap } from './SchemaMap';

/**
 * «Quaera in four pages» — брошюра для того, кто решает, отдавать ли ссылку
 * группе или тратить на неё вечер, а не для занимающегося.
 *
 * Открывается только прямой ссылкой (`?overview`) или печатью того, кому её
 * прислали, — в боковое меню не поставлена намеренно, см. src/content/overview.ts.
 * Раскладка и печать — код; вся проза, включая подписи внутри картинок и то,
 * какие числа настоящие, живёт в модуле контента и разобрана там.
 *
 * **Печатный заголовок дублирует заголовок шапки приложения.** На экране его
 * не видно (`.overview-print-title` скрыт по умолчанию): при печати `.topbar`
 * и `.sidebar` гасятся целиком (см. `@media print` в styles.css), и без своего
 * заголовка распечатка осталась бы без имени вовсе.
 *
 * **Разбивка на печатные листы — атрибутом `data-block`, а не догадкой
 * браузера.** `break-before: page` в CSS стоит перед блоками `what`, `data`
 * и `limits` — это и есть четыре листа из названия: проблема; что это плюс
 * как проверяется; один датасет; границы плюс как отдать.
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
      <h1 className="overview-print-title">{page.title}</h1>

      <p className="intro-lead">{page.lead}</p>

      <button type="button" className="link-row overview-print-btn no-print" onClick={() => window.print()}>
        {page.printLabel}
      </button>

      <StatsRow stats={page.stats} />

      {page.blocks.map((block) => (
        <section className="card" data-block={block.id} key={block.id}>
          <h2>{block.title}</h2>
          <OverviewBlockBody block={block} page={page} schema={schema} />
        </section>
      ))}

      <section className="card" data-block="closing">
        <h2>{page.closing.title}</h2>
        {page.closing.body.map((text, i) => (
          <p key={i}>{text}</p>
        ))}

        <div className="intro-doors">
          <button type="button" className="link-row intro-door" onClick={onOpenApp}>
            <span className="intro-door-label">{page.closing.appLabel} →</span>
            <span className="intro-door-note">{page.closing.appNote}</span>
          </button>
          <button type="button" className="link-row intro-door" onClick={onOpenIntro}>
            <span className="intro-door-label">{page.closing.introLabel} →</span>
            <span className="intro-door-note">{page.closing.introNote}</span>
          </button>
        </div>

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
      </section>
    </div>
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
 */
function SchemaFigure({ schema, caption }: { schema: SchemaDoc | null; caption: string }) {
  if (!schema) return null;
  return (
    <figure className="overview-schema">
      <SchemaMap doc={schema} onOpenTable={() => undefined} />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
