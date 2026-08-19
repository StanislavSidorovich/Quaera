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
        {scene === 'catalog' && <Catalog />}
        {scene === 'tables' && <Tables />}
        {scene === 'join' && <Join />}
        {scene === 'groups' && <Groups />}
        {scene === 'trend' && <Trend />}
        {scene === 'split' && <Split />}
        {scene === 'factors' && <Factors />}
        {scene === 'outlets' && <Outlets />}
        {scene === 'rival' && <Rival />}
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
