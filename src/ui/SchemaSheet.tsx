import { useEffect, useRef, useState } from 'react';
import type { SchemaDoc } from '../engine/types';
import { useI18n } from '../i18n/context';
import { TableDoc } from './TableDoc';

/**
 * Шторка со схемой данных — быстрый взгляд, не покидая задания.
 *
 * Держать схему в голове невозможно, а уходить со страницы задания за ней —
 * значит терять контекст и набранный текст. Поэтому схема открывается поверх.
 * Полноразмерный обзор всех таблиц сразу живёт отдельным экраном (DataScreen):
 * шторка отвечает на вопрос «как называется колонка вот в этой таблице»
 * посреди работы, экран — на вопрос «что вообще лежит в этих данных»
 * до её начала. Рисуют таблицу оба одинаково, общим TableDoc.
 */

let cached: SchemaDoc | null = null;

/**
 * Документ старой формы — с текстом одной строкой вместо пары локалей.
 *
 * Прилететь он может по той же причине, по которой у типа колонки стоит
 * опциональный доступ (см. TableDoc): `/data/schema.json` не хеширован
 * по содержимому, и в окне между обновлением бандла и переключением
 * service worker'а старый воркер отвечает своим кешем. Такой документ
 * не роняет дерево, но показывает пустые названия таблиц и пустые
 * описания колонок — схему без единого слова. Лучше подождать: следующая
 * загрузка придёт уже от нового воркера.
 *
 * Проверяется форма, а не поле version: версия — обещание, которое надо
 * не забыть обновить, а форма и есть то, что здесь требуется.
 */
const isLocalized = (d: SchemaDoc): boolean => typeof d?.company?.ru === 'string';

export function useSchema(): SchemaDoc | null {
  const [doc, setDoc] = useState<SchemaDoc | null>(cached);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetch('/data/schema.json')
      .then((r) => r.json())
      .then((d: SchemaDoc) => {
        if (!isLocalized(d)) return;
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

interface Props {
  doc: SchemaDoc | null;
  onClose: () => void;
  /**
   * Таблица, с которой шторка должна открыться раскрытой и к которой
   * прокрутиться, — приходит с чипа задания (см. openSchema в App).
   * null/undefined — общий вход, всё свёрнуто, как раньше.
   */
  focusTable?: string | null;
}

export function SchemaSheet({ doc, onClose, focusTable }: Props) {
  const { t, locale } = useI18n();

  // Аппаратная кнопка «назад» закрывает шторку — обработано в App.tsx (popstate),
  // а не здесь: это тот же перехват, что и для экранов, единый на всё приложение.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Прокрутка к раскрытой по фокусу таблице. Само раскрытие — через `open`
   * у TableDoc ниже, не здесь: `open` там завязан на `focusTable` и не
   * трогается на несвязанных перерисовках (клик по копированию колонки),
   * поэтому вручную раскрытую человеком другую таблицу так не захлопнет.
   */
  const focusRef = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => {
    if (doc && focusTable) focusRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [doc, focusTable]);

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
              {doc.company[locale]}. {t.schema.periodLabel(doc.period.from, doc.period.to)}.
            </p>
            {doc.tables.map((table) => (
              <TableDoc
                key={table.table}
                table={table}
                open={table.table === focusTable}
                detailsRef={table.table === focusTable ? focusRef : undefined}
              />
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
