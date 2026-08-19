import type { Locale } from '../i18n/context';
import type { Track } from './types';

/**
 * Режим истории — сквозная сюжетная кампания, а НЕ выведенная из графа линия.
 *
 * Это сознательно другая сущность, чем сюжетная линия (src/story/line.ts +
 * story.ts). Линия выводится из предпосылок: её состав и порядок — следствие
 * графа, руками пишется только связка. Здесь наоборот: миссия написана целиком
 * руками, а из существующего берутся только задания, которые крутятся внутри
 * неё через обычный движок (TaskView). Всё остальное — бриф голосом заказчика,
 * подводки ровно перед нуждой, суждение после работы и переход к следующему
 * дню — это нарратив, которого из графа не выведешь.
 *
 * **Почему миссия ссылается на задания по id, а не несёт свой контент.**
 * Правильность задания проверяется исполнением: эталон прогоняется движком,
 * числа в разборе сверяются с датасетом (см. verify-content.mjs). Заводить
 * копию задания внутри истории значило бы завести второй, непроверяемый
 * источник правды рядом с проверяемым. Миссия берёт задания из пака как есть
 * и лишь оборачивает их в сюжет.
 *
 * **Единица кампании — рабочий день, и в дне несколько заданий.**
 * Сначала день держал ровно одно задание, и на пяти заданиях подряд это
 * развалилось: между «помесячной динамикой» одной таблицы и разбором падения
 * с двумя JOIN человек получал четыре новые конструкции разом. Лестницу
 * пришлось разложить на неделю — понедельник учит доставать строки, вторник
 * считать, среда открывает продажи, четверг соединяет таблицы, и только
 * в пятницу, где не появляется ни одной новой конструкции, спрашивают
 * суждение. Из этого же следует ритм прозы: бриф и крючок — раз в день,
 * перед заданием одна-две фразы, и полноценная теория только там, где
 * вводится настоящая новая идея.
 *
 * **Порядок дней сюжетный, а не по сложности.** Крючок каждого дня называет
 * следующий поимённо («завтра откроем fact_sellout»), поэтому переставить
 * дни нельзя, не переписав прозу.
 *
 * **Пока это вертикальный срез: одна неделя, только SQL, без ветвления.**
 * Вход спрятан за `?story` (см. STORY_ENABLED в App.tsx): код в проде, но
 * показывать всем рано.
 */

/**
 * Сцены заставок, которые умеет рисовать StoryArt.tsx. Список живёт здесь,
 * а не в ui: какие сцены бывают — вопрос кампании, а не рисовалки. Новый бит,
 * которому не хватает сцены, добавляет имя сюда и функцию туда.
 */
export type StoryScene =
  // рабочее место: общий кадр начала дня
  | 'office'
  | 'desk'
  // приёмы, которые вводит подводка
  | 'catalog'
  | 'filter'
  | 'sort'
  | 'fold'
  | 'counts'
  | 'groups'
  | 'calendar'
  | 'stray'
  | 'tables'
  | 'join'
  | 'dropped'
  | 'threshold'
  | 'factors'
  // находки и повороты сюжета
  | 'toolkit'
  | 'foundation'
  | 'coverage'
  | 'sellout'
  | 'trend'
  | 'split'
  | 'meeting'
  | 'outlets'
  | 'rival';

export interface StoryMessage {
  /** Кто пишет: имя и роль. Живой заказчик — дешёвый и уместный источник эмоции. */
  from: string;
  /** Текст сообщения. */
  text: string;
}

/**
 * Экран перед заданием.
 *
 * Один тип на две очень разные вещи — и это намеренно. Там, где задание просто
 * следующее в дне, здесь одна фраза без картинки и без заголовка; там, где
 * вводится новая идея (группировка, соединение, разложение на множители), —
 * полноценная теория с заставкой и разобранным примером. Разводить их в два
 * типа значило бы решать за автора, какой длины бывает подводка.
 *
 * Заставка необязательна и по умолчанию её нет: на дне из семи экранов
 * картинка над каждым перестаёт что-либо значить. Картинка открывает момент —
 * начало дня, новую идею, вывод, — а не сопровождает абзац.
 */
export interface StoryIntro {
  scene?: StoryScene;
  /** Заголовок экрана. Без него экран идёт одной прозой — так и задумано для коротких подводок. */
  title?: string;
  paras: string[];
}

export interface StoryStep {
  /** id существующего задания, которое крутится на этом шаге. */
  taskId: string;
  intro?: StoryIntro;
}

export interface StoryMission {
  id: string;
  /**
   * Короткая метка дня для полосы дела («Пн»). Полоса должна помещаться
   * на 320 пикселях в пять делений, поэтому метка именно короткая, а не
   * название дня целиком.
   */
  short: string;
  /**
   * Что этот день установил — одна строка в папку дела.
   *
   * Показывается не в своём дне, а в брифах следующих: смысл в том, чтобы
   * каждое утро начиналось с растущего списка уже известного. Пишется
   * как факт расследования, а не как перечень выученных приёмов: «продаж
   * в прайсе нет», а не «изучили SELECT».
   */
  found: string;
  /** Трек заданий — нужен, чтобы миссия шла в контексте его исполнителя и схемы. */
  track: Track;
  /** Контекстная строка брифа: место и время. Задаёт сцену одной строкой. */
  place: string;
  /**
   * Заставки трёх экранов дня, каждая необязательна (см. StoryIntro о том,
   * почему картинка не полагается каждому экрану).
   */
  scenes: { brief?: StoryScene; reflection?: StoryScene; hook?: StoryScene };
  /** Бриф как переписка: заказчик и руководитель. Ставит задачу дня и даёт человеческую фактуру. */
  messages: StoryMessage[];
  /** Задания дня по порядку, каждое со своей подводкой. */
  steps: StoryStep[];
  /**
   * Суждение после работы — не пересказ ответов, а вопрос «это уже ответ
   * заказчику?». Именно суждение, а не сводка, отличает историю от учебника
   * (см. разбор про выбор и суждение в исследовании вовлечения).
   */
  reflection: string[];
  /** Переход к следующему дню: что осталось нерешённым и куда ведёт сюжет. */
  hook: string[];
}

export interface StoryCampaign {
  /**
   * Вопрос расследования — стоит над каждым экраном кампании.
   *
   * Он существует ровно затем, чтобы на третьем задании вторника человек
   * помнил, зачем считает средние цены по брендам. Задание видно, а цель —
   * нет, и без напоминания неделя рассыпается на дюжину упражнений.
   */
  question: string;
  missions: StoryMission[];
}

const ru: StoryCampaign = {
  question: 'Почему продажи Nettora упали вдвое — и к кому с этим идти?',
  missions: [
    /*
     * Понедельник. Ни одного вопроса про Nettora по существу — день целиком
     * про инструмент. Это и есть ответ на скачок: до пятницы человек должен
     * успеть увидеть каждую конструкцию пятничного запроса по отдельности.
     */
    {
      id: 'day-1-first-day',
      track: 'sql',
      place: 'Kaiyo Trading · Коммерческая аналитика · Понедельник, 9:14',
      short: 'Пн',
      found: 'Прайс читается насквозь: колонки, отбор, сортировка. Продаж в нём нет ни одной.',
      scenes: { brief: 'office', reflection: 'toolkit', hook: 'tables' },
      messages: [
        {
          from: 'Аоки-сан, директор по продажам',
          text: '«Слышала, у нас новый аналитик. Хорошо — у меня вопрос, который висит уже неделю. Продажи Nettora падают, и никто не может внятно сказать почему. В пятницу в 11:00 у меня встреча с брендом, и прийти туда со словами „всё плохо" я не могу. Мне нужны цифры и одно внятное объяснение. Неделя у тебя есть.»',
        },
        {
          from: 'Ваш руководитель',
          text: '«Добро пожаловать в команду. В Nettora не бросайся — до пятницы дойдём, и по дороге станет понятно почему. Сначала научись доставать данные вообще: половина рабочих вопросов решается тем, что ты умеешь читать таблицы. Начни с прайса, dim_product: это наш ассортимент, одна строка — один товар.»',
        },
      ],
      steps: [
        {
          taskId: 'sql-001',
          intro: {
            scene: 'catalog',
            title: 'Из чего состоит запрос',
            paras: [
              'Запрос к базе — это два ответа на два вопроса: что показать и откуда взять. SELECT перечисляет колонки, FROM называет таблицу. Всё остальное, что ты увидишь на этой неделе, — уточнения поверх этих двух слов.',
              'Колонку можно переименовать на выходе: list_price AS price вернёт те же числа, но в отчёте они пойдут под коротким именем. Это не косметика — заголовки колонок читают люди, а не только движок.',
            ],
          },
        },
        {
          taskId: 'sql-003',
          intro: {
            scene: 'filter',
            paras: [
              'Теперь то же самое, но не всё подряд: в каталог берут не весь ассортимент, а два бренда и только позиции дороже сотни. Строки отбирает WHERE, и стоит он после FROM.',
            ],
          },
        },
        {
          taskId: 'sql-004',
          intro: {
            scene: 'sort',
            paras: [
              'И последнее на сегодня — порядок. ORDER BY сортирует, LIMIT обрезает; вдвоём они отвечают на любой вопрос вида «покажи верхние десять».',
            ],
          },
        },
      ],
      reflection: [
        'За день ты собрал три вещи, из которых состоит примерно половина рабочих запросов: достать колонки, отобрать строки, упорядочить результат.',
        'Заметь, чего среди них нет. Ты видел, что мы продаём, но ни разу не видел, сколько продали: цена в прайсе — это ценник, а не продажа. Вопрос Аоки-сан живёт в другой таблице, и до неё мы ещё не дошли.',
      ],
      hook: [
        'Первый день закрыт. До встречи четыре дня, а вопрос «почему упала Nettora» не сдвинулся ни на шаг — и это нормально: сегодня ты учился держать инструмент, а не отвечать.',
        'Завтра начнём считать. Не перечислять строки, а получать из них числа: сколько позиций, сколько брендов, сколько точек. Без этого с директором по продажам разговаривать не о чем.',
      ],
    },

    /*
     * Вторник. Здесь вводится COUNT(DISTINCT) — конструкция, которая в первой
     * версии кампании появлялась в пятничном запросе из ниоткуда. Подводка
     * к ней намеренно ссылается вперёд, на пятницу: неделя должна читаться
     * как одно движение, а не как пять несвязанных дней.
     */
    {
      id: 'day-2-counting',
      track: 'sql',
      place: 'Kaiyo Trading · Коммерческая аналитика · Вторник, 9:20',
      short: 'Вт',
      found: 'Считать по разрезам умеем. «Сколько продали» и «в скольких точках продавали» — разные числа.',
      scenes: { brief: 'desk', reflection: 'foundation', hook: 'sellout' },
      messages: [
        {
          from: 'Ваш руководитель',
          text: '«Вчера ты доставал строки. Сегодня будешь получать из них числа — это разные умения, и второе в нашей работе важнее. Аоки-сан никогда не спросит „покажи все товары Nettora"; она спросит „сколько их" и „в скольких точках они стоят".»',
        },
        {
          from: 'Аоки-сан, директор по продажам',
          text: '«Кстати, к пятнице: сколько у нас вообще позиций в FMCG и сколько брендов? Хочу понимать масштаб, прежде чем разговаривать про один бренд.»',
        },
      ],
      steps: [
        {
          taskId: 'sql-008',
          intro: {
            scene: 'fold',
            paras: [
              'Агрегат — функция, которая из многих строк делает одно число: COUNT считает строки, AVG усредняет, MIN и MAX берут края. Без GROUP BY агрегат сворачивает всю таблицу в одну-единственную строку — ровно то, что просит Аоки-сан.',
            ],
          },
        },
        {
          taskId: 'sql-007',
          intro: {
            scene: 'counts',
            title: 'Три вопроса, которые выглядят одинаково',
            paras: [
              'Осторожно с самым простым. COUNT(*) считает строки. COUNT(колонка) считает строки, где в этой колонке что-то есть. COUNT(DISTINCT колонка) считает разные значения. Три разных вопроса, три разных числа, и перепутать их легче, чем кажется.',
              'Это не мелочь на потом: «в скольких точках продавали бренд» — это в точности COUNT(DISTINCT customer_id), и к пятнице оно нам понадобится.',
            ],
          },
        },
        {
          taskId: 'sql-009',
          intro: {
            scene: 'groups',
            title: 'Одно число на группу',
            paras: [
              'Агрегат считает по всей таблице сразу. GROUP BY разрезает её на группы и заставляет агрегат посчитать внутри каждой отдельно: одна строка результата на одну группу.',
              'Разрез стоит в GROUP BY, а в SELECT рядом с ним — только он сам и агрегаты. Колонка мимо этого правила ошибка, и завтра ты своими глазами увидишь, что с ней делает движок.',
            ],
          },
        },
      ],
      reflection: [
        'Сегодняшнее — фундамент всего, что дальше: агрегат сворачивает многое в одно, GROUP BY говорит, по какому разрезу сворачивать. Дальше на этой неделе не будет ни одного запроса без них.',
        'И одна вещь, которая понадобится в пятницу дословно. «Сколько раз продали» и «в скольких точках продавали» — это два разных COUNT. Пока это просто две разные функции; в пятницу окажется, что это два разных объяснения.',
      ],
      hook: [
        'Второй день закрыт. Считать ты умеешь, но считал пока по прайсу — по тому, что мы продаём, а не по тому, как оно продаётся.',
        'Завтра открываем fact_sellout: розничные продажи, одна строка — товар в одной точке за одну неделю. Оттуда и начнётся разговор про Nettora.',
      ],
    },

    /*
     * Среда. Бывшая первая миссия целиком: та же теория группировки и то же
     * суждение про форму года. Разобранный пример в подводке теперь ссылается
     * на вчерашнее задание человека, а не на абстрактный dim_product, —
     * первая ступень лесов, которую однажды срезали и получили новичка,
     * вписывающего колонку на место функции.
     */
    {
      id: 'day-3-shape-of-the-year',
      track: 'sql',
      place: 'Kaiyo Trading · Коммерческая аналитика · Среда, 9:05',
      short: 'Ср',
      found: 'Форма года найдена: провал в первом квартале. Но он у всей категории, а не у одной Nettora.',
      scenes: { brief: 'desk', reflection: 'trend', hook: 'split' },
      messages: [
        {
          from: 'Аоки-сан, директор по продажам',
          text: '«Начни с простого: покажи, как продажи вообще вели себя по месяцам за прошлый год. Я хочу видеть форму, а не одно число. Форма расскажет больше, чем любое среднее.»',
        },
        {
          from: 'Ваш руководитель',
          text: '«Розница лежит в fact_sellout: одна строка — продажи товара в точке за неделю. Недель в году пятьдесят две, строк — сотни тысяч. Сверни их в двенадцать месяцев тем же GROUP BY, что вчера, и посмотри, что получится.»',
        },
      ],
      steps: [
        {
          taskId: 'sql-010',
          intro: {
            scene: 'calendar',
            title: 'Группировать по тому, чего в таблице нет',
            paras: [
              'Месяца в таблице нет — есть неделя, week_start, вида 2025-03-17. Но первые семь символов этой строки и есть месяц: substr(week_start, 1, 7) даёт 2025-03.',
              'Группировать можно не только по колонке, но и по выражению. Чтобы не повторять его дважды, пишут GROUP BY 1 — «по первой колонке в SELECT».',
              'Как это выглядело вчера, на ассортименте по брендам:\n\nSELECT brand,\n       COUNT(*) AS sku_count,\n       AVG(list_price) AS avg_price\nFROM dim_product\nGROUP BY brand\n\nАгрегат всегда стоит перед мерой: COUNT(*), AVG(list_price). В твоём задании два места оставлены пустыми — чем считаем штуки и по чему группируем.',
            ],
          },
        },
        {
          taskId: 'sql-035',
          intro: {
            scene: 'stray',
            paras: [
              'И сразу та ловушка, о которой вчера предупреждали: что будет, если рядом с агрегатом поставить колонку, которой нет в GROUP BY. Ответ зависит от движка, и это само по себе стоит знать.',
            ],
          },
        },
      ],
      reflection: [
        'Ты видишь форму: продажи держатся весь год и проваливаются в первом квартале — и это по всем брендам сразу.',
        'Обрати внимание на то, что легко проскочить: ты нашёл где просело, а не почему. И нашёл по всей рознице разом, а Аоки-сан спрашивает про один бренд.',
      ],
      hook: [
        'Провал в Q1 есть у всей категории — это сезон, и нести его на встречу бессмысленно: сезон одинаков для всех, включая конкурентов.',
        'А у Nettora продажи упали вдвое, и вдвое — это уже не сезон. Завтра надо будет отделить один бренд от остальных. Загвоздка в том, что бренда в таблице продаж нет.',
      ],
    },

    /*
     * Четверг. Последняя ступень перед пятницей: соединение, его цена
     * и точки как метрика. После этого дня в пятничном запросе не остаётся
     * ни одной конструкции, которую человек видит впервые.
     */
    {
      id: 'day-4-join',
      track: 'sql',
      place: 'Kaiyo Trading · Коммерческая аналитика · Четверг, 9:30',
      short: 'Чт',
      found: 'Бренд соединяется с продажами. На руках выручка бренда и число точек, где он стоит.',
      scenes: { brief: 'desk', reflection: 'coverage', hook: 'meeting' },
      messages: [
        {
          from: 'Ваш руководитель',
          text: '«Вчерашний запрос считает всю розницу разом, и по-другому он не умеет: в fact_sellout нет ни бренда, ни названия товара — только product_id. Бренд лежит в dim_product. Сегодня научишься соединять таблицы; без этого про Nettora не скажешь вообще ничего.»',
        },
        {
          from: 'Аоки-сан, директор по продажам',
          text: '«И посчитай заодно, в скольких точках вообще стоят наши бренды. Завтра мне понадобится не только выручка — выручка без охвата ничего не объясняет.»',
        },
      ],
      steps: [
        {
          taskId: 'sql-012',
          intro: {
            scene: 'join',
            title: 'Две таблицы и общий ключ',
            paras: [
              'Таблицы связаны ключами. В fact_sellout у каждой строки стоит product_id, и ровно такой же product_id есть в dim_product. JOIN подставляет к каждой строке продаж её товар — а вместе с ним бренд, название и цену.',
              'Пишется это так:\n\nFROM fact_sellout f\nJOIN dim_product p ON p.product_id = f.product_id\n\nУсловие после ON и есть «по какому ключу совпадать». Короткие имена f и p — псевдонимы таблиц: без них пришлось бы писать полное имя перед каждой колонкой.',
            ],
          },
        },
        {
          taskId: 'sql-037',
          intro: {
            scene: 'dropped',
            paras: [
              'У соединения есть цена, и узнать её лучше сразу, на маленьком примере: строки, которым не нашлось пары, исчезают из результата молча — без ошибки и без предупреждения.',
            ],
          },
        },
        {
          taskId: 'sql-049',
          intro: {
            scene: 'threshold',
            title: 'Фильтр, который считает после группировки',
            paras: [
              'И то, о чём просила Аоки-сан: бренды, у которых одновременно большая выручка и широкий охват. Охват — это число разных точек, COUNT(DISTINCT customer_id): вторничная функция на новой таблице.',
              'Фильтровать по агрегату WHERE не умеет — он отбирает строки до группировки, а выручка бренда появляется только после неё. Для этого есть HAVING: тот же фильтр, но после GROUP BY.',
            ],
          },
        },
      ],
      reflection: [
        'Теперь у тебя есть оба языка сразу: выручка бренда и число точек, в которых он стоит. Второе выглядит служебной подробностью, но это полноценная метрика — в FMCG её зовут дистрибуцией, и за неё отвечают живые люди.',
        'До сих пор все вопросы недели были «сколько». Завтра будет первый вопрос «почему», и вот на него одним числом не отвечают.',
      ],
      hook: [
        'Четвёртый день закрыт. Завтра в 11:00 Аоки-сан идёт к бренду, и объяснения у неё до сих пор нет — есть форма года и понимание, что падение глубже сезона.',
        'Завтра ты его дашь. Инструменты собраны все: соединить, сгруппировать, посчитать точки. Останется то, чего ни один из них не делает, — назвать причину и удержать её под вопросами.',
      ],
    },

    /*
     * Пятница. Единственный день недели, где не вводится ни одной новой
     * конструкции: запрос в задании собран из понедельничного SELECT,
     * вторничного COUNT(DISTINCT), средней группировки и четвергового JOIN.
     * Ровно поэтому от человека здесь просят не запрос, а суждение —
     * кампания растёт весом суждения, а не длиной запроса.
     */
    {
      id: 'day-5-shelf-or-demand',
      track: 'sql',
      place: 'Kaiyo Trading · Коммерческая аналитика · Пятница, 9:40',
      short: 'Пт',
      found: 'Причина названа: бренд потерял полку, а не спрос. Владелец проблемы — полевая команда.',
      scenes: { brief: 'office', reflection: 'outlets', hook: 'rival' },
      messages: [
        {
          from: 'Аоки-сан, директор по продажам',
          text: '«Встреча через час двадцать. Всю неделю я жду одного предложения: почему Nettora упала вдвое. И мне нужно знать, к кому с этим идти — к маркетингу, к ценообразованию или к своим полевым. Прийти на встречу с четырьмя версиями хуже, чем не прийти вовсе.»',
        },
        {
          from: 'Ваш руководитель',
          text: '«Не ищи причину внутри одного числа — разложи его. Штуки — это число точек, где бренд стоит, умноженное на продажи в одной точке. Разрез по первым кварталам трёх лет я уже собрал, он в задании над запросом; собран он ровно из того, что ты делал вчера и позавчера. Сегодня от тебя нужен не запрос, а суждение: назвать виновника и удержать это имя под вопросами. Ошибёшься — Аоки-сан в 11:00 постучит не в ту дверь.»',
        },
      ],
      steps: [
        {
          taskId: 'sql-023',
          intro: {
            scene: 'factors',
            title: 'Прежде чем судить — одна идея',
            paras: [
              'Любое падение раскладывается на множители, и это единственный способ спорить о причинах не наугад. Штуки = число точек × продажи на точку. Выручка = штуки × цена. Пока число целое, версий у него столько же, сколько людей в переговорной; как только оно разложено, вопрос сводится к одному: какой множитель поехал.',
              'Как это читается — на другом случае. Бренд продавал 1000 штук в месяц, стало 500. Раскладываем: точек было 50, стало 48 — почти не изменилось; продаж на точку было 20, стало 10.4 — ровно вдвое. Полка на месте, а берут с неё вдвое меньше: это спрос, и разговор пойдёт с маркетингом. Была бы обратная картина — точек 50 против 24 при тех же 20 на точку — виноват доступ, и разговор пойдёт с полевой командой.',
              'В задании разрез уже посчитан и стоит над запросом: по первым кварталам 2024, 2025 и 2026 — штуки, число точек, продажи на точку и средняя цена. Сам запрос читается целиком: JOIN из четверга, COUNT(DISTINCT) из вторника, GROUP BY из среды. Сравнивай 2024 с 2026 и ищи множитель, который изменился сильнее остальных.',
            ],
          },
        },
      ],
      reflection: [
        'Точек было 79, стало 37 — больше половины полок бренд потерял. Продажи в одной точке при этом почти не двинулись: 127.9 против 116.4, обычные колебания. Там, где Nettora ещё стоит, её берут как брали.',
        'Вот теперь это ответ, а не уточнённый вопрос. У него есть не только виновник, но и владелец: не маркетинг и не цена, а переговоры с сетями и работа полевой команды. Заметь, что изменилось за неделю — в понедельник ты не мог достать даже список товаров, сегодня называешь причину падения и адресата.',
      ],
      hook: [
        'Аоки-сан уходит на встречу в 11:00 с одним предложением и четырьмя числами за ним. Это и есть работа аналитика: не отчёт, а решение, которое кто-то может принять.',
        'Остался вопрос, которого в этих числах нет: почему сорок две точки перестали брать Nettora. Полка не пустует — если бренд с неё ушёл, значит место занял кто-то другой. Кто именно, ты пока не знаешь.',
      ],
    },
  ],
};

const en: StoryCampaign = {
  question: 'Why did Nettora sales fall by half, and whose door do we knock on?',
  missions: [
    /* Про устройство недели и выбор заданий см. комментарии в русской кампании выше. */
    {
      id: 'day-1-first-day',
      track: 'sql',
      place: 'Kaiyo Trading · Commercial Analytics · Monday, 9:14',
      short: 'Mon',
      found: 'The price list reads end to end: columns, filter, order. It holds no sales at all.',
      scenes: { brief: 'office', reflection: 'toolkit', hook: 'tables' },
      messages: [
        {
          from: 'Aoki, Sales Director',
          text: '"Heard we have a new analyst. Good, because I have a question that has been hanging for a week. Nettora sales are falling and nobody can tell me why. On Friday at 11:00 I meet the brand, and I cannot walk in there saying things are bad. I need numbers and one clear explanation. You have a week."',
        },
        {
          from: 'Your manager',
          text: '"Welcome to the team. Do not dive straight into Nettora; we will get there by Friday and you will see why the detour was worth it. First learn to pull data at all: half the questions in this job are solved by being able to read the tables. Start with the price list, dim_product. That is our assortment, one row per product."',
        },
      ],
      steps: [
        {
          taskId: 'sql-001',
          intro: {
            scene: 'catalog',
            title: 'What a query is made of',
            paras: [
              'A query answers two questions: what to show and where to take it from. SELECT lists the columns, FROM names the table. Everything else you meet this week is a refinement on top of those two words.',
              'A column can be renamed on the way out: list_price AS price returns the same numbers under a shorter heading. That is not decoration. Column headings are read by people, not only by the engine.',
            ],
          },
        },
        {
          taskId: 'sql-003',
          intro: {
            scene: 'filter',
            paras: [
              'Now the same thing, but not everything at once: the catalog takes two brands only, and only items above a hundred. Rows are picked by WHERE, which comes after FROM.',
            ],
          },
        },
        {
          taskId: 'sql-004',
          intro: {
            scene: 'sort',
            paras: [
              'One more thing today: order. ORDER BY sorts, LIMIT cuts, and together they answer any question shaped like "show me the top ten".',
            ],
          },
        },
      ],
      reflection: [
        'In one day you collected the three things that make up roughly half of all working queries: pull the columns, pick the rows, order the result.',
        'Notice what is missing. You saw what we sell and never once saw how much we sold: a price in the price list is a tag, not a sale. Aoki question lives in a different table, and you have not reached it yet.',
      ],
      hook: [
        'Day one is done. Four days until the meeting, and the question of why Nettora fell has not moved an inch. That is fine: today you were learning to hold the tool, not to answer.',
        'Tomorrow we start counting. Not listing rows but getting numbers out of them: how many items, how many brands, how many outlets. Without that there is nothing to discuss with a sales director.',
      ],
    },

    {
      id: 'day-2-counting',
      track: 'sql',
      place: 'Kaiyo Trading · Commercial Analytics · Tuesday, 9:20',
      short: 'Tue',
      found: 'We can count by dimension. "How many sales" and "in how many outlets" are different numbers.',
      scenes: { brief: 'desk', reflection: 'foundation', hook: 'sellout' },
      messages: [
        {
          from: 'Your manager',
          text: '"Yesterday you pulled rows. Today you will get numbers out of them, and in this job the second skill matters more. Aoki will never ask you to show all Nettora products; she will ask how many there are and in how many outlets they sit."',
        },
        {
          from: 'Aoki, Sales Director',
          text: '"While you are at it, for Friday: how many items do we carry in FMCG and how many brands? I want a sense of the scale before we talk about one brand."',
        },
      ],
      steps: [
        {
          taskId: 'sql-008',
          intro: {
            scene: 'fold',
            paras: [
              'An aggregate is a function that turns many rows into one number: COUNT counts rows, AVG averages, MIN and MAX take the edges. Without GROUP BY an aggregate folds the whole table into a single row, which is exactly what Aoki asked for.',
            ],
          },
        },
        {
          taskId: 'sql-007',
          intro: {
            scene: 'counts',
            title: 'Three questions that look identical',
            paras: [
              'Be careful with the simplest one. COUNT(*) counts rows. COUNT(column) counts rows where that column holds something. COUNT(DISTINCT column) counts different values. Three different questions, three different numbers, and they are easier to mix up than they look.',
              'This is not a detail for later: "in how many outlets did the brand sell" is exactly COUNT(DISTINCT customer_id), and by Friday we will need it.',
            ],
          },
        },
        {
          taskId: 'sql-009',
          intro: {
            scene: 'groups',
            title: 'One number per group',
            paras: [
              'An aggregate counts across the whole table at once. GROUP BY cuts the table into groups and makes the aggregate count inside each one separately: one result row per group.',
              'The dimension sits in GROUP BY, and next to it in SELECT there are only the dimension itself and aggregates. A column outside that rule is an error, and tomorrow you will see for yourself what the engine does with it.',
            ],
          },
        },
      ],
      reflection: [
        'Today is the foundation of everything that follows: an aggregate folds many into one, GROUP BY says along which dimension to fold. There will not be a single query this week without them.',
        'And one thing you will need on Friday word for word. "How many times we sold" and "in how many outlets we sold" are two different COUNTs. For now they are just two functions; on Friday they turn out to be two different explanations.',
      ],
      hook: [
        'Day two is done. You can count, but so far you counted the price list: what we sell, not how it sells.',
        'Tomorrow we open fact_sellout, the retail sales table, one row per product in one outlet for one week. That is where the Nettora conversation begins.',
      ],
    },

    {
      id: 'day-3-shape-of-the-year',
      track: 'sql',
      place: 'Kaiyo Trading · Commercial Analytics · Wednesday, 9:05',
      short: 'Wed',
      found: 'The shape of the year is found: a first quarter dip. But it belongs to the whole category, not to Nettora.',
      scenes: { brief: 'desk', reflection: 'trend', hook: 'split' },
      messages: [
        {
          from: 'Aoki, Sales Director',
          text: '"Start simple: show me how sales behaved month by month last year. I want to see the shape, not a single number. A shape says more than any average."',
        },
        {
          from: 'Your manager',
          text: '"Retail lives in fact_sellout: one row is one product in one outlet for one week. Fifty two weeks in a year, hundreds of thousands of rows. Fold them into twelve months with the same GROUP BY you used yesterday and see what comes out."',
        },
      ],
      steps: [
        {
          taskId: 'sql-010',
          intro: {
            scene: 'calendar',
            title: 'Grouping by something the table does not hold',
            paras: [
              'There is no month in the table, only a week, week_start, shaped like 2025-03-17. But the first seven characters of that string are the month: substr(week_start, 1, 7) gives 2025-03.',
              'You can group not only by a column but by an expression. To avoid writing it twice, people write GROUP BY 1, meaning "by the first column in SELECT".',
              'Here is how it looked yesterday, on the assortment by brand:\n\nSELECT brand,\n       COUNT(*) AS sku_count,\n       AVG(list_price) AS avg_price\nFROM dim_product\nGROUP BY brand\n\nThe aggregate always sits in front of the measure: COUNT(*), AVG(list_price). Your task leaves two spots blank: what to compute the units with, and what to group by.',
            ],
          },
        },
        {
          taskId: 'sql-035',
          intro: {
            scene: 'stray',
            paras: [
              'And straight into the trap we warned you about yesterday: what happens when a column that is not in GROUP BY sits next to an aggregate. The answer depends on the engine, and that alone is worth knowing.',
            ],
          },
        },
      ],
      reflection: [
        'You can see the shape: sales hold all year and dip in the first quarter, and that dip is there across every brand at once.',
        'Notice what is easy to skip: you found where it dropped, not why. And you found it across all of retail at once, while Aoki is asking about one brand.',
      ],
      hook: [
        'The Q1 dip belongs to the whole category, which makes it seasonality, and carrying seasonality into the meeting is pointless: the season is the same for everyone, competitors included.',
        'Nettora, though, fell by half, and by half is not a season. Tomorrow you will have to separate one brand from the rest. The catch is that the sales table holds no brand at all.',
      ],
    },

    {
      id: 'day-4-join',
      track: 'sql',
      place: 'Kaiyo Trading · Commercial Analytics · Thursday, 9:30',
      short: 'Thu',
      found: 'The brand joins to sales. We hold brand revenue and the number of outlets it sits in.',
      scenes: { brief: 'desk', reflection: 'coverage', hook: 'meeting' },
      messages: [
        {
          from: 'Your manager',
          text: '"Yesterday query counts all of retail at once and it cannot do otherwise: fact_sellout holds no brand and no product name, only product_id. The brand lives in dim_product. Today you learn to join tables, and without that you cannot say anything about Nettora at all."',
        },
        {
          from: 'Aoki, Sales Director',
          text: '"And count how many outlets our brands actually sit in. Tomorrow I will need more than revenue: revenue without coverage explains nothing."',
        },
      ],
      steps: [
        {
          taskId: 'sql-012',
          intro: {
            scene: 'join',
            title: 'Two tables and a shared key',
            paras: [
              'Tables are linked by keys. Every row in fact_sellout carries a product_id, and the very same product_id exists in dim_product. JOIN attaches its product to each sales row, and with it the brand, the name and the price.',
              'It is written like this:\n\nFROM fact_sellout f\nJOIN dim_product p ON p.product_id = f.product_id\n\nThe condition after ON is the "match on which key" part. The short names f and p are table aliases: without them you would spell the full table name in front of every column.',
            ],
          },
        },
        {
          taskId: 'sql-037',
          intro: {
            scene: 'dropped',
            paras: [
              'A join has a price, and it is better learned right away on a small example: rows that found no match disappear from the result silently, with no error and no warning.',
            ],
          },
        },
        {
          taskId: 'sql-049',
          intro: {
            scene: 'threshold',
            title: 'A filter that runs after grouping',
            paras: [
              'And here is what Aoki asked for: brands with high revenue and wide coverage at the same time. Coverage is the number of distinct outlets, COUNT(DISTINCT customer_id), Tuesday function on a new table.',
              'WHERE cannot filter by an aggregate. It picks rows before grouping, and a brand revenue only exists after it. That is what HAVING is for: the same filter, but after GROUP BY.',
            ],
          },
        },
      ],
      reflection: [
        'Now you hold both languages at once: the revenue of a brand and the number of outlets it sits in. The second looks like a housekeeping detail, but it is a metric in its own right. In FMCG it is called distribution, and living people are accountable for it.',
        'Every question this week has been a "how much". Tomorrow brings the first "why", and a single number does not answer that one.',
      ],
      hook: [
        'Day four is done. Tomorrow at 11:00 Aoki meets the brand and she still has no explanation, only the shape of the year and the knowledge that the fall runs deeper than the season.',
        'Tomorrow you give her one. Every tool is in place: join, group, count the outlets. What remains is the thing none of them does, which is naming the cause and holding that name under questioning.',
      ],
    },

    {
      id: 'day-5-shelf-or-demand',
      track: 'sql',
      place: 'Kaiyo Trading · Commercial Analytics · Friday, 9:40',
      short: 'Fri',
      found: 'The cause is named: the brand lost shelf, not demand. The problem belongs to the field team.',
      scenes: { brief: 'office', reflection: 'outlets', hook: 'rival' },
      messages: [
        {
          from: 'Aoki, Sales Director',
          text: '"The meeting is in an hour and twenty minutes. All week I have been waiting for one sentence: why Nettora fell by half. And I need to know whose door to knock on, marketing, pricing, or my own field team. Walking in with four theories is worse than not walking in at all."',
        },
        {
          from: 'Your manager',
          text: '"Do not look for the cause inside a single number, break it apart. Units are the number of outlets carrying the brand multiplied by sales in one outlet. I already pulled the split across the first quarters of three years, and it sits above the query in your task; it is built from exactly what you did yesterday and the day before. Today I need a judgment from you rather than a query: name the culprit and hold that name under questioning. Get it wrong and Aoki knocks on the wrong door at 11:00."',
        },
      ],
      steps: [
        {
          taskId: 'sql-023',
          intro: {
            scene: 'factors',
            title: 'One idea before you judge',
            paras: [
              'Any decline breaks into factors, and that is the only way to argue about causes without guessing. Units = outlets × sales per outlet. Revenue = units × price. While the number stays whole it carries as many theories as there are people in the room; once it is broken apart the question narrows to one: which factor moved.',
              'Here is how that reads on a different case. A brand sold 1000 units a month and now sells 500. Break it apart: outlets went from 50 to 48, barely a change; sales per outlet went from 20 to 10.4, exactly half. The shelf is intact and people take half as much from it, so that is demand and the conversation goes to marketing. Flip the picture, outlets 50 against 24 with the same 20 per outlet, and the culprit is access, so the conversation goes to the field team.',
              'In your task the split is already computed and sits above the query: first quarters of 2024, 2025 and 2026, with units, outlets, sales per outlet and average price. The query itself reads end to end: the JOIN from Thursday, COUNT(DISTINCT) from Tuesday, GROUP BY from Wednesday. Compare 2024 with 2026 and find the factor that moved more than the rest.',
            ],
          },
        },
      ],
      reflection: [
        'Outlets went from 79 to 37, so the brand lost more than half of its shelves. Sales in a single outlet barely moved, 127.9 against 116.4, ordinary fluctuation. Where Nettora is still on the shelf, people buy it the way they always did.',
        'Now this is an answer rather than a sharper question. It has a culprit and it has an owner: not marketing and not price, but negotiations with the chains and the work of the field team. Notice what changed in a week. On Monday you could not even pull a list of products; today you name the cause of a decline and the person who owns it.',
      ],
      hook: [
        'Aoki walks into her 11:00 with one sentence and four numbers behind it. That is the job: not a report, but a decision somebody can act on.',
        'One question is not in those numbers: why forty two outlets stopped carrying Nettora. A shelf does not stay empty, so if the brand left it, somebody else took the space. Who exactly, you do not know yet.',
      ],
    },
  ],
};

/** Кампания режима истории для локали. */
export function storyCampaign(locale: Locale = 'ru'): StoryCampaign {
  return locale === 'en' ? en : ru;
}
