import { useRef, type ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import type { Task } from '../content/types';
import type { Executor, SchemaDoc } from '../engine/types';
import { CODE_FENCE, isFencedCode, unfenceCode } from '../content/proseCode';
import { annotateSequence } from './GlossaryText';
import { StoryArt } from './StoryArt';
import { TaskView, type TaskDraftStore, type TaskOutcome } from './TaskView';
import {
  storyClosesCampaign,
  storyClosesWeek,
  storyWeekOf,
  type StoryCampaign,
  type StoryMission,
} from '../content/storymode';
import type { Progress } from '../srs/store';
import type { PushState } from '../push/client';
import { StoryProgress } from './StoryProgress';
import { StoryWeekSummary, type WeekDay } from './StoryWeekSummary';

/**
 * Экран режима истории — нарративная оболочка вокруг нескольких существующих
 * заданий. В отличие от StoryLine (карта выведенных из графа миссий), здесь
 * миссия рукописная, а её ход — маленькая машина фаз, которую крутит этот
 * экран. Задания крутит тот же TaskView, что и обычное занятие: движок,
 * проверка эталоном, подсказки — всё настоящее.
 *
 * Один день миссии выглядит так:
 *   бриф (кто и зачем спрашивает)
 *   → [разговор между делом → подводка → задание] столько раз, сколько
 *     заданий в дне
 *   → суждение (это уже ответ заказчику? ещё нет)
 *   → [итог недели — только у дня, который неделю закрывает]
 *   → крючок (что осталось и куда ведёт сюжет).
 *
 * Разговор между делом есть у одного шага на неделю (см. StoryStep.interlude),
 * подводка — у большинства; экран, которому нечего показать, просто не
 * появляется.
 *
 * **Почему фаза — объект, а не строка.** Раньше день держал ровно одно
 * задание, и пяти имён хватало. Как только в дне их стало три, фаза обязана
 * называть ещё и номер шага: «задание» без номера не отличает первое задание
 * понедельника от третьего, а стрелке «назад» надо попадать ровно на тот
 * экран, откуда пришли. Порядок фаз при этом по-прежнему существует в одном
 * месте — storyPhases(), — и оба движения выводятся из него.
 *
 * Своего хранилища нет: решения уходят в прогресс через onTaskDone (тот же
 * путь, что handleDone у занятия), а фаза живёт в `screen` приложения.
 */
export type StoryPhase =
  | { kind: 'brief' }
  | { kind: 'interlude'; step: number }
  | { kind: 'intro'; step: number }
  | { kind: 'task'; step: number }
  | { kind: 'reflection' }
  | { kind: 'summary' }
  | { kind: 'hook' };

/**
 * Порядок экранов дня — единственный источник правды о ходе миссии.
 * Из него растут и «дальше», и «назад»; разъехаться им негде, потому что
 * оба считают индекс в этом же списке.
 *
 * Подводка появляется только у тех шагов, где она написана: задание, которому
 * нечего предпослать, идёт сразу за предыдущим. Пустой экран ради симметрии
 * читался бы как заминка.
 *
 * Итог недели стоит после суждения и перед крючком: суждение закрывает дело,
 * итог — неделю самого человека, а крючок уводит в новое дело. Поставь итог
 * после крючка — и он читался бы приложением к уже сказанному «до понедельника».
 */
export function storyPhases(campaign: StoryCampaign, mission: StoryMission): StoryPhase[] {
  const phases: StoryPhase[] = [{ kind: 'brief' }];
  mission.steps.forEach((step, i) => {
    if (step.interlude) phases.push({ kind: 'interlude', step: i });
    if (step.intro) phases.push({ kind: 'intro', step: i });
    phases.push({ kind: 'task', step: i });
  });
  phases.push({ kind: 'reflection' });
  if (storyClosesWeek(campaign, mission.id)) phases.push({ kind: 'summary' });
  phases.push({ kind: 'hook' });
  return phases;
}

/**
 * Совпадают ли два экрана дня — та же фаза и тот же шаг у фаз с шагом.
 *
 * Экспортирована ради восстановления сохранённого экрана (см. StoredScreen
 * и initialBoot в App.tsx): там нужно проверить, что фаза, лежащая
 * в хранилище, всё ещё существует в текущем ходе дня, а не завести
 * второе определение того же сравнения.
 */
export function samePhase(a: StoryPhase, b: StoryPhase): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'intro' || a.kind === 'task' || a.kind === 'interlude') {
    return a.step === (b as { step: number }).step;
  }
  return true;
}

function phaseAt(campaign: StoryCampaign, mission: StoryMission, phase: StoryPhase, delta: number): StoryPhase | null {
  const phases = storyPhases(campaign, mission);
  const i = phases.findIndex((p) => samePhase(p, phase));
  if (i < 0) return null;
  return phases[i + delta] ?? null;
}

/**
 * Предыдущий экран дня, либо null на первом.
 *
 * Нужна шапке: до этой правки стрелка «назад» из любой точки миссии
 * выбрасывала на главную, то есть теряла весь день ради того, чтобы
 * перечитать предыдущий экран. Вопрос «а что там было в брифе?» возникает
 * ровно посреди задания — та же причина, по которой с задачи занятия
 * «назад» ведёт на карточку приёма, а не наружу.
 *
 * Возврат на решённое задание намеренно разрешён: попытка уже записана
 * (см. `recorded` ниже), решение лежит в черновиках, и перечитать свой
 * запрос — законное желание. Второй записи это не заводит.
 */
export function storyPhaseBefore(campaign: StoryCampaign, mission: StoryMission, phase: StoryPhase): StoryPhase | null {
  return phaseAt(campaign, mission, phase, -1);
}

/** Следующий экран дня, либо null на крючке (дальше уже переход между днями). */
export function storyPhaseAfter(campaign: StoryCampaign, mission: StoryMission, phase: StoryPhase): StoryPhase | null {
  return phaseAt(campaign, mission, phase, 1);
}

/** Задание дня вместе с названием приёма — разрешается в App по паку активного трека. */
export interface StoryStepView {
  task: Task;
  skillTitle: string;
}

/**
 * Строки прозы текущей фазы, в порядке показа, — вход для глоссария
 * (см. annotateSequence в GlossaryText.tsx). Заголовок подводки (intro.title)
 * в список не входит: он короткая шапка, а не проза, и включать его значило
 * бы городить смещение индекса на единицу между этим списком и intro.paras
 * ради термина, которому в заголовке взяться неоткуда.
 *
 * Фаза `task` даёт ровно два элемента — `task.brief`, `task.goal`,
 * в этом порядке — их и подставляет вызывающий код обратно в TaskView
 * (glossaryBrief/glossaryGoal). Порядок жёстко завязан на этот вызов —
 * менять его здесь и не поменять там значит подменить одну прозу другой.
 */
function phaseGlossaryTexts(phase: StoryPhase, mission: StoryMission, steps: StoryStepView[]): string[] {
  if (phase.kind === 'brief') return mission.messages.map((m) => m.text);
  if (phase.kind === 'interlude') {
    const interlude = mission.steps[phase.step]?.interlude;
    return interlude ? interlude.messages.map((m) => m.text) : [];
  }
  if (phase.kind === 'intro') return mission.steps[phase.step]?.intro?.paras ?? [];
  if (phase.kind === 'task') {
    const task = steps[phase.step]?.task;
    return task ? [task.brief, task.goal] : [];
  }
  if (phase.kind === 'reflection') return mission.reflection;
  if (phase.kind === 'hook') return mission.hook;
  return [];
}

/**
 * Режет размеченный глоссарием абзац на блоки по пустой строке. Работает
 * по кускам разметки, а не по исходной строке: индекс абзаца в
 * glossaryRendered остаётся тем же, что у intro.paras, и «первое за день»
 * посчитано по абзацу целиком. `\n\n` через границу двух кусков не
 * проходит — между кусками всегда стоит термин, а в нём переводов строк нет.
 */
function splitParaBlocks(pieces: ReactNode[]): ReactNode[][] {
  const blocks: ReactNode[][] = [[]];
  for (const piece of pieces) {
    if (typeof piece !== 'string') {
      blocks[blocks.length - 1].push(piece);
      continue;
    }
    piece.split('\n\n').forEach((part, j) => {
      if (j > 0) blocks.push([]);
      if (part) blocks[blocks.length - 1].push(part);
    });
  }
  return blocks;
}

/**
 * Абзац подводки. Без примера кода — один <p>, как был: pre-wrap держит
 * пустые строки внутри прозы сам. С примером — проза отдельными <p>,
 * а код моноширинным .sql-block (src/content/proseCode.ts): в
 * пропорциональном шрифте с переносом по словам пример читался как ещё
 * одна фраза. Внутри кода глоссарий ничего не размечает, поэтому блок
 * кода — всегда чистая строка.
 */
function StoryPara({ text, pieces }: { text: string; pieces: ReactNode[] | undefined }) {
  if (!text.includes(CODE_FENCE)) return <p className="story-mode-para">{pieces ?? text}</p>;
  return (
    <>
      {splitParaBlocks(pieces ?? [text]).map((block, j) => {
        const plain = block.every((x) => typeof x === 'string') ? block.join('') : null;
        return plain !== null && isFencedCode(plain) ? (
          <pre className="sql-block story-mode-code" key={j}>
            {unfenceCode(plain)}
          </pre>
        ) : (
          <p className="story-mode-para" key={j}>
            {block}
          </p>
        );
      })}
    </>
  );
}

export function StoryMode({
  campaign,
  mission,
  steps,
  executor,
  schema,
  drafts,
  phase,
  onPhase,
  onTaskDone,
  onOpenSchema,
  onNext,
  openDayIds,
  onOpenDay,
  onExit,
  runtimeConsent,
  consentDeferred,
  onConfirmDownload,
  onDeferConsent,
  onResumeConsent,
  lesson,
  onOpenLesson,
  onCloseLesson,
  summaryDays,
  progress,
  onEnablePush,
}: {
  /** Вся кампания — полосе дела нужны вопрос расследования и все дни разом. */
  campaign: StoryCampaign;
  mission: StoryMission;
  /** Задания дня по порядку mission.steps — уже найденные в паке. */
  steps: StoryStepView[];
  executor: Executor;
  schema: SchemaDoc | null;
  drafts: TaskDraftStore;
  /** Текущий экран — живёт в `screen` приложения, чтобы шапка умела шаг назад. */
  phase: StoryPhase;
  onPhase: (next: StoryPhase) => void;
  /** Записывает попытку в прогресс — та же запись, что у обычного занятия. */
  onTaskDone: (task: Task, outcome: TaskOutcome) => void;
  onOpenSchema: (table?: string) => void;
  /**
   * Перейти к следующей миссии кампании, либо null — если эта последняя.
   * Признак приходит снаружи, а не считается здесь: порядок дней знает
   * кампания, а экран знает только свой.
   */
  onNext: (() => void) | null;
  /** id дней, куда разрешён возврат, — см. storyOpenDayIds в App. */
  openDayIds: Set<string>;
  /** Открыть день кампании — с брифа, если экран не назван. */
  onOpenDay: (missionId: string, phase?: StoryPhase) => void;
  /**
   * Размер закачки движка, если исполнитель дня её ещё ждёт, иначе null.
   *
   * Появилось вместе с четвёртой неделей — первой, идущей по треку python.
   * Без этого день упирался в тупик, который не видно ни одним гейтом:
   * Pyodide не начинает качаться без явного согласия, спросить согласие
   * в кампании было негде, и «Проверить» молча крутил многоточие до конца
   * времён. Карточка стоит на брифе, а не над заданием, и это не косметика:
   * бриф человек читает минуту-две, и за это время 53 МБ успевают приехать
   * к тому моменту, когда они впервые нужны.
   */
  runtimeConsent: number | null;
  consentDeferred: boolean;
  onConfirmDownload: () => void;
  onDeferConsent: () => void;
  onResumeConsent: () => void;
  /** Выйти из миссии (на главную). */
  onExit: () => void;
  /**
   * Карточка приёма текущего задания, если её открыли с плашки, — уже
   * собранная в App: исполнитель и признак «запускается ли пример» считаются
   * там по треку навыка, тем же кодом, что у карточки из справочника.
   */
  lesson: ReactNode | null;
  /** Открыть карточку приёма задания; нет — если у навыка карточки нет. */
  onOpenLesson?: () => void;
  /** Закрыть карточку и вернуться в то же задание. */
  onCloseLesson: () => void;
  /** Дни недели этого дня с их заданиями — итогу недели нужна вся неделя. */
  summaryDays: WeekDay[];
  /** Прогресс — итог недели считает состояния приёмов на момент показа. */
  progress: Progress;
  /** Включить напоминания — кнопка в итоге недели, рядом с датой повторения. */
  onEnablePush: () => Promise<PushState>;
}) {
  const { t, locale } = useI18n();

  /*
   * Термины глоссария, уже показанные сегодня, — состояние на весь день
   * (см. GlossaryText.tsx), а не на фазу: StoryMode перемонтируется целиком
   * на смену дня (key={mission.id} в App.tsx), значит пустое множество здесь
   * и есть «новый день», без отдельного сброса.
   *
   * Умышленно НЕ React state с коммитом эффектом — на этом ровно один раз
   * уже ловилась самосхлопывающаяся петля: эффект дописывает термины фазы
   * в состояние сразу после первого рендера, вызывает повторный рендер той
   * же фазы, и та же самая разметка на этом повторном рендере видит свои
   * же только что показанные термины уже «показанными» — подчёркивание
   * гасло в момент коммита, раньше, чем человек успевал его увидеть.
   *
   * Вместо этого — две ref: `committedRef` держит термины, показанные
   * строго ДО текущей фазы (не мутируется, пока фаза не сменится, поэтому
   * разметка текущей фазы стабильна на любом числе повторных рендеров,
   * включая двойной вызов под React StrictMode), `pendingRef` — то, что
   * показала САМА текущая фаза, и коммитится в `committedRef` только
   * в момент смены фазы на другую — то есть уже после того, как человек
   * фазу прочитал.
   */
  const committedRef = useRef<Set<string>>(new Set());
  const phaseKeyRef = useRef<string | null>(null);
  const pendingRef = useRef<string[]>([]);
  const phaseKey =
    phase.kind === 'intro' || phase.kind === 'task' || phase.kind === 'interlude'
      ? `${phase.kind}:${phase.step}`
      : phase.kind;
  if (phaseKeyRef.current !== phaseKey) {
    pendingRef.current.forEach((id) => committedRef.current.add(id));
    pendingRef.current = [];
    phaseKeyRef.current = phaseKey;
  }
  const { rendered: glossaryRendered, newlyShown: glossaryNewlyShown } = annotateSequence(
    phaseGlossaryTexts(phase, mission, steps),
    committedRef.current,
    locale
  );
  pendingRef.current = glossaryNewlyShown;

  /*
   * Записанные попытки — множеством, а не флагом: в дне несколько заданий,
   * и «уже зачёл» относится к конкретному, а не ко дню целиком. Ref защищает
   * от второй записи, если человек вернулся стрелкой на решённое задание
   * и прошёл его снова.
   */
  const recorded = useRef(new Set<string>());

  const after = storyPhaseAfter(campaign, mission, phase);

  function goNext() {
    if (after) onPhase(after);
  }

  function handleTaskDone(task: Task, outcome: TaskOutcome) {
    if (!recorded.current.has(task.id)) {
      recorded.current.add(task.id);
      onTaskDone(task, outcome);
    }
    goNext();
  }

  if (phase.kind === 'task') {
    const step = steps[phase.step];
    if (!step) return null;
    /*
     * Карточка приёма поверх задания, а не отдельным экраном: полоса дня
     * остаётся, фаза не меняется, и возврат попадает ровно в то задание,
     * откуда ушли. До этого плашка приёма в кампании была мёртвой, а уйти
     * к карточке через справочник значило потерять ход дня целиком.
     */
    if (lesson) {
      return (
        <>
          <StoryProgress
            campaign={campaign}
            mission={mission}
            phase={phase}
            openDayIds={openDayIds}
            onOpenDay={onOpenDay}
          />
          {lesson}
          <button type="button" className="btn" onClick={onCloseLesson}>
            {t.storyMode.backToTask}
          </button>
        </>
      );
    }
    return (
      <>
        <StoryProgress
          campaign={campaign}
          mission={mission}
          phase={phase}
          openDayIds={openDayIds}
          onOpenDay={onOpenDay}
        />
        {runtimeConsent !== null && (
          <div className="card">
            <p className="story-known-title">{t.consent.title}</p>
            <p className="story-mode-text">{t.consent.body(Math.round(runtimeConsent / 1e6))}</p>
            <button type="button" className="btn" onClick={onConfirmDownload}>
              {t.consent.confirmBtn}
            </button>
          </div>
        )}
        <TaskView
          key={step.task.id}
          task={step.task}
          executor={executor}
          schema={schema}
          drafts={drafts}
          skillTitle={step.skillTitle}
          onOpenLesson={onOpenLesson}
          onOpenSchema={onOpenSchema}
          afterNote={mission.steps[phase.step]?.after}
          onDone={(outcome) => handleTaskDone(step.task, outcome)}
          glossaryBrief={glossaryRendered[0]}
          glossaryGoal={glossaryRendered[1]}
        />
      </>
    );
  }

  /*
   * Подпись кнопки выводится из того, что будет дальше, а не из того, где мы
   * сейчас: «Взяться за задачу» перед заданием и «Дальше» перед разговором.
   * Иначе подпись пришлось бы держать в каждой ветке отдельно и следить,
   * чтобы она не разъехалась с порядком фаз.
   */
  const nextLabel = after?.kind === 'task' ? t.storyMode.toTask : t.storyMode.next;

  const intro = phase.kind === 'intro' ? mission.steps[phase.step]?.intro : null;
  const interlude = phase.kind === 'interlude' ? mission.steps[phase.step]?.interlude : null;
  const scene =
    phase.kind === 'brief'
      ? mission.scenes.brief
      : phase.kind === 'reflection'
        ? mission.scenes.reflection
        : phase.kind === 'hook'
          ? mission.scenes.hook
          : phase.kind === 'interlude'
            ? interlude?.scene
            : intro?.scene;

  /*
   * Находки прошлых дней — папка дела, которая растёт. Показывается только
   * на брифе: утро начинается с того, что уже известно, а дальше по дню
   * это был бы шум над каждым экраном.
   */
  const weekDays = storyWeekOf(campaign, mission.id)?.missions ?? campaign.missions;
  /** Следующий день кампании принадлежит другой неделе — значит, крючок ведёт в новое дело. */
  const nextMission = campaign.missions[campaign.missions.findIndex((m) => m.id === mission.id) + 1] ?? null;
  const nextStartsWeek = !!nextMission && nextMission.week !== mission.week;
  const found = weekDays.slice(0, weekDays.findIndex((m) => m.id === mission.id)).map((m) => m.found);

  return (
    <>
      <StoryProgress
          campaign={campaign}
          mission={mission}
          phase={phase}
          openDayIds={openDayIds}
          onOpenDay={onOpenDay}
        />

      <div className="card story-mode">
        {/*
          * Сцене-месту нужен момент дня: календарь отмечает этот день недели,
          * часы показывают время из строки места. Берём их из самой миссии,
          * а не из описания сцены — иначе одно и то же «9:10» жило бы в двух
          * местах и однажды разошлось.
          */}
        {scene && (
          <StoryArt
            scene={scene}
            moment={{
              weekday: weekDays.findIndex((m) => m.id === mission.id),
              time: /\d{1,2}:\d{2}/.exec(mission.place)?.[0],
            }}
          />
        )}

        {phase.kind === 'brief' && (
          <>
            <p className="story-mode-badge">{t.storyMode.badge}</p>
            <p className="story-mode-place">{mission.place}</p>
            {runtimeConsent !== null && !consentDeferred && (
              <div className="story-known">
                <p className="story-known-title">{t.consent.title}</p>
                <p className="story-mode-text">{t.consent.body(Math.round(runtimeConsent / 1e6))}</p>
                <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>{t.consent.note}</p>
                <div className="row">
                  <button type="button" className="btn" onClick={onConfirmDownload}>
                    {t.consent.confirmBtn}
                  </button>
                  <button type="button" className="btn secondary" onClick={onDeferConsent}>
                    {t.consent.laterBtn}
                  </button>
                </div>
              </div>
            )}
            {runtimeConsent !== null && consentDeferred && (
              <div className="story-known">
                <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>{t.consent.deferredNote}</p>
                <button type="button" className="btn secondary" onClick={onResumeConsent}>
                  {t.consent.resumeBtn(Math.round(runtimeConsent / 1e6))}
                </button>
              </div>
            )}
            {found.length > 0 && (
              /*
               * От трёх находок и выше папка дела сама начинала уводить
               * первую реплику брифа за сгиб (замер 764 при окне 812 держался
               * только для недели из одной-двух находок; к среде-четвергу
               * список догоняет и снова выталкивает содержимое вниз).
               * <details> сворачивает её по умолчанию своими силами — код
               * не следит за состоянием, раскрытие целиком в руках браузера.
               */
              found.length >= 3 ? (
                <details className="story-known">
                  <summary className="story-known-title">
                    {t.storyMode.known}
                    <small>{t.storyMode.knownCount(found.length)}</small>
                  </summary>
                  <ul>
                    {found.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </details>
              ) : (
                <div className="story-known">
                  <p className="story-known-title">{t.storyMode.known}</p>
                  <ul>
                    {found.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )
            )}
            <div className="story-mode-thread">
              {mission.messages.map((m, i) => (
                <div className="story-mode-msg" key={i}>
                  <p className="story-mode-from">{m.from}</p>
                  <p className="story-mode-text">{glossaryRendered[i] ?? m.text}</p>
                </div>
              ))}
            </div>
            <button type="button" className="btn" onClick={goNext}>
              {nextLabel}
            </button>
          </>
        )}

        {/*
          * Разговор между делом рисуется той же перепиской, что и бриф:
          * это один и тот же жанр — люди говорят, — и различать их вёрсткой
          * значило бы намекать на разницу, которой нет.
          */}
        {phase.kind === 'interlude' && interlude && (
          <>
            <div className="story-mode-thread">
              {interlude.messages.map((m, i) => (
                <div className="story-mode-msg" key={i}>
                  <p className="story-mode-from">{m.from}</p>
                  <p className="story-mode-text">{glossaryRendered[i] ?? m.text}</p>
                </div>
              ))}
            </div>
            <button type="button" className="btn" onClick={goNext}>
              {nextLabel}
            </button>
          </>
        )}

        {phase.kind === 'intro' && intro && (
          <>
            {intro.title && <h2>{intro.title}</h2>}
            {intro.paras.map((p, i) => (
              <StoryPara key={i} text={p} pieces={glossaryRendered[i]} />
            ))}
            <button type="button" className="btn" onClick={goNext}>
              {nextLabel}
            </button>
          </>
        )}

        {phase.kind === 'reflection' && (
          <>
            <h2>{t.storyMode.reflectionTitle}</h2>
            {mission.reflection.map((p, i) => (
              <p className="story-mode-para" key={i}>
                {glossaryRendered[i] ?? p}
              </p>
            ))}
            <button type="button" className="btn" onClick={goNext}>
              {nextLabel}
            </button>
          </>
        )}

        {phase.kind === 'summary' && (
          <>
            <StoryWeekSummary
              days={summaryDays}
              progress={progress}
              onEnablePush={onEnablePush}
              campaign={storyClosesCampaign(campaign, mission.id)}
            />
            <button type="button" className="btn" onClick={goNext}>
              {nextLabel}
            </button>
          </>
        )}

        {phase.kind === 'hook' && (
          <>
            {mission.hook.map((p, i) => (
              <p className="story-mode-para" key={i}>
                {glossaryRendered[i] ?? p}
              </p>
            ))}
            {onNext ? (
              <button type="button" className="btn" onClick={onNext}>
                {/*
                 * Подпись выводится из того, куда ведёт кнопка: внутри недели
                 * это следующий день, на границе недель — следующая неделя.
                 * Назвать переход между неделями «следующим днём» значит
                 * соврать в единственном месте, где кампания меняет дело
                 * и вопрос над полосой.
                 */}
                {nextStartsWeek ? t.storyMode.nextWeek : t.storyMode.nextMission}
              </button>
            ) : (
              <>
                <p className="story-mode-tbc">{t.storyMode.toBeContinued}</p>
                <button type="button" className="btn secondary" onClick={onExit}>
                  {t.storyMode.finish}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
