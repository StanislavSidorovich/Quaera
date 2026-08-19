import type { Locale } from '../i18n/context';
import type { Track } from './types';

/**
 * Режим истории — сквозная сюжетная миссия, а НЕ выведенная из графа линия.
 *
 * Это сознательно другая сущность, чем сюжетная линия (src/story/line.ts +
 * story.ts). Линия выводится из предпосылок: её состав и порядок — следствие
 * графа, руками пишется только связка. Здесь наоборот: миссия написана целиком
 * руками, а из существующего берётся ровно одно — задание, которое крутится
 * внутри неё через обычный движок (TaskView). Всё остальное — бриф голосом
 * заказчика, теория ровно перед нуждой, суждение после решения и переход
 * к следующей миссии — это нарратив, которого из графа не выведешь.
 *
 * **Почему миссия ссылается на задание по id, а не несёт свой контент.**
 * Правильность задания проверяется исполнением: эталон прогоняется движком,
 * числа в разборе сверяются с датасетом (см. verify-content.mjs). Заводить
 * копию задания внутри истории значило бы завести второй, непроверяемый
 * источник правды рядом с проверяемым. Миссия берёт задание из пака как есть
 * и лишь оборачивает его в сюжет.
 *
 * **Пока это вертикальный срез: одна миссия, только SQL, без ветвления.**
 * Цель среза — проверить, заходит ли сама рамка «первый день на работе», прежде
 * чем строить движок состояний (последствия, ветки) и остальную кампанию.
 * Вход спрятан за `?story` (см. STORY_ENABLED в App.tsx): код в проде, но
 * показывать всем рано.
 */

export interface StoryMessage {
  /** Кто пишет: имя и роль. Живой заказчик — дешёвый и уместный источник эмоции. */
  from: string;
  /** Текст сообщения. */
  text: string;
}

export interface StoryMission {
  id: string;
  /** id существующего задания, которое крутится внутри миссии. */
  taskId: string;
  /** Трек задания — нужен, чтобы миссия шла в контексте его исполнителя и схемы. */
  track: Track;
  /** Контекстная строка брифа: место и время. Задаёт сцену одной строкой. */
  place: string;
  /** Бриф как переписка: заказчик и руководитель. Ставит задачу и даёт человеческую фактуру. */
  messages: StoryMessage[];
  /** Теория ровно перед нуждой: несколько коротких абзацев прямо перед заданием. */
  theory: string[];
  /**
   * Суждение после решения — не пересказ ответа, а вопрос «это уже ответ
   * заказчику?». Именно суждение, а не сводка, отличает историю от учебника
   * (см. разбор про выбор и суждение в исследовании вовлечения).
   */
  reflection: string[];
  /** Переход к следующей миссии: что осталось нерешённым и куда ведёт сюжет. */
  hook: string[];
}

export interface StoryCampaign {
  missions: StoryMission[];
}

const ru: StoryCampaign = {
  missions: [
    {
      id: 'first-day',
      taskId: 'sql-010',
      track: 'sql',
      place: 'Kaiyo Trading · Коммерческая аналитика · Понедельник, 9:14',
      messages: [
        {
          from: 'Аоки-сан, директор по продажам',
          text: '«Слышала, у нас новый аналитик. Хорошо — у меня вопрос, который висит уже неделю. Продажи Nettora падают, и никто не может внятно сказать почему. Завтра в 11:00 у меня встреча с брендом. Мне нужно не „всё плохо", а цифры. Начни с простого: покажи, как продажи вообще вели себя по месяцам. Я хочу видеть форму, а не одно число.»',
        },
        {
          from: 'Ваш руководитель',
          text: '«Добро пожаловать в команду. Не бросайся сразу в Nettora — сначала научись читать таблицу продаж целиком. Розница лежит в fact_sellout: одна строка — продажи товара в точке за неделю. Вытащи помесячную динамику за 2025-й. Поймёшь её форму — поймёшь и что случилось с брендом.»',
        },
      ],
      theory: [
        '«Помесячно» значит свести тысячи недельных строк в двенадцать. Это делает GROUP BY: он собирает строки в группы, а SUM складывает штуки внутри каждой.',
        'Дата хранится текстом в формате ГГГГ-ММ-ДД, поэтому первые 7 символов — это уже месяц.',
        'Дальше — сам. В запросе оставлены два пустых места.',
      ],
      reflection: [
        'Ты видишь форму: продажи держатся весь год и проваливаются в первом квартале — и это по всем брендам сразу.',
        'Обрати внимание на то, что легко проскочить: ты нашёл где просело, а не почему. «Продажи в Q1 ниже» — это ещё не ответ для Аоки-сан. Это тот же вопрос, только заданный точнее.',
      ],
      hook: [
        'Первый день закрыт. Аоки-сан ждёт завтра к 11:00, и её вопрос никуда не делся: почему именно Nettora?',
        'Провал в Q1 есть у всей категории. Но у Nettora продажи упали вдвое — это не сезон. Завтра ты разложишь падение на части и узнаешь, спрос это или полка.',
      ],
    },
  ],
};

const en: StoryCampaign = {
  missions: [
    {
      id: 'first-day',
      taskId: 'sql-010',
      track: 'sql',
      place: 'Kaiyo Trading · Commercial Analytics · Monday, 9:14',
      messages: [
        {
          from: 'Aoki, Sales Director',
          text: '"Heard we have a new analyst. Good, because I have a question that has been hanging for a week. Nettora’s sales are falling and nobody can tell me why. Tomorrow at 11:00 I meet the brand. I need numbers, not “things are bad”. Start simple: show me how sales behaved month by month. I want to see the shape, not a single number."',
        },
        {
          from: 'Your manager',
          text: '"Welcome to the team. Don’t dive straight into Nettora; first learn to read the sales table as a whole. Retail lives in fact_sellout: one row is one product’s sales in one store for one week. Pull the monthly trend for 2025. Get its shape and you will understand what happened to the brand."',
        },
      ],
      theory: [
        '"By month" means folding thousands of weekly rows into twelve. GROUP BY does that: it collects rows into groups, and SUM adds up the units within each one.',
        'Dates are stored as text in YYYY-MM-DD format, so the first 7 characters are already the month.',
        'Now it is your turn. Two spots in the query are left blank.',
      ],
      reflection: [
        'You can see the shape: sales hold all year and dip in the first quarter, and that dip is there across every brand at once.',
        'Notice what is easy to skip: you found where it dropped, not why. "Q1 sales are lower" is not yet an answer for Aoki. It is the same question, only asked more precisely.',
      ],
      hook: [
        'Day one is done. Aoki expects you tomorrow at 11:00, and her question has not gone anywhere: why Nettora specifically?',
        'The Q1 dip belongs to the whole category. But Nettora’s sales fell by half, and that is not seasonality. Tomorrow you break the decline into parts and find out whether it is demand or shelf.',
      ],
    },
  ],
};

/** Кампания режима истории для локали. Английской нет — падаем на русскую, как и story.ts. */
export function storyCampaign(locale: Locale = 'ru'): StoryCampaign {
  return locale === 'en' ? en : ru;
}
