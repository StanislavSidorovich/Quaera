import { useMemo } from 'react';
import { careerAxes, careerEvidence, careerRole } from '../content/career';
import { passedQuizEvidence } from '../career/quiz';
import { DEFAULT_ROLE, checkedIds, emptyCareerState } from '../career/store';
import { roleReadiness } from '../career/readiness';
import { useI18n } from '../i18n/context';
import type { Progress } from '../srs/store';
import './roleStrip.css';

/**
 * Одна строка на главной вернувшегося: сколько целей выбранной роли уже
 * закрыто. Считает та же `roleReadiness`, что и экран «Путь к роли», поэтому
 * числа совпадают. Без выбранной роли (`roleAt === null`, стоит роль по
 * умолчанию) числа не показываем: цель, которую человек не выбирал, звучала
 * бы как оценка, — вместо них тихое приглашение выбрать.
 */
export function RoleStrip({ progress, onOpen }: { progress: Progress; onOpen: () => void }) {
  const { t, locale } = useI18n();
  const c = t.career;
  const state = progress.career ?? emptyCareerState();
  const chosen = state.roleAt !== null;
  const role = careerRole(state.role) ?? careerRole(DEFAULT_ROLE)!;
  const r = useMemo(() => {
    const checked = new Set([...checkedIds(state), ...passedQuizEvidence(careerEvidence, state.quiz, new Date())]);
    return roleReadiness(role, careerAxes, progress.skills, careerEvidence, checked);
  }, [role, state, progress.skills]);
  const text = !chosen ? c.stripPick : r.met >= r.total ? c.stripAllMet(role.title[locale]) : c.stripGoal(role.title[locale], r.met, r.total);
  return (
    <p className="role-strip">
      <span>{text}</span>
      <button type="button" className="role-strip-link" onClick={onOpen}>
        {chosen ? c.stripLink : c.stripPickLink} →
      </button>
    </p>
  );
}
