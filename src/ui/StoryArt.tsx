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
import type { StoryScene } from '../content/storymode';

/*
 * Список сцен объявлен в контенте (content/storymode.ts), а не здесь: какие
 * сцены вообще бывают — вопрос кампании, а этот файл только рисует названное.
 * Так добавление сцены начинается там же, где пишется бит, который её просит.
 */

/** Общая рамка сцен: одна ширина и одна высота на все фазы. */
const VIEW_BOX = '0 0 320 116';

export function StoryArt({ scene }: { scene: StoryScene }) {
  return (
    <div className="story-art" aria-hidden>
      <svg viewBox={VIEW_BOX} role="presentation" preserveAspectRatio="xMidYMid meet">
        {scene === 'office' && <Office />}
        {scene === 'desk' && <Desk />}
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
        {scene === 'factors' && <Factors />}
        {scene === 'outlets' && <Outlets />}
        {scene === 'rival' && <Rival />}
        {scene === 'request' && <Request />}
        {scene === 'scope' && <Scope />}
        {scene === 'dispute' && <Dispute />}
        {scene === 'contract' && <Contract />}
        {scene === 'shift' && <Shift />}
      </svg>
    </div>
  );
}

/*
 * Первый день на месте: окно с городом, ряд столов, на ближнем — монитор
 * с тем самым столбчатым знаком. Акцентом выделен ровно один стол: это
 * «твоё место», и больше ничего в кадре внимания не просит.
 */
function Office() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* окно во всю заднюю стену и город за ним */}
      <g className="art-far">
        <rect x="24" y="10" width="272" height="44" rx="4" strokeWidth="1.5" />
        <path d="M24 40h272" strokeWidth="1" />
        <path d="M108 10v44M212 10v44" strokeWidth="1" />
        <path d="M40 40V26h14v14M62 40V20h10v20M96 40V30h9v10M132 40V24h12v16M158 40V32h8v8M236 40V22h11v18M256 40V31h9v9" strokeWidth="1.2" />
      </g>

      {/* дальний ряд столов */}
      <g className="art-mid">
        <path d="M36 78h60M52 78v10M84 78v10" strokeWidth="1.5" />
        <rect x="52" y="62" width="28" height="16" rx="2" strokeWidth="1.3" />
        <path d="M224 78h60M240 78v10M272 78v10" strokeWidth="1.5" />
        <rect x="240" y="62" width="28" height="16" rx="2" strokeWidth="1.3" />
      </g>

      {/* твоё место: монитор со столбцами */}
      <g className="art-near">
        <path d="M118 100h84M134 100v8M186 100v8" strokeWidth="1.8" />
        <rect x="130" y="66" width="60" height="34" rx="3" strokeWidth="1.8" />
        <path d="M144 90v-8M156 90v-14M168 90v-20M180 90v-11" strokeWidth="3" strokeLinecap="butt" />
      </g>

      {/* растение в углу — единственная деталь не по работе, и её достаточно */}
      <g className="art-mid">
        <path d="M292 104V88" strokeWidth="1.5" />
        <path d="M292 92c-7 0-11-4-11-9 6 0 11 4 11 9zM292 90c6 0 10-4 10-9-6 0-10 4-10 9z" strokeWidth="1.3" />
        <path d="M286 104h12" strokeWidth="2" />
      </g>
    </g>
  );
}

/*
 * Что делает GROUP BY, одной картинкой: слева стопка недельных строк,
 * справа — три столбца, в которые они сложились. Стрелка посередине
 * и есть агрегат. Ровно та мысль, которую абзацы теории объясняют словами.
 */
function Groups() {
  const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        {rows.map((i) => (
          <path key={i} d={`M16 ${14 + i * 8}h${i % 3 === 0 ? 74 : i % 3 === 1 ? 62 : 68}`} strokeWidth="3" strokeLinecap="butt" />
        ))}
      </g>

      <g className="art-far">
        <path d="M118 60h56" strokeWidth="1.5" />
        <path d="m166 54 8 6-8 6" strokeWidth="1.5" />
      </g>

      <g className="art-near">
        <path d="M200 100h104" strokeWidth="1.8" />
        <rect x="214" y="60" width="22" height="40" rx="2" strokeWidth="1.6" />
        <rect x="244" y="34" width="22" height="66" rx="2" strokeWidth="1.6" />
        <rect x="274" y="50" width="22" height="50" rx="2" strokeWidth="1.6" />
      </g>
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
 */
function Split() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        <path d="M22 100h276" strokeWidth="1.5" />
        <path d="M22 16v84" strokeWidth="1.5" />
      </g>

      {/* категория: просела и вернулась */}
      <g className="art-mid">
        <path d="M22 40 58 44 94 62 130 46 166 38 202 42 238 36 274 40" strokeWidth="2.4" />
      </g>

      {/* бренд: тот же старт, но обратно не поднялся */}
      <path className="art-line" d="M22 40 58 46 94 66 130 70 166 76 202 80 238 84 274 86" strokeWidth="2.6" />
      <g className="art-near">
        <circle cx="274" cy="86" r="3.4" strokeWidth="2" />
      </g>

      {/* разрыв между линиями назван вертикальной скобкой, без подписи */}
      <g className="art-far">
        <path d="M292 40v46" strokeWidth="1.2" strokeDasharray="3 4" />
        <path d="M288 40h8M288 86h8" strokeWidth="1.2" />
      </g>
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
 * Акцент достаётся оставшимся, а не потерянным, хотя история про потерю:
 * отсутствие нечем выделить. Это совпадает с мыслью фазы — там, где бренд
 * ещё стоит, продажи живые, и упал не спрос, а доступ к полке.
 */
function Outlets() {
  const rows = [22, 54, 86];
  /** Точек в ряду и сколько из них ещё заняты — 17 из 36, та же доля, что 37 из 79. */
  const perRow = 12;
  const kept = [6, 6, 5];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {rows.map((y, r) => (
        <g key={y}>
          {/* сама полка */}
          <g className="art-far">
            <path d={`M22 ${y + 11}h276`} strokeWidth="1.5" />
          </g>

          {/* занятые места */}
          <g className="art-near">
            {Array.from({ length: kept[r] }, (_, i) => (
              <circle key={i} cx={34 + i * 24} cy={y} r="5" strokeWidth="2" />
            ))}
          </g>

          {/* освободившиеся: контур пунктиром — место есть, товара нет */}
          <g className="art-far">
            {Array.from({ length: perRow - kept[r] }, (_, i) => (
              <circle key={i} cx={34 + (kept[r] + i) * 24} cy={y} r="5" strokeWidth="1.4" strokeDasharray="2 3" />
            ))}
          </g>
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
 * В четверг тот же кадр закрывается сценой `join`, и это единственная пара
 * сцен в кампании, которая работает именно как пара.
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
 * Рабочее место: монитор с таблицей на экране, клавиатура, остывающий кофе.
 * Общий кадр начала дня — брифы вторника, среды и четверга открываются им
 * одинаково, и это намеренно: одно и то же утро, одно и то же место,
 * меняется только вопрос. Понедельник и пятница получают `office`, потому
 * что первый день и день встречи — не рядовое утро.
 */
function Desk() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <rect x="86" y="10" width="148" height="72" rx="4" strokeWidth="1.8" />
        <path d="M160 82v10M136 96h48" strokeWidth="1.8" />
        <rect x="96" y="100" width="128" height="9" rx="2" strokeWidth="1.5" />
      </g>

      <g className="art-far">
        <path d="M100 28h60M100 40h84M100 52h72" strokeWidth="2.2" strokeLinecap="butt" />
      </g>

      {/* строка, ради которой человек и сел за стол */}
      <path className="art-line" d="M100 64h48" strokeWidth="2.8" strokeLinecap="butt" />

      <g className="art-far">
        <path d="M256 62h30v26h-30z" strokeWidth="1.6" />
        <path d="M286 68h5a5 5 0 0 1 0 12h-5" strokeWidth="1.4" />
        <path d="M264 54v-8M272 54v-11M280 54v-8" strokeWidth="1.2" />
      </g>
    </g>
  );
}

/*
 * Отбор строк: слева пришло много, справа осталось меньше, между ними
 * воронка. Акцент на самой воронке — она и есть WHERE, о котором говорит
 * подводка; строки по обе стороны одинаково второстепенны.
 */
function Filter() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <path d="M20 26h84M20 42h84M20 58h84M20 74h84M20 90h84" strokeWidth="2.6" strokeLinecap="butt" />
      </g>

      <path className="art-line" d="M122 22h72l-25 30v34l-22 9V52z" strokeWidth="2.2" />

      <g className="art-near">
        <path d="M216 42h80M216 58h80M216 74h80" strokeWidth="2.6" strokeLinecap="butt" />
      </g>
    </g>
  );
}

/*
 * Сортировка и обрезка: столбики выстроены по убыванию, и рамкой назван
 * не самый высокий столбик, а верхняя часть списка целиком — LIMIT берёт
 * сколько сказано, а не одного победителя.
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
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        <path d="M18 102h284" strokeWidth="1.5" />
      </g>

      <g className="art-mid">
        {bars.map((b) => (
          <rect key={b.x} x={b.x} y={102 - b.h} width="22" height={b.h} rx="2" strokeWidth="1.6" />
        ))}
      </g>

      <rect className="art-line" x="18" y="16" width="112" height="94" rx="4" strokeWidth="2.2" />
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
 * весь смысл сцены. Акцент на третьей колонке: COUNT(DISTINCT) — та,
 * ради которой подводка написана и которая понадобится в пятницу.
 */
function Counts() {
  const ys = [18, 34, 50, 66, 82, 98];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* всё подряд */}
      <g className="art-mid">
        {ys.map((y) => (
          <circle key={y} cx="60" cy={y} r="6" strokeWidth="1.8" />
        ))}
      </g>

      {/* только заполненные */}
      <g className="art-mid">
        {ys.slice(0, 4).map((y) => (
          <circle key={y} cx="160" cy={y} r="6" strokeWidth="1.8" />
        ))}
      </g>
      <g className="art-far">
        {ys.slice(4).map((y) => (
          <circle key={y} cx="160" cy={y} r="6" strokeWidth="1.4" strokeDasharray="2 3" />
        ))}
      </g>

      {/* только разные */}
      {ys.slice(0, 3).map((y) => (
        <circle key={y} className="art-line" cx="260" cy={y} r="6" strokeWidth="2.2" />
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
 * него — молча, пунктиром, вниз за кадр. Акцент на этом падении, потому что
 * подводка ровно о нём: ошибки не будет, строк просто не станет.
 */
function Dropped() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <rect x="20" y="12" width="146" height="58" rx="4" strokeWidth="1.7" />
        <path d="M34 28h104M34 42h86M34 56h112" strokeWidth="2.2" strokeLinecap="butt" />

        <rect x="222" y="12" width="78" height="58" rx="4" strokeWidth="1.7" />
        <path d="M236 28h50M236 42h42" strokeWidth="2.2" strokeLinecap="butt" />
      </g>

      <g className="art-far">
        <path d="M178 41h32" strokeWidth="1.8" />
        <path d="m204 35 6 6-6 6" strokeWidth="1.8" />
      </g>

      {/* то, чему не нашлось пары */}
      <path className="art-line" d="M118 78v18" strokeWidth="2" strokeDasharray="4 4" />
      <path className="art-line" d="m111 89 7 9 7-9" strokeWidth="2" />
    </g>
  );
}

/*
 * Порог после группировки: столбики уже посчитаны по группам, и линия
 * отсекает те, что не дотянули. Акцент — сама линия: HAVING это она,
 * а не столбики.
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
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        <path d="M18 102h288" strokeWidth="1.5" />
      </g>

      {bars.map((b) => (
        <g key={b.x} className={b.h >= cut ? 'art-near' : 'art-far'}>
          <rect x={b.x} y={102 - b.h} width="20" height={b.h} rx="2" strokeWidth="1.7" />
        </g>
      ))}

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
 * Переговорная перед встречей: экран на стене, стол, часы. Акцент отдан
 * часам — крючок четверга держится не на комнате, а на «завтра в 11:00».
 */
function Meeting() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        <rect x="70" y="12" width="130" height="50" rx="3" strokeWidth="1.6" />
        <path d="M84 30h94M84 42h64" strokeWidth="2" strokeLinecap="butt" />
      </g>

      <g className="art-mid">
        <path d="M52 100h216" strokeWidth="2" />
        <path d="M78 100 96 76h128l18 24" strokeWidth="1.8" />
        <path d="M96 88h128" strokeWidth="1.2" />
      </g>

      <g className="art-near">
        <circle cx="264" cy="34" r="18" strokeWidth="1.8" />
      </g>
      <path className="art-line" d="M264 34V22M264 34l9 6" strokeWidth="2.2" />
    </g>
  );
}

/*
 * Разговор между делом: две чашки на узком столике у автомата, пар над ними
 * и дверной проём в стороне. Акцент на пар — единственное движение в кадре,
 * и оно же единственное, что отличает эту сцену от рабочего места: здесь
 * никто не работает, здесь разговаривают.
 */
function Corridor() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-far">
        <path d="M24 22v78M24 22h56v78" strokeWidth="1.6" />
        <path d="M232 20h64v54h-64z" strokeWidth="1.6" />
        <path d="M244 36h40M244 48h28" strokeWidth="1.6" strokeLinecap="butt" />
      </g>

      <g className="art-mid">
        <path d="M96 100h136" strokeWidth="2" />
        <path d="M118 100V84h92v16" strokeWidth="1.8" />
      </g>

      <g className="art-near">
        <path d="M132 84V68h20v16zM176 84V68h20v16z" strokeWidth="1.8" />
        <path d="M152 72h6a4 4 0 0 1 0 8h-6M196 72h6a4 4 0 0 1 0 8h-6" strokeWidth="1.4" />
      </g>

      <path className="art-line" d="M142 60c-6-6 6-10 0-16M186 60c-6-6 6-10 0-16" strokeWidth="2.2" />
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
 * Спор о метрике: два столбца под одной и той же подписью, разной высоты,
 * и акцентом — скоба на разнице между ними. Столбцы намеренно одинаковы
 * по ширине и стилю: спорят не о том, чей способ лучше, а о том, что вошло
 * в счёт, и разница — единственное, на что здесь стоит смотреть.
 */
function Dispute() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        <path d="M30 98h250" strokeWidth="2" />
        <rect x="62" y="44" width="56" height="54" rx="2" strokeWidth="1.8" />
        <rect x="150" y="24" width="56" height="74" rx="2" strokeWidth="1.8" />
      </g>

      <g className="art-far">
        <path d="M64 108h52M152 108h52" strokeWidth="1.6" strokeLinecap="butt" />
        <path d="M118 44h114M206 24h26" strokeWidth="1.3" strokeDasharray="4 4" strokeLinecap="butt" />
      </g>

      <path className="art-line" d="M244 24v20M236 24h16M236 44h16" strokeWidth="2.2" />
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
 * те же пункты пунктиром — то, что в задачу не входит. Акцент на самой черте:
 * весь смысл дня в ней, а не в длине списка. Пунктирное справа намеренно
 * не короче сплошного слева — «за границей» всегда остаётся столько же,
 * сколько внутри, и работа заканчивается не тогда, когда сделано всё.
 */
function Scope() {
  const rows = [24, 46, 68, 90];
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="art-mid">
        {rows.map((y) => (
          <path key={y} d={`M20 ${y}h116`} strokeWidth="2" strokeLinecap="butt" />
        ))}
      </g>

      <g className="art-near">
        {rows.map((y) => (
          <rect key={y} x="8" y={y - 5} width="10" height="10" rx="2" strokeWidth="1.6" />
        ))}
      </g>

      <g className="art-far">
        {rows.map((y) => (
          <path key={y} d={`M182 ${y}h130`} strokeWidth="1.6" strokeDasharray="5 5" strokeLinecap="butt" />
        ))}
      </g>

      <path className="art-line" d="M160 12v92" strokeWidth="2.4" />
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
