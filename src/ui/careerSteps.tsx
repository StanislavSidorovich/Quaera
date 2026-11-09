import { AXIS_SHARE } from '../career/readiness';
import type { AxisReading, AxisId } from '../career/readiness';
import { careerAxis, careerEvidence } from '../content/career';
import type { AxisStep } from '../content/career';
import { useI18n } from '../i18n/context';
import { FAMILY, LAB_BUILD, LAB_PRACTICE_PYTHON, LAB_PRACTICE_SQL, openFamilyLink } from '../links';
import type { QuizAttempt } from '../career/quiz';
import { quizStatus } from '../career/quiz';
import { quizBank } from '../content/careerQuiz';
import { useQuizStatusText } from './CareerQuiz';
import './careerSteps.css';

/**
 * Общие куски обзора и страницы роли: шаги «как дойти до уровня» и строки
 * отметок. Здесь только раскладка; что засчитано и что предложить, решает
 * `career/readiness.ts`, а тексты шагов лежат в `content/career.json` (поле `levels`).
 */
export interface StepCtx {
  /** Засчитанные отметки: галочки, самопроверки и возврат из Lab. */
  checked: ReadonlySet<string>;
  quiz: QuizAttempt[];
  skillTitle: (id: string) => string;
  onStartSkill: (id: string) => void;
  /** Нет, если у активного пака нет сюжета (кнопка режима истории тогда не рисуется). */
  onOpenStory?: () => void;
  openQuiz: (axis: AxisId) => void;
  toggleEvidence: (id: string) => void;
}

/** Куда вести за отметкой, которую ставит Lab: адрес в Lab по id отметки. */
const LAB_EVIDENCE_LINK: Record<string, string> = {
  'eng-lab-pipeline': LAB_BUILD,
  'sql-lab-practice': LAB_PRACTICE_SQL,
  'py-lab-practice': LAB_PRACTICE_PYTHON,
};

const evidenceById = (id: string) => careerEvidence.find((e) => e.id === id);

/** Строка отметки оси: галочка, самопроверка с кнопкой или метка «придёт из Lab». */
export function EvidenceRow({ id, ctx, capped }: { id: string; ctx: StepCtx; capped?: boolean }) {
  const { t, locale } = useI18n();
  const c = t.career;
  const quizText = useQuizStatusText();
  const e = evidenceById(id);
  if (!e) return null;
  if (e.source === 'labDone') {
    return (
      <li className="career-quiz-row">
        <span>{e.title[locale]}</span>
        <small className="muted">{ctx.checked.has(e.id) ? (capped ? c.labMark.got : c.labMark.done) : c.labMark.todo}</small>
        {capped && ctx.checked.has(e.id) && (
          <small className="career-capped">
            {c.evidenceCapped} {c.evidenceCappedWhy(c.levels[e.level - 1])}
          </small>
        )}
        {!ctx.checked.has(e.id) && LAB_EVIDENCE_LINK[e.id] && (
          <a className="btn secondary career-step-link" href={LAB_EVIDENCE_LINK[e.id]} target="_blank" rel="noreferrer" onClick={(ev) => openFamilyLink(ev.currentTarget, ev.nativeEvent, 'lab')}>
            {c.labMark.open} ↗
          </a>
        )}
      </li>
    );
  }
  if (e.source === 'quiz') {
    const status = quizStatus(ctx.quiz, e.axis, new Date());
    return (
      <li className="career-quiz-row">
        <span>{e.title[locale]}</span>
        {quizText(ctx.quiz, e.axis, new Date()).map((line) => (
          <small key={line} className="muted">
            {line}
          </small>
        ))}
        {!status.passed && quizBank(e.axis).length > 0 && (
          <button type="button" className="btn secondary" disabled={!status.canStart} onClick={() => ctx.openQuiz(e.axis)}>
            {c.quiz.start}
          </button>
        )}
      </li>
    );
  }
  return (
    <li>
      <label>
        <input type="checkbox" checked={ctx.checked.has(e.id)} onChange={() => ctx.toggleEvidence(e.id)} />
        <span>
          {e.title[locale]}
          {capped && (
            <small className="career-capped">
              {' '}
              {c.evidenceCapped} {c.evidenceCappedWhy(c.levels[e.level - 1])}
            </small>
          )}
        </span>
      </label>
    </li>
  );
}

/** Все отметки оси списком; упёршиеся в потолок помечены причиной. */
export function EvidenceList({ axis, reading, ctx }: { axis: AxisId; reading: AxisReading; ctx: StepCtx }) {
  const items = careerEvidence.filter((e) => e.axis === axis);
  if (!items.length) return null;
  return (
    <ul className="career-evidence">
      {items.map((e) => (
        <EvidenceRow key={e.id} id={e.id} ctx={ctx} capped={reading.evidenceCapped.includes(e.id)} />
      ))}
    </ul>
  );
}

/** Один шаг: строка текста и то, что по нему можно нажать. */
export function StepItem({ step, axis, ctx }: { step: AxisStep; axis: AxisId; ctx: StepCtx }) {
  const { t, locale } = useI18n();
  const c = t.career;
  const text = step.text[locale];
  switch (step.kind) {
    case 'skills':
      return (
        <li className="career-step">
          <p>{text}</p>
          <div className="career-gap-actions">
            {(step.skills ?? []).slice(0, 3).map((id, i) => (
              <button key={id} type="button" className={i === 0 ? 'btn career-skill-btn' : 'btn secondary career-skill-btn'} onClick={() => ctx.onStartSkill(id)}>
                {c.practice(ctx.skillTitle(id))}
              </button>
            ))}
          </div>
        </li>
      );
    case 'tasks':
      return (
        <li className="career-step">
          <p>{text}</p>
          <a className="btn secondary career-step-link" href={`?task=${(step.tasks ?? []).join(',')}`}>
            {c.rp.kindTasks}
          </a>
        </li>
      );
    case 'app': {
      const app = FAMILY.find((f) => f.key === step.app);
      return (
        <li className="career-step">
          <p>{text}</p>
          {step.href && (
            <a
              className="btn secondary career-step-link"
              href={step.href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => app && openFamilyLink(e.currentTarget, e.nativeEvent, app.key)}
            >
              {c.rp.kindApp}: {app ? { model: t.nav.familyModel, flow: t.nav.familyFlow, pandas: t.nav.familyPandas, lab: t.nav.familyLab }[app.key as 'model' | 'flow' | 'pandas' | 'lab'] : ''} ↗
            </a>
          )}
        </li>
      );
    }
    case 'story':
      return (
        <li className="career-step">
          <p>{text}</p>
          {ctx.onOpenStory && (
            <button type="button" className="btn secondary career-step-link" onClick={ctx.onOpenStory}>
              {c.rp.kindStory}
            </button>
          )}
        </li>
      );
    case 'quiz': {
      const status = quizStatus(ctx.quiz, axis, new Date());
      return (
        <li className="career-step">
          <p>{text}</p>
          {!status.passed && quizBank(axis).length > 0 && (
            <button type="button" className="btn secondary career-step-link" disabled={!status.canStart} onClick={() => ctx.openQuiz(axis)}>
              {c.rp.kindQuiz}
            </button>
          )}
          {status.passed && <small className="muted">{c.quiz.statusDone}</small>}
        </li>
      );
    }
    case 'evidence':
      return (
        <li className="career-step">
          <p>{text}</p>
          {step.evidence && (
            <ul className="career-evidence">
              <EvidenceRow id={step.evidence} ctx={ctx} />
            </ul>
          )}
        </li>
      );
    default:
      return (
        <li className="career-step">
          <p>{text}</p>
        </li>
      );
  }
}

export function StepList({ steps, axis, ctx }: { steps: AxisStep[]; axis: AxisId; ctx: StepCtx }) {
  return (
    <ul className="career-steps">
      {steps.map((s, i) => (
        <StepItem key={i} step={s} axis={axis} ctx={ctx} />
      ))}
    </ul>
  );
}

/** Строка «засчитывается»: считается из формулы, а не хранится, чтобы числа не разошлись с ней. */
export function useCountedLine() {
  const { t, locale } = useI18n();
  const r = t.career.rp;
  return (axis: AxisId, level: 1 | 2 | 3): string => {
    const def = careerAxis(axis);
    const total = def.skills.length;
    const need = Math.ceil(total * AXIS_SHARE);
    const parts: string[] = [];
    if (level <= def.trainerMax) parts.push(level === 1 ? r.trainerSolved(need, total) : r.trainerSure(need, total));
    else parts.push(r.trainerNo);
    const marks = careerEvidence.filter((e) => e.axis === axis && e.level === level).map((e) => e.title[locale]);
    if (marks.length) parts.push(r.marksOnly(marks.join('; ')));
    else if (level > def.trainerMax) parts.push(r.needMark);
    return parts.join('; ');
  };
}
