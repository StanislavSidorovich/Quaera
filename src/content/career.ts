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

export interface CareerAxis extends AxisDef {
  title: Text;
  /** Чем тренажёр покрывает ось и чем нет, одной фразой. */
  note: Text;
}

export interface CareerRole extends RoleDef {
  title: Text;
  does: Text;
  /** Как роль совмещается с соседними в компаниях разного размера. */
  hybrid: Text;
  /** Что в роли уже берёт на себя ИИ и что остаётся человеку. */
  ai: Text;
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

export interface CareerEvidence extends EvidenceDef {
  title: Text;
  /**
   * `quiz` — отметку ставит самопроверка (`career/quiz.ts`), а не человек:
   * галочки у неё нет, засчитана она, когда сдан тест оси.
   */
  source?: 'quiz';
}

interface CareerData {
  axes: CareerAxis[];
  roles: CareerRole[];
  stages: CareerStage[];
  evidence: CareerEvidence[];
}

const data = raw as unknown as CareerData;

export const careerAxes: CareerAxis[] = data.axes;
export const careerRoles: CareerRole[] = data.roles;
export const careerStages: CareerStage[] = data.stages;
export const careerEvidence: CareerEvidence[] = data.evidence;

export const careerAxis = (id: AxisId): CareerAxis => careerAxes.find((a) => a.id === id)!;
export const careerRole = (id: string): CareerRole | undefined => careerRoles.find((r) => r.id === id);

/** Этапы, на которых роль стоит в `who`, — для карточки роли. */
export const stagesOfRole = (roleId: string): CareerStage[] => careerStages.filter((s) => s.who.includes(roleId));

export type { AxisId, Level };
