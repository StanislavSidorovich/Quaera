import type { Pack, Skill, Task, Track } from '../content/types';
// Расширение .js обязательно: test-story-line.mjs компилирует этот файл
// отдельно и запускает вывод через нативный загрузчик Node, а он не
// достраивает расширение у путей, как это делает Vite.
import { MODE_RANK, compareTaskOrder } from '../content/taskOrder.js';

/**
 * Сюжетная линия трека — порядок, в котором собирают базу.
 *
 * Зачем она вообще, если есть планировщик. SRS собирает занятие из того,
 * что пора повторить и что уже открыто, то есть намеренно не линейно, —
 * и это правильно для возвращающегося. Но приложение из-за этого не
 * отвечает ни на «где я во всём этом», ни на «когда я закончил»: человек,
 * зашедший по ссылке, решает два запроса и уходит, не понимая, много ли
 * осталось и есть ли вообще конец. Линия отвечает на оба вопроса и ничего
 * не отнимает у планировщика: занятия остаются, линия берёт около половины
 * заданий трека, остальное — практика и повторения поверх пройденного.
 *
 * **Порядок и задания выводятся из графа, нарезка на миссии — не всегда.**
 * У каждого навыка есть предпосылки и tier, и этого достаточно для честного
 * порядка (топологического) и для набора заданий на навык. Но где именно
 * проходит граница миссии — решение о смысле, а не о графе: жадная нарезка
 * по минутам не знает, что «справочники» — это одна мысль, а не совпадение
 * бюджета. Поэтому у трека с прозой (content/story.ts) границы миссий задаёт
 * автор — тем же `skills`, которым раньше только сверяли отпечаток; теперь
 * это вход, а не сверка. Гейт (test:story-line) проверяет свойства этой
 * нарезки (порядок, размер, полноту), а не её равенство жадной выкладке.
 * У трека без прозы нарезки нет — жадный путь работает как раньше.
 *
 * **Своего хранилища у линии нет и не будет.** Миссия пройдена, когда решены
 * её задания, а решённые задания уже лежат в `taskRecords` (srs/store.ts).
 * Вторая запись о том же означала бы два источника правды и расхождение
 * при слиянии копий — ровно то, чего sync/merge.ts избегает по построению.
 */

export interface Mission {
  /** `sql-m1`, `sql-m2`, … — стабилен, пока стабилен состав навыков трека. */
  id: string;
  track: Track;
  /** Номер с единицы: он же печатается на экране («Миссия 3 из 7»). */
  number: number;
  /** Навыки миссии в порядке прохождения. Предпосылки каждого — в этой же или более ранней миссии. */
  skills: Skill[];
  /** Задания линии, уже в порядке прохождения: по навыкам, внутри навыка — от подсказанного к самостоятельному. */
  tasks: Task[];
  /** Оценка времени в минутах, вместе с карточками приёма. Целое: точность здесь ложная, а число человек читает. */
  minutes: number;
}

/**
 * Сколько минут стоит шаг.
 *
 * Числа не измерены, а оценены, и это честно сказано: измерять пришлось бы
 * на людях, которых нет. Порядок между режимами при этом не выдуман —
 * он следует из того, что человек делает руками: `predict` читается
 * и выбирается, `fill` дописывается в готовый скелет, `write` набирается
 * с нуля и почти всегда с одной неудачной попыткой.
 */
const MINUTES = { lesson: 1.5, predict: 1.5, order: 2, fill: 2.5, write: 4, interpret: 1.5 } as const;

/**
 * Заданий на навык в линии.
 *
 * Два, а не все: линия — база, а не полное прохождение. При двух на навык
 * в линию попадает около половины трека, и вторая половина остаётся тем,
 * ради чего человек возвращается, — практикой и повторениями. Одно задание
 * на навык дало бы линию на 50 минут, но «базу закрыл» после одного
 * прохода приёма было бы неправдой.
 */
const TASKS_PER_SKILL = 2;

/** Больше трёх тем за миссию — это уже не миссия, а занятие «прочитать всё подряд». */
const MAX_SKILLS_PER_MISSION = 3;

/**
 * Потолок и пол миссии в минутах.
 *
 * Потолок держит ритм: миссия обязана помещаться в один подход, иначе линия
 * снова становится тем, из чего выходят на середине. Пол нужен только хвосту —
 * последняя миссия из одного короткого навыка читается как обрубленная,
 * и вливается в предыдущую.
 */
const MISSION_MAX_MINUTES = 18;
const MISSION_MIN_MINUTES = 6;

/**
 * Глубина навыка в графе — длина самой длинной цепочки предпосылок до него.
 *
 * Именно глубина, а не `tier`: tier проставлен руками и говорит о сложности
 * темы, а порядок прохождения задают связи. Они расходятся — `sql-data-quality`
 * стоит tier 3, но зависит только от `sql-aggregate` и `sql-null`, то есть
 * берётся заметно раньше оконных функций того же tier.
 */
function depthOf(skills: Skill[]): Map<string, number> {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const skill = byId.get(id);
    // Битой предпосылки здесь быть не может — её ловит validate() при загрузке
    // пака. Ветка нужна не ради данных, а ради типа: без неё walk врал бы,
    // что всегда получает скилл.
    if (!skill) return 0;
    // Цикл в графе тоже отсекается загрузкой не полностью (validate проверяет
    // только существование предпосылок), а бесконечная рекурсия здесь стоила бы
    // белого экрана. Считаем цикл нулевой глубиной и идём дальше.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const value = skill.prereqs.length ? 1 + Math.max(...skill.prereqs.map(walk)) : 0;
    visiting.delete(id);
    depth.set(id, value);
    return value;
  };

  for (const s of skills) walk(s.id);
  return depth;
}

function taskMinutes(task: Task): number {
  if (task.steps?.length) {
    return task.steps.reduce(
      (n, step) =>
        n +
        (step.kind === 'interpret' ? MINUTES.interpret : step.kind === 'order' ? MINUTES.order : MINUTES[step.mode]),
      0
    );
  }
  return MINUTES[task.mode];
}

/**
 * Задания линии для одного навыка: от подсказанного к самостоятельному.
 *
 * Порядок — сначала режим ввода, потом уровень, и это ровно приём «затухающих
 * образцов» (faded worked examples): помощь снимают постепенно, а не разом.
 * Даром он достаётся потому, что режимы в контенте уже проставлены — линия
 * их не заводит, а только выстраивает.
 *
 * **Отбор и порядок — два разных решения, и сводить их в одну сортировку
 * нельзя.** Здесь дважды ошиблись в обе стороны, и обе ошибки поймал гейт.
 * Сортировка по уровню давала обратное затухание: `py-explore` отдавал
 * сперва `py-026` (уровень 1, набрать с нуля), потом `py-027` (уровень 2,
 * выбрать из вариантов) — то есть помощь не убывала, а появлялась.
 * Сортировка по режиму чинила порядок, но ломала отбор: финал SQL
 * (`sql-business-case`) начал брать два вопроса с вариантами вместо двух
 * разборов, потому что варианты в этом навыке есть, а по режиму они первые.
 *
 * Поэтому: **берём по уровню** — это «начало навыка», самые представительные
 * его задачи; **выдаём по режиму** — уровень описывает трудность задачи,
 * а режим то, сколько за человека сделали заранее, и в лесах важно второе.
 */
function lineTasksFor(skillId: string, tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.skill === skillId)
    .sort(compareTaskOrder)
    .slice(0, TASKS_PER_SKILL)
    .sort((a, b) => MODE_RANK[a.mode] - MODE_RANK[b.mode] || a.level - b.level);
}

/**
 * Линия трека. Чистая функция от пака (и, для трека с прозой, от нарезки):
 * одинаковые входы — одинаковая линия у всех и всегда, прогресс не нужно
 * нигде хранить.
 *
 * `grouping` — миссии, как их назвал автор прозы: массив миссий, миссия —
 * массив id навыков в порядке прохождения (`storyFingerprint` в
 * content/story.ts). Когда он передан и не пуст, миссии строятся ровно по
 * нему — задания на навык и их порядок внутри навыка всё ещё считает
 * `lineTasksFor`, минуты всё ещё суммируются как обычно, но где кончается
 * миссия, решает автор, не потолок в минутах. Навык без заданий в паке
 * внутри такой миссии пропускается (готовые задания могут появиться позже),
 * а слияние короткого хвоста не применяется — границы миссий уже авторские,
 * подправлять их сложением было бы решением поверх решения.
 *
 * Без нарезки (undefined или пустой массив — трек ещё без прозы) — прежний
 * жадный путь: границы миссий выводятся из бюджета минут и потолка тем.
 */
export function buildLine(pack: Pack, grouping?: string[][]): Mission[] {
  if (!pack.tasks.length) return []; // черновой трек: линии нет, как нет и занятий

  if (grouping && grouping.length) {
    const skillById = new Map(pack.skills.map((s) => [s.id, s]));
    const groups = grouping.map((ids) => {
      const skills: Skill[] = [];
      const tasks: Task[] = [];
      let minutes = 0;
      for (const id of ids) {
        const skill = skillById.get(id);
        if (!skill) continue; // навык, которого нет в паке — ловит гейт, здесь просто не рисуем
        const skillTasks = lineTasksFor(id, pack.tasks);
        if (!skillTasks.length) continue;
        skills.push(skill);
        tasks.push(...skillTasks);
        minutes += MINUTES.lesson + skillTasks.reduce((n, t) => n + taskMinutes(t), 0);
      }
      return { skills, tasks, minutes };
    });
    return groups.map((g, i) => ({
      id: `${pack.track}-m${i + 1}`,
      track: pack.track,
      number: i + 1,
      skills: g.skills,
      tasks: g.tasks,
      minutes: Math.round(g.minutes),
    }));
  }

  const depth = depthOf(pack.skills);
  const order = pack.skills.indexOf.bind(pack.skills);
  const ordered = [...pack.skills].sort(
    (a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) || a.tier - b.tier || order(a) - order(b)
  );

  const groups: { skills: Skill[]; tasks: Task[]; minutes: number }[] = [];
  let current: { skills: Skill[]; tasks: Task[]; minutes: number } | null = null;

  for (const skill of ordered) {
    const tasks = lineTasksFor(skill.id, pack.tasks);
    // Навык без заданий в линию не попадает вовсе: миссия обещает практику,
    // а не список тем. В готовых паках таких нет, в наполняемых — бывают.
    if (!tasks.length) continue;
    const cost = MINUTES.lesson + tasks.reduce((n, t) => n + taskMinutes(t), 0);

    const full =
      current !== null &&
      (current.skills.length >= MAX_SKILLS_PER_MISSION || current.minutes + cost > MISSION_MAX_MINUTES);
    if (current === null || full) {
      current = { skills: [], tasks: [], minutes: 0 };
      groups.push(current);
    }
    current.skills.push(skill);
    current.tasks.push(...tasks);
    current.minutes += cost;
  }

  /*
   * Хвост короче пола вливается в предыдущую миссию: «Миссия 8 из 8,
   * 4 минуты» читается не как финал, а как то, что забыли доделать.
   *
   * Но только если предыдущая после этого остаётся в своих же границах.
   * Без этой оговорки слияние их и нарушало: на `model` финал собирал
   * четыре темы разом (многие-ко-многим, CALCULATE, переход контекста,
   * time intelligence) — то есть ровно четыре самых тяжёлых темы трека
   * в одну миссию, лишь бы не было короткой. Короткая последняя миссия
   * из одной большой темы честнее переполненной.
   */
  if (groups.length > 1) {
    const last = groups[groups.length - 1];
    const prev = groups[groups.length - 2];
    const fits =
      prev.skills.length + last.skills.length <= MAX_SKILLS_PER_MISSION &&
      prev.minutes + last.minutes <= MISSION_MAX_MINUTES;
    if (last.minutes < MISSION_MIN_MINUTES && fits) {
      prev.skills.push(...last.skills);
      prev.tasks.push(...last.tasks);
      prev.minutes += last.minutes;
      groups.pop();
    }
  }

  return groups.map((g, i) => ({
    id: `${pack.track}-m${i + 1}`,
    track: pack.track,
    number: i + 1,
    skills: g.skills,
    tasks: g.tasks,
    minutes: Math.round(g.minutes),
  }));
}

export interface MissionProgress {
  solved: number;
  total: number;
  /** Все задания миссии решены. */
  done: boolean;
  /** Хоть одно решено, но не все. */
  started: boolean;
}

export function missionProgress(mission: Mission, solved: (taskId: string) => boolean): MissionProgress {
  const n = mission.tasks.filter((t) => solved(t.id)).length;
  return {
    solved: n,
    total: mission.tasks.length,
    done: n === mission.tasks.length,
    started: n > 0 && n < mission.tasks.length,
  };
}

/**
 * Где человек на линии: первая непройденная миссия.
 *
 * Первая непройденная, а не «следующая за последней пройденной»: задания
 * решают и вне линии (занятие, практика по теме), поэтому пройденные миссии
 * умеют появляться не подряд. Ведём к самой ранней дыре — она и есть то,
 * чего не хватает для «базу закрыл».
 */
export function currentMissionIndex(line: Mission[], solved: (taskId: string) => boolean): number {
  const i = line.findIndex((m) => !missionProgress(m, solved).done);
  return i === -1 ? line.length : i;
}
