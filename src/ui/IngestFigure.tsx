import { architecture } from '../content/architecture';
import { useI18n } from '../i18n/context';
import { Notes, rich } from './figureParts';

const g = architecture.artifacts.ingest;

/**
 * Схема загрузки в lakehouse: файлы по расписанию, три слоя внутри рамки lakehouse и отчёт.
 * Узко: вертикальный список шагов со стрелками вниз; от 860px контейнера: строка со стрелками
 * вправо. Рамка lakehouse — настоящий вложенный контейнер трёх шагов, а не слой поверх сетки.
 * Число файлов и первый с последним в bronze сняты запросом к `staging_raw_sellout`, их сверяет
 * `test:architecture`; расписание и подключение нарисованы для примера (пометка 2).
 */
export function IngestFigure() {
  const { locale } = useI18n();
  const L = (k: Exclude<keyof typeof g.labels, 'cleanTags'>) => g.labels[k][locale];
  const arrow = () => (
    <li className="ig-arrow" role="presentation" aria-hidden="true">
      <span className="ig-arrow-down">↓</span>
      <span className="ig-arrow-right">→</span>
    </li>
  );

  return (
    <figure className="pf ig">
      <figcaption className="pf-title">{g.title[locale]}</figcaption>
      <ol className="ig-steps" aria-label={g.aria[locale]}>
        <li className="ig-step ig-step--files">
          <strong className="ig-h">{L('files')}</strong>
          <div className="ig-body">
            <span className="ig-sub">{L('filesSub')}</span>
            <span className="ig-chips">
              <span className="ig-chip">{g.files.first}</span>
              <span className="ig-dots" aria-hidden="true">
                …
              </span>
              <span className="ig-chip">{g.files.last}</span>
            </span>
          </div>
        </li>
        {arrow()}
        <li className="ig-lake">
          <span className="ig-lake-label">{L('lake')}</span>
          <ol className="ig-lake-steps">
            <li className="ig-step ig-step--bronze">
              <strong className="ig-h">{L('bronze')}</strong>
              <div className="ig-body">
                <span className="ig-sub">{rich(L('bronzeSub'))}</span>
                <span className="ig-chips">
                  <span className="ig-chip">staging_raw_sellout</span>
                </span>
                <span className="ig-sub">{L('bronzeCount')}</span>
              </div>
            </li>
            {arrow()}
            <li className="ig-step ig-step--silver">
              <strong className="ig-h">{L('silver')}</strong>
              <div className="ig-body">
                <span className="ig-sub">{L('silverSub')}</span>
                <span className="ig-chips">
                  {g.labels.cleanTags[locale].map((t) => (
                    <span key={t} className="ig-chip ig-chip--tag">
                      {t}
                    </span>
                  ))}
                </span>
              </div>
            </li>
            {arrow()}
            <li className="ig-step ig-step--gold">
              <strong className="ig-h">{L('gold')}</strong>
              <div className="ig-body">
                <span className="ig-sub">{L('goldSub2')}</span>
                <span className="ig-chips">
                  <span className="ig-chip">fact_sellout</span>
                </span>
                <span className="ig-sub">{L('goldSub')}</span>
              </div>
            </li>
          </ol>
        </li>
        {arrow()}
        <li className="ig-step ig-step--report">
          <strong className="ig-h">{L('next')}</strong>
          <div className="ig-body">
            <span className="ig-sub">{L('nextSub')}</span>
          </div>
        </li>
      </ol>
      <Notes notes={g.notes} locale={locale} />
      <p className="muted pf-caption">{rich(g.caption[locale])}</p>
    </figure>
  );
}
