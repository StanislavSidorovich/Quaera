/**
 * Данные экрана «Путь к роли»: восемь осей навыков, роли с целями junior,
 * десять этапов задачи от вопроса до решения и отметки-доказательства.
 *
 * Формат как у tools-compare.json: одна запись на обе локали, текст полями
 * `{ ru, en }`. Ролей и этапов немного, и переводить их отдельным файлом
 * значило бы держать два списка id, которые обязаны совпадать.
 *
 * **Привязка навыков к осям — единственное место, где 78 навыков тренажёра
 * встречаются с ролями.** Новый навык без оси молча выпал бы из готовности,
 * поэтому `test:career` требует, чтобы каждый навык из паков стоял хотя бы
 * в одной оси, и проверяет обратное: каждый id здесь существует.
 *
 * Имени университета и названий конкретных курсов здесь нет намеренно,
 * по той же причине, что в overview.ts: публичная страница с именем школы
 * читается как одобрение, которого никто не давал. Поле `courses` называет
 * предмет, как он обычно называется в программе.
 */
import raw from './career.json';
import type { Locale } from '../i18n/context';
import type { AxisDef, AxisId, EvidenceDef, Level, RoleDef } from '../career/readiness';

type Text = Record<Locale, string>;

/** Приложения семейства, куда этап ведёт наружу (id из family/family.json). */
export type FamilyApp = 'lab' | 'model' | 'flow' | 'pandas';

/** Один шаг к уровню оси: что сделать и куда нажать. */
export interface AxisStep {
  /** Что сделать, одной строкой без тире. */
  text: Text;
  /**
   * skills: кнопки «потренировать» по этим навыкам;
   * tasks: ссылка `?task=` на эти задания;
   * app: ссылка `href` в приложение семейства (`app`);
   * quiz: кнопка самопроверки оси;
   * story: вход в режим истории;
   * evidence: строка отметки по id, без ссылки;
   * outside: только текст;
   * learn: семья этот шаг дать не может, строка «Где прокачать»: `text` называет официальный бесплатный ресурс, `href` ведёт на него;
   * planned: строка «В проработке в Quaera», только там, где у семьи записан план.
   */
  kind: 'skills' | 'tasks' | 'app' | 'story' | 'quiz' | 'evidence' | 'outside' | 'learn' | 'planned';
  skills?: string[];
  tasks?: string[];
  app?: FamilyApp;
  href?: string;
  evidence?: string;
}

/** Что значит уровень оси и как до него дойти с предыдущего. */
export interface AxisLevel {
  level: 1 | 2 | 3;
  /** Что человек делает на этом уровне, наблюдаемо; второе лицо. */
  does: Text;
  /** Шаги, чтобы дойти до этого уровня с предыдущего: 1-3 штуки. */
  steps: AxisStep[];
  /** Для отдельной роли у уровня другой текст и шаги (например, у DA уровень 2 BI без DAX). */
  forRole?: Record<string, { does?: Text; steps?: AxisStep[] }>;
}

/** Уровень оси так, как его видит роль: с её подменой текста и шагов, если она есть. */
export function levelFor(level: AxisLevel, roleId: string): { does: Text; steps: AxisStep[] } {
  const o = level.forRole?.[roleId];
  return { does: o?.does ?? level.does, steps: o?.steps ?? level.steps };
}

export interface CareerAxis extends AxisDef {
  title: Text;
  /** Чем тренажёр покрывает ось и чем нет, одной фразой. */
  note: Text;
  /** Короткое имя для подписи на паутинке. */
  short: Text;
  /** Критерии уровней 1, 2, 3 по порядку (источник: docs/career-axis-levels-2026-11.md). */
  levels: AxisLevel[];
  /** Как ось видна в вакансиях, одной фразой с долей. */
  market: Text;
  /** Потолок тренажёра здесь 1, а уровень 2 даёт сборка в Lab: экран говорит это строкой со ссылкой. */
  ceilingLab?: boolean;
}

export type GradeGroup = 'entry' | 'mid' | 'senior';
export const GRADE_GROUPS: GradeGroup[] = ['entry', 'mid', 'senior'];

export interface CareerRole extends RoleDef {
  title: Text;
  does: Text;
  /** Как роль совмещается с соседними в компаниях разного размера. */
  hybrid: Text;
  /** Что в роли уже берёт на себя ИИ и что остаётся человеку. */
  ai: Text;
  /** Сколько вакансий выборки у роли (`vacancies.total` всего). */
  ads: number;
  /** Сколько из них называют Excel, английский и коммуникацию; у ролей с малой выборкой поля нет. */
  outside?: Outside;
  /** Пометка к цели оси, когда цель и вакансии расходятся (например, Python у BI: на входе встречается, обязательным называют редко). */
  targetNotes?: Record<string, Text>;
  /** Соседняя роль для сравнения на странице роли. */
  neighbor: string;
  /** Навыки, которые чаще всего называют обязательными: [id из `vacancies.skillLabels`, сколько из `ads` вакансий]. */
  ask: [string, number][];
  /** По грейдам (вход = intern и junior): N вакансий группы и до трёх частых навыков. Группа меньше `minRoleAds` показывается как «мало данных», навыков в ней нет. */
  grades: Record<GradeGroup, { n: number; top: [string, number][] }>;
  /** Выборка роли мала (Data Scientist: 8): цели заданы по смыслу, и экран говорит «мало данных». */
  lowData?: boolean;
}

export interface Outside {
  excel: number;
  english: number;
  comms: number;
}

export interface CareerStage {
  id: string;
  title: Text;
  /** id ролей из `roles`; первая — та, на ком этап висит. */
  who: string[];
  /** Инструменты рынка. Только названия: доступа к ним у тренажёра нет. */
  tools: string[];
  /** Навыки тренажёра, на которых этот этап можно потрогать. */
  skills: string[];
  apps: FamilyApp[];
  courses: Text;
  ai: Text;
}

/**
 * Отметка-доказательство. `source: 'quiz'` — её ставит самопроверка (`career/quiz.ts`),
 * `source: 'labDone'` — возврат из Lab (`labKeys` в `quaera.labDone`, хватает любого): галочки у таких нет.
 */
export interface CareerEvidence extends EvidenceDef {
  title: Text;
}

interface CareerData {
  /**
   * Выборка вакансий, на которой стоят цели ролей. Число одно: хаб обновляет
   * его вместе с `ads` и `outside` ролей, когда разбирает новую партию.
   * `roleTotal` — сколько из `total` отнесено к семи ролям (сумма `ads`), цели считаны по ним;
   * `excelEntry` — Excel в вакансиях входного уровня DA и BI.
   */
  vacancies: { total: number; roleTotal: number; excelEntry: { hit: number; of: number }; linkedin: number; boards: number; outsideTotal: Outside; minRoleAds: number; skillLabels: Record<string, Text> };
  axes: CareerAxis[];
  roles: CareerRole[];
  stages: CareerStage[];
  evidence: CareerEvidence[];
}

const data = raw as unknown as CareerData;

export const vacancies = data.vacancies;
export const careerAxes: CareerAxis[] = data.axes;
export const careerRoles: CareerRole[] = data.roles;
export const careerStages: CareerStage[] = data.stages;
export const careerEvidence: CareerEvidence[] = data.evidence;

export const careerAxis = (id: AxisId): CareerAxis => careerAxes.find((a) => a.id === id)!;
export const careerRole = (id: string): CareerRole | undefined => careerRoles.find((r) => r.id === id);

/** Этапы, на которых роль стоит в `who`, — для карточки роли. */
export const stagesOfRole = (roleId: string): CareerStage[] => careerStages.filter((s) => s.who.includes(roleId));

export type { AxisId, Level };
