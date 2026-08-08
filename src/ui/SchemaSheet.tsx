import { useEffect, useRef, useState } from 'react';
import type { SchemaDoc } from '../engine/types';
import { useI18n } from '../i18n/context';

/**
 * Шторка со схемой данных.
 *
 * Держать схему в голове невозможно, а уходить со страницы задания за ней —
 * значит терять контекст и набранный текст. Поэтому схема открывается поверх,
 * с описанием каждой колонки и, что важнее, с указанием гранулярности таблицы:
 * половина ошибок в отчётах начинается с непонимания, что такое одна строка факта.
 */

let cached: SchemaDoc | null = null;

export function useSchema(): SchemaDoc | null {
  const [doc, setDoc] = useState<SchemaDoc | null>(cached);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetch('/data/schema.json')
      .then((r) => r.json())
      .then((d: SchemaDoc) => {
        cached = d;
        if (alive) setDoc(d);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return doc;
}

export function SchemaSheet({ doc, onClose }: { doc: SchemaDoc | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const numberLocale = locale === 'ru' ? 'ru-RU' : 'en-US';

  // Аппаратная кнопка «назад» закрывает шторку — обработано в App.tsx (popstate),
  // а не здесь: это тот же перехват, что и для экранов, единый на всё приложение.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Копирование имени колонки по клику — раньше схема была чисто справочной,
   * набирать `commercial_category_id` руками с телефона на панели токенов
   * долго и с опечатками. Ключ вида `table.column`, а не просто имя колонки:
   * одинаковые имена (`revenue`, `product_id`) встречаются в нескольких
   * таблицах, и без таблицы в ключе клик по одной колонке подсветил бы
   * «Скопировано» сразу у всех тёзок на экране.
   */
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  function copyColumn(table: string, name: string) {
    navigator.clipboard?.writeText(name).catch(() => undefined);
    setCopiedKey(`${table}.${name}`);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedKey(null), 1200);
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t.schema.ariaLabel}>
        <div className="grabber" />
        {!doc ? (
          <p className="muted">{t.schema.loading}</p>
        ) : (
          <>
            <h2>{t.schema.title}</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {doc.company}. Период данных: {doc.period.from} — {doc.period.to}.
            </p>
            {doc.tables.map((table) => (
              <details key={table.table} className="table-doc">
                <summary>
                  <code style={{ color: 'var(--code)' }}>{table.table}</code> — {table.title}
                  <small>{t.schema.grainLabel(table.grain, table.row_count.toLocaleString(numberLocale))}</small>
                </summary>
                {table.columns.map((c) => {
                  const copied = copiedKey === `${table.table}.${c.name}`;
                  return (
                    <div className="col-doc" key={c.name}>
                      <button
                        type="button"
                        className="col-name"
                        onClick={() => copyColumn(table.table, c.name)}
                        aria-label={t.schema.copyAria(c.name)}
                      >
                        <code>{c.name}</code>
                      </button>
                      <span>{copied ? t.schema.copied : c.description}</span>
                    </div>
                  );
                })}
                {table.note && <div className="note">{table.note}</div>}
              </details>
            ))}
          </>
        )}
        <button className="btn secondary" style={{ marginTop: 12 }} onClick={onClose}>
          {t.schema.closeBtn}
        </button>
      </div>
    </>
  );
}
