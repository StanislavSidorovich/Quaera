import { useEffect, useState } from 'react';
import { careerRole, careerStages } from '../content/career';
import type { CareerStage } from '../content/career';
import { lessonBySkill } from '../content';
import { useI18n } from '../i18n/context';
import { FAMILY, openFamilyLink } from '../links';
import { skillLevel } from '../career/readiness';
import type { Progress } from '../srs/store';

/**
 * «Путь задачи»: десять этапов от вопроса до решения. На узком экране этапы
 * встают столбиком и раскрываются под собой, на широком идут рядом, а подробности
 * показываются под рядом. Вынесено из экрана «Путь к роли» без изменений в содержании.
 */
export function CareerStages({
  skills,
  skillTitle,
  onStartSkill,
  onOpenSkill,
}: {
  skills: Progress['skills'];
  skillTitle: (id: string) => string;
  onStartSkill: (id: string) => void;
  onOpenSkill: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const c = t.career;
  const [openStage, setOpenStage] = useState<string | null>(null);
  const narrow = useNarrow();

  const stageDetail = (stage: CareerStage) => (
    <div className="career-stage-detail">
      <dl className="career-dl">
        <dt>{c.stageWho}</dt>
        <dd>{stage.who.map((r) => careerRole(r)?.title[locale] ?? r).join(', ')}</dd>
        <dt>{c.stageTools}</dt>
        <dd>{stage.tools.join(', ')}</dd>
        <dt>{c.stageAi}</dt>
        <dd>{stage.ai[locale]}</dd>
        <dt>{c.stageCourse}</dt>
        <dd>{stage.courses[locale]}</dd>
      </dl>
      <h3 className="career-h3">{c.stageSkills}</h3>
      {stage.skills.length ? (
        <ul className="career-skill-list">
          {stage.skills.map((id) => {
            const lvl = skillLevel(skills[id]);
            const hasCard = lessonBySkill.has(id);
            return (
              <li key={id}>
                <button type="button" className="link-row career-skill-link" onClick={() => (hasCard ? onOpenSkill(id) : onStartSkill(id))}>
                  <span className="career-dots" role="img" aria-label={c.skillLevelAria(lvl)}>
                    {[1, 2].map((n) => (
                      <i key={n} className={lvl >= n ? 'on' : ''} />
                    ))}
                  </span>
                  {skillTitle(id)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{c.stageNoSkills}</p>
      )}
      {stage.apps.length > 0 && (
        <>
          <h3 className="career-h3">{c.stageApps}</h3>
          <div className="career-apps">
            {FAMILY.filter((f) => stage.apps.includes(f.key)).map((f) => (
              <a key={f.key} href={f.url} target="_blank" rel="noreferrer" onClick={(e) => openFamilyLink(e.currentTarget, e.nativeEvent, f.key)}>
                {{ model: t.nav.familyModel, flow: t.nav.familyFlow, pandas: t.nav.familyPandas, lab: t.nav.familyLab }[f.key]} ↗
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const chosenStage = careerStages.find((s) => s.id === openStage);

  return (
    <section className="card">
      <h2>{c.stagesTitle}</h2>
      <p className="muted">{c.stagesLead}</p>
      {narrow ? (
        <ol className="career-stages career-stages-v">
          {careerStages.map((s, i) => (
            <li key={s.id}>
              <button type="button" className="career-stage-btn" aria-expanded={openStage === s.id} onClick={() => setOpenStage(openStage === s.id ? null : s.id)}>
                <span className="career-stage-n">{i + 1}</span>
                {s.title[locale]}
              </button>
              {openStage === s.id && stageDetail(s)}
            </li>
          ))}
        </ol>
      ) : (
        <>
          <ol className="career-stages career-stages-h">
            {careerStages.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="career-stage-btn"
                  aria-expanded={openStage === s.id}
                  aria-label={c.stageOpen(i + 1, s.title[locale])}
                  onClick={() => setOpenStage(openStage === s.id ? null : s.id)}
                >
                  <span className="career-stage-n">{i + 1}</span>
                  <span className="career-stage-name">{s.title[locale]}</span>
                </button>
              </li>
            ))}
          </ol>
          {chosenStage && stageDetail(chosenStage)}
        </>
      )}
    </section>
  );
}

/** Узкий экран: этапы встают столбиком, и тап раскрывает подробности под этапом. */
function useNarrow(): boolean {
  const query = '(max-width: 640px)';
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}
