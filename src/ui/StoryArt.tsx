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
export type StoryScene = 'office' | 'groups' | 'trend' | 'split';

/** Общая рамка сцен: одна ширина и одна высота на все фазы. */
const VIEW_BOX = '0 0 320 116';

export function StoryArt({ scene }: { scene: StoryScene }) {
  return (
    <div className="story-art" aria-hidden>
      <svg viewBox={VIEW_BOX} role="presentation" preserveAspectRatio="xMidYMid meet">
        {scene === 'office' && <Office />}
        {scene === 'groups' && <Groups />}
        {scene === 'trend' && <Trend />}
        {scene === 'split' && <Split />}
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
