import { careerAxis, careerEvidence } from '../content/career';
import { useI18n } from '../i18n/context';
import './labDoneCard.css';

/** Ключи сборки руками в Lab: за каждым свой смысл на карточке. */
const BUILD = 'build:kaiyo-sales';
const MORE = 'build:kaiyo-sales-more';
const REFRESH = 'build:kaiyo-sales-refresh';

/**
 * Карточка «что дальше» на возврат из Lab с отметкой сборки (`#lab-done=build:…`), вместо тоста:
 * на ней видно, какая ось сдвинулась (по отметкам `career.json`, у которых этот ключ), и одна
 * кнопка дальше. После основной сборки это SQL (JOIN и GROUP BY нужны для More), после More
 * и Refresh «Путь к роли». Обзор Fable 2026-11-11, п. 3.
 */
export function LabDoneCard({
  markKey,
  sqlSkill,
  onClose,
  onStartSkill,
  onOpenPath,
}: {
  markKey: string;
  sqlSkill: string;
  onClose: () => void;
  onStartSkill: (skillId: string) => void;
  onOpenPath: () => void;
}) {
  const { t, locale } = useI18n();
  const c = t.labDone.card;
  const moved = careerEvidence.filter((e) => e.source === 'labDone' && e.labKeys?.includes(markKey));
  const title = markKey === REFRESH ? c.refreshTitle : markKey === MORE ? c.moreTitle : c.buildTitle;
  return (
    <section className="lab-done-card card" role="status" aria-labelledby="ldc-title">
      <button type="button" className="ldc-x" aria-label={c.close} onClick={onClose}>
        ×
      </button>
      <h2 id="ldc-title">{title}</h2>
      {moved.length > 0 && (
        <>
          <p className="ldc-lead">{c.moved}</p>
          <ul className="ldc-axes">
            {moved.map((e) => (
              <li key={e.id}>
                <strong>{careerAxis(e.axis).short[locale]}</strong>
                <span>{t.career.levels[e.level]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="ldc-next">{markKey === BUILD ? c.nextBuild : c.nextPath}</p>
      <div className="ldc-actions">
        {markKey === BUILD ? (
          <button type="button" className="btn" onClick={() => onStartSkill(sqlSkill)}>
            {sqlSkill === 'sql-join-inner' ? c.startJoin : c.startGroupBy}
          </button>
        ) : (
          <button type="button" className="btn" onClick={onOpenPath}>
            {c.openPath}
          </button>
        )}
        <button type="button" className="btn secondary" onClick={onClose}>
          {c.close}
        </button>
      </div>
    </section>
  );
}
