/**
 * Банк самопроверки «Пути к роли» (src/content/career-quiz.json).
 *
 * Формат как у career.json: одна запись на обе локали. Флаг `correct`
 * стоит на самом варианте, а не номером в отдельном поле: перемешивание
 * и правка порядка вариантов не могут разойтись с ключом. Разбор `why`
 * есть у каждого варианта, у неверного он называет заблуждение, а не
 * говорит «неверно».
 *
 * В файле верный вариант стоит первым: так его проще проверять глазами.
 * На экране варианты обязаны перемешиваться (`shuffled` в career/quiz.ts).
 *
 * Правила банка держит `test:career`: ровно один верный из четырёх,
 * обе локали, без тире и имени школы, длина не выдаёт ответ.
 */
import raw from './career-quiz.json';
import type { Locale } from '../i18n/context';
import type { AxisId } from '../career/readiness';

type Text = Record<Locale, string>;

export interface QuizOption {
  text: Text;
  correct: boolean;
  why: Text;
}

export interface QuizQuestion {
  id: string;
  axis: AxisId;
  /** Откуда вопрос: раздел подготовки к интервью или этап из career.json. На экран не выводится. */
  ref: string;
  q: Text;
  options: QuizOption[];
}

export const quizQuestions: QuizQuestion[] = (raw as unknown as { questions: QuizQuestion[] }).questions;

export const quizBank = (axis: AxisId): QuizQuestion[] => quizQuestions.filter((q) => q.axis === axis);
