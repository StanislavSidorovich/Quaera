import { useMemo, useRef, useState } from 'react';
import { quizBank } from '../content/careerQuiz';
import type { QuizOption, QuizQuestion } from '../content/careerQuiz';
import { careerAxes } from '../content/career';
import { useI18n } from '../i18n/context';
import type { AxisId } from '../career/readiness';
import { QUIZ_GAP_DAYS, QUIZ_PASS, QUIZ_SIZE, attemptScore, drawQuiz, isPassingAttempt, quizStatus, shuffled } from '../career/quiz';
import type { QuizAttempt } from '../career/quiz';

/** Подпись состояния самопроверки по оси: общая для строки на экране пути и для итога подхода. */
export function useQuizStatusText() {
  const { t, locale } = useI18n();
  const q = t.career.quiz;
  const intl = locale === 'ru' ? 'ru-RU' : 'en-GB';
  const day = (d: Date) => d.toLocaleDateString(intl, { day: 'numeric', month: 'long' });
  return (attempts: QuizAttempt[], axis: AxisId, now: Date): string[] => {
    const s = quizStatus(attempts, axis, now);
    const lines: string[] = [];
    if (s.passed) lines.push(q.statusDone);
    else if (s.passes === 1 && s.secondFrom) {
      lines.push(s.secondFrom.getTime() > now.getTime() ? q.statusOne(day(s.secondFrom)) : q.statusOneReady);
    } else lines.push(attempts.some((a) => a.axis === axis) ? q.statusOpen : q.statusNone);
    if (!s.passed && s.nextAt) lines.push(q.statusToday(day(s.nextAt)));
    return lines;
  };
}

/**
 * Один подход самопроверки. Вопросы берёт `drawQuiz` (ошибки прошлого раза,
 * потом новые, потом давние), варианты перемешиваются здесь: в банке верный
 * стоит первым. Ответ после показа разбора не меняется, подход записывается
 * сразу после последнего ответа, чтобы закрытая вкладка его не потеряла.
 */
export function CareerQuiz({
  axis,
  attempts,
  onFinish,
  onClose,
}: {
  axis: AxisId;
  /** Подходы на момент входа: по ним отбираются вопросы и считается итоговый статус. */
  attempts: QuizAttempt[];
  onFinish: (attempt: QuizAttempt) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const c = t.career;
  const q = c.quiz;
  const statusText = useQuizStatusText();

  const items = useMemo(() => {
    const bank = quizBank(axis);
    const byId = new Map(bank.map((x) => [x.id, x]));
    const ids = drawQuiz(
      bank.map((x) => x.id),
      attempts,
      axis,
      Math.random
    );
    return ids.map((id) => {
      const question = byId.get(id) as QuizQuestion;
      return { question, options: shuffled<QuizOption>(question.options, Math.random) };
    });
    // Подход выбирается один раз при входе; новые подходы его не перетасовывают.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [result, setResult] = useState<QuizAttempt | null>(null);
  const finished = useRef(false);

  const axisName = careerAxes.find((a) => a.id === axis)!.title[locale];
  const total = items.length;
  const current = items[index];

  const answer = (i: number) => {
    if (picked !== null || finished.current) return;
    const isRight = current.options[i].correct;
    const nextWrong = isRight ? wrong : [...wrong, current.question.id];
    setPicked(i);
    setWrong(nextWrong);
    if (index === total - 1) {
      finished.current = true;
      const attempt: QuizAttempt = {
        axis,
        at: new Date().toISOString(),
        asked: items.map((x) => x.question.id),
        wrong: nextWrong,
      };
      onFinish(attempt);
      setResult(attempt);
    }
  };

  const next = () => {
    setIndex(index + 1);
    setPicked(null);
  };

  if (total === 0) {
    return (
      <section className="card">
        <p className="muted">{q.empty}</p>
        <button type="button" className="btn secondary" onClick={onClose}>
          {q.back}
        </button>
      </section>
    );
  }

  /* Итог показывается под последним разбором, а не вместо него: разбор последнего вопроса тоже надо прочитать. */
  const passed = result ? isPassingAttempt(result) : false;

  return (
    <div className="career-quiz">
      <section className="card">
        <h2>{q.title(axisName)}</h2>
        <p className="muted">{q.rules(QUIZ_SIZE, QUIZ_PASS, QUIZ_GAP_DAYS)}</p>
        <p className="career-quiz-progress muted" aria-live="polite">
          {q.progress(index + 1, total)}
        </p>
        <p className="career-quiz-q">{current.question.q[locale]}</p>
        <div role="group" aria-label={q.optionsAria}>
          {current.options.map((o, i) => {
            const state = picked === null ? undefined : o.correct ? 'correct' : picked === i ? 'wrong' : undefined;
            return (
              <button
                key={`${current.question.id}-${i}`}
                type="button"
                className="option"
                data-state={state}
                onClick={() => answer(i)}
                aria-disabled={picked !== null}
              >
                {state && <strong className="career-quiz-tag">{state === 'correct' ? q.tagCorrect : q.tagWrong}</strong>}
                {o.text[locale]}
                {picked !== null && <span className="why">{o.why[locale]}</span>}
              </button>
            );
          })}
        </div>
        {picked !== null && index < total - 1 && (
          <button type="button" className="btn" onClick={next}>
            {q.next}
          </button>
        )}
      </section>

      {result && (
        <section className="card career-quiz-result">
          <h2>{passed ? q.resultPassed : q.resultFailed}</h2>
          <p>{q.score(attemptScore(result), result.asked.length)}</p>
          {statusText([...attempts, result], axis, new Date()).map((line) => (
            <p key={line} className="muted">
              {line}
            </p>
          ))}
          <button type="button" className="btn" onClick={onClose}>
            {q.back}
          </button>
        </section>
      )}
    </div>
  );
}
