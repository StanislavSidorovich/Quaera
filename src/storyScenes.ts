import type { Locale } from './i18n/context';

/**
 * Сцены Gemini на отдельных шагах сюжета (разговор между делом и вступление
 * к заданию), не на первом дне недели: там `StoryWeekScene`. Ключ:
 * `<id дня>/<intro|interlude>/<номер шага>`. Файл лежит в `public/story/`
 * (1376×768), уходит в precache service worker (postbuild-sw.mjs). Подписи
 * нет, только alt. Манифест в коде, а не проба сети: офлайн-PWA не дёргает 404.
 *
 * Картинка на шаге заменяет старую SVG-сцену этого шага (если она была),
 * поэтому на шаге всегда одна сцена. Выбор шагов: аудит
 * `shots/gemini/2026-11-17-b2/story-image-audit.md`, пункты 2, 4, 7, 8, 9, 12
 * (пункт 12: день 25, вступление py-046, вариант v2 выбран хозяином 2026-11-19).
 */
export const STORY_STEP_SCENES: Readonly<Record<string, { file: string; alt: Record<Locale, string> }>> = {
  'day-5-shelf-or-demand/intro/0': {
    file: 'scene-shelf-vs-demand',
    alt: {
      ru: 'Две витрины с напитками. Слева почти пустая полка с несколькими бутылками бренда и покупатель, который не может его взять. Справа полный ряд тех же бутылок на уровне глаз и покупатель, который проходит мимо.',
      en: 'Two drink aisles. Left: an almost empty shelf with a few bottles of the brand and a shopper who cannot buy it. Right: a full row of the same bottles at eye level and a shopper walking past.',
    },
  },
  'day-7-promo-or-price/interlude/2': {
    file: 'scene-private-label',
    alt: {
      ru: 'Магазинная полка: почти всё занято одинаковыми бутылками собственной марки сети, бренд сдвинут в угол нижней полки, продавец ставит рядом новый лоток.',
      en: 'A store shelf: most of it holds identical private-label bottles, the brand is pushed to the corner of the lower shelf, and a clerk slides a new tray in beside it.',
    },
  },
  'day-11-what-they-decide/intro/0': {
    file: 'scene-three-users',
    alt: {
      ru: 'Три человека, три кадра: торговый представитель у входа в магазин с планшетом, закупщик на складе с папкой, руководитель у экрана с растущим графиком.',
      en: 'Three people, three frames: a field rep at a shop entrance with a tablet, a purchaser in a warehouse with a binder, a manager at a screen with a rising chart.',
    },
  },
  'day-14-raw-layer/intro/0': {
    file: 'scene-raw-exports',
    alt: {
      ru: 'К одному лотку на столе стекаются разные источники: чековая лента, складской сканер, стопка накладных, ноутбук с таблицей. Сбоку аккуратная папка с готовыми таблицами.',
      en: 'Different sources pour into one tray on a desk: a receipt roll, a warehouse scanner, a stack of delivery slips, a laptop with a table. Aside, a tidy binder of finished tables.',
    },
  },
  'day-15-conclusion-first/intro/0': {
    file: 'scene-car-two-lines',
    alt: {
      ru: 'Руководитель на заднем сиденье машины между встречами смотрит на экран телефона; за окном размытый город.',
      en: 'A director in the back seat of a car between meetings looks at a phone screen; a blurred city outside the window.',
    },
  },
  'day-25-flow-and-level/intro/0': {
    file: 'scene-flow-vs-level',
    alt: {
      ru: 'Склад дистрибьютора: слева рабочий вкатывает на тележке небольшую стопку коробок, справа другой вывозит такую же к фургону, а посреди склада стоят высокие паллеты с нетронутым запасом.',
      en: 'A distributor warehouse: on the left a worker wheels in a small stack of cases, on the right another wheels out an equal stack to a van, and in the middle stand tall pallets of untouched stock.',
    },
  },
};

export const stepSceneKey = (missionId: string, kind: string, step: number): string => `${missionId}/${kind}/${step}`;
