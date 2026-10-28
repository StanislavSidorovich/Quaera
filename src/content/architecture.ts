/**
 * Данные «Карты данных компании»: шесть слоёв пути данных от источников
 * до встречи, три линзы и маршрут вопроса «Nettora».
 *
 * Содержание лежит в architecture.json (одна запись на обе локали, как
 * career.json); роли и этапы ссылаются на career.json по id, навыки на паки.
 * Числа маршрута сняты запросом к датасету, и тот же запрос лежит в поле
 * `sql` шага: `test:architecture` выполняет его на `public/data/quaera.dataset`.
 * Здесь только типы и чтение, текст не правится.
 */
import raw from './architecture.json';
import type { Locale } from '../i18n/context';
import type { FamilyApp } from './career';

type Text = Record<Locale, string>;

export type LensId = 'roles' | 'quaera' | 'money';
export type MoneyKind = 'work' | 'storage' | 'compute' | 'seats' | 'people';

export interface ArchLayer {
  id: string;
  /** Слой лежит внутри lakehouse (bronze, silver, gold): их обводит пунктирная рамка. */
  lake: boolean;
  title: Text;
  what: Text;
  kaiyo: Text;
  /** Слой, где живёт датасет тренажёра: «вы здесь». */
  here?: boolean;
  roles: string[];
  stages: string[];
  tools: string[];
  money: { kind: MoneyKind; text: Text };
  practice: {
    /** `hands` — можно сделать руками, `described` — в браузере только описано. */
    mode: 'hands' | 'described';
    apps: FamilyApp[];
    skills: string[];
    text: Text;
  };
}

export interface ArchStep {
  layer: string;
  role: string | null;
  who: Text;
  text: Text;
  sql?: string;
}

export interface Architecture {
  lake: { title: Text; note: Text };
  lenses: { id: LensId; title: Text }[];
  money: { id: MoneyKind; title: Text }[];
  layers: ArchLayer[];
  trace: { id: string; title: Text; steps: ArchStep[] };
}

export const architecture = raw as unknown as Architecture;
