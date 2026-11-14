import { useMemo } from 'react';
import { careerAxes, careerEvidence, careerRole } from '../content/career';
import { passedQuizEvidence } from '../career/quiz';
import { DEFAULT_ROLE, checkedIds, emptyCareerState } from '../career/store';
import { closedEvidence, roleReadiness } from '../career/readiness';
import { careerSignals } from '../career/signals';
import { useI18n } from '../i18n/context';
import type { Progress } from '../srs/store';
import './roleStrip.css';

/**
 * Одна строка на главной вернувшегося: сколько целей выбранной роли уже
 * закрыто. Считает та же `roleReadiness`, что и экран «Путь к роли», поэтому
 * числа совпадают. Без выбранной роли (`roleAt === null`, стоит роль по
 * умолчанию) числа не показываем: цель, которую человек не выбирал, звучала
 * бы как оценка, — вместо них тихое приглашение выбрать.
 * Ссылка ведёт на страницу выбранной роли; пока роль не выбрана, на обзор.
 */
/** Цели выбранной роли: сколько закрыто. Те же числа, что на экране «Путь к роли» (галочки, тесты, отметки Lab). */
export function roleGoal(progress: Progress, now: Date = new Date()) {
  const state = progress.career ?? emptyCareerState();
  const role = careerRole(state.role) ?? careerRole(DEFAULT_ROLE)!;
  const checked = closedEvidence(checkedIds(state), passedQuizEvidence(careerEvidence, state.quiz, now), careerEvidence, state.labDone ?? {});
  const r = roleReadiness(role, careerAxes, careerSignals(progress), careerEvidence, checked);
  return { chosen: state.roleAt !== null, role, met: r.met, total: r.total };
}

export function RoleStrip({ progress, onOpen }: { progress: Progress; onOpen: (roleId: string | null) => void }) {
  const { t, locale } = useI18n();
  const c = t.career;
  const r = useMemo(() => roleGoal(progress), [progress.career, progress.skills, progress.taskRecords]);
  const { chosen, role } = r;
  const text = !chosen ? c.stripPick : r.met >= r.total ? c.stripAllMet(role.title[locale]) : c.stripGoal(role.title[locale], r.met, r.total);
  return (
    <p className="role-strip">
      <span>{text}</span>
      <button type="button" className="role-strip-link" onClick={() => onOpen(chosen ? role.id : null)}>
        {chosen ? c.stripLink : c.stripPickLink} →
      </button>
    </p>
  );
}
