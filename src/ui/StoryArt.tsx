/**
 * Заставки фаз режима истории — схематичные картинки, а не иллюстрации.
 *
 * Зачем вообще. Миссия — это четыре экрана прозы подряд, и подряд они читаются
 * как учебник, а не как история: глазу не за что зацепиться, и все фазы
 * выглядят одинаково. Картинка сверху решает ровно две задачи и ни одной
 * лишней: говорит «это другой момент, чем предыдущий» до того, как человек
 * начал читать, и называет сцену — офис, группировка, форма продаж, развилка.
 *
 * Почему схемы, а не люди. Люди требуют стиля, которого в проекте нет ни
 * одного (шрифтов и растровых ассетов здесь принципиально нет, см. gen-icons),
 * и мгновенно ставят вопрос «а этот человек кто?» — вопрос не по задаче.
 * Схема же говорит на языке самого тренажёра: столбцы, строки, линия тренда.
 * Тот же язык, что у знака приложения (три растущих столбца) и у экрана
 * «Данные» (схема-звезда картинкой).
 *
 * Как устроено. Одна `<svg>` на фазу, без внешних файлов и без растра:
 * приложение офлайновое, и картинка обязана приходить тем же куском, что
 * и код. Цвета — только переменные темы (`--line`, `--text-dim`, `--accent`),
 * поэтому в светлой теме ничего не проваливается; ни одного жёсткого hex.
 * `viewBox` один на все сцены, чтобы полоса не прыгала по высоте между
 * фазами: скачок высоты читался бы как перезагрузка экрана.
 *
 * Картинка декоративна: `aria-hidden`, никакой информации, которой нет
 * в тексте рядом, она не несёт. Смысл, который есть только на картинке,
 * был бы недоступен через экранный диктор — а разбор миссии обязан
 * читаться целиком голосом.
 */
import type { ReactNode } from 'react';
import type { StoryScene } from '../content/storymode';

/*
 * Список сцен объявлен в контенте (content/storymode.ts), а не здесь: какие
 * сцены вообще бывают — вопрос кампании, а этот файл только рисует названное.
 * Так добавление сцены начинается там же, где пишется бит, который её просит.
 */

/** Общая рамка сцен: одна ширина и одна высота на все фазы. */
const VIEW_BOX = '0 0 320 116';

/**
 * Момент дня — то, что сцена-место берёт из самой миссии, а не из своего
 * описания: какой день недели отмечен на календаре и сколько на часах.
 * Выводится из порядка дня в неделе и из строки места («…Четверг, 9:10»):
 * число, набранное руками рядом с уже записанным, расходится молча.
 */
export interface StoryMoment {
  /** 0 — понедельник, 4 — пятница; за пределами — день без отметки. */
  weekday: number;
  /** «9:10» из строки места; без него часы показывают девять, начало дня. */
  time?: string;
}

/*
 * Места рисуются натюрмортом, идеи — схемой (решено 2026-09-13, пилот —
 * неделя 4). Схема хороша, когда сцена объясняет приём: группировку,
 * соединение, окно. Для утра дня она была не тем жанром: рабочее место
 * из трёх линий читалось как ещё одна схема, и утра кампании сливались
 * в одно. Натюрморт даёт утру фактуру без людей: на мониторе идея этого дня,
 * на календаре отмечен этот день, часы показывают время из строки места,
 * над телефоном — сообщение, если в брифе пишет не постоянный собеседник.
 *
 * Людей по-прежнему нет, и причина прежняя (см. шапку файла): присутствие
 * передают предметы — две кружки на столе переговорной, стикер, который
 * кто-то оставил на мониторе.
 *
 * Стол один и тот же каждое утро, меняется только то, что на нём: узнаваемое
 * утро дороже разнообразия, и разницу между днями несёт предмет дня,
 * а не перестановка мебели. Акцент — один, на мониторе: это то, о чём бриф.
 */
interface DeskSetup {
  /** Что на мониторе — идея дня в том виде, в каком она лежала бы на экране. */
  screen: () => ReactNode;
  /** Распечатки на столе. */
  papers?: boolean;
  /** Стикер на мониторе — напоминание, которое кто-то оставил. */
  note?: boolean;
  /** Сообщение над телефоном — в брифе пишет тот, кто пишет не каждый день. */
  ping?: boolean;
}

const DESK_SCENES: Partial<Record<StoryScene, DeskSetup>> = {
  // Пн: новый инструмент — ячейки блокнота, и под каждой остаётся таблица. Мори-сан пишет впервые.
  'desk-frames': { screen: ScreenNotebook, ping: true },
  // Вт: отбор строк маской; распечатка на столе — фактура Мори-сан «из первых рук».
  'desk-mask': { screen: ScreenMask, papers: true },
  // Ср: ключ группировки ушёл в индекс; стикер — напоминание Аоки-сан про месячный отчёт.
  'desk-index': { screen: ScreenIndex, note: true },
  // Чт: зубцы недельного ряда и сглаженная линия; пишет Ито-сан, на столе понедельные распечатки.
  'desk-series': { screen: ScreenSeries, papers: true, note: true, ping: true },

  /*
   * Недели 1–3, перерисовка по правилам пилота (2026-09-13, второй заход).
   * Экран — идея дня в виде, в каком она лежала бы на мониторе; papers/
   * note/ping — по конкретному факту брифа этого дня, не по шаблону.
   */
  // Пн w1, первый день: прайс на экране. Аоки-сан пишет впервые за всю кампанию.
  'desk-price': { screen: ScreenCatalog, ping: true },
  // Вт w1: счёт вместо перечня. Аоки-сан просит цифры «к пятнице» — напоминание о сроке.
  'desk-tally': { screen: ScreenTally, note: true },
  // Ср w1: форма года — волна без причины внутри неё.
  'desk-wave': { screen: ScreenWave },
  // Чт w1: две таблицы сходятся по ключу.
  'desk-link': { screen: ScreenLink },
  // Пн w2: список точек, часть строк — пунктиром: продаж бренда там нет. Напоминание о вопросе с прошлой встречи.
  'desk-gap': { screen: ScreenGap, note: true },
  // Вт w2: одна выручка распадается на акционную и обычную часть. На столе — распечатка прайса, на который ссылается руководитель.
  'desk-split-bar': { screen: ScreenSplitBar, papers: true },
  // Ср w2: выручка на одну точку — два бизнеса разного размера рядом.
  'desk-per-outlet': { screen: ScreenPerOutlet },
  // Чт w2: одна строка соединения размножается в несколько. На столе — распечатки прежних отчётов с той же ошибкой.
  'desk-fanout': { screen: ScreenFanout, papers: true },
  // Вт w3: спор о метрике. Танака-сан, финансовый контролёр, пишет впервые за всю кампанию.
  'desk-dispute': { screen: ScreenDispute, ping: true },
  // Ср w3: строка смотрит на предыдущую — окно вместо свёртки. Аоки-сан просит черновик «хоть в среду».
  'desk-lookback': { screen: ScreenLookback, note: true },
  // Чт w3: сырые строки неровные, две из них — одно и то же имя. Профилирование выгрузки на бумаге.
  'desk-raw-row': { screen: ScreenRawRow, papers: true },
  // Пт w3: письмо — первая строка длиннее и жирнее остальных. Срок жёсткий, отмечен на стикере.
  'desk-lede': { screen: ScreenLede, note: true },

  /*
   * Перебалансировка недель 4–5 (2026-09-14): утра новых дней.
   */
  // Чт w4: пары столбцов «год назад / сейчас», одна пара вдвое выше. На столе — прошлогодние распечатки.
  'desk-yoy': { screen: ScreenYoy, papers: true },
  // Вт w5: два ряда рядом — отгрузки с горбом и ровные продажи точек, которые кладут рядом сегодня.
  'desk-pair': { screen: ScreenPair },
  // Чт w5: две свёрнутые колонки и третья — их отношение. Стикер — срок Аоки-сан «до пятницы».
  'desk-ratio': { screen: ScreenRatio, note: true },
};

/*
 * Переговорная, параметризованная (2026-09-13, второй заход): доска
 * рисует то, о чём именно эта встреча, — раскладка та же, что в пилоте
 * недели 4, но данные приходят снаружи, а не зашиты в функцию.
 */
interface BoardSetup {
  /** Столбцы на доске — форма, о которой встреча. */
  bars: number[];
  /** Индексы столбцов с акцентом. */
  accent: number[];
}

const BOARD_SCENES: Partial<Record<StoryScene, BoardSetup>> = {
  // Пт w1: падение по первым кварталам трёх лет — то, с чем Аоки-сан идёт к бренду.
  'boardroom-nettora': { bars: [34, 29, 16], accent: [2] },
  // Пт w2: отношение отгрузок к продажам по двенадцати дистрибьюторам — один выше остальных.
  'boardroom-supply': { bars: [15, 16, 14, 15, 17, 14, 16, 15, 14, 17, 15, 32], accent: [11] },
  // Пн w3: то, что Аоки-сан только что показала бренду — точки, которые остались, и точки, которые ушли.
  'boardroom-dashboard': { bars: [37, 42], accent: [1] },
  // Пт w4: ряд отгрузок Setouchi — всплеск на три месяца (пилот, перенесено из прежней константы).
  'boardroom-setouchi': { bars: [14, 16, 12, 15, 32, 27, 31, 15, 13], accent: [4, 5, 6] },
  // Пт w5: отношение Setouchi по кварталам — горб и снова единица. У Мори-сан и Аоки-сан на руках
  // последние два столбца; остатков на доске нет — это ответ дня, бриф его не знает.
  'boardroom-ratio': { bars: [14, 14, 14, 14, 14, 14, 14, 32, 15, 14], accent: [8, 9] },
};

export function StoryArt({ scene, moment }: { scene: StoryScene; moment?: StoryMoment }) {
  const desk = DESK_SCENES[scene];
  const board = BOARD_SCENES[scene];
  return (
    <div className="story-art" aria-hidden>
      <svg viewBox={VIEW_BOX} role="presentation" preserveAspectRatio="xMidYMid meet">
        {desk && <DeskStill moment={moment} setup={desk} />}
        {board && <Boardroom moment={moment} setup={board} />}
        {scene === 'office' && <Office />}
        {scene === 'filter' && <Filter />}
        {scene === 'sort' && <Sort />}
        {scene === 'fold' && <Fold />}
        {scene === 'counts' && <Counts />}
        {scene === 'calendar' && <Calendar />}
        {scene === 'stray' && <Stray />}
        {scene === 'sellout' && <Sellout />}
        {scene === 'dropped' && <Dropped />}
        {scene === 'threshold' && <Threshold />}
        {scene === 'toolkit' && <Toolkit />}
        {scene === 'foundation' && <Foundation />}
        {scene === 'coverage' && <Coverage />}
        {scene === 'meeting' && <Meeting />}
        {scene === 'corridor' && <Corridor />}
        {scene === 'catalog' && <Catalog />}
        {scene === 'tables' && <Tables />}
        {scene === 'join' && <Join />}
        {scene === 'groups' && <Groups />}
        {scene === 'trend' && <Trend />}
        {scene === 'split' && <Split />}
        {scene === 'branches' && <Branches />}
        {scene === 'factors' && <Factors />}
        {scene === 'outlets' && <Outlets />}
        {scene === 'rival' && <Rival />}
        {scene === 'request' && <Request />}
        {scene === 'scope' && <Scope />}
        {scene === 'dispute' && <Dispute />}
        {scene === 'contract' && <Contract />}
        {scene === 'shift' && <Shift />}
        {scene === 'twins' && <Twins />}
        {scene === 'smooth' && <Smooth />}
        {scene === 'level' && <Level />}
        {scene === 'channels' && <Channels />}
        {scene === 'definitions' && <Definitions />}
        {scene === 'absent' && <Absent />}
        {scene === 'yoy' && <Yoy />}
        {scene === 'versions' && <Versions closed={3} spoken />}
        {scene === 'versions-half' && <Versions closed={2} spoken={false} />}
        {scene === 'fanout' && <Fanout />}
        {scene === 'notebook' && <Notebook />}
        {scene === 'brackets' && <Brackets />}
        {scene === 'flow' && <Level withLevel={false} />}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------ сцены-места */

/*
 * Утро за своим столом. Раскладка общая на все дни; что лежит на мониторе
 * и вокруг — из DeskSetup. Предметы — плоские заливки из палитры .story-art
 * (styles.css), контуры и мелкие детали — приглушённым цветом линий.
 */
function DeskStill({ moment, setup }: { moment?: StoryMoment; setup: DeskSetup }) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* окно с жалюзи: утро, а не ночь */}
      <rect className="art-glass" x="14" y="8" width="64" height="48" rx="2" />
      <path className="art-far" d="M14 16h64M14 24h64M14 32h64M14 40h64M14 48h64" stroke="currentColor" strokeWidth="0.6" fill="none" />
      <WallCalendar weekday={moment?.weekday} />
      <WallClock cx={286} cy={24} r={11} time={moment?.time} />

      <rect className="art-wood" x="0" y="88" width="320" height="28" />
      <rect className="art-wood-edge" x="0" y="88" width="320" height="2.5" />

      {/* растение — та же единственная деталь не по работе, что в кадре офиса */}
      <rect className="art-pot" x="96" y="76" width="12" height="12" rx="1.5" />
      <path className="art-leaf" d="M102 76c-6-2-8-8-7-13 5 2 8 7 7 13zM102 76c5-3 7-9 5-14-5 3-7 8-5 14z" />

      {setup.papers && <Printouts />}

      <rect className="art-body" x="118" y="28" width="100" height="56" rx="3" />
      <rect className="art-screen" x="123" y="33" width="90" height="46" rx="1.5" />
      {setup.screen()}
      <rect className="art-body" x="164" y="84" width="8" height="3" />
      <rect className="art-body" x="152" y="86" width="32" height="2.5" rx="1" />
      {setup.note && <rect className="art-note" x="205" y="23" width="13" height="13" transform="rotate(8 211 29)" />}

      <rect className="art-paper" x="134" y="95" width="68" height="9" rx="1.5" />
      <path className="art-far" d="M138 98.2h60M138 100.8h60" stroke="currentColor" strokeWidth="0.9" strokeDasharray="2.4 1.4" fill="none" />

      {/* своя кружка: одна и та же каждое утро */}
      <rect className="art-mug" x="236" y="91" width="13" height="15" rx="2" />
      <path d="M249 95c5 0 5 7 0 7" style={{ stroke: 'var(--art-mug)' }} strokeWidth="1.4" fill="none" />
      <path className="art-far" d="M240 87c-2-3 2-5 0-8M245 87c-2-3 2-5 0-8" stroke="currentColor" strokeWidth="0.9" fill="none" />

      <rect className="art-body" x="262" y="98" width="22" height="11" rx="2" />
      {setup.ping && <Ping />}
    </g>
  );
}

/*
 * Календарь на стене: пять рабочих дней в три недели. Прошедшие дни темнее
 * будущих, сегодняшний окрашен цветом шапки — не акцентом, акцент в сцене
 * принадлежит монитору.
 */
function WallCalendar({ weekday }: { weekday?: number }) {
  const current = 1;
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const isToday = r === current && c === weekday;
      const isPast = r < current || (r === current && weekday !== undefined && c < weekday);
      cells.push(
        <rect
          key={`${r}-${c}`}
          className={isToday ? 'art-pot' : isPast ? 'art-cell-past' : 'art-cell'}
          x={95 + c * 5.6}
          y={22 + r * 7}
          width="4"
          height="4"
          rx="0.6"
        />
      );
    }
  }
  return (
    <g>
      <rect className="art-paper" x="92" y="10" width="32" height="36" rx="2" />
      <rect className="art-pot" x="92" y="10" width="32" height="8" rx="2" />
      {cells}
    </g>
  );
}

/** Настенные часы. Стрелки по строке «9:10»; без времени — девять, начало дня. */
function WallClock({ cx, cy, r, time }: { cx: number; cy: number; r: number; time?: string }) {
  const m = /(\d{1,2}):(\d{2})/.exec(time ?? '');
  const minutes = m ? Number(m[2]) : 0;
  const hours = (m ? Number(m[1]) % 12 : 9) + minutes / 60;
  const tip = (turn: number, len: number) =>
    `${(cx + Math.sin(turn * 2 * Math.PI) * len).toFixed(1)} ${(cy - Math.cos(turn * 2 * Math.PI) * len).toFixed(1)}`;
  return (
    <g>
      <circle className="art-paper" cx={cx} cy={cy} r={r} />
      <circle className="art-mid" cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/*
        * Часовая короче и толще минутной: на 9:15 стрелки ложатся в одну
        * линию, и одинаковые читались бы знаком «минус», а не временем.
        */}
      <path d={`M${cx} ${cy}L${tip(hours / 12, r * 0.45)}`} stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d={`M${cx} ${cy}L${tip(minutes / 60, r * 0.8)}`} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
    </g>
  );
}

/** Распечатки на столе: верхний лист со столбиками, под ним ещё один. */
function Printouts() {
  return (
    <g>
      <rect className="art-paper" x="40" y="91" width="40" height="22" transform="rotate(5 58 100)" />
      <g transform="rotate(-8 58 100)">
        <rect className="art-paper" x="36" y="90" width="40" height="22" />
        <rect className="art-far" x="36" y="90" width="40" height="22" fill="none" stroke="currentColor" strokeWidth="0.6" />
        <path className="art-far" d="M40 94h22M40 97h16" stroke="currentColor" strokeWidth="0.9" fill="none" />
        <path className="art-mid" d="M43 109v-5M49 109v-8M55 109v-6M61 109v-9M67 109v-4" stroke="currentColor" strokeWidth="3" strokeLinecap="butt" fill="none" />
      </g>
    </g>
  );
}

/*
 * Сообщение над телефоном. Хвост закрашен бумагой поверх контура пузыря —
 * так пузырь и хвост читаются одной фигурой без стыка.
 */
function Ping() {
  return (
    <g>
      <rect className="art-paper" x="256" y="60" width="48" height="22" rx="4" />
      <rect className="art-mid" x="256" y="60" width="48" height="22" rx="4" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <path className="art-paper" d="M265 81l-2 7 9-7z" />
      <path className="art-mid" d="M265 82l-2 6 8-6" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <path className="art-mid" d="M261 67h38M261 72h38M261 77h22" stroke="currentColor" strokeWidth="1.1" fill="none" />
    </g>
  );
}

/*
 * Экраны дня. Всё внутри прямоугольника 123..213 × 33..79 — это экран
 * монитора DeskStill. Акцентная деталь на каждом одна.
 */

/** Пн: блокнот — строка кода, под ней таблица, и так ячейка за ячейкой: таблица остаётся в руках. */
function ScreenNotebook() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      <path className="art-far" d="M127 37v15M127 56v20" strokeWidth="1.2" />
      <path className="art-line" d="M131 39h34" strokeWidth="2" />
      <g className="art-mid" strokeWidth="0.8">
        <rect x="131" y="43" width="42" height="9" />
        <path d="M131 46.5h42M145 43v9M159 43v9" />
      </g>
      <path className="art-mid" d="M131 58h26" strokeWidth="2" />
      <g className="art-mid" strokeWidth="0.8">
        <rect x="131" y="62" width="56" height="13" />
        <path d="M131 65.5h56M131 70h56M145 62v13M159 62v13M173 62v13" />
      </g>
    </g>
  );
}

/** Вт: таблица, в которой маска отобрала две строки из семи. */
function ScreenMask() {
  const rows = [38, 44, 50, 56, 62, 68, 74];
  const picked = new Set([44, 62]);
  return (
    <g>
      {rows
        .filter((y) => picked.has(y))
        .map((y) => (
          <rect key={`band-${y}`} className="art-pick" x="126" y={y - 2.8} width="84" height="5.6" rx="1" />
        ))}
      <g fill="none" stroke="currentColor" strokeLinecap="butt">
        {rows.map((y, i) => (
          <path
            key={y}
            className={picked.has(y) ? 'art-near' : 'art-far'}
            d={`M130 ${y}h14M150 ${y}h24M180 ${y}h${i % 2 ? 16 : 24}`}
            strokeWidth="1.6"
          />
        ))}
      </g>
      {[...picked].map((y) => (
        <path key={`mark-${y}`} className="art-line" d={`M126.5 ${y - 2}v4`} strokeWidth="1.6" />
      ))}
    </g>
  );
}

/** Ср: результат группировки — ключ ушёл в индекс, отдельный столбец слева. */
function ScreenIndex() {
  const rows = [
    { y: 40, w: 40 },
    { y: 48, w: 58 },
    { y: 56, w: 30 },
    { y: 64, w: 48 },
    { y: 72, w: 36 },
  ];
  return (
    <g strokeLinecap="butt">
      <rect className="art-pick" x="127" y="36" width="16" height="40" rx="1" />
      <g fill="none" stroke="currentColor">
        {rows.map((r) => (
          <path key={`key-${r.y}`} className="art-near" d={`M130 ${r.y}h10`} strokeWidth="1.4" />
        ))}
        {rows.map((r) => (
          <path key={`bar-${r.y}`} className="art-mid" d={`M148 ${r.y}h${r.w}`} strokeWidth="4" />
        ))}
      </g>
      <path className="art-line" d="M143.5 36v40" strokeWidth="1.2" />
    </g>
  );
}

/** Чт: недельный ряд с зубцами и сглаженная линия поверх него — ровно то, о чём просит Ито-сан. */
function ScreenSeries() {
  return (
    <g fill="none" stroke="currentColor" strokeLinejoin="round">
      <path className="art-far" d="M128 74h80" strokeWidth="0.8" />
      <path
        className="art-mid"
        d="M128 58 133 50 138 62 143 47 148 60 153 52 158 64 163 49 168 58 173 44 178 55 183 46 188 57 193 42 198 53 203 45 208 50"
        strokeWidth="1"
      />
      <path className="art-line" d="M128 57C140 56 150 55 160 55S185 51 208 48" strokeWidth="2" />
    </g>
  );
}

/*
 * Экраны недель 1–3, перерисовка по правилам пилота: та же идея, что
 * читалась днём на схеме-подводке, но сжатая в 90×46 монитора.
 */

/** Пн w1: прайс на экране — строки читаются, колонка цены отмечена акцентом. */
function ScreenCatalog() {
  const rows = [40, 47, 54, 61, 68, 75];
  const widths = [46, 34, 50, 30, 42, 36];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      <path className="art-far" d="M127 37h60" strokeWidth="1" />
      <g className="art-mid" strokeWidth="1.6">
        {rows.map((y, i) => (
          <path key={y} d={`M127 ${y}h${widths[i]}`} />
        ))}
      </g>
      <g className="art-line" strokeWidth="2">
        {rows.map((y) => (
          <path key={`p-${y}`} d={`M192 ${y}h13`} />
        ))}
      </g>
    </g>
  );
}

/** Вт w1: строки таблицы сворачиваются в одно число — счёт вместо перечня. */
function ScreenTally() {
  return (
    <g fill="none" stroke="currentColor">
      <g className="art-mid" strokeWidth="1.6" strokeLinecap="butt">
        <path d="M127 39h26M127 45h32M127 51h20M127 57h28" />
      </g>
      <path className="art-line" d="M168 48h14" strokeWidth="1.8" strokeLinecap="round" />
      <path className="art-line" d="m179 44 5 4-5 4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect className="art-near" x="190" y="38" width="18" height="16" rx="2" strokeWidth="1.6" />
    </g>
  );
}

/** Ср w1: форма года — линия с провалом и пиком, ни одного бренда в ней не различить. */
function ScreenWave() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path className="art-far" d="M127 76h82" strokeWidth="0.8" />
      <path className="art-line" d="M129 60 141 70 153 50 165 44 177 58 189 48 201 62 209 46" strokeWidth="2" />
    </g>
  );
}

/** Чт w1: две таблицы наконец сходятся по общему ключу. */
function ScreenLink() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      <g className="art-mid" strokeWidth="1.4">
        <rect x="127" y="38" width="34" height="30" rx="1.5" />
        <path d="M127 47h34" strokeWidth="0.9" />
        <rect x="177" y="38" width="34" height="30" rx="1.5" />
        <path d="M177 47h34" strokeWidth="0.9" />
      </g>
      <path className="art-line" d="M133 52h22M183 52h22" strokeWidth="2" />
      <g className="art-near" strokeLinecap="round">
        <circle cx="161" cy="52" r="2.4" strokeWidth="1.6" />
        <circle cx="177" cy="52" r="2.4" strokeWidth="1.6" />
      </g>
    </g>
  );
}

/** Пн w2: список точек, часть строк — пунктиром: продаж бренда там нет. */
function ScreenGap() {
  const rows = [39, 47, 55, 63, 71];
  const missing = new Set([55, 71]);
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      {rows.map((y) => (
        <path
          key={y}
          className={missing.has(y) ? 'art-far' : 'art-mid'}
          d={`M127 ${y}h60`}
          strokeWidth={missing.has(y) ? 1.2 : 1.8}
          strokeDasharray={missing.has(y) ? '3 3' : undefined}
        />
      ))}
      {[...missing].map((y) => (
        <path key={`m-${y}`} className="art-line" d={`M191 ${y - 2}v4`} strokeWidth="1.8" strokeLinecap="round" />
      ))}
    </g>
  );
}

/** Вт w2: одна выручка — акционная часть внутри неё, снизу и меньше. */
function ScreenSplitBar() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      <rect className="art-mid" x="140" y="38" width="24" height="38" strokeWidth="1.6" />
      <rect className="art-line" x="140" y="66" width="24" height="10" strokeWidth="1.6" />
      <path className="art-far" d="M170 46h30M170 70h20" strokeWidth="1.6" />
    </g>
  );
}

/** Ср w2: выручка на одну точку — два бизнеса разного размера рядом. */
function ScreenPerOutlet() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      <path className="art-far" d="M127 76h80" strokeWidth="0.9" />
      <rect className="art-line" x="135" y="44" width="18" height="32" strokeWidth="1.6" />
      <rect className="art-mid" x="170" y="62" width="18" height="14" strokeWidth="1.6" />
    </g>
  );
}

/** Чт w2: одна строка соединения размножается в несколько — цена ошибки. */
function ScreenFanout() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      <path className="art-mid" d="M127 44h30" strokeWidth="2" />
      <g className="art-line" strokeWidth="1.6">
        <path d="M163 44 195 36" />
        <path d="M163 44 195 44" />
        <path d="M163 44 195 52" />
        <path d="M163 44 195 60" />
      </g>
      <g className="art-far" strokeWidth="1.2">
        <path d="M199 36h10M199 44h10M199 52h10M199 60h10" />
      </g>
    </g>
  );
}

/** Вт w3: одна подпись, два столбца разной высоты — спор не про арифметику. */
function ScreenDispute() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      <path className="art-far" d="M129 76h74" strokeWidth="0.9" />
      <rect className="art-mid" x="140" y="52" width="18" height="24" strokeWidth="1.6" />
      <rect className="art-line" x="172" y="40" width="18" height="36" strokeWidth="1.6" />
    </g>
  );
}

/** Ср w3: строка смотрит на предыдущую — окно вместо свёртки. */
function ScreenLookback() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      <g className="art-mid" strokeWidth="1.6">
        <rect x="127" y="40" width="46" height="12" rx="1.5" />
        <rect x="127" y="58" width="46" height="12" rx="1.5" />
      </g>
      <path className="art-line" d="M150 58c-14 0-14-18 0-18" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path className="art-line" d="m145 41 5-5 5 5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** Чт w3: сырые строки неровные, а две из них отмечены акцентом — одно имя в двух написаниях. */
function ScreenRawRow() {
  const rows = [39, 47, 55, 63, 71];
  const widths = [50, 34, 58, 40, 46];
  const twins = new Set([1, 3]);
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      {rows.map((y, i) => (
        <path
          key={y}
          className={twins.has(i) ? 'art-line' : 'art-mid'}
          d={`M127 ${y}h${widths[i]}`}
          strokeWidth={twins.has(i) ? 2 : 1.6}
        />
      ))}
    </g>
  );
}

/** Пт w3: письмо — первая строка длиннее и жирнее остальных, вывод стоит первым. */
function ScreenLede() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      <path className="art-line" d="M127 41h80" strokeWidth="2.6" />
      <g className="art-far" strokeWidth="1.2">
        <path d="M127 51h70M127 58h74M127 65h50" />
      </g>
    </g>
  );
}

/** Чт w4: пары «год назад / сейчас» — у одной сейчас вдвое выше, остальные чуть ниже себя прошлых. */
function ScreenYoy() {
  const pairs = [
    { was: 18, now: 17 },
    { was: 20, now: 40, hot: true },
    { was: 15, now: 13 },
    { was: 17, now: 15 },
  ];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      <path className="art-far" d="M127 76h82" strokeWidth="0.9" />
      {pairs.map((p, i) => {
        const x = 132 + i * 20;
        return (
          <g key={i}>
            <rect className="art-far" x={x} y={76 - p.was} width="6" height={p.was} strokeWidth="1.2" />
            <rect className={p.hot ? 'art-line' : 'art-mid'} x={x + 8} y={76 - p.now} width="6" height={p.now} strokeWidth="1.6" />
          </g>
        );
      })}
    </g>
  );
}

/** Вт w5: отгрузки с горбом и ровные продажи точек — акцент на продажах, их кладут рядом сегодня. */
function ScreenPair() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path className="art-far" d="M127 76h82" strokeWidth="0.9" />
      <path className="art-mid" d="M129 60 141 58 153 61 165 57 176 40 184 46 192 41 200 59 209 58" strokeWidth="1.4" />
      <path className="art-line" d="M129 63 141 61 153 64 165 60 176 65 184 66 192 64 200 61 209 62" strokeWidth="2" />
    </g>
  );
}

/** Чт w5: две свёрнутые колонки рядом и третья — их отношение, она и акцент. */
function ScreenRatio() {
  const rows = [40, 48, 56, 64, 72];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="butt">
      <g className="art-mid" strokeWidth="1.6">
        {rows.map((y) => (
          <path key={y} d={`M127 ${y}h22M155 ${y}h20`} />
        ))}
      </g>
      <path className="art-far" d="M181 36v40" strokeWidth="0.9" />
      <g className="art-line" strokeWidth="2">
        {rows.map((y) => (
          <path key={`r-${y}`} d={`M186 ${y}h${y === 48 ? 20 : 9}`} />
        ))}
      </g>
    </g>
  );
}

/*
 * Переговорная в день встречи. На доске — форма, о которой встреча, и акцент
 * на столбцах, которые обсуждают; данные и акцент приходят параметром
 * (`BoardSetup`), доска общая. Ответ дня на доске не рисуется намеренно —
 * бриф его не знает, его найдёт человек. Две кружки на столе: встреча
 * на двоих.
 */
function Boardroom({ moment, setup }: { moment?: StoryMoment; setup: BoardSetup }) {
  const chartX0 = 30;
  const chartWidth = 98;
  const gap = chartWidth / setup.bars.length;
  const barWidth = Math.min(gap * 0.66, 9);
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <rect className="art-floor" x="0" y="72" width="320" height="44" />

      <rect className="art-paper" x="22" y="10" width="114" height="52" rx="2" />
      <rect className="art-mid" x="22" y="10" width="114" height="52" rx="2" fill="none" stroke="currentColor" strokeWidth="0.9" />
      <path className="art-far" d="M30 54h98" stroke="currentColor" strokeWidth="0.7" fill="none" />
      {setup.bars.map((h, i) => (
        <rect
          key={i}
          className={setup.accent.includes(i) ? 'art-accent' : 'art-bar'}
          x={chartX0 + i * gap + (gap - barWidth) / 2}
          y={54 - h}
          width={barWidth}
          height={h}
        />
      ))}
      <path className="art-mid" d="M28 65h102" stroke="currentColor" strokeWidth="1.6" fill="none" />

      <WallClock cx={166} cy={26} r={11} time={moment?.time} />

      {/* экран на стене: чей-то дашборд, не наш вопрос */}
      <rect className="art-body" x="196" y="10" width="100" height="52" rx="2" />
      <rect className="art-screen" x="202" y="16" width="26" height="12" rx="1" />
      <rect className="art-screen" x="232" y="16" width="26" height="12" rx="1" />
      <rect className="art-screen" x="262" y="16" width="28" height="12" rx="1" />
      <path className="art-far" d="M205 22h12M235 22h9M265 22h15" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <rect className="art-screen" x="202" y="32" width="88" height="24" rx="1" />
      <path className="art-mid" d="M205 52 216 47 227 49 238 42 249 45 260 39 271 41 286 36" stroke="currentColor" strokeWidth="1.2" fill="none" />

      {/* спинки стульев по дальнюю сторону стола */}
      <g className="art-body">
        <rect x="84" y="66" width="20" height="14" rx="4" />
        <rect x="124" y="66" width="20" height="14" rx="4" />
        <rect x="176" y="66" width="20" height="14" rx="4" />
        <rect x="216" y="66" width="20" height="14" rx="4" />
      </g>

      <polygon className="art-wood" points="70,78 250,78 282,104 38,104" />

      <rect className="art-body" x="110" y="72" width="30" height="18" rx="1.5" />
      <rect className="art-screen" x="112.5" y="74.5" width="25" height="13" rx="0.8" />
      <polygon className="art-body" points="106,90 144,90 148,94 102,94" />

      <rect className="art-paper" x="178" y="86" width="24" height="13" transform="rotate(-6 190 92)" />
      <rect className="art-mug" x="222" y="87" width="8" height="8" rx="1.5" />
      <rect className="art-mug" x="78" y="89" width="8" height="8" rx="1.5" />

      <g className="art-body">
        <rect x="76" y="104" width="24" height="10" rx="4" />
        <rect x="148" y="104" width="24" height="10" rx="4" />
        <rect x="222" y="104" width="24" height="10" rx="4" />
      </g>

      <rect className="art-pot" x="298" y="74" width="12" height="12" rx="1.5" />
      <path className="art-leaf" d="M304 74c-6-2-8-9-7-14 5 2 8 8 7 14zM304 74c5-3 7-10 5-15-5 3-7 9-5 15z" />
    </g>
  );
}

/*
 * Хук дня 20, последнего: кампания закрывается, дальше — треки на свой
 * выбор. Натюрморт (2026-09-13, восьмой заход), а не схема: дальние столы
 * пусты, твой экран включён, но на нём ничего не показано — куда идти
 * дальше, решает не картинка. Цвет не взят намеренно: тем, о которых
 * говорит крючок (SQL, работа вокруг чисел, pandas), у домена нет своего
 * оттенка (сливается с акцентом, см. правило над `Groups`), а закрашивать
 * два трека из трёх значило бы выбрать за читателя.
 */
function Office() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* окно во всю заднюю стену и город за ним */}
      <g className="art-far" fill="none" stroke="currentColor">
        <rect x="24" y="10" width="272" height="44" rx="4" strokeWidth="1.5" />
        <path d="M24 40h272" strokeWidth="1" />
        <path d="M108 10v44M212 10v44" strokeWidth="1" />
        <path d="M40 40V26h14v14M62 40V20h10v20M96 40V30h9v10M132 40V24h12v16M158 40V32h8v8M236 40V22h11v18M256 40V31h9v9" strokeWidth="1.2" />
      </g>

      {/* дальний ряд столов: те же места, что утром, сейчас пустые */}
      <g className="art-body">
        <rect x="52" y="62" width="28" height="16" rx="2" />
        <rect x="240" y="62" width="28" height="16" rx="2" />
      </g>
      <path className="art-far" d="M36 78h60M52 78v10M84 78v10M224 78h60M240 78v10M272 78v10" stroke="currentColor" strokeWidth="1.5" fill="none" />

      {/* твоё место: экран включён и пуст */}
      <rect className="art-body" x="130" y="66" width="60" height="34" rx="3" />
      <rect className="art-screen" x="135" y="71" width="50" height="24" rx="1.5" />
      <path className="art-far" d="M118 100h84M134 100v8M186 100v8" stroke="currentColor" strokeWidth="1.8" fill="none" />

      {/* растение в углу — та же единственная деталь не по работе, что в кадре стола */}
      <rect className="art-pot" x="286" y="98" width="12" height="12" rx="1.5" />
      <path className="art-leaf" d="M292 98c-6-2-8-9-7-14 5 2 8 8 7 14zM292 98c5-3 7-10 5-15-5 3-7 9-5 15z" />
    </g>
  );
}

/* ------------------------------------------------------ сцены-идеи */

/*
 * Идеи в цвете (решено 2026-09-13, пилот — Groups, Split, Threshold, Branches).
 * До пилота идеи рисовались одноцветной линией, и это было честно, пока
 * линия ничего не утверждала. Цвет утверждает, поэтому правила строже:
 *
 * — Цвет — это связь. Оттенок появляется в сцене не меньше двух раз
 *   и связывает два места одной мыслью: строку и её столбец, разрыв
 *   и скобку, значение в строке и метку, которую оно подставило.
 *   Оттенок, встреченный один раз, — украшение, его не бывает.
 * — Группы — оттенками треков (`art-cat-1…3`), и только в сценах про
 *   разрез на группы. Больше трёх групп не рисуется: на 116 пикселях
 *   четвёртый оттенок уже не отличить.
 * — Отобранное и отброшенное — не оттенком, а заливкой против контура:
 *   прошедшее залито бледным акцентом (как отобранные строки на мониторе
 *   утра), отсечённое — пустой пунктирный контур. Иначе «прошло» спорило
 *   бы с группами и придумывало «зелёный значит хорошо».
 * — Разница между двумя величинами — залитая площадь между ними, тёплым
 *   `art-gap`, и тем же тоном отмечен её размер.
 * — Акцент по-прежнему один: действие или предмет, о котором текст рядом.
 * — Сцена с цветом несёт один смысл. Перед раскраской перечислить все
 *   места, где она стоит (grep по `scene`), и где смысл другой — завести
 *   свою сцену. Так появилась Branches: над CASE стоял Split, и залитый
 *   разрыв «бренд против рынка» соврал бы там прямо.
 *
 * Остаток 26 идей и четыре сцены-места разобраны 2026-09-13 (восьмой
 * заход, Sonnet). Раскрашено семь: filter, sort, counts, dropped, scope,
 * dispute, outlets — у каждой был свой кандидат в отобранное/отброшенное
 * или в разницу величин. Девятнадцать остались линией, потому что
 * связывать нечем: catalog, fold, calendar, stray, tables, join, factors,
 * shift, smooth, level, request, contract, toolkit, foundation, coverage,
 * sellout, trend, rival, twins — «группа» там не про разрез на категории
 * (join, twins — связь одной пары, а не до трёх групп), «отобранное/
 * отброшенное» ничего не выбирает (fold, calendar, factors — свёртка или
 * разложение, не отбор), а «разница» ничего не сравнивает (trend, smooth,
 * level — один ряд или ряд и его сглаживание, не два значения). rival
 * не тронут отдельно: у него уже есть довод против цвета в собственном
 * комментарии («форма важнее цвета» — два оттенка на одной полке
 * пришлось бы объяснять).
 *
 * Нашлись две сцены не по плану, обе разобраны ниже, у Channels
 * и Definitions: outlets стоял за двумя разными мыслями сразу
 * (потерянная полка и выручка на точку), а хук дня 11 держался на split
 * и предрешал развилку дня 12. Проверка перед раскраской (grep по scene)
 * поймала обе.
 */

/*
 * Что делает GROUP BY, одной картинкой: слева стопка строк, окрашенных
 * группой, справа — столбцы тех же цветов, в которые они сложились.
 * Стрелка посередине и есть агрегат, она — акцент. Высота столбца
 * не набрана руками, а считается из строк: сумма длин строк группы.
 * Картинка тем самым верна буквально, и правка строк её не обманет.
 */
function Groups() {
  /** Длина строки и её группа (1…3). */
  const rows: Array<[number, 1 | 2 | 3]> = [
    [74, 2], [50, 1], [68, 3], [68, 2], [62, 3], [74, 2],
    [62, 1], [70, 3], [62, 2], [44, 1], [56, 3], [74, 2],
  ];
  const groups = [1, 2, 3] as const;
  const sums = groups.map((g) => rows.filter(([, rg]) => rg === g).reduce((s, [w]) => s + w, 0));
  const tallest = Math.max(...sums);
  const columnX = [214, 244, 274];
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {rows.map(([w, g], i) => (
        <rect key={i} className={`art-cat-${g}`} x="16" y={11 + i * 8} width={w} height="6" rx="1.5" />
      ))}

      <path className="art-line" d="M118 60h56m-8-6 8 6-8 6" strokeWidth="2.4" />

      <path className="art-far" d="M200 100h104" stroke="currentColor" strokeWidth="1.6" fill="none" />
      {groups.map((g, k) => {
        const h = Math.round((sums[k] / tallest) * 66);
        return (
          <rect key={g} className={`art-cat-${g}-soft`} x={columnX[k]} y={100 - h} width="22" height={h} rx="2" strokeWidth="1.6" />
        );
      })}
    </g>
  );
}

/*
 * Форма года: провал в первом квартале и ровное плато дальше. Провал
 * подсвечен заливкой — это ответ, который человек только что получил
 * своим запросом, и картинка повторяет его формой, а не числом.
 */
function Trend() {
  const line = 'M22 78 43 84 64 80 85 44 106 40 127 46 148 38 169 44 190 36 211 42 232 38 253 44 274 34 295 40';
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        <path d="M22 100h276" strokeWidth="1.5" />
        <path d="M22 20v80" strokeWidth="1.5" />
        <path d="M22 62h276M22 36h276" strokeWidth="1" strokeDasharray="3 5" />
      </g>

      {/* полоса первого квартала — подсветка, а не отдельный смысл */}
      <rect className="art-band" x="22" y="20" width="54" height="80" rx="2" stroke="none" />

      <path className="art-line" d={line} strokeWidth="2.6" />
      <g className="art-near">
        <circle cx="43" cy="84" r="3.2" strokeWidth="2" />
      </g>
    </g>
  );
}

/*
 * Крючок к следующей миссии: у категории провал сезонный и она возвращается,
 * а один бренд уходит вдвое и не возвращается. Две линии из одной точки —
 * это и есть вопрос «почему именно Nettora», нарисованный формой.
 *
 * Разрыв между ними залит: это то, что сезоном не объясняется, и о нём
 * крючок. Скобка справа того же тона — размер разрыва. Под линией бренда
 * серая площадь — то, что у бренда осталось; вместе с разрывом она
 * и составляет категорию. Площади не перекрываются: тёплое поверх серого
 * в светлой теме смешивалось в бурый.
 */
function Split() {
  const category = 'M22 40 58 44 94 62 130 46 166 38 202 42 238 36 274 40';
  const brand = 'M22 40 58 46 94 66 130 70 166 76 202 80 238 84 274 86';
  /** Та же линия бренда задом наперёд — чтобы замкнуть площадь разрыва. */
  const brandBack = '274 86 238 84 202 80 166 76 130 70 94 66 58 46';
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        <path d="M22 100h276" strokeWidth="1.5" />
        <path d="M22 16v84" strokeWidth="1.5" />
      </g>

      <path className="art-ground" d={`${brand} 274 100 22 100Z`} />
      <path className="art-gap-area" d={`${category} ${brandBack}Z`} />

      {/* категория: просела и вернулась */}
      <g className="art-mid">
        <path d={category} strokeWidth="2.4" />
      </g>

      {/* бренд: тот же старт, но обратно не поднялся */}
      <path className="art-line" d={brand} strokeWidth="2.8" />
      <circle className="art-dot" cx="274" cy="86" r="3.8" />

      <path className="art-gap-mark" d="M292 40v46M288 40h8M288 86h8" strokeWidth="1.6" />
    </g>
  );
}

/*
 * CASE: условие решает не «попадёт ли строка», а что подставить в новую
 * колонку для этой строки. Слева строки, у каждой ячейка канала;
 * справа колонка, которую CASE дописывает, — она обведена акцентом.
 * Метка того же оттенка, что ячейка, по которой сработала ветка. Строки
 * без цветной ячейки не подошли ни под одну ветку и получили метку ELSE —
 * третий оттенок, который у ячеек не встречается: ELSE ловит всё остальное.
 *
 * Своя сцена, а не Split: до 2026-09-13 над CASE стояли две расходящиеся
 * линии, и пока они были одноцветной схемой, это сходило за «развилку».
 * С залитым разрывом «бренд против рынка» картинка утверждала бы то,
 * о чём подводка не говорит.
 */
function Branches() {
  /** Ветка, по которой прошла строка: 1 — ecom, 2 — pharmacy, 0 — ни одна (ELSE). */
  const rows: Array<0 | 1 | 2> = [1, 0, 2, 0, 1, 0, 2];
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {rows.map((branch, i) => {
        const y = 21 + i * 12;
        return (
          <g key={i}>
            <rect
              className={branch ? `art-cat-${branch}-soft` : 'art-cell-none'}
              x="54" y={y - 3} width="16" height="6" rx="1.5" strokeWidth="1.2"
            />
            <path className="art-mid" d={`M78 ${y}h40M124 ${y}h28M158 ${y}h${i % 2 ? 14 : 22}`} stroke="currentColor" strokeWidth="3" strokeLinecap="butt" fill="none" />
            <path className="art-far" d={`M186 ${y}h20`} stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 3" fill="none" />
            <rect className={`art-cat-${branch || 3}`} x="214" y={y - 3} width="54" height="6" rx="1.5" />
          </g>
        );
      })}
      <rect className="art-line" x="208" y="10" width="66" height="94" rx="4" strokeWidth="1.8" />
    </g>
  );
}

/*
 * Одно число раскладывается на два множителя: слева целое, справа те же
 * данные как произведение. Акцентом назван не множитель, а сама стрелка —
 * то есть действие разложения. Выделить один из множителей значило бы
 * заранее показать пальцем на виновника, которого человек как раз и должен
 * найти сам по числам в задании.
 */
function Factors() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* целое: одно число, о котором спорить бесполезно */}
      <g className="art-near">
        <rect x="24" y="30" width="46" height="56" rx="3" strokeWidth="1.8" />
      </g>

      {/* разложение */}
      <path className="art-line" d="M84 58h30" strokeWidth="2.4" />
      <path className="art-line" d="m108 52 7 6-7 6" strokeWidth="2.4" />

      {/* множители и знак умножения между ними */}
      <g className="art-mid">
        <rect x="130" y="30" width="46" height="56" rx="3" strokeWidth="1.8" />
        <rect x="228" y="30" width="46" height="56" rx="3" strokeWidth="1.8" />
      </g>
      <g className="art-far">
        <path d="m194 52 16 12M210 52l-16 12" strokeWidth="1.8" />
      </g>
    </g>
  );
}

/*
 * Полки с товаром: три ряда точек на трёх полках, и меньше половины из них
 * ещё заняты. Ровно та форма, которую называет проза фазы, — не «продажи
 * упали», а «бренд перестали брать больше половины точек».
 *
 * Оставшиеся точки идут подряд, а не вразброс: вразброс честнее по жизни,
 * но на 116 пикселях высоты читается как шум, а сцена обязана сообщать одно
 * — «занято меньше половины» — и сообщать это до чтения текста.
 *
 * Занятые места — `art-kept`, освободившиеся — `art-dropped`: та же пара,
 * что у HAVING в `threshold`, только здесь «отсечено» не запросом,
 * а рынком. Акцент всё равно достаётся оставшимся, а не потерянным:
 * там, где бренд ещё стоит, продажи живые, и упал не спрос, а доступ к полке.
 */
function Outlets() {
  const rows = [22, 54, 86];
  /** Точек в ряду и сколько из них ещё заняты — 17 из 36, та же доля, что 37 из 79. */
  const perRow = 12;
  const kept = [6, 6, 5];
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {rows.map((y, r) => (
        <g key={y}>
          {/* сама полка */}
          <path className="art-far" d={`M22 ${y + 11}h276`} stroke="currentColor" strokeWidth="1.5" fill="none" />

          {/* занятые места */}
          {Array.from({ length: kept[r] }, (_, i) => (
            <circle key={i} className="art-kept" cx={34 + i * 24} cy={y} r="5" strokeWidth="1.8" />
          ))}

          {/* освободившиеся: пустой пунктирный контур — место есть, товара нет */}
          {Array.from({ length: perRow - kept[r] }, (_, i) => (
            <circle key={i} className="art-dropped" cx={34 + (kept[r] + i) * 24} cy={y} r="5" strokeWidth="1.4" strokeDasharray="2 3" />
          ))}
        </g>
      ))}
    </g>
  );
}

/*
 * Те же полки, что в `outlets`, но освободившиеся места уже заняты — другим
 * знаком. Единственный акцент сцены отдан не нашему бренду, а чужому: текст
 * рядом говорит ровно об этом, полка не пустует, её кто-то забрал.
 *
 * Форма важнее цвета: кружок и квадрат различаются и в монохроме, и на
 * телефоне в 320 пикселей, а два цвета на одной полке пришлось бы объяснять.
 */
function Rival() {
  const rows = [22, 54, 86];
  const perRow = 12;
  const kept = [6, 6, 5];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {rows.map((y, r) => (
        <g key={y}>
          <g className="art-far">
            <path d={`M22 ${y + 11}h276`} strokeWidth="1.5" />
          </g>

          {/* наш бренд: то, что осталось, и уже без акцента */}
          <g className="art-mid">
            {Array.from({ length: kept[r] }, (_, i) => (
              <circle key={i} cx={34 + i * 24} cy={y} r="5" strokeWidth="1.8" />
            ))}
          </g>

          {/* чужой знак на освободившихся местах */}
          {Array.from({ length: perRow - kept[r] }, (_, i) => (
            <rect
              key={i}
              className="art-line"
              x={34 + (kept[r] + i) * 24 - 4.5}
              y={y - 4.5}
              width="9"
              height="9"
              rx="1.5"
              strokeWidth="2"
            />
          ))}
        </g>
      ))}
    </g>
  );
}

/*
 * Прайс-лист: ряды позиций, у каждой длинное имя и короткое число справа.
 * Акцент отдан колонке цен — единственному, что в первый день будет
 * фильтроваться и сортироваться, и единственному, о чём говорит текст.
 */
function Catalog() {
  const rows = [30, 46, 62, 78, 94];
  /** Разная длина имён — чтобы ряды читались как названия, а не как полосы. */
  const names = [148, 176, 132, 190, 160];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* шапка таблицы */}
      <g className="art-far">
        <path d="M24 18h124M188 18h44M252 18h44" strokeWidth="2.5" strokeLinecap="butt" />
        <path d="M24 24h272" strokeWidth="1" />
      </g>

      <g className="art-mid">
        {rows.map((y, i) => (
          <path key={y} d={`M24 ${y}h${names[i]}`} strokeWidth="2.5" strokeLinecap="butt" />
        ))}
      </g>

      {/* колонка цен */}
      {rows.map((y) => (
        <path key={y} className="art-line" d={`M252 ${y}h44`} strokeWidth="2.5" strokeLinecap="butt" />
      ))}
    </g>
  );
}

/*
 * Две таблицы, между которыми связи ещё нет: понедельник кончается на том,
 * что прайс человек читать умеет, а продажи лежат отдельно. Акцентом названа
 * не таблица, а разрыв — две встречные стрелки, которые не сходятся.
 * В четверг тот же кадр закрывается сценой `join`.
 *
 * Смысл у сцены один везде, где она стоит: два факта лежат порознь, и
 * соединить их — завтрашняя работа (крючки дней 1, 8 и 22). До 2026-09-14
 * здесь было написано, что `tables` → `join` — единственная пара в кампании;
 * пар теперь больше (`flow` → `level` в неделе 5), и слово «единственная»
 * было бы неправдой.
 */
function Tables() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <rect x="20" y="24" width="104" height="68" rx="4" strokeWidth="1.6" />
        <path d="M20 40h104" strokeWidth="1.2" />
        <path d="M32 54h64M32 66h72M32 78h56" strokeWidth="2" strokeLinecap="butt" />

        <rect x="196" y="24" width="104" height="68" rx="4" strokeWidth="1.6" />
        <path d="M196 40h104" strokeWidth="1.2" />
        <path d="M208 54h72M208 66h58M208 78h68" strokeWidth="2" strokeLinecap="butt" />
      </g>

      {/* разрыв между ними: стрелки идут навстречу и не встречаются */}
      <path className="art-line" d="M134 58h20" strokeWidth="2.2" />
      <path className="art-line" d="m148 52 6 6-6 6" strokeWidth="2.2" />
      <path className="art-line" d="M186 58h-20" strokeWidth="2.2" />
      <path className="art-line" d="m172 52-6 6 6 6" strokeWidth="2.2" />
    </g>
  );
}

/*
 * Тот же кадр, что в `tables`, но ключ найден: в каждой таблице подсвечена
 * одна строка-колонка, и между ними сплошная линия. Разрыв из понедельника
 * закрыт — это и есть весь смысл четверга.
 */
function Join() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <rect x="20" y="24" width="104" height="68" rx="4" strokeWidth="1.6" />
        <path d="M20 40h104" strokeWidth="1.2" />
        <path d="M32 66h72M32 78h56" strokeWidth="2" strokeLinecap="butt" />

        <rect x="196" y="24" width="104" height="68" rx="4" strokeWidth="1.6" />
        <path d="M196 40h104" strokeWidth="1.2" />
        <path d="M208 66h58M208 78h68" strokeWidth="2" strokeLinecap="butt" />
      </g>

      {/* общий ключ: одинаковая колонка в обеих таблицах и линия между ними */}
      <path className="art-line" d="M32 54h64" strokeWidth="2.6" strokeLinecap="butt" />
      <path className="art-line" d="M208 54h64" strokeWidth="2.6" strokeLinecap="butt" />
      <path className="art-line" d="M124 54h72" strokeWidth="2.2" />
      <g className="art-near">
        <circle cx="124" cy="54" r="3" strokeWidth="2" />
        <circle cx="196" cy="54" r="3" strokeWidth="2" />
      </g>
    </g>
  );
}

/*
 * Отбор строк: слева пришло много, воронка посередине — она и есть WHERE,
 * о котором говорит подводка. Справа — то, что прошло: три строки, залитые
 * `art-kept`, тем же языком, что отобранные строки на мониторе утра маски.
 * Отсечённые не рисуются: вход остаётся одинаково второстепенным по обе
 * стороны, а какие именно строки не прошли — воронка не помнит.
 */
function Filter() {
  const kept = [42, 58, 74];
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path className="art-mid" d="M20 26h84M20 42h84M20 58h84M20 74h84M20 90h84" stroke="currentColor" strokeWidth="2.6" strokeLinecap="butt" fill="none" />

      <path className="art-line" d="M122 22h72l-25 30v34l-22 9V52z" strokeWidth="2.2" fill="none" stroke="currentColor" />

      {kept.map((y) => (
        <rect key={y} className="art-kept" x="216" y={y - 4} width="80" height="8" rx="2" strokeWidth="1.4" />
      ))}
    </g>
  );
}

/*
 * Сортировка и обрезка: столбики уже выстроены по убыванию, и LIMIT берёт
 * верхние — не одного победителя, а сколько сказано. Отобранные залиты
 * `art-kept`, остаток — пустым пунктиром `art-dropped`: тот же язык,
 * что у HAVING в `threshold`, только порог здесь не по значению, а по ранту.
 */
function Sort() {
  const bars = [
    { x: 26, h: 74 },
    { x: 60, h: 64 },
    { x: 94, h: 56 },
    { x: 128, h: 46 },
    { x: 162, h: 38 },
    { x: 196, h: 30 },
    { x: 230, h: 24 },
    { x: 264, h: 18 },
  ];
  const keptCount = 3;
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path className="art-far" d="M18 102h284" stroke="currentColor" strokeWidth="1.5" fill="none" />

      {bars.map((b, i) => (
        <rect
          key={b.x}
          className={i < keptCount ? 'art-kept' : 'art-dropped'}
          x={b.x}
          y={102 - b.h}
          width="22"
          height={b.h}
          rx="2"
          strokeWidth={i < keptCount ? 1.6 : 1.4}
          strokeDasharray={i < keptCount ? undefined : '3 3'}
        />
      ))}
    </g>
  );
}

/*
 * Свёртка: много строк слева превращаются в одно число справа. Акцент отдан
 * стрелке, то есть самому действию, — ровно как в сцене `factors`, где
 * акцентировано разложение, а не множители.
 */
function Fold() {
  const rows = [22, 34, 46, 58, 70, 82];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        {rows.map((y) => (
          <path key={y} d={`M24 ${y}h92`} strokeWidth="2.4" strokeLinecap="butt" />
        ))}
      </g>

      <path className="art-line" d="M136 52h32" strokeWidth="2.4" />
      <path className="art-line" d="m162 46 7 6-7 6" strokeWidth="2.4" />

      <g className="art-near">
        <rect x="196" y="36" width="100" height="34" rx="3" strokeWidth="1.8" />
        <path d="M218 53h56" strokeWidth="3.2" strokeLinecap="butt" />
      </g>
    </g>
  );
}

/*
 * Три способа посчитать одно и то же множество: все ячейки, только
 * заполненные, только разные. Слева направо число убывает — это и есть
 * весь смысл сцены. Средняя и правая колонки честно рисуют то, что метод
 * исключает: пропущенные NULL и повторы залиты пустым пунктиром
 * `art-dropped`, оставшиеся — `art-kept`. До этой правки колонка DISTINCT
 * просто не рисовала исключённые повторы, и её честность держалась на слово.
 */
function Counts() {
  const ys = [18, 34, 50, 66, 82, 98];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* всё подряд: COUNT(*) не различает строки */}
      <g className="art-mid">
        {ys.map((y) => (
          <circle key={y} cx="60" cy={y} r="6" strokeWidth="1.8" />
        ))}
      </g>

      {/* только заполненные: COUNT(колонка) пропускает NULL */}
      {ys.slice(0, 4).map((y) => (
        <circle key={y} className="art-kept" cx="160" cy={y} r="6" strokeWidth="1.6" />
      ))}
      {ys.slice(4).map((y) => (
        <circle key={y} className="art-dropped" cx="160" cy={y} r="6" strokeWidth="1.4" strokeDasharray="2 3" />
      ))}

      {/* только разные: DISTINCT оставляет по одному значению из повторов */}
      {ys.slice(0, 3).map((y) => (
        <circle key={y} className="art-kept" cx="260" cy={y} r="6" strokeWidth="1.6" />
      ))}
      {ys.slice(3).map((y) => (
        <circle key={y} className="art-dropped" cx="260" cy={y} r="6" strokeWidth="1.4" strokeDasharray="2 3" />
      ))}
    </g>
  );
}

/*
 * Недели сворачиваются в месяцы: сверху частая гребёнка недель, снизу
 * дюжина широких блоков. Числа не подписаны намеренно — сцена говорит
 * «много мелкого стало немногим крупным», а не «пятьдесят два и двенадцать».
 */
function Calendar() {
  const ticks = Array.from({ length: 27 }, (_, i) => 24 + i * 10);
  const months = Array.from({ length: 12 }, (_, i) => 26 + i * 22);
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        {ticks.map((x) => (
          <path key={x} d={`M${x} 16v14`} strokeWidth="1.6" />
        ))}
      </g>

      <path className="art-line" d="M160 40v14" strokeWidth="2.4" />
      <path className="art-line" d="m154 48 6 7 6-7" strokeWidth="2.4" />

      <g className="art-mid">
        {months.map((x) => (
          <rect key={x} x={x} y="68" width="18" height="30" rx="2" strokeWidth="1.6" />
        ))}
      </g>
    </g>
  );
}

/*
 * Колонка мимо группировки: три строки честно собраны в группу, а четвёртая
 * стоит снаружи рамки и держится на пунктире — движок её откуда-то взял,
 * но откуда именно, не обещал. Акцент на ней: вопрос подводки — про неё.
 */
function Stray() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <rect x="26" y="14" width="176" height="66" rx="4" strokeWidth="1.8" />
        <path d="M42 32h140M42 48h116M42 64h132" strokeWidth="2.4" strokeLinecap="butt" />
      </g>

      <path className="art-line" d="M226 47h56" strokeWidth="2.8" strokeLinecap="butt" />
      <path className="art-line" d="M206 47h14" strokeWidth="1.6" strokeDasharray="3 4" />
      <g className="art-near">
        <circle cx="254" cy="76" r="3" strokeWidth="2" />
      </g>
      <path className="art-line" d="M254 55v14" strokeWidth="1.6" strokeDasharray="3 4" />
    </g>
  );
}

/*
 * Таблица розничных продаж: сетка, у которой много строк и несколько
 * колонок. Акцентом названа колонка штук — та мера, которую всю неделю
 * и будут складывать.
 */
function Sellout() {
  const rows = [44, 58, 72, 86];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <rect x="20" y="14" width="280" height="88" rx="4" strokeWidth="1.8" />
        <path d="M20 32h280" strokeWidth="1.5" />
        <path d="M104 14v88M188 14v88M244 14v88" strokeWidth="1.2" />
      </g>

      <g className="art-far">
        <path d="M32 24h56M116 24h56M200 24h32" strokeWidth="2.2" strokeLinecap="butt" />
        {rows.map((y) => (
          <g key={y}>
            <path d={`M32 ${y}h58M116 ${y}h48M200 ${y}h28`} strokeWidth="2.2" strokeLinecap="butt" />
          </g>
        ))}
      </g>

      <path className="art-line" d="M256 24h30" strokeWidth="2.4" strokeLinecap="butt" />
      {rows.map((y) => (
        <path key={y} className="art-line" d={`M256 ${y}h30`} strokeWidth="2.4" strokeLinecap="butt" />
      ))}
    </g>
  );
}

/*
 * Цена соединения: часть строк ушла в результат, а часть провалилась мимо
 * него — молча, вниз за кадр. Строка слева, которой не нашлось пары, залита
 * пустым пунктиром `art-dropped» — тем же языком, что и строки, отсечённые
 * HAVING в `threshold`. Строки, дошедшие до результата справа, — `art-kept`.
 * Сама «пропажа» внизу остаётся монохромной: она не строка из левой таблицы,
 * а обобщённый знак «где-то была пара, которой не нашлось», и красить его
 * в одиночный оттенок значило бы использовать цвет для украшения.
 */
function Dropped() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <rect className="art-mid" x="20" y="12" width="146" height="58" rx="4" stroke="currentColor" strokeWidth="1.7" fill="none" />
      <path className="art-mid" d="M34 28h104M34 42h86" stroke="currentColor" strokeWidth="2.2" strokeLinecap="butt" fill="none" />
      <path className="art-dropped" d="M34 56h112" strokeWidth="2.2" strokeLinecap="butt" strokeDasharray="4 3" />

      <rect className="art-mid" x="222" y="12" width="78" height="58" rx="4" stroke="currentColor" strokeWidth="1.7" fill="none" />
      <path className="art-kept" d="M236 28h50" strokeWidth="3" strokeLinecap="butt" />
      <path className="art-kept" d="M236 42h42" strokeWidth="3" strokeLinecap="butt" />

      <g className="art-far" fill="none" stroke="currentColor">
        <path d="M178 41h32" strokeWidth="1.8" />
        <path d="m204 35 6 6-6 6" strokeWidth="1.8" />
      </g>

      {/* то, чему не нашлось пары */}
      <path className="art-line" d="M118 78v18" strokeWidth="2" strokeDasharray="4 4" fill="none" />
      <path className="art-line" d="m111 89 7 9 7-9" strokeWidth="2" fill="none" />
    </g>
  );
}

/*
 * Порог после группировки: столбики уже посчитаны по группам, и линия
 * отсекает те, что не дотянули. Акцент — сама линия: HAVING это она,
 * а не столбики.
 *
 * Прошедшее залито бледным акцентом — тем же языком, что отобранные
 * строки на мониторе утра маски; отсечённое остаётся пустым пунктирным
 * контуром: его в ответе нет. Сцена стоит и над HAVING, и в итоге дня
 * масок («дороже 100»), и в обоих местах значит одно: условие оставляет
 * то, что выше линии.
 */
function Threshold() {
  const bars = [
    { x: 26, h: 72 },
    { x: 62, h: 40 },
    { x: 98, h: 86 },
    { x: 134, h: 28 },
    { x: 170, h: 64 },
    { x: 206, h: 22 },
    { x: 242, h: 54 },
    { x: 278, h: 34 },
  ];
  const cut = 50;
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path className="art-far" d="M18 102h288" stroke="currentColor" strokeWidth="1.5" fill="none" />

      {bars.map((b) =>
        b.h >= cut ? (
          <rect key={b.x} className="art-kept" x={b.x} y={102 - b.h} width="20" height={b.h} rx="2" strokeWidth="1.6" />
        ) : (
          <rect key={b.x} className="art-dropped" x={b.x} y={102 - b.h} width="20" height={b.h} rx="2" strokeWidth="1.4" strokeDasharray="3 3" />
        ),
      )}

      <path className="art-line" d="M14 52h292" strokeWidth="2.4" strokeDasharray="7 5" />
    </g>
  );
}

/*
 * Собранный инструмент: три блока понедельника стоят в ряд и сцеплены.
 * Акцент на сцепках, а не на блоках: находка дня в том, что три приёма
 * работают вместе, а не в том, что их три.
 */
function Toolkit() {
  const boxes = [26, 124, 222];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        {boxes.map((x) => (
          <rect key={x} x={x} y="30" width="72" height="52" rx="4" strokeWidth="1.8" />
        ))}
        <path d="M42 48h40M42 62h28" strokeWidth="2.2" strokeLinecap="butt" />
        <path d="M140 48h40M140 62h24" strokeWidth="2.2" strokeLinecap="butt" />
        <path d="M238 48h40M238 62h32" strokeWidth="2.2" strokeLinecap="butt" />
      </g>

      <path className="art-line" d="M98 56h26M196 56h26" strokeWidth="2.6" />
      <g className="art-near">
        <circle cx="111" cy="56" r="3" strokeWidth="2" />
        <circle cx="209" cy="56" r="3" strokeWidth="2" />
      </g>
    </g>
  );
}

/*
 * Переговорная перед встречей: экран на стене, стол, часы. Натюрморт
 * (2026-09-13, восьмой заход) — та же материя, что у стола и `Boardroom`
 * (`art-body`/`art-screen`/`art-wood`/`art-mug`), а не контур. Пара кружек
 * на столе — тем же языком, что в `Boardroom`: встреча на двоих. Акцент
 * по-прежнему только часы — крючки держатся не на комнате, а на времени.
 */
function Meeting() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <rect className="art-body" x="70" y="12" width="130" height="50" rx="3" />
      <rect className="art-screen" x="76" y="18" width="118" height="38" rx="1.5" />

      <path className="art-mid" d="M52 100h216" stroke="currentColor" strokeWidth="2" fill="none" />
      <path className="art-mid" d="M78 100 96 76h128l18 24" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect className="art-wood" x="96" y="85" width="128" height="4" />

      {/* пара кружек: здесь ждут вдвоём */}
      <rect className="art-mug" x="112" y="90" width="10" height="10" rx="1.6" />
      <rect className="art-mug" x="198" y="90" width="10" height="10" rx="1.6" />

      <circle className="art-paper" cx="264" cy="34" r="18" />
      <circle className="art-mid" cx="264" cy="34" r="18" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path className="art-line" d="M264 34V22M264 34l9 6" strokeWidth="2.2" fill="none" />
    </g>
  );
}

/*
 * Разговор между делом: две чашки на узком столике у автомата, пар над ними
 * и дверной проём в стороне. Натюрморт (2026-09-13, восьмой заход) —
 * столик и чашки теперь той же материей, что стол и кружка утра
 * (`art-wood`/`art-mug`), а не контуром. Акцент на пар — единственное
 * движение в кадре, и оно же единственное, что отличает эту сцену
 * от рабочего места: здесь никто не работает, здесь разговаривают.
 */
function Corridor() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far" fill="none" stroke="currentColor">
        <path d="M24 22v78M24 22h56v78" strokeWidth="1.6" />
        <path d="M232 20h64v54h-64z" strokeWidth="1.6" />
        <path d="M244 36h40M244 48h28" strokeWidth="1.6" strokeLinecap="butt" />
      </g>

      <path className="art-mid" d="M118 100V84h92v16" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect className="art-wood" x="96" y="97" width="136" height="3.5" />

      <rect className="art-mug" x="132" y="72" width="16" height="12" rx="2" />
      <path d="M148 75c4 0 4 6 0 6" style={{ stroke: 'var(--art-mug)' }} strokeWidth="1.3" fill="none" />
      <rect className="art-mug" x="176" y="72" width="16" height="12" rx="2" />
      <path d="M192 75c4 0 4 6 0 6" style={{ stroke: 'var(--art-mug)' }} strokeWidth="1.3" fill="none" />

      <path className="art-line" d="M142 60c-6-6 6-10 0-16M186 60c-6-6 6-10 0-16" strokeWidth="2.2" fill="none" />
    </g>
  );
}

/*
 * Размытая просьба: слева пузырь сообщения с двумя строками, справа три
 * одинаково пустые рамки — три отчёта, каждый из которых честно называется
 * «дашборд по продажам». Акцентом выделены расходящиеся линии, а не рамки:
 * беда понедельника не в том, что вариантов три, а в том, что просьба ведёт
 * ко всем трём сразу и выбрать по ней нельзя.
 */
function Request() {
  const rows = [24, 54, 84];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <rect x="18" y="38" width="96" height="44" rx="4" strokeWidth="1.8" />
        <path d="M34 54h64M34 66h40" strokeWidth="1.6" strokeLinecap="butt" />
        <path d="M30 82v12l14-12" strokeWidth="1.8" />
      </g>

      <g className="art-far">
        {rows.map((y) => (
          <rect key={y} x="234" y={y} width="68" height="26" rx="3" strokeWidth="1.5" strokeDasharray="4 4" />
        ))}
      </g>

      <path
        className="art-line"
        d="M120 60c40 0 44-23 108-23M120 60h108M120 60c40 0 44 23 108 23"
        strokeWidth="2.2"
      />
    </g>
  );
}

/*
 * Одно имя в двух написаниях: две строки, сходящиеся в одну точку. Акцент
 * на месте слияния, а не на самих строках — находка дня в том, что это
 * одна сеть, а не в том, что записей две.
 */
function Twins() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <rect x="24" y="16" width="96" height="26" rx="3" strokeWidth="1.8" />
        <rect x="24" y="74" width="96" height="26" rx="3" strokeWidth="1.8" />
      </g>

      <g className="art-far">
        <path d="M38 29h68M38 87h52" strokeWidth="1.6" strokeLinecap="butt" />
        <rect x="212" y="42" width="84" height="32" rx="3" strokeWidth="1.6" strokeDasharray="4 4" />
        <path d="M228 58h52" strokeWidth="1.5" strokeLinecap="butt" />
      </g>

      <path className="art-line" d="M120 29h44c14 0 14 29 28 29M120 87h44c14 0 14-29 28-29M192 58h20M204 52l8 6-8 6" strokeWidth="2.2" />
    </g>
  );
}

/*
 * Взгляд на строку назад: столбик строк таблицы, у каждой — своё значение
 * справа, и акцентом дуга от одной строки к предыдущей. Ряд намеренно
 * не сворачивается ни во что: смысл окна в том, что строк остаётся столько
 * же, сколько было, — этим оно и отличается от группировки, которую человек
 * знает с первой недели.
 */
function Shift() {
  const rows = [20, 42, 64, 86];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        {rows.map((y) => (
          <rect key={y} x="46" y={y} width="150" height="16" rx="2" strokeWidth="1.6" />
        ))}
      </g>

      <g className="art-far">
        {rows.map((y) => (
          <path key={y} d={`M60 ${y + 8}h34M120 ${y + 8}h62`} strokeWidth="1.5" strokeLinecap="butt" />
        ))}
      </g>

      <g className="art-near">
        {rows.slice(1).map((y) => (
          <rect key={y} x="214" y={y} width="58" height="16" rx="2" strokeWidth="1.5" strokeDasharray="4 3" />
        ))}
      </g>

      <path className="art-line" d="M204 72c22 0 22-22 0-22M204 50l6-5M204 50l6 5" strokeWidth="2.2" />
    </g>
  );
}

/*
 * Спор о метрике: два столбца под одной и той же подписью, разной высоты.
 * Столбцы намеренно одинаковы по ширине и стилю: спорят не о том, чей
 * способ лучше, а о том, что вошло в счёт. Разница между ними — учебный
 * пример устройства «разница величин» из правил: заливка `art-gap-area`
 * между вершинами столбцов и скоба `art-gap-mark` того же тона.
 */
function Dispute() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path className="art-mid" d="M30 98h250" stroke="currentColor" strokeWidth="2" fill="none" />
      <rect className="art-mid" x="62" y="44" width="56" height="54" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect className="art-mid" x="150" y="24" width="56" height="74" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />

      <rect className="art-gap-area" x="118" y="24" width="32" height="20" />

      <g className="art-far" fill="none" stroke="currentColor">
        <path d="M64 108h52M152 108h52" strokeWidth="1.6" strokeLinecap="butt" />
        <path d="M118 44h114M206 24h26" strokeWidth="1.3" strokeDasharray="4 4" strokeLinecap="butt" />
      </g>

      <path className="art-gap-mark" d="M244 24v20M236 24h16M236 44h16" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  );
}

/*
 * Записанное определение: карточка метрики с заголовком и тремя строками,
 * у каждой — короткое имя поля и значение. Акцент на одной строке, потому
 * что день упирается не в саму карточку, а в тот её пункт, который обычно
 * и пропускают. Печать в углу — то, что отличает договорённость от заметки.
 */
function Contract() {
  const rows = [46, 66, 86];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <rect x="26" y="14" width="212" height="92" rx="4" strokeWidth="1.8" />
        <path d="M42 32h96" strokeWidth="2.4" strokeLinecap="butt" />
      </g>

      <g className="art-far">
        {rows.map((y) => (
          <path key={y} d={`M42 ${y}h40M96 ${y}h126`} strokeWidth="1.5" strokeLinecap="butt" />
        ))}
      </g>

      <g className="art-near">
        <circle cx="268" cy="80" r="20" strokeWidth="1.8" />
        <path d="M258 80l7 7 13-14" strokeWidth="2" />
      </g>

      <path className="art-line" d="M42 66h40M96 66h126" strokeWidth="2.4" strokeLinecap="butt" />
    </g>
  );
}

/*
 * Граница готового: слева четыре пункта списка, справа за вертикальной чертой
 * те же по счёту пункты пунктиром — то, что в задачу не входит. Отобранное
 * и отброшенное здесь совпадают буквально с `art-kept`/`art-dropped»:
 * галочка залита, пункт вне границы — пустой пунктирный контур. Пунктирное
 * справа намеренно не короче сплошного слева — «за границей» всегда
 * остаётся столько же, сколько внутри, и работа заканчивается не тогда,
 * когда сделано всё. Черта посередине — сама граница, ей нужен свой,
 * нейтральный акцент, а не один из двух исходов.
 */
function Scope() {
  const rows = [24, 46, 68, 90];
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {rows.map((y) => (
        <path key={`row-${y}`} className="art-mid" d={`M20 ${y}h116`} stroke="currentColor" strokeWidth="2" strokeLinecap="butt" fill="none" />
      ))}

      {rows.map((y) => (
        <rect key={y} className="art-kept" x="8" y={y - 5} width="10" height="10" rx="2" strokeWidth="1.6" />
      ))}

      {rows.map((y) => (
        <path key={y} className="art-dropped" d={`M182 ${y}h130`} strokeWidth="1.6" strokeDasharray="5 5" strokeLinecap="butt" fill="none" />
      ))}

      <path className="art-line" d="M160 12v92" strokeWidth="2.4" fill="none" stroke="currentColor" />
    </g>
  );
}

/*
 * Фундамент: широкое основание из двух блоков — агрегат и группировка, —
 * а на нём приглушённо стоит то, что будет строиться дальше. Акцент внизу,
 * потому что находка вторника не в трёх решённых заданиях, а в том, что без
 * этих двух приёмов на неделе не будет ни одного запроса.
 */
function Foundation() {
  const upper = [40, 108, 176, 244];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        {upper.map((x) => (
          <rect key={x} x={x} y="18" width="48" height="34" rx="3" strokeWidth="1.5" strokeDasharray="4 4" />
        ))}
      </g>

      <rect className="art-line" x="30" y="64" width="120" height="34" rx="3" strokeWidth="2.2" />
      <rect className="art-line" x="164" y="64" width="126" height="34" rx="3" strokeWidth="2.2" />
    </g>
  );
}

/*
 * Два языка одного бренда: слева столбик выручки, справа ряд точек, в которых
 * он стоит. Акцент отдан точкам — суждение четверга ровно про то, что охват
 * выглядит служебной подробностью, а на деле это отдельная метрика.
 */
function Coverage() {
  const dots = Array.from({ length: 9 }, (_, i) => 150 + i * 19);
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        <path d="M20 100h280" strokeWidth="1.5" />
      </g>

      {/* выручка */}
      <g className="art-mid">
        <rect x="34" y="24" width="34" height="76" rx="2" strokeWidth="1.8" />
        <rect x="80" y="46" width="34" height="54" rx="2" strokeWidth="1.8" />
      </g>

      {/* охват */}
      <g className="art-far">
        <path d="M150 72h162" strokeWidth="1.4" strokeDasharray="3 4" />
      </g>
      {dots.map((x) => (
        <circle key={x} className="art-line" cx={x} cy="56" r="6" strokeWidth="2.2" />
      ))}
    </g>
  );
}

/*
 * Сглаживание: тот же ряд двумя линиями.
 *
 * Зубчатая — наблюдения как есть, гладкая — скользящее окно поверх них.
 * Смысл сцены ровно в том, что линий две и они об одном: сглаженный ряд
 * не заменяет исходный, а ложится рядом, — и именно это говорит подводка
 * четверга. Начало гладкой линии сдвинуто вправо на три шага: у окна из
 * четырёх наблюдений первых трёх значений нет, и это тот самый факт,
 * который спрашивает py-036.
 */
function Smooth() {
  const raw = 'M22 84 44 62 66 88 88 58 110 80 132 52 154 76 176 48 198 70 220 44 242 64 264 40 286 58';
  const mean = 'M88 76 110 72 132 70 154 66 176 63 198 60 220 56 242 53 264 50 286 47';
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        <path d="M22 100h276" strokeWidth="1.5" />
        <path d="M22 20v80" strokeWidth="1.5" />
      </g>

      {/* окно, из которого посчитана первая точка гладкой линии */}
      <rect className="art-band" x="22" y="20" width="66" height="80" rx="2" stroke="none" />

      <path className="art-far" d={raw} strokeWidth="1.6" />
      <path className="art-line" d={mean} strokeWidth="2.6" />
      <g className="art-near">
        <circle cx="88" cy="76" r="3.2" strokeWidth="2" />
      </g>
    </g>
  );
}

/*
 * Поток и уровень: столбцы прихода и накопленный остаток одной картинкой.
 *
 * Столбцы одинаковы, кроме трёх высоких в середине, — и после них снова
 * одинаковы: поток вернулся. Линия уровня поднимается вместе со всплеском
 * и дальше идёт полкой: уровень не вернулся. Вся пятница держится на том,
 * что это два разных факта об одном партнёре, и здесь они видны сразу,
 * потому что нарисованы в одних осях.
 *
 * **`flow` — та же сцена без линии уровня** (2026-09-14). Понедельник
 * и четверг недели 5 честно говорят «поток вернулся», и ровно это
 * и рисуется: три высоких столбца, дальше снова обычные. Линии нет, потому
 * что про уровень эти дни ещё не знают, — пятница дорисовывает её в тех же
 * осях, и пара работает как пара: картинка, которую человек видел всю
 * неделю, оказывается половиной картинки. Акцент без линии уходит
 * на три осенних столбца — единственное, о чём говорят эти дни.
 */
function Level({ withLevel = true }: { withLevel?: boolean }) {
  const bars = [78, 82, 76, 80, 44, 52, 46, 80, 84, 78, 82, 76];
  const spike = new Set([4, 5, 6]);
  const level = 'M22 96 46 94 70 92 94 90 118 62 142 40 166 30 190 29 214 28 238 28 262 27 286 26';
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        <path d="M22 100h276" strokeWidth="1.5" />
        <path d="M22 20v80" strokeWidth="1.5" />
      </g>

      {bars.map((y, i) => (
        <path
          key={i}
          className={!withLevel && spike.has(i) ? 'art-line' : 'art-near'}
          d={`M${34 + i * 22} 100V${y}`}
          strokeWidth="6"
        />
      ))}

      {withLevel && (
        <>
          <path className="art-line" d={level} strokeWidth="2.6" />
          <g className="art-near">
            <circle cx="286" cy="26" r="3.2" strokeWidth="2" />
          </g>
        </>
      )}
    </g>
  );
}

/*
 * Сравнение с собой год назад: пары столбцов, в каждой прошлый год контуром
 * и нынешний плотнее. У всех, кроме одной, нынешний столбец чуть ниже
 * прошлого — ровно как у одиннадцати дистрибьюторов осенью 2025 года; у одной
 * он вдвое выше, и акцент у него. Смысл сцены — точка отсчёта: число само
 * по себе не «много», много оно против себя же год назад.
 */
function Yoy() {
  const pairs = [
    { was: 40, now: 37 },
    { was: 34, now: 31 },
    { was: 42, now: 80, hot: true },
    { was: 30, now: 27 },
    { was: 38, now: 35 },
    { was: 26, now: 24 },
  ];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path className="art-far" d="M18 100h288" strokeWidth="1.5" />
      {pairs.map((p, i) => {
        const x = 30 + i * 46;
        return (
          <g key={i}>
            <rect className="art-far" x={x} y={100 - p.was} width="14" height={p.was} rx="1.5" strokeWidth="1.6" />
            <rect
              className={p.hot ? 'art-line' : 'art-near'}
              x={x + 18}
              y={100 - p.now}
              width="14"
              height={p.now}
              rx="1.5"
              strokeWidth={p.hot ? 2.4 : 1.8}
            />
          </g>
        );
      })}
    </g>
  );
}

/*
 * Версии, закрытые числами: четыре карточки, закрытые — пустой пунктир
 * и перечёркнуты (тот же язык `art-dropped`, что у отсечённого в `threshold`).
 *
 * Два случая, и акцент в них разный, потому что текст рядом говорит
 * о разном. `versions` (пятница недели 4): три закрыты, четвёртая стоит,
 * и у неё хвостик реплики — она держится не на данных, а на словах
 * человека, на переписке Мори-сан; акцент отдан ей. `versions-half`
 * (итог дня 7): закрыты две из четырёх, две ещё открыты, и день говорит
 * именно о вычёркивании — «числами, а не мнением», — поэтому акцент
 * у штрихов, а открытые карточки нейтральны: про них день ещё не знает.
 */
function Versions({ closed, spoken }: { closed: number; spoken: boolean }) {
  const xs = [18, 92, 166, 240];
  const text = (x: number) => `M${x + 12} 40h36M${x + 12} 50h28M${x + 12} 60h32`;
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {xs.map((x, i) => {
        if (i < closed) {
          return (
            <g key={x}>
              <rect className="art-dropped" x={x} y="22" width="60" height="66" rx="4" strokeWidth="1.5" strokeDasharray="3 3" />
              <path className="art-far" d={text(x)} stroke="currentColor" strokeWidth="1.6" fill="none" />
              <path className={spoken ? 'art-mid' : 'art-line'} d={`M${x + 6} 82 ${x + 54} 28`} stroke="currentColor" strokeWidth={spoken ? 1.8 : 2.2} fill="none" />
            </g>
          );
        }
        if (spoken && i === xs.length - 1) {
          return (
            <g key={x}>
              <path className="art-line" d={`M${x + 4} 22h52a4 4 0 0 1 4 4v58a4 4 0 0 1-4 4h-36l-10 10v-10h-6a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4z`} strokeWidth="2" fill="none" />
              <path className="art-mid" d={text(x)} stroke="currentColor" strokeWidth="1.6" fill="none" />
            </g>
          );
        }
        return (
          <g key={x}>
            <rect className="art-mid" x={x} y="22" width="60" height="66" rx="4" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <path className="art-mid" d={text(x)} stroke="currentColor" strokeWidth="1.6" fill="none" />
          </g>
        );
      })}
    </g>
  );
}

/*
 * Соединение по неуникальному ключу: одна строка слева совпала с каждой
 * из нескольких строк справа, и в результат ушла столько раз, сколько
 * совпадений. Акцент — эта строка и её веер: день говорит ровно о том,
 * что строк стало больше, чем было, без единой ошибки. Стоит там, где
 * это случается: JOIN по бренду в дне 9 и тот же merge по бренду в дне 23.
 * До 2026-09-14 день 9 стоял на `stray` — колонке мимо группировки, другой
 * ошибке с другим симптомом (значение из случайной строки, а не лишние строки).
 */
function Fanout() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <rect x="20" y="22" width="92" height="72" rx="4" strokeWidth="1.7" />
        <path d="M34 40h64M34 76h64" strokeWidth="2.2" strokeLinecap="butt" />
        <rect x="208" y="14" width="92" height="90" rx="4" strokeWidth="1.7" />
      </g>
      <path className="art-line" d="M34 58h64" strokeWidth="3" strokeLinecap="butt" />
      <g className="art-line" strokeWidth="1.8">
        <path d="M112 58 208 26M112 58 208 48M112 58 208 70M112 58 208 92" />
      </g>
      <g className="art-near" strokeWidth="2.2" strokeLinecap="butt">
        <path d="M222 26h64M222 48h64M222 70h64M222 92h64" />
      </g>
    </g>
  );
}

/*
 * Блокнот: три шага подряд, у каждого слева строка кода, справа таблица,
 * которая после него осталась. Акцент — дуги от таблицы шага к следующему
 * шагу: находка понедельника недели 4 не в том, что таблиц три, а в том,
 * что следующий шаг берёт готовую по имени, а не пишет всё сначала, как
 * запрос. Тот же блокнот, что на мониторе утра (`desk-frames`), только
 * здесь видно, куда таблица идёт дальше.
 */
function Notebook() {
  const ys = [14, 48, 82];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {ys.map((y) => (
        <g key={y}>
          <path className="art-far" d={`M20 ${y}v20`} strokeWidth="1.6" />
          <path className="art-mid" d={`M30 ${y + 10}h70`} strokeWidth="2.4" strokeLinecap="butt" />
          <path className="art-far" d={`M108 ${y + 10}h50m-6-4 6 4-6 4`} strokeWidth="1.4" />
          <g className="art-near">
            <rect x="170" y={y} width="72" height="20" rx="2" strokeWidth="1.6" />
            <path d={`M170 ${y + 7}h72M194 ${y}v20M218 ${y}v20`} strokeWidth="1" />
          </g>
        </g>
      ))}
      <g className="art-line" strokeWidth="2">
        <path d="M206 34C206 44 116 40 104 58" />
        <path d="M206 68C206 78 116 74 104 92" />
      </g>
    </g>
  );
}

/*
 * Одна скобка или две: слева колонка сама по себе — Series, в одних
 * скобках; справа та же колонка, но с заголовком и в рамке таблицы —
 * DataFrame из одной колонки, во вторых скобках. Значения одинаковые,
 * тип разный, и акцент отдан ровно второй паре скобок: это всё, чем
 * записи различаются, и всё, о чём спрашивает py-006.
 */
function Brackets() {
  const cells = [34, 50, 66, 82];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path className="art-far" d="M72 22h-8v80h8M124 22h8v80h-8" strokeWidth="2" />
      <g className="art-mid">
        {cells.map((y) => (
          <rect key={y} x="82" y={y} width="32" height="12" rx="1.5" strokeWidth="1.5" />
        ))}
      </g>

      <path className="art-far" d="M212 22h-8v80h8M264 22h8v80h-8" strokeWidth="2" />
      <path className="art-line" d="M200 14h-12v96h12M276 14h12v96h-12" strokeWidth="2.2" />
      <g className="art-near">
        <rect x="222" y="22" width="32" height="8" rx="1.5" strokeWidth="1.8" />
        {cells.map((y) => (
          <rect key={y} x="222" y={y} width="32" height="12" rx="1.5" strokeWidth="1.5" />
        ))}
      </g>
    </g>
  );
}

/*
 * Находка не по плану (2026-09-13, восьмой заход): `outlets` стоял разом
 * за «бренд потерял полку» (пятница недели 1) и за «выручка на точку
 * не зависит от их числа» (среда недели 2) — те же кружки-полки честно
 * рисуют первое и молчат про второе. Своя сцена, а не перекраска: два
 * канала разного размера, столбец — выручка на одну точку канала,
 * ряд точек под ним — сколько точек у канала вообще. E-com высокий
 * и малолюдный, розница низкая и многолюдная — сама разница в счёте
 * точек и есть довод «сравнивать общей суммой нельзя». Цвет — группа
 * (`art-cat-1…2`, каналов два, оба ниже потолка в три): столбец и его
 * же точки одного оттенка, потому что счёт точек объясняет высоту
 * столбца, а не соседствует с ней просто так.
 */
function Channels() {
  const ecomDots = 4;
  const retailDots = 11;
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path className="art-far" d="M20 100h280" stroke="currentColor" strokeWidth="1.5" fill="none" />

      {/* высота столбца — выручка на одну точку канала */}
      <rect className="art-cat-1" x="46" y="20" width="40" height="80" rx="3" />
      <rect className="art-cat-2" x="146" y="78" width="40" height="22" rx="3" />

      {/* число точек канала — тот самый знаменатель */}
      {Array.from({ length: ecomDots }, (_, i) => (
        <circle key={i} className="art-cat-1-soft" cx={54 + i * 9} cy="108" r="3.4" strokeWidth="1.4" />
      ))}
      {Array.from({ length: retailDots }, (_, i) => (
        <circle key={i} className="art-cat-2-soft" cx={150 + i * 12} cy="108" r="3.4" strokeWidth="1.4" />
      ))}
    </g>
  );
}

/*
 * Находка не по плану (2026-09-13, восьмой заход): хук дня 11 стоял на
 * `split` — «категория просела и вернулась, бренд просел и не вернулся».
 * Разрыв «бренд против рынка» предрешал бы одно из трёх определений,
 * которые день 12 разводит свободно (что считать точкой, за какой период,
 * что делать при смене определения) — ни одно из них не про рынок вовсе.
 * Своя сцена, нейтральная: один термин ветвится на три ответа, и три знака
 * внутри рамок — три РАЗНЫХ, но ни один не назван верным. Цвета здесь
 * нет намеренно: назвать один из трёх ответов оттенком значило бы выбрать
 * за читателя то, что день 12 ещё только собирается решить.
 */
function Definitions() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-near">
        <rect x="18" y="42" width="60" height="32" rx="4" strokeWidth="1.8" />
      </g>

      <g className="art-far">
        <path d="M84 58c30-26 30-26 90-34M84 58h96M84 58c30 26 30 26 90 34" strokeWidth="1.6" />
      </g>

      <g className="art-mid">
        <rect x="184" y="12" width="46" height="30" rx="3" strokeWidth="1.6" />
        <rect x="184" y="43" width="46" height="30" rx="3" strokeWidth="1.6" />
        <rect x="184" y="74" width="46" height="30" rx="3" strokeWidth="1.6" />
      </g>

      {/* три разных знака — три разных ответа, ни один не назван верным */}
      <circle className="art-line" cx="207" cy="27" r="6" strokeWidth="2" />
      <rect className="art-line" x="200" y="51" width="14" height="14" rx="1.5" strokeWidth="2" />
      <path className="art-line" d="M200 96l7-12 7 12z" strokeWidth="2" />
    </g>
  );
}

/*
 * Находка grep-проверки (2026-09-13, одиннадцатый заход): `coverage` стояла
 * разом за «выручка бренда и охват» (день 4, положительный счёт точек, где
 * бренд есть) и за реплику дня 6 «список получен, но заметь, чего в нём
 * нет» — прямо противоположный смысл на той же картинке. Своя сцена.
 *
 * Список слева — то, что anti-join действительно даёт: обычный результат
 * запроса, приглушённый (art-mid), потому что это уже объяснено раньше
 * в дне. Акцент, единственный в сцене, — карточка справа: вопрос, на
 * который в данных нет ответа вовсе, кто стоит на полке вместо нас.
 * Разрыв между списком и карточкой ничем не заполнен — запрос одно
 * с другим не соединяет, и не может.
 */
function Absent() {
  const rows = [24, 42, 60, 78, 96];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <rect x="18" y="14" width="150" height="90" rx="4" strokeWidth="1.7" />
        {rows.map((y) => (
          <path key={y} d={`M32 ${y}h122`} strokeWidth="2.2" strokeLinecap="butt" />
        ))}
      </g>

      {/* карточка вопроса без ответа: пунктир — вне того, что запрос достаёт */}
      <rect className="art-line" x="220" y="24" width="80" height="68" rx="4" strokeWidth="1.8" strokeDasharray="4 4" />
      <path
        className="art-line"
        d="M250 46c0-7.5 6.5-11 12-11 6.5 0 12 4 12 11 0 6-5 8-9 11-2.3 1.7-3 3.6-3 6.4"
        strokeWidth="2.2"
      />
      <circle cx="260" cy="80" r="1.8" fill="currentColor" stroke="none" />
    </g>
  );
}
