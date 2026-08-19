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
 * **Пока это вертикальный срез: две миссии подряд, только SQL, без ветвления.**
 * Цель среза — проверить, заходит ли сама рамка «первый день на работе», прежде
 * чем строить движок состояний (последствия, ветки) и остальную кампанию.
 * Вход спрятан за `?story` (см. STORY_ENABLED в App.tsx): код в проде, но
 * показывать всем рано.
 *
 * Миссии идут по порядку массива, и порядок этот — сюжетный, а не по сложности:
 * крючок каждой миссии обещает следующую поимённо («завтра ты разложишь падение
 * на части»), поэтому переставить их местами нельзя, не переписав прозу.
 * Вторая миссия сознательно меняет род работы: первая просит написать запрос,
 * вторая — прочитать готовый разрез и назвать причину. Кампания растёт не
 * длиной запроса, а весом суждения.
 */

/**
 * Сцены заставок, которые умеет рисовать StoryArt.tsx. Список живёт здесь,
 * а не в ui: какие сцены бывают — вопрос кампании, а не рисовалки. Новый бит,
 * которому не хватает сцены, добавляет имя сюда и функцию туда.
 */
export type StoryScene = 'office' | 'groups' | 'trend' | 'split' | 'factors' | 'outlets' | 'rival';

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
  /**
   * Заставка каждой фазы, кроме задания (там всё внимание редактору).
   * Сцена принадлежит биту, а не фазе: «суждение» первой миссии — это форма
   * продаж, второй — полки, с которых бренд исчез, и общей картинки у них нет.
   */
  scenes: { brief: StoryScene; theory: StoryScene; reflection: StoryScene; hook: StoryScene };
  /**
   * Заголовок фазы теории, если общий не подходит. Общий говорит «прежде чем
   * писать», и это правда для миссии с заданием на запрос; миссия, где надо
   * не написать, а прочитать и назвать, просит своих слов.
   */
  theoryTitle?: string;
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
      scenes: { brief: 'office', theory: 'groups', reflection: 'trend', hook: 'split' },
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
        '«Помесячно» значит свести тысячи недельных строк в двенадцать. Это делает GROUP BY: он собирает строки в группы, а агрегат — SUM, COUNT, AVG — считает значение внутри каждой группы.',
        'Как это выглядит на другом вопросе — «сколько товаров и какая средняя цена в каждом дивизионе»:\n\nSELECT division,\n       COUNT(*) AS sku_count,\n       AVG(list_price) AS avg_price\nFROM dim_product\nGROUP BY division\n\nАгрегат всегда стоит перед мерой: COUNT(*), AVG(list_price). Группируют по разрезу — здесь division.',
        'В твоём задании разрез — месяц (substr(week_start, 1, 7)), а сложить нужно штуки (units). Два места оставлены пустыми: чем считаем и по чему группируем. GROUP BY 1 — это «по первой колонке», чтобы не повторять выражение.',
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
    /*
     * Вторая миссия — те же сутки плюс одни, и сознательно другой род работы.
     * В первой человек писал запрос (fill), здесь запрос уже написан, а от него
     * требуется суждение по готовому разрезу (predict, sql-023). Это не шаг
     * вниз по сложности: назвать виновника и удержать имя под вопросами —
     * ровно то, чем работа аналитика отличается от работы с синтаксисом,
     * и ровно то, чего не хватило в конце первой миссии («ты нашёл где, а не
     * почему»). Бит выбран первым, задание подтянуто под него.
     */
    {
      id: 'shelf-or-demand',
      taskId: 'sql-023',
      track: 'sql',
      place: 'Kaiyo Trading · Коммерческая аналитика · Вторник, 9:40',
      scenes: { brief: 'office', theory: 'factors', reflection: 'outlets', hook: 'rival' },
      messages: [
        {
          from: 'Аоки-сан, директор по продажам',
          text: '«Встреча через час двадцать. Твою помесячную динамику я посмотрела — форма понятна, спасибо. Но бренд придёт спрашивать не про форму. Мне нужно одно предложение: почему Nettora упала вдвое. И мне нужно знать, к кому с этим идти — к маркетингу, к ценообразованию или к своим полевым. Прийти на встречу с четырьмя версиями хуже, чем не прийти вовсе.»',
        },
        {
          from: 'Ваш руководитель',
          text: '«Не ищи причину внутри одного числа — разложи его. Штуки — это число точек, где бренд стоит, умноженное на продажи в одной точке. Разрез по первым кварталам трёх лет я уже собрал, он в задании над запросом. Сегодня от тебя нужен не запрос, а суждение: назвать виновника и удержать это имя под вопросами. Ошибёшься — Аоки-сан в 11:00 постучит не в ту дверь.»',
        },
      ],
      theoryTitle: 'Прежде чем судить — одна идея',
      theory: [
        'Любое падение раскладывается на множители, и это единственный способ спорить о причинах не наугад. Штуки = число точек × продажи на точку. Выручка = штуки × цена. Пока число целое, версий у него столько же, сколько людей в переговорной; как только оно разложено, вопрос сводится к одному: какой множитель поехал.',
        'Как это читается — на другом случае. Бренд продавал 1000 штук в месяц, стало 500. Раскладываем: точек было 50, стало 48 — почти не изменилось; продаж на точку было 20, стало 10.4 — ровно вдвое. Полка на месте, а берут с неё вдвое меньше: это спрос, и разговор пойдёт с маркетингом. Была бы обратная картина — точек 50 против 24 при тех же 20 на точку — виноват доступ, и разговор пойдёт с полевой командой.',
        'В задании разрез уже посчитан и стоит над запросом: по первым кварталам 2024, 2025 и 2026 — штуки, число точек, продажи на точку и средняя цена. Сравнивай 2024 с 2026 и ищи множитель, который изменился сильнее остальных.',
      ],
      reflection: [
        'Точек было 79, стало 37 — больше половины полок бренд потерял. Продажи в одной точке при этом почти не двинулись: 127.9 против 116.4, обычные колебания. Там, где Nettora ещё стоит, её берут как брали.',
        'Вот теперь это ответ, а не уточнённый вопрос. У него есть не только виновник, но и владелец: не маркетинг и не цена, а переговоры с сетями и работа полевой команды. Заметь, что изменилось за сутки — вчера ты назвал где просело, сегодня почему и к кому с этим идти.',
      ],
      hook: [
        'Аоки-сан уходит на встречу в 11:00 с одним предложением и четырьмя числами за ним. Это и есть работа аналитика: не отчёт, а решение, которое кто-то может принять.',
        'Остался вопрос, которого в этих числах нет: почему сорок две точки перестали брать Nettora. Полка не пустует — если бренд с неё ушёл, значит место занял кто-то другой. Кто именно, ты пока не знаешь.',
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
      scenes: { brief: 'office', theory: 'groups', reflection: 'trend', hook: 'split' },
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
        '"By month" means folding thousands of weekly rows into twelve. GROUP BY does that: it collects rows into groups, and an aggregate (SUM, COUNT, AVG) computes a value within each group.',
        'Here is the shape on a different question, "how many products and what average price in each division":\n\nSELECT division,\n       COUNT(*) AS sku_count,\n       AVG(list_price) AS avg_price\nFROM dim_product\nGROUP BY division\n\nThe aggregate always sits in front of the measure: COUNT(*), AVG(list_price). You group by the dimension, here division.',
        'In your task the dimension is the month (substr(week_start, 1, 7)) and the thing to add up is units. Two spots are left blank: what to compute with, and what to group by. GROUP BY 1 means "by the first column", so you do not repeat the expression.',
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
    /* Про выбор задания и род работы см. комментарий к этой миссии в русской кампании выше. */
    {
      id: 'shelf-or-demand',
      taskId: 'sql-023',
      track: 'sql',
      place: 'Kaiyo Trading · Commercial Analytics · Tuesday, 9:40',
      scenes: { brief: 'office', theory: 'factors', reflection: 'outlets', hook: 'rival' },
      messages: [
        {
          from: 'Aoki, Sales Director',
          text: '"The meeting is in an hour and twenty minutes. I looked at your monthly trend and the shape is clear, thank you. But the brand is not coming to ask about shapes. I need one sentence: why Nettora fell by half. And I need to know whose door to knock on, marketing, pricing, or my own field team. Walking in with four theories is worse than not walking in at all."',
        },
        {
          from: 'Your manager',
          text: '"Do not look for the cause inside a single number, break it apart. Units are the number of outlets carrying the brand multiplied by sales in one outlet. I already pulled the split across the first quarters of three years, and it sits above the query in your task. Today I need a judgment from you rather than a query: name the culprit and hold that name under questioning. Get it wrong and Aoki knocks on the wrong door at 11:00."',
        },
      ],
      theoryTitle: 'One idea before you judge',
      theory: [
        'Any decline breaks into factors, and that is the only way to argue about causes without guessing. Units = outlets × sales per outlet. Revenue = units × price. While the number stays whole it carries as many theories as there are people in the room; once it is broken apart the question narrows to one: which factor moved.',
        'Here is how that reads on a different case. A brand sold 1000 units a month and now sells 500. Break it apart: outlets went from 50 to 48, barely a change; sales per outlet went from 20 to 10.4, exactly half. The shelf is intact and people take half as much from it, so that is demand and the conversation goes to marketing. Flip the picture, outlets 50 against 24 with the same 20 per outlet, and the culprit is access, so the conversation goes to the field team.',
        'In your task the split is already computed and sits above the query: first quarters of 2024, 2025 and 2026, with units, outlets, sales per outlet and average price. Compare 2024 with 2026 and find the factor that moved more than the rest.',
      ],
      reflection: [
        'Outlets went from 79 to 37, so the brand lost more than half of its shelves. Sales in a single outlet barely moved, 127.9 against 116.4, ordinary fluctuation. Where Nettora is still on the shelf, people buy it the way they always did.',
        'Now this is an answer rather than a sharper question. It has a culprit and it has an owner: not marketing and not price, but negotiations with the chains and the work of the field team. Notice what changed in a day. Yesterday you named where sales dropped; today you named why, and whose problem it is.',
      ],
      hook: [
        'Aoki walks into her 11:00 with one sentence and four numbers behind it. That is the job: not a report, but a decision somebody can act on.',
        'One question is not in those numbers: why forty two outlets stopped carrying Nettora. A shelf does not stay empty, so if the brand left it, somebody else took the space. Who exactly, you do not know yet.',
      ],
    },
  ],
};

/** Кампания режима истории для локали. Английской нет — падаем на русскую, как и story.ts. */
export function storyCampaign(locale: Locale = 'ru'): StoryCampaign {
  return locale === 'en' ? en : ru;
}
