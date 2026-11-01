/**
 * «Как попробовать и освоить» и «что переносится» для инструментов карты данных.
 *
 * Условия живут у ссылки, а не у инструмента: шесть инструментов Fabric ведут на
 * одну пробную версию, и при перепроверке её условия правятся в одном месте.
 * «Что переносится» живёт у семейства по той же причине. Дата `checked` видна
 * человеку: условия чужих сервисов меняются, а гейт работает без сети.
 * Согласованность файла с картой держит `test:architecture`.
 */
import raw from './tool-learning.json';
import type { Locale } from '../i18n/context';

type Text = Record<Locale, string>;

/** Куда ведёт шаг внутри семьи Quaera; без `to` это текст о треке тренажёра. */
export type QuaeraTarget = 'labSql' | 'labPython' | 'labData' | 'model' | 'pandas' | 'csv';

export interface LearnSource {
  title: string;
  url: string;
  access: Text;
}

export interface ToolLearn {
  family: string;
  quaera?: { to?: QuaeraTarget; text: Text };
  try?: string;
  learn?: string[];
  note?: Text;
}

export interface ToolLearning {
  checked: string;
  /** `peers`: инструменты семейства делают одну работу. DAX не замена Power BI, а Teams не замена SAP. */
  families: Record<string, { title: Text; carries: Text; relearn: Text; peers?: boolean }>;
  sources: Record<string, LearnSource>;
  tools: Record<string, ToolLearn>;
}

export const toolLearning = raw as unknown as ToolLearning;

/** Другие инструменты той же работы: на них и переносится опыт. */
export function familyPeers(name: string): string[] {
  const family = toolLearning.tools[name]?.family;
  return Object.keys(toolLearning.tools).filter((t) => t !== name && toolLearning.tools[t].family === family);
}
