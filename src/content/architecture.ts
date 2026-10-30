/**
 * Данные «Карты данных компании»: шесть слоёв пути данных от источников
 * до встречи, три линзы и маршрут вопроса «Nettora».
 *
 * Содержание лежит в architecture.json (одна запись на обе локали, как
 * career.json); роли и этапы ссылаются на career.json по id, навыки на паки.
 * Числа маршрута сняты запросом к датасету, и тот же запрос лежит в поле
 * `sql` шага: `test:architecture` выполняет его на `public/data/quaera.dataset`.
 * Рядом сценарий «Проект от и до» (`project`): девять станций вперёд, от вопроса
 * к ответу. Здесь только типы и чтение, текст не правится.
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
  /** График под текстом шага: линия штук по месяцам или разложение «точки × штук на точку». */
  figure?: 'line' | 'split';
}

/** Месячные значения Nettora за 2025: `test:architecture` сверяет их с запросом шага «split». */
export interface ArchFigure {
  months: string[];
  outlets: number[];
  units: number[];
  names: Record<'units' | 'outlets' | 'perOutlet', Text>;
}

/** Метка станции: сделать в браузере, только прочитать или пойти во внешний инструмент. */
export type ProjectLabel = 'here' | 'watch' | 'outside';

/**
 * Внешняя страница. `kind: try` — где попробовать самому, `doc` — откуда взято
 * утверждение. `checked` — дата сверки с официальной страницей (показывать
 * рядом с условиями); `unconfirmed` — что подтвердить не удалось.
 */
export interface ProjectExternal {
  id: string;
  kind: 'try' | 'doc';
  name: string;
  url: string;
  also?: string[];
  checked: string;
  terms: Text;
  unconfirmed?: Text;
}

export interface ProjectLesson {
  text: Text;
  /** id из `project.external`, если урок опирается на официальную страницу. */
  source?: string;
}

/** Запрос станции: `expect` — ровно то, что он возвращает на датасете; сверяет `test:architecture`. */
export interface ProjectQuery {
  id: string;
  title: Text;
  sql: string;
  expect: (string | number)[][];
}

export interface ProjectStation {
  id: string;
  /** Необязательная станция: пропуск не рвёт цепочку передач. */
  optional?: boolean;
  layer: string;
  /** Кто работает на станции (id из career.json); `also` — кто участвует рядом. */
  role: string;
  also?: string[];
  title: Text;
  /** `from: null` — от бизнеса, без роли из career.json. */
  receives: { from: string | null; text: Text };
  does: Text;
  tools: string[];
  /** `to: null` — бизнесу, без роли из career.json. */
  hands: { to: string | null; text: Text };
  label: ProjectLabel;
  action: {
    text: Text;
    skills: string[];
    app?: FamilyApp;
    /** Прямая ссылка: внешний адрес или файл из `public/`. */
    href?: string;
    externals?: string[];
  };
  queries?: ProjectQuery[];
  lessons?: ProjectLesson[];
  /** График `project.figure` под текстом станции. */
  figure?: 'planVsFact';
  /** Только у станции «Сырьё»: способы осмотреть и уменьшить большой файл. */
  bigFile?: {
    title: Text;
    methods: { id: string; name: string; when: Text; source?: string }[];
    /** Замер предела Quaera Lab: `ok_mb` стал таблицей, `fail_mb` не открылся (null: предел не найден). */
    labLimit: { ok_mb: number; fail_mb: number | null; checked: string; text: Text };
  };
}

/** Маршрут «Проект от и до»: вперёд от вопроса к ответу, в конце выбор роли и переход к разбору. */
export interface ArchProject {
  id: string;
  title: Text;
  intro: Text;
  minutes: number;
  case: { question: Text; who: Text };
  labels: { id: ProjectLabel; title: Text; note: Text }[];
  external: ProjectExternal[];
  stations: ProjectStation[];
  figure: { months: string[]; fact: number[]; plan: number[]; names: Record<'fact' | 'plan', Text> };
  finish: {
    title: Text;
    text: Text;
    roles: { role: string; stations: string[]; why: Text }[];
    next: { trace: string; text: Text };
  };
}

/** Запрос артефакта: `expect` — ровно то, что он возвращает на датасете; сверяет `test:architecture`. */
export interface ArtifactQuery {
  sql: string;
  expect: (string | number | null)[][];
}

export interface SilverCombo {
  sql: string;
  names: number;
  codes: number;
  rows: number;
  dates: number;
}

/**
 * Артефакты слоёв: то, что в слое реально лежит, на данных Kaiyo. Все значения
 * сняты запросом и сверяются гейтом; ключ комбинации silver — три цифры
 * «TRIM и регистр, даты, дубли» (`101`: первый и третий шаги включены).
 */
export interface ArchArtifacts {
  ui: Record<'query' | 'hideQuery' | 'openLab' | 'table' | 'sourceNote', Text>;
  sources: {
    title: Text;
    sellin: { event: Text; table: string; columns: string[] } & ArtifactQuery;
    sellout: { event: Text; table: string; columns: string[] } & ArtifactQuery;
  };
  bronze: { title: Text; caption: Text; columns: string[] } & ArtifactQuery;
  silver: {
    title: Text;
    caption: Text;
    note: Text;
    toggles: Record<'trim' | 'types' | 'dedup', Text>;
    metrics: Record<'names' | 'codes' | 'rows' | 'dates', Text>;
    combos: Record<string, SilverCombo>;
  };
  gold: { title: Text; grain: Text; rowsLabel: Text; table: string } & ArtifactQuery;
  serve: { title: Text; caption: Text; measure: string; dax: string; chart: Text; refs: [string, string][] };
  meeting: { title: Text; kicker: Text; phrase: Text };
}

export interface Architecture {
  lake: { title: Text; note: Text };
  lenses: { id: LensId; title: Text }[];
  money: { id: MoneyKind; title: Text }[];
  /** Одна фраза «что это и кто им пользуется» на каждый инструмент из `layers[].tools`. */
  tools: Record<string, Text>;
  layers: ArchLayer[];
  trace: { id: string; title: Text; figure: ArchFigure; steps: ArchStep[] };
  project: ArchProject;
  artifacts: ArchArtifacts;
}

export const architecture = raw as unknown as Architecture;
