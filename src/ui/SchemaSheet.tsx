import { useEffect, useState } from 'react';
import type { SchemaDoc } from '../engine/types';
import { ru } from '../i18n/ru';

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
  // Аппаратная кнопка «назад» на Android должна закрывать шторку, а не приложение.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={ru.schema.ariaLabel}>
        <div className="grabber" />
        {!doc ? (
          <p className="muted">{ru.schema.loading}</p>
        ) : (
          <>
            <h2>{ru.schema.title}</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {doc.company}. Период данных: {doc.period.from} — {doc.period.to}.
            </p>
            {doc.tables.map((t) => (
              <details key={t.table} className="table-doc">
                <summary>
                  <code style={{ color: 'var(--code)' }}>{t.table}</code> — {t.title}
                  <small>{ru.schema.grainLabel(t.grain, t.row_count.toLocaleString('ru-RU'))}</small>
                </summary>
                {t.columns.map((c) => (
                  <div className="col-doc" key={c.name}>
                    <code>{c.name}</code>
                    <span>{c.description}</span>
                  </div>
                ))}
                {t.note && <div className="note">{t.note}</div>}
              </details>
            ))}
          </>
        )}
        <button className="btn secondary" style={{ marginTop: 12 }} onClick={onClose}>
          {ru.schema.closeBtn}
        </button>
      </div>
    </>
  );
}
