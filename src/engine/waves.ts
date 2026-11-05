/**
 * Движок задания «волны загрузки» (`mode: 'waves'`): чистая логика без React,
 * чтобы ту же функцию звали экран и гейт `test:waves`.
 *
 * Правило проверки: не форма, а свойство. Принимается ЛЮБАЯ раскладка, где
 * (1) каждый нужный шаг стоит в волне строго позже всех своих зависимостей,
 * (2) лишние карточки остались на столе, (3) у каждой стрелки между волнами
 * выбрано «после успеха». Эталонной раскладки в задании нет: единственный
 * источник правды это `dependsOn` у шагов.
 *
 * «Запустить» не отвечает «верно/неверно», а разыгрывает журнал. Неверная
 * сборка падает так, как упала бы на работе: факт раньше справочника это
 * Failed и «пропущено» дальше, копирование до очистки это удвоенные строки при
 * зелёном статусе, «после завершения» это зелёный запуск, который при сбое
 * справочника загрузил бы факты с пустыми ключами (проверка на сбой).
 */

import type { WaveItem } from '../content/types';

export type WaveGate = 'success' | 'complete';

export interface WavesLayout {
  /** id шага → номер колонки (0-based) или null, если карточка на столе. */
  placement: Record<string, number | null>;
  /** Условие у стрелки между волной k и k+1; null: ещё не выбрано. */
  gates: (WaveGate | null)[];
}

export type RunStatus = 'succeeded' | 'failed' | 'skipped';

export interface RunRow {
  id: string;
  wave: number;
  status: RunStatus;
  /** Подпись под статусом: что именно пошло не так (или число строк при успехе). */
  note?: string;
  /** Тон заметки: err у «тихо испорчено», даже если статус зелёный. */
  tone?: 'err';
  rows?: number;
}

export interface WavesRun {
  rows: RunRow[];
  /** Проверка на сбой: упал справочник, стрелка «после завершения» пустила факт дальше. */
  stress?: { failedId: string; rows: RunRow[] };
  /** Свойство выполнено целиком: можно засчитывать. */
  correct: boolean;
  /** Что именно нарушено, по классам (для сообщения под журналом). */
  problems: { early: string[]; extraPlaced: string[]; gateComplete: boolean };
}

export function waveCount(layout: WavesLayout): number {
  return layout.gates.length + 1;
}

/** Все нужные карточки положены, а у всех стрелок выбрано условие: тогда «Запустить» доступна. */
export function canRun(items: WaveItem[], layout: WavesLayout): boolean {
  return items.every((it) => it.extra || layout.placement[it.id] != null) && layout.gates.every((g) => g !== null);
}

function waveOf(layout: WavesLayout, id: string): number | null {
  return layout.placement[id] ?? null;
}

/** Разыгрывает запуск. Предполагает `canRun`. */
export function runWaves(items: WaveItem[], layout: WavesLayout): WavesRun {
  const byId = new Map(items.map((it) => [it.id, it]));
  const placed = items.filter((it) => waveOf(layout, it.id) !== null);
  const waves = waveCount(layout);
  const order = [...placed].sort((a, b) => waveOf(layout, a.id)! - waveOf(layout, b.id)! || items.indexOf(a) - items.indexOf(b));

  const early = (it: WaveItem) => (it.dependsOn ?? []).filter((d) => {
    const dw = waveOf(layout, d);
    return dw === null || dw >= waveOf(layout, it.id)!;
  });

  const rows: RunRow[] = [];
  const status = new Map<string, RunStatus>();
  const waveFailed: boolean[] = new Array(waves).fill(false);
  const early_ids: string[] = [];

  for (let w = 0; w < waves; w++) {
    // Стрелка «после успеха» не пускает волну, если в предыдущей что-то упало или пропущено.
    const blocked = w > 0 && layout.gates[w - 1] === 'success' && waveFailed[w - 1];
    for (const it of order.filter((o) => waveOf(layout, o.id) === w)) {
      let row: RunRow;
      if (blocked) {
        row = { id: it.id, wave: w, status: 'skipped' };
      } else if (early(it).length) {
        early_ids.push(it.id);
        const st = it.earlyStatus ?? 'failed';
        row = { id: it.id, wave: w, status: st, note: it.earlyText, tone: st === 'succeeded' ? 'err' : undefined };
      } else {
        row = { id: it.id, wave: w, status: 'succeeded', rows: it.rows };
      }
      rows.push(row);
      status.set(it.id, row.status);
      if (row.status !== 'succeeded') waveFailed[w] = true;
    }
    // Тихо испорченный шаг (Succeeded с тоном err) волну не валит, но решение не засчитывается.
  }

  const extraPlaced = items.filter((it) => it.extra && waveOf(layout, it.id) !== null).map((it) => it.id);
  const gateComplete = layout.gates.some((g) => g === 'complete');
  const correct = early_ids.length === 0 && extraPlaced.length === 0 && !gateComplete;

  // Проверка на сбой: стрелка «после завершения» пустила бы шаг дальше, если справочник упадёт.
  let stress: WavesRun['stress'];
  if (early_ids.length === 0 && gateComplete) {
    for (const it of order) {
      const w = waveOf(layout, it.id)!;
      if (w === 0 || layout.gates[w - 1] !== 'complete' || !it.orphanText) continue;
      const dep = (it.dependsOn ?? []).find((d) => (waveOf(layout, d) ?? 99) === w - 1) ?? it.dependsOn?.[0];
      if (!dep || !byId.has(dep)) continue;
      stress = {
        failedId: dep,
        rows: [
          { id: dep, wave: w - 1, status: 'failed' },
          { id: it.id, wave: w, status: 'succeeded', note: it.orphanText, tone: 'err' },
        ],
      };
      break;
    }
  }

  return { rows, stress, correct, problems: { early: early_ids, extraPlaced, gateComplete } };
}

/**
 * Верная раскладка по умолчанию (для гейта и подсказок): каждый шаг в самую
 * раннюю допустимую волну, все стрелки «после успеха». Не эталон ответа, а
 * доказательство, что решение существует в заданном числе колонок.
 */
export function earliestLayout(items: WaveItem[], waves: number): WavesLayout | null {
  const need = items.filter((it) => !it.extra);
  const wave = new Map<string, number>();
  const pending = new Set(need.map((i) => i.id));
  let guard = 0;
  while (pending.size && guard++ < 50) {
    for (const it of need) {
      if (!pending.has(it.id)) continue;
      const deps = it.dependsOn ?? [];
      if (deps.every((d) => wave.has(d))) {
        wave.set(it.id, deps.length ? Math.max(...deps.map((d) => wave.get(d)!)) + 1 : 0);
        pending.delete(it.id);
      }
    }
  }
  if (pending.size) return null; // цикл или зависимость от неизвестного шага
  const max = Math.max(...wave.values());
  if (max >= waves) return null;
  const placement: Record<string, number | null> = {};
  for (const it of items) placement[it.id] = it.extra ? null : wave.get(it.id)!;
  return { placement, gates: new Array(waves - 1).fill('success') };
}
