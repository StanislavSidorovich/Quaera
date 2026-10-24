import { AXES, type AxisId, type Level } from './readiness';

/**
 * Состояние экрана «Путь к роли»: выбранная роль, отметки-доказательства
 * и недельные снимки уровней осей.
 *
 * Живёт полем `career` внутри прогресса (`srs/store.ts`), а не своим ключом:
 * так оно едет на второе устройство той же строкой `progress` в Supabase,
 * сливается тем же `mergeProgress` и гаснет тем же сбросом через эпоху
 * `resetAt`. Источник правды один, и экран с синхронизацией разойтись
 * не могут. Модуль чистый, без localStorage: его проверяет `test:merge`.
 *
 * До фазы 3 состояние лежало в `quaera.career.v1`; одноразовый перенос
 * оттуда — в `legacy.ts`.
 */

export const DEFAULT_ROLE = 'bi';

/** Снимок старше этого возраста заменяется новым при открытии экрана. */
export const SNAPSHOT_EVERY_DAYS = 7;
const SNAPSHOT_LIMIT = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AxisLevels = Record<AxisId, Level>;

export interface WeeklySnapshot {
  /** ISO-дата со временем: по ней считается возраст снимка. */
  date: string;
  levels: AxisLevels;
}

/**
 * Отметка хранит не только «стоит», но и когда её последний раз меняли.
 *
 * Простое множество поставленных отметок слилось бы объединением, и снятая
 * на телефоне галочка вернулась бы с ноутбука при первой же синхронизации:
 * у объединения нет удаления (та же ловушка, что у сброса прогресса).
 * Снятая отметка поэтому не удаляется, а остаётся записью `on: false`
 * со своей меткой, и на каждую отметку побеждает более поздняя запись.
 */
export interface EvidenceMark {
  on: boolean;
  at: string;
}

export interface CareerState {
  role: string;
  /** Когда роль выбрали руками; `null` — не выбирали, стоит роль по умолчанию. */
  roleAt: string | null;
  checks: Record<string, EvidenceMark>;
  weekly: WeeklySnapshot[];
}

export const emptyCareerState = (): CareerState => ({ role: DEFAULT_ROLE, roleAt: null, checks: {}, weekly: [] });

/** Идентификаторы поставленных отметок — то, что нужно формуле готовности. */
export const checkedIds = (s: CareerState): string[] =>
  Object.keys(s.checks).filter((id) => s.checks[id].on);

export const withRole = (s: CareerState, role: string, now: Date): CareerState => ({
  ...s,
  role,
  roleAt: now.toISOString(),
});

export const withToggledEvidence = (s: CareerState, id: string, now: Date): CareerState => ({
  ...s,
  checks: { ...s.checks, [id]: { on: !s.checks[id]?.on, at: now.toISOString() } },
});

function isLevels(v: unknown): v is AxisLevels {
  if (!v || typeof v !== 'object') return false;
  return AXES.every((a) => {
    const n = (v as Record<string, unknown>)[a];
    return typeof n === 'number' && n >= 0 && n <= 3;
  });
}

const isSnapshot = (w: unknown): w is WeeklySnapshot =>
  !!w && typeof w === 'object' && typeof (w as WeeklySnapshot).date === 'string' && isLevels((w as WeeklySnapshot).levels);

/**
 * Проверка формы на входе: из localStorage, из файла экспорта и из jsonb
 * на сервере приходит что угодно. `undefined` — состояния нет (запись,
 * сделанная до фазы 3, или мусор вместо поля), и это не ошибка.
 */
export function parseCareer(v: unknown): CareerState | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Partial<CareerState>;
  const checks: Record<string, EvidenceMark> = {};
  if (p.checks && typeof p.checks === 'object') {
    for (const [id, m] of Object.entries(p.checks)) {
      if (m && typeof m === 'object' && typeof m.on === 'boolean' && typeof m.at === 'string') {
        checks[id] = { on: m.on, at: m.at };
      }
    }
  }
  return normalizeCareer({
    role: typeof p.role === 'string' ? p.role : DEFAULT_ROLE,
    roleAt: typeof p.roleAt === 'string' ? p.roleAt : null,
    checks,
    weekly: Array.isArray(p.weekly) ? p.weekly.filter(isSnapshot) : [],
  });
}

/**
 * Слияние двух копий состояния экрана. Как и `mergeProgress`, полурешётка:
 * идемпотентно, коммутативно, ассоциативно — это проверяет `test:merge`
 * на тех же случайных тройках.
 *
 * - *Роль* — последняя выбранная, по `roleAt`. При равных метках решает
 *   строка роли: ответ обязан не зависеть от порядка аргументов.
 * - *Отметка* — на каждую своя победившая запись, более поздняя по `at`;
 *   при равных метках поставленная сильнее снятой (тот же довод о порядке).
 * - *Снимки* — объединение по дате, не больше двенадцати последних.
 *   Обрезка оставляет самые новые, поэтому ассоциативна, как обрезка дней
 *   активности в прогрессе.
 *
 * Сброс здесь не решается: копии разных эпох до этой функции не доходят,
 * их разводит `mergeProgress`.
 */
export function mergeCareer(a: CareerState, b: CareerState): CareerState {
  /*
   * Сравнение по полям, а не склейкой в строку: в склейке `null` давал
   * ключ «|bi», а «|» старше любой цифры ISO-даты, и невыбранная роль
   * по умолчанию перебивала выбранную руками. Поймал `test:merge`.
   */
  const ta = a.roleAt ?? '';
  const tb = b.roleAt ?? '';
  const roleWin = ta !== tb ? (ta > tb ? a : b) : a.role >= b.role ? a : b;

  const checks: Record<string, EvidenceMark> = {};
  for (const id of new Set([...Object.keys(a.checks), ...Object.keys(b.checks)])) {
    const x = a.checks[id];
    const y = b.checks[id];
    checks[id] = x && y ? (markKey(x) >= markKey(y) ? x : y) : (x ?? y);
  }

  return normalizeCareer({ role: roleWin.role, roleAt: roleWin.roleAt, checks, weekly: [...a.weekly, ...b.weekly] });
}

const markKey = (m: EvidenceMark) => `${m.at}|${m.on ? 1 : 0}`;

/**
 * Каноническая форма: отметки по алфавиту, снимки по дате без повторов
 * и с потолком. Нужна, чтобы `merge(a, a)` совпадало с `a` побайтово,
 * а не только по смыслу. Два снимка с одной датой и разными уровнями
 * в жизни не встречаются (дата с миллисекундами), но и тут ответ
 * не зависит от порядка: остаётся снимок с бóльшей строкой уровней.
 */
function normalizeCareer(s: CareerState): CareerState {
  const checks: Record<string, EvidenceMark> = {};
  for (const id of Object.keys(s.checks).sort()) checks[id] = s.checks[id];

  const byDate = new Map<string, WeeklySnapshot>();
  const levelsKey = (w: WeeklySnapshot) => JSON.stringify(AXES.map((a) => w.levels[a]));
  for (const w of s.weekly) {
    const prev = byDate.get(w.date);
    if (!prev || levelsKey(w) > levelsKey(prev)) byDate.set(w.date, w);
  }
  const weekly = [...byDate.values()].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0)).slice(-SNAPSHOT_LIMIT);

  return { role: s.role, roleAt: s.roleAt, checks, weekly };
}

/**
 * Дописывает снимок, если последнего нет или ему не меньше семи дней.
 * Возвращает тот же массив, если писать нечего, — по ссылке видно, менялось ли что-то.
 */
export function withWeeklySnapshot(weekly: WeeklySnapshot[], levels: AxisLevels, now: Date): WeeklySnapshot[] {
  const last = weekly[weekly.length - 1];
  const age = last ? now.getTime() - new Date(last.date).getTime() : Infinity;
  if (last && !(age >= SNAPSHOT_EVERY_DAYS * DAY_MS)) return weekly;
  return [...weekly, { date: now.toISOString(), levels }].slice(-SNAPSHOT_LIMIT);
}

export interface AxisChange {
  axis: AxisId;
  from: Level;
  to: Level;
}

/**
 * Что изменилось за неделю. Сравнивается с самым новым снимком, который
 * старше последнего хотя бы на семь дней: последний только что записан
 * (или записан на этой неделе) и отражает сегодняшнее состояние.
 *
 * На одном устройстве это всегда предпоследний снимок — они и пишутся
 * не чаще раза в семь дней. После слияния с другим устройством снимки
 * двух копий перемежаются, и предпоследний мог оказаться вчерашним;
 * поиск по возрасту возвращает строке «за неделю» её смысл.
 * Сравнивать не с чем — возвращается null.
 */
export function weeklyChanges(weekly: WeeklySnapshot[], now: AxisLevels): AxisChange[] | null {
  const last = weekly[weekly.length - 1];
  if (!last) return null;
  const cutoff = new Date(last.date).getTime() - SNAPSHOT_EVERY_DAYS * DAY_MS;
  const base = [...weekly].reverse().find((w) => new Date(w.date).getTime() <= cutoff)?.levels;
  if (!base) return null;
  return AXES.filter((a) => now[a] !== base[a]).map((a) => ({ axis: a, from: base[a], to: now[a] }));
}
