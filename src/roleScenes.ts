import type { Locale } from './i18n/context';

/**
 * Сцены ролей на странице «Путь к роли» (`?roles=<id>` и плитки обзора).
 *
 * Манифест в коде, а не проба сети: офлайн-PWA не должна дёргать 404 на роль
 * без картинки. Файл лежит в `public/roles/<id>.webp` (1200×670), попадает в
 * precache service worker (postbuild-sw.mjs). Положили файл: добавьте id сюда.
 * `x` для миниатюры: куда смотрит кадрирование по горизонтали (лицо героя).
 */
export const ROLE_SCENES: Readonly<Record<string, { x: number; alt: Record<Locale, string> }>> = {
  ba: {
    x: 22,
    alt: {
      ru: 'Аналитик у доски со схемой процесса объясняет её коллеге с планшетом',
      en: 'An analyst at a whiteboard process diagram talks it through with a colleague holding a tablet',
    },
  },
  de: {
    x: 82,
    alt: {
      ru: 'Инженер данных за двумя мониторами со схемой загрузки данных, рядом серверная стойка',
      en: 'A data engineer at two monitors showing a data pipeline diagram, a server rack behind',
    },
  },
  ae: {
    x: 78,
    alt: {
      ru: 'Аналитик-инженер за монитором со схемой связанных таблиц, на столе тетрадь с заметками',
      en: 'An analytics engineer at a monitor showing linked tables, a notebook on the desk',
    },
  },
  bi: {
    x: 28,
    alt: {
      ru: 'BI-разработчик за монитором с дашбордом из диаграмм, на столе распечатки с графиками',
      en: 'A BI developer at a monitor with a dashboard of charts, printed charts on the desk',
    },
  },
  da: {
    x: 40,
    alt: {
      ru: 'Аналитик показывает коллеге на ноутбуке таблицу и график, рядом стикеры с вопросами',
      en: 'An analyst shows a colleague a table and a chart on a laptop, sticky notes with questions beside it',
    },
  },
  ds: {
    x: 40,
    alt: {
      ru: 'Специалист по данным за монитором с графиком прогноза: линия уходит в расширяющийся коридор, за окном Токийская башня',
      en: 'A data scientist at a monitor with a forecast chart: the line fans out into a widening band, Tokyo Tower in the window',
    },
  },
  gov: {
    x: 62,
    alt: {
      ru: 'Опытный специалист по данным листает толстый справочник, коллега рядом делает заметки',
      en: 'A senior data steward leafs through a thick reference book while a colleague takes notes',
    },
  },
};

export const roleSceneUrl = (id: string): string | null =>
  ROLE_SCENES[id] ? `${import.meta.env.BASE_URL}roles/${id}.webp` : null;
