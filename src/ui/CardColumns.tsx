import { useState, type ReactNode } from 'react';
import './cardColumns.css';

/**
 * «Карточки в колонки»: общая компонента, не привязанная к BI.
 *
 * Первый потребитель: «Волны загрузки» (вид `waves`, колонки «Волна 1…N»).
 * Следующий: «Разложите по местам» трека «Профессия» (docs/profession-interactive-design-2026-11.md):
 * там те же карточки и колонки, только колонки это роли или слои, а у стрелок нет условий.
 *
 * ## Как пользоваться
 * Компонента показывает и меняет РАСКЛАДКУ, но ничего не проверяет: проверка
 * это дело задания (для волн `engine/waves.ts`), потому что «верно» у каждого
 * вида своё. Раскладка лежит снаружи (в черновике шага), поэтому переживает
 * уход на карточку теории.
 *
 * - `columns`: колонки по порядку. `capacity: 1` превращает колонку в «слот»
 *   (раскладка «слоты»: одна карточка на место, вторая вытесняет первую на стол).
 *   Без `capacity` колонка безразмерная (раскладка «колонки»). Раскладка «матрица»
 *   (строки на колонки) пока не нужна: она добавится, когда её попросит
 *   «Профессия», как колонки с ключом `строка:колонка` и подписью строки,
 *   без смены остального API.
 * - `cards`: все карточки, в том числе ЛИШНИЕ (дистракторы). Лишняя карточка
 *   ничем не отличается на экране, пока задание не откроет её `note`.
 * - `placement`: id карточки → id колонки или null (карточка на столе).
 * - `onChange`: новая раскладка целиком. Компонента её не мутирует.
 * - `locked`: после зачёта: карточки не двигаются, виден `note`.
 * - `note(card, columnId)`: объяснение «почему здесь» / «почему не в соседней
 *   колонке», показывается под карточкой только при `locked`. Для лишней
 *   карточки это «почему она не нужна».
 * - `between(i)`: что нарисовать между колонкой i и i+1 (у волн это переключатель
 *   «после успеха / после завершения»). Без него колонки просто рядом.
 * - `labels`: слова интерфейса (локаль задаёт вызывающий).
 *
 * ## Как двигать: касание, потом касание
 * Перетаскивания нет (на телефоне оно спорит с прокруткой, см. querium-order-tasks).
 * Касаешься карточки: она выбрана. Касаешься колонки (кнопка «Положить сюда» в её
 * шапке) или стола: карточка переезжает. Повторное касание карточки снимает
 * выбор. Всё это кнопки: работает пальцем, мышью и клавиатурой, а выбранная
 * карточка объявляется скринридеру через `aria-pressed`.
 */

export interface CardColumn {
  id: string;
  title: string;
  /** Короткая подсказка под заголовком колонки. */
  hint?: string;
  /** Сколько карточек помещается; без поля: сколько угодно. */
  capacity?: number;
}

export interface CardItem {
  id: string;
  label: string;
  /** Вторая строка карточки (имя таблицы, роль). */
  sub?: string;
}

export interface CardColumnsLabels {
  /** Заголовок стола с невыложенными карточками. */
  pool: string;
  /** Подпись кнопки колонки, например «Положить сюда». */
  putHere: string;
  /** Подпись кнопки стола, когда выбрана карточка из колонки. */
  putBack: string;
  /** Пустая колонка. */
  empty: string;
  /** Пустой стол. */
  poolEmpty: string;
  /** Скринридер: «выбрана карточка X». */
  selected: (label: string) => string;
}

export interface CardColumnsProps {
  columns: CardColumn[];
  cards: CardItem[];
  placement: Record<string, string | null>;
  onChange: (next: Record<string, string | null>) => void;
  locked?: boolean;
  note?: (card: CardItem, columnId: string | null) => ReactNode;
  between?: (index: number) => ReactNode;
  labels: CardColumnsLabels;
}

export function CardColumns({ columns, cards, placement, onChange, locked, note, between, labels }: CardColumnsProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const inColumn = (id: string | null) => cards.filter((c) => (placement[c.id] ?? null) === id);

  function drop(target: string | null) {
    if (locked || !picked) return;
    const col = columns.find((c) => c.id === target);
    const next = { ...placement };
    if (col?.capacity !== undefined) {
      // Слот заполнен: прежняя карточка уходит на стол, а не пропадает.
      const here = inColumn(col.id).filter((c) => c.id !== picked);
      here.slice(0, Math.max(0, here.length - col.capacity + 1)).forEach((c) => (next[c.id] = null));
    }
    next[picked] = target;
    onChange(next);
    setPicked(null);
  }

  function renderCard(c: CardItem, columnId: string | null) {
    const on = picked === c.id;
    return (
      <li key={c.id} className="cc-item">
        <button
          type="button"
          className={`cc-card${on ? ' is-picked' : ''}`}
          aria-pressed={on}
          disabled={locked}
          onClick={() => setPicked(on ? null : c.id)}
        >
          <span className="cc-label">{c.label}</span>
          {c.sub && <span className="cc-sub">{c.sub}</span>}
          {on && <span className="cc-sr">{labels.selected(c.label)}</span>}
        </button>
        {locked && note && <div className="cc-note">{note(c, columnId)}</div>}
      </li>
    );
  }

  const pickedFromColumn = picked !== null && (placement[picked] ?? null) !== null;

  return (
    <div className="cc">
      <section className="cc-pool" aria-label={labels.pool}>
        <h4 className="cc-h">{labels.pool}</h4>
        <ul className="cc-list">
          {inColumn(null).map((c) => renderCard(c, null))}
          {inColumn(null).length === 0 && <li className="cc-empty">{labels.poolEmpty}</li>}
        </ul>
        {!locked && pickedFromColumn && (
          <button type="button" className="cc-drop" onClick={() => drop(null)}>
            {labels.putBack}
          </button>
        )}
      </section>

      <div className="cc-cols" style={{ ["--cc-n" as string]: columns.length }}>
        {columns.map((col, i) => {
          const here = inColumn(col.id);
          return (
            <div key={col.id} className="cc-col-wrap">
              {between && <div className="cc-between">{i > 0 ? between(i - 1) : null}</div>}
              <section className="cc-col" aria-label={col.title}>
                <h4 className="cc-h">{col.title}</h4>
                {col.hint && <p className="cc-hint">{col.hint}</p>}
                <ul className="cc-list">
                  {here.map((c) => renderCard(c, col.id))}
                  {here.length === 0 && <li className="cc-empty">{labels.empty}</li>}
                </ul>
                {!locked && (
                  <button
                    type="button"
                    className="cc-drop"
                    disabled={!picked || (placement[picked] ?? null) === col.id}
                    onClick={() => drop(col.id)}
                  >
                    {labels.putHere}
                  </button>
                )}
              </section>
            </div>
          );
        })}
      </div>
    </div>
  );
}
