import { useState } from 'react';
import { useI18n } from '../i18n/context';
import type { StoryMission } from '../content/storymode';
import type { Progress } from '../srs/store';
import { isDue } from '../srs/scheduler';
import { pushState, type PushState } from '../push/client';
import type { StoryStepView } from './StoryMode';

/**
 * Итог недели — экран между суждением пятницы и крючком в следующее дело.
 *
 * Зачем. Суждение закрывает дело, но ничего не говорит о самом человеке:
 * неделя кончалась тем же «дальше», что и вторник. Здесь четыре вещи, сверху
 * вниз: что выяснено (дело), что теперь умеете и когда это вернётся (память),
 * как шла неделя и где было трудно (усилие), когда дальше (одна дата).
 * По quaera-product-ux это разрыв привычки и мотивации, а не знания:
 * прогресс, который видно, и названная финишная черта.
 *
 * **Чего здесь нет намеренно:** очков, уровней, процента верных (он штрафует
 * подсказку, которую мы же предлагаем), серии дней как главной цифры (обрыв
 * серии наказывает ровно того, кого ждём обратно), времени в приложении.
 *
 * **Всё считается из прогресса на момент показа, а не запоминается.** Экран
 * открывается и позже — через дверь в закрытое дело на понедельнике
 * следующей недели, — и тогда состояния приёмов уже другие: что вернулось
 * в повторение и выдержало его, со временем начинает «держаться». Это и есть
 * повод заглянуть сюда ещё раз.
 */

/** Интервал, с которого приём «держится»: неделю без повторения. */
const HOLDS_DAYS = 7;
/**
 * Интервал, с которого приём «закреплён»: три недели без повторения.
 *
 * Только в итоге кампании: там между первой неделей и последней проходит
 * достаточно повторений, чтобы «держится» перестало различать приём,
 * который вернулся вчера, от того, что не падал месяц. В итоге одной
 * недели порог не достижим ни разу — интервалы такими короткими не бывают.
 */
const ANCHORED_DAYS = 21;

export interface WeekDay {
  mission: StoryMission;
  steps: StoryStepView[];
}

type SkillLine = { id: string; title: string; state: 'due' | 'anchored' | 'holds' | 'back'; dueAt: string };
type HardLine = { id: string; title: string; how: 'shown' | 'attempts'; attempt: number };

export interface WeekSummary {
  found: string[];
  skills: SkillLine[];
  tally: { total: number; clean: number; helped: number; shown: number };
  hard: HardLine[];
  /** Сколько приёмов недели пора повторить уже сегодня. */
  dueToday: number;
  /** Ближайший будущий срок среди приёмов недели и сколько их придёт в тот день. */
  next: { at: Date; count: number } | null;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * Сводка недели — чистая функция от дней недели и прогресса.
 *
 * «Трудным» считается задание, сданное через разбор или не с первой попытки,
 * и только оно: про такие экран обещает «вернутся раньше», а планировщик это
 * обещание держит — провал возвращает приём в тот же день, вторая попытка
 * даёт интервал в день против двух. Задание с подсказками в список не идёт:
 * первый интервал у него тот же, что у чистого, и «раньше» было бы неправдой.
 * Подсказка видна в счёте недели — там, где ей и место.
 */
export function weekSummary(days: WeekDay[], progress: Progress, now: Date): WeekSummary {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const titles = new Map<string, string>();
  const tasks: { id: string; title: string }[] = [];
  for (const day of days) {
    for (const step of day.steps) {
      if (!titles.has(step.task.skill)) titles.set(step.task.skill, step.skillTitle);
      tasks.push({ id: step.task.id, title: step.task.title });
    }
  }

  const skills: SkillLine[] = [];
  for (const [id, title] of titles) {
    const st = progress.skills[id];
    if (!st || st.reps === 0) continue;
    const state = isDue(st, endOfToday)
      ? 'due'
      : st.intervalDays >= ANCHORED_DAYS
        ? 'anchored'
        : st.intervalDays >= HOLDS_DAYS
          ? 'holds'
          : 'back';
    skills.push({ id, title, state, dueAt: st.dueAt });
  }

  const tally = { total: 0, clean: 0, helped: 0, shown: 0 };
  const hard: HardLine[] = [];
  for (const task of tasks) {
    const r = progress.taskRecords[task.id];
    if (!r) continue;
    tally.total += 1;
    if (!r.solved) {
      tally.shown += 1;
      hard.push({ ...task, how: 'shown', attempt: 0 });
    } else if (r.wrongAttempts > 0) {
      tally.helped += 1;
      hard.push({ ...task, how: 'attempts', attempt: r.wrongAttempts + 1 });
    } else if (r.hintsUsed > 0) {
      tally.helped += 1;
    } else {
      tally.clean += 1;
    }
  }

  const ahead = skills
    .filter((s) => s.state !== 'due')
    .map((s) => new Date(s.dueAt))
    .sort((a, b) => a.getTime() - b.getTime());
  const first = ahead[0];
  const next = first ? { at: first, count: ahead.filter((d) => dayKey(d) === dayKey(first)).length } : null;

  return {
    found: days.map((d) => d.mission.found),
    skills,
    tally,
    hard,
    dueToday: skills.filter((s) => s.state === 'due').length,
    next,
  };
}

export function StoryWeekSummary({
  days,
  progress,
  onEnablePush,
  campaign = false,
}: {
  days: WeekDay[];
  progress: Progress;
  onEnablePush: () => Promise<PushState>;
  /**
   * Итог кампании, а не одной недели: заголовок называет кампанию,
   * а папка дела на 25 находках сворачивается тем же приёмом, что и на
   * брифе (StoryMode.tsx, `found.length >= 3`) — без этого список из
   * четырёх-пяти строк на неделю превращается в стену текста.
   */
  campaign?: boolean;
}) {
  const { t, locale } = useI18n();
  const [now] = useState(() => new Date());
  const [push, setPush] = useState<PushState>(() => pushState());
  const [asked, setAsked] = useState(false);
  const s = weekSummary(days, progress, now);

  const tag = locale === 'en' ? 'en-GB' : 'ru-RU';
  const shortDate = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short' });
  const longDate = new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long' });

  async function remind() {
    setAsked(true);
    const result = await onEnablePush();
    setPush(result);
    // Окно разрешения закрыли, не ответив: кнопка возвращается.
    if (result === 'default') setAsked(false);
  }

  const foundList = (
    <ul>
      {s.found.map((f, i) => (
        <li key={i}>{f}</li>
      ))}
    </ul>
  );

  return (
    <>
      <h2>{campaign ? t.storyMode.summaryTitleCampaign : t.storyMode.summaryTitle}</h2>

      {/* Та же папка дела, что на брифе, — теперь полная. */}
      {campaign && s.found.length >= 3 ? (
        <details className="story-known">
          <summary className="story-known-title">
            {t.storyMode.summaryFound}
            <small>{t.storyMode.knownCount(s.found.length)}</small>
          </summary>
          {foundList}
        </details>
      ) : (
        <div className="story-known">
          <p className="story-known-title">{t.storyMode.summaryFound}</p>
          {foundList}
        </div>
      )}

      {s.skills.length > 0 && (
        <>
          <h3 className="story-summary-h">{t.storyMode.summarySkills}</h3>
          <ul className="story-summary-list">
            {s.skills.map((k) => (
              <li key={k.id}>
                <span>{k.title}</span>
                <span className={`story-summary-note${k.state === 'due' ? ' is-due' : ''}`}>
                  {k.state === 'due'
                    ? t.storyMode.skillDue
                    : k.state === 'anchored'
                      ? t.storyMode.skillAnchored
                      : k.state === 'holds'
                        ? t.storyMode.skillHolds
                        : t.storyMode.skillBack(shortDate.format(new Date(k.dueAt)))}
                </span>
              </li>
            ))}
          </ul>
          <p className="story-mode-para">{t.storyMode.summarySkillsNote}</p>
        </>
      )}

      {s.tally.total > 0 && (
        <>
          <h3 className="story-summary-h">{t.storyMode.summaryWeek}</h3>
          <p className="story-mode-para">
            {t.storyMode.summaryTally(s.tally.total, s.tally.clean, s.tally.helped, s.tally.shown)}
          </p>
          {s.hard.length > 0 ? (
            <>
              <p className="story-mode-para">{t.storyMode.hardLead}</p>
              <ul className="story-summary-list">
                {s.hard.map((h) => (
                  <li key={h.id}>
                    <span>{h.title}</span>
                    <span className="story-summary-note">
                      {h.how === 'shown' ? t.storyMode.hardShown : t.storyMode.hardAttempt(h.attempt)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="story-mode-para">{t.storyMode.noneHard}</p>
          )}
        </>
      )}

      <h3 className="story-summary-h">{t.storyMode.summaryNext}</h3>
      {s.dueToday > 0 ? (
        <p className="story-mode-para">{t.storyMode.nextDueToday(s.dueToday)}</p>
      ) : (
        s.next && <p className="story-mode-para">{t.storyMode.nextDue(longDate.format(s.next.at), s.next.count)}</p>
      )}
      <p className="story-mode-para">{t.storyMode.nextWhere}</p>
      {/*
        * Спрашивать разрешение можно только по нажатию и только там, где
        * человек понимает, о чём речь (см. enablePush). Здесь понимает:
        * строкой выше названа дата, о которой и напомнят.
        */}
      {push === 'default' && !asked && (
        <button type="button" className="btn secondary" onClick={remind}>
          {t.storyMode.remindBtn}
        </button>
      )}
      {asked && push === 'granted' && <p className="story-mode-para">{t.account.pushOn}</p>}
      {asked && push === 'denied' && <p className="story-mode-para">{t.account.pushDenied}</p>}
    </>
  );
}
