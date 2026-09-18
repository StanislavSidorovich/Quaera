import { useEffect, useMemo, useRef } from 'react';
import type { Track } from '../content/types';
import type { SchemaDoc } from '../engine/types';
import { useI18n } from '../i18n/context';
import { clearInsertTarget, setInsertTarget } from './insertTarget';
import { TokenPanel, useKeyboardOpen, useTokensOpen } from './TokenPanel';

/**
 * Редактор кода для телефона — общий для SQL и Python.
 *
 * Набор кода с экранной клавиатуры — то, на чём ломаются все мобильные
 * тренажёры: каждая скобка и кавычка требуют переключения раскладки.
 * Панель токенов снимает большую часть ввода: символы, ключевые слова
 * и имена таблиц/колонок вставляются одним касанием, фокус и позиция
 * курсора при этом сохраняются, поэтому клавиатура не закрывается
 * и мысль не теряется.
 *
 * Состав панели языковой: SQL и pandas почти не пересекаются по синтаксису
 * (`GROUP BY` против `.groupby(`), поэтому набор символов и ключевых слов
 * выбирается по track, а не сваливается в одну общую свалку токенов —
 * показывать SELECT/FROM в Python-задании не просто бесполезно, а прямо
 * подсказывает неверный синтаксис.
 *
 * Панель таблиц/колонок общая: она строится из той же схемы данных,
 * которой пользуется и SQL, и pandas — один датасет, одни имена.
 *
 * Правило состава, по которому панель и собрана: **в ней лежит то, чего нет
 * на буквенном слое экранной клавиатуры.** Буквы набираются штатно и слоя
 * не меняют, поэтому их в панели нет вовсе (кроме ключевых слов и имён —
 * те ускоряют многосимвольное). Скобки, кавычка, подчёркивание, сравнения
 * живут за `?123` — они здесь. Цифры и дефис даты жили там же и были
 * пропущены: замер по паку показал цифру в 31 решении из 38 у SQL
 * и дату в 20 из 38, то есть самую частую смену слоя из оставшихся.
 */

interface Props {
  value: string;
  onChange: (v: string) => void;
  schema: SchemaDoc | null;
  /** Уровень задания — определяет, какие конструкции показывать в панели. */
  level: number;
  /** Выбирает набор символов и ключевых слов: SQL и pandas синтаксически не пересекаются. */
  track: Track;
  disabled?: boolean;
  placeholder?: string;
  /** Таблицы задания (см. taskTables) — засевают колонки в панели до того, как текст сам их назовёт. Пусто в песочнице, где своего задания нет. */
  knownTables?: string[];
  /** Собственные имена задания (см. taskLiterals) — бренды и категории из его же кода, чипом вместо ручного набора. */
  knownLiterals?: string[];
}

export function CodeEditor({
  value,
  onChange,
  schema,
  level,
  track,
  disabled,
  placeholder,
  knownTables = [],
  knownLiterals = [],
}: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  /*
   * Экранная клавиатура открывается по касанию в textarea всегда, даже когда
   * человек весь запрос собирает из панели токенов и колонок ниже. На телефоне
   * это лишняя половина экрана, которую приходится закрывать вручную. Тумблер
   * переключает textarea в inputMode="none": фокус и позиция курсора работают
   * как раньше (вставка из панели по-прежнему целится в них), а клавиатура
   * просто не всплывает, пока её явно не попросили. useKeyboardOpen (см.
   * TokenPanel.tsx) — тот же выбор, что и у пропусков (FillTemplate
   * в TaskView.tsx): состояние общее для write и fill, а не своё на каждый.
   */
  const [keyboardOn, toggleKeyboardOn] = useKeyboardOpen();
  const [tokensOn, toggleTokens] = useTokensOpen();

  /**
   * Колонки упомянутых таблиц идут первыми, следом — имена таблиц,
   * чтобы соединение оставалось в одно касание. Пока ни одна таблица
   * не упомянута и не входит в knownTables, показываются только таблицы:
   * колонки без контекста бесполезны.
   *
   * knownTables (таблицы самого задания, см. TaskView.tsx) досрочно
   * причисляет свои таблицы к «упомянутым», даже пока текст их не назвал:
   * SQL пишут SELECT → колонки → FROM, и ждать FROM означало бы показывать
   * колонки только тогда, когда они уже почти не нужны.
   */
  const chips = useMemo(() => {
    if (!schema) return knownLiterals;
    const tables = schema.tables.map((t) => t.table);
    const mentioned = schema.tables.filter(
      (t) => knownTables.includes(t.table) || new RegExp(`\\b${t.table}\\b`).test(value)
    );
    if (!mentioned.length) return [...knownLiterals, ...tables];
    const columns = [...new Set(mentioned.flatMap((t) => t.columns.map((c) => c.name)))];
    const rest = tables.filter((t) => !mentioned.some((m) => m.table === t));
    return [...knownLiterals, ...columns, ...rest];
  }, [schema, value, knownTables, knownLiterals]);

  /**
   * Стирает выделение, если оно есть, иначе один символ перед курсором —
   * единственный способ отменить промах панели без вызова системной
   * клавиатуры (та по умолчанию выключена, см. initialKeyboardOn).
   * Гранулярность символьная, а не токенная: курсор часто стоит внутри
   * вставленного слова, и удаление по токену там непредсказуемо.
   */
  const backspace = () => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const from = start === end ? Math.max(0, start - 1) : start;
    const next = value.slice(0, from) + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from, from);
    });
  };

  /** Вставка в позицию курсора без потери фокуса — иначе клавиатура схлопывается. */
  const insert = (text: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    // Пробел ставим между двумя «словами» — иначе имена колонок слипаются
    // (date_id + year давало date_idyear). Перед запятой и закрывающей скобкой
    // пробел не нужен, после открывающей — тоже.
    //
    // Два исключения, и без них ряд цифр ломает ровно то, ради чего заведён.
    // Цифра к цифре: «1» плюс «0» обязаны дать 10, а не «1 0».
    // Внутри строкового литерала: автопробел — правило форматирования кода,
    // к содержимому строки неприменимое ('2025-01-01', а не ' 2025-01-01').
    // Нечётное число апострофов слева и значит «мы внутри строки» — оно же
    // отличает открывающую кавычку от закрывающей, после которой пробел
    // как раз нужен (WHERE brand = 'Aqualis' + AND).
    const insideString = (before.match(/'/g) ?? []).length % 2 === 1;
    const digitRun = /\d$/.test(before) && /^\d/.test(text);
    const needsSpace =
      !insideString && !digitRun && /[\w)'"\]]$/.test(before) && /^[\w([]/.test(text);
    const chunk = (needsSpace ? ' ' : '') + text;
    const next = before + chunk + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + chunk.length;
      el.setSelectionRange(pos, pos);
    });
  };

  /*
   * Цель для вставки из шторки схемы (см. insertTarget.ts). `insert` выше
   * замыкает `value`/`onChange` текущего рендера и стал бы протухшим
   * колбэком, если бы регистрировался сам, — поэтому регистрируется
   * стабильная обёртка (одна на всё время жизни поля), которая на каждый
   * вызов читает `insertRef.current`, обновляемый на каждом рендере.
   * Регистрация — по фокусу, а не при монтировании: полей редактора
   * на экране может быть несколько (задание и песочница не одновременно,
   * но потенциально не только textarea), активно ровно то, на котором
   * стоит курсор.
   */
  const insertRef = useRef(insert);
  insertRef.current = insert;
  const stableInsertRef = useRef((text: string) => insertRef.current(text));
  useEffect(() => () => clearInsertTarget(stableInsertRef.current), []);

  const toggleKeyboard = () => {
    const next = !keyboardOn;
    toggleKeyboardOn();
    const el = ref.current;
    if (!el) return;
    // Blur закрывает уже открытую клавиатуру; при включении, наоборот,
    // фокусируем сразу — незачем заставлять коснуться поля второй раз.
    if (next) requestAnimationFrame(() => el.focus());
    else el.blur();
  };

  return (
    <div>
      {/*
       * Два тумблера, и каждый виден там, где ему есть что переключать:
       * клавиатурный — на узком экране (см. .keyboard-toggle в styles.css:
       * на десктопе без сенсорного ввода inputMode="none" не значит ничего),
       * токенный — на широком, где панель как раз и мешает. Оба в одном ряду,
       * а не в разных местах: это один вопрос «чем я тут набираю».
       */}
      <div className="editor-tools">
        <button
          type="button"
          className="pill keyboard-toggle"
          aria-pressed={keyboardOn}
          onClick={toggleKeyboard}
        >
          ⌨ {keyboardOn ? t.editor.keyboardHide : t.editor.keyboardShow}
        </button>
        <button
          type="button"
          className="pill tokens-toggle"
          aria-pressed={tokensOn}
          onClick={toggleTokens}
        >
          {tokensOn ? t.editor.tokensHide : t.editor.tokensShow}
        </button>
      </div>
      <textarea
        ref={ref}
        className="sql"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setInsertTarget(stableInsertRef.current)}
        // Без включённого тумблера клавиатура не должна всплывать сама —
        // фокус и выделение при этом продолжают работать как обычно.
        inputMode={keyboardOn ? undefined : 'none'}
        // Автозамена и заглавные буквы превращают ввод кода в борьбу с браузером.
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        data-gramm="false"
      />
      <TokenPanel level={level} track={track} open={tokensOn} onInsert={insert} disabled={disabled} onBackspace={backspace} />
      {/*
       * Чипы таблиц/колонок остаются здесь, не в TokenPanel: они строятся
       * из текста самого редактора (см. chips выше), а не из статичного
       * набора по track/level — источник другой, и делить его с fill
       * незачем (там свой механизм, плашки таблиц под заданием).
       * Тумблер тот же (tokensOn/data-open), поэтому ряд прячется вместе
       * с остальной панелью одним правилом.
       */}
      {chips.length > 0 && (
        <div className="accessory-stack" data-open={tokensOn}>
          <div className="accessory" role="toolbar" aria-label={t.editor.chipsAria}>
            {chips.map((s) => (
              <button key={s} type="button" className="dim" onClick={() => insert(s)} disabled={disabled}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
