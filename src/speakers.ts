/**
 * Говорящие кампании: стабильные id вместо разбора строки `from`.
 *
 * Одного человека в данных подписывают по-разному («Aoki, Sales Director»,
 * «Aoki-san, sales director», «Aoki san, sales director», «Аоки-сан, ...»),
 * а озвучке нужен один голос на персонажа. Реплики пилота несут `speaker`
 * прямо в данных (`StoryMessage.speaker`); для всех остальных id выводится
 * из подписи функцией `speakerId`. Модуль без React и DOM: его читают и
 * приложение, и гейт `test:voice-manifest` (через esbuild).
 */

export type SpeakerId = 'aoki' | 'manager' | 'mori' | 'ito' | 'tanaka' | 'narrator';

export const SPEAKER_IDS: readonly SpeakerId[] = ['aoki', 'manager', 'mori', 'ito', 'tanaka', 'narrator'];

/** Имя персонажа, окружённое не-буквами: «ito» не должно находиться внутри «Kito», «auditor» и т.п. */
const word = (s: string) => new RegExp(`(?<![\\p{L}])${s}(?![\\p{L}])`, 'iu');

const PATTERNS: Array<[RegExp, SpeakerId]> = [
  [word('aoki|аоки'), 'aoki'],
  [word('mori|мори'), 'mori'],
  [word('ito|ито'), 'ito'],
  [word('tanaka|танака'), 'tanaka'],
  [word('(your\\s+)?manager|(ваш\\s+)?руководитель'), 'manager'],
];

/**
 * Id говорящего по подписи `from` (обеих локалей). Подпись «Ито-сан,
 * руководитель полевой команды» содержит слово «руководитель», поэтому
 * имена проверяются раньше роли. Незнакомая подпись: рассказчик.
 */
export function speakerId(from: string): SpeakerId {
  return PATTERNS.find(([re]) => re.test(from))?.[1] ?? 'narrator';
}
