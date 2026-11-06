import { useEffect, useMemo, useRef, useState } from 'react';
import { compareTaskOrder } from '../content/taskOrder';
import type { Pack, Task, TaskMode } from '../content/types';
import { useI18n } from '../i18n/context';
import './allTasks.css';

/**
 * Шторка «Все задания» — свободный переход к любому заданию трека.
 *
 * Зачем она нужна. Занятие подбирает планировщик, и до нужного задания
 * доходят только по порядку. Хозяину и ученикам нужно обратное: открыть
 * конкретное задание сразу, например проверить новый интерактивный вид,
 * не проходя трек. Девяносто номеров в одну ленту нечитаемы, поэтому они
 * сгруппированы по навыкам, как на карте навыков.
 *
 * Шторка ничего не засчитывает сама: клик отдаёт id наверх, а там из него
 * собирается занятие тем же путём, что и по ссылке `?task=` (taskLinkQueue).
 */

/** Виды, которые отличаются от обычного «написать код»: им ставим значок и фильтр «Интерактивные». */
const INTERACTIVE: TaskMode[] = ['relate', 'spot', 'waves', 'order'];

/** Значок вида задания на плитке. Виды без значка (fill, write) обычные и ничем не помечены. */
const MODE_GLYPH: Partial<Record<TaskMode, string>> = {
  predict: '?',
  order: '↕',
  waves: '≋',
  relate: '⇄',
  spot: '◎',
};

type Filter = 'all' | 'interactive' | TaskMode;

export interface AllTasksGroup {
  skillId: string;
  title: string;
  tasks: { task: Task; n: number }[];
}

/**
 * Задания пака в порядке трека: навыки по ярусам графа (как на карте навыков),
 * внутри навыка от подсказанного к самостоятельному (compareTaskOrder).
 * Номер сквозной по всему паку, до фильтра: фильтр прячет плитки, но не
 * перенумеровывает их, иначе «№ 41» менял бы смысл от выбранного чипа.
 */
export function allTasksGroups(pack: Pack): AllTasksGroup[] {
  const skills = [...pack.skills].sort((a, b) => a.tier - b.tier);
  let n = 0;
  const groups: AllTasksGroup[] = [];
  for (const skill of skills) {
    const tasks = pack.tasks
      .filter((t) => t.skill === skill.id)
      .sort(compareTaskOrder)
      .map((task) => ({ task, n: ++n }));
    if (tasks.length) groups.push({ skillId: skill.id, title: skill.title, tasks });
  }
  return groups;
}

/** id для занятия «с этого задания»: само задание первым, дальше остальные задания навыка в порядке трека. */
export function taskIdsFrom(pack: Pack, taskId: string): string[] {
  const task = pack.tasks.find((x) => x.id === taskId);
  if (!task) return [];
  const rest = pack.tasks
    .filter((x) => x.skill === task.skill && x.id !== taskId)
    .sort(compareTaskOrder)
    .map((x) => x.id);
  return [taskId, ...rest];
}

interface Props {
  pack: Pack;
  isSolved: (id: string) => boolean;
  onPick: (taskId: string) => void;
  onClose: () => void;
}

export function AllTasksSheet({ pack, isSolved, onPick, onClose }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const groups = useMemo(() => allTasksGroups(pack), [pack]);
  const modesPresent = useMemo(() => {
    const set = new Set<TaskMode>();
    for (const g of groups) for (const { task } of g.tasks) set.add(task.mode);
    return set;
  }, [groups]);

  // Фокус внутрь при открытии и назад на кнопку-открывашку при закрытии.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // Esc закрывает; Tab не выпускает фокус из диалога.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const matches = (task: Task) =>
    filter === 'all' ? true : filter === 'interactive' ? INTERACTIVE.includes(task.mode) : task.mode === filter;

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: t.allTasks.filterAll },
    { id: 'interactive', label: t.allTasks.filterInteractive },
    ...(Object.keys(t.allTasks.modes) as TaskMode[])
      .filter((m) => modesPresent.has(m))
      .map((m) => ({ id: m as Filter, label: t.allTasks.modes[m] })),
  ];

  const total = groups.reduce((s, g) => s + g.tasks.length, 0);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div ref={dialogRef} className="sheet all-tasks" role="dialog" aria-modal="true" aria-label={t.allTasks.title}>
        <div className="grabber" />
        <div className="sheet-header">
          <h2>
            {t.allTasks.title} <span className="all-tasks-count">{total}</span>
          </h2>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label={t.allTasks.closeBtn}>
            ✕
          </button>
        </div>
        <div className="all-tasks-chips" role="group" aria-label={t.allTasks.filterAria}>
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`all-tasks-chip${filter === c.id ? ' is-active' : ''}`}
              aria-pressed={filter === c.id}
              onClick={() => setFilter(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        {groups.map((g) => {
          const shown = g.tasks.filter(({ task }) => matches(task));
          if (!shown.length) return null;
          return (
            <section key={g.skillId} className="all-tasks-group">
              <h3>{g.title}</h3>
              <div className="all-tasks-tiles">
                {shown.map(({ task, n }) => {
                  const solved = isSolved(task.id);
                  const glyph = MODE_GLYPH[task.mode];
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className={`all-tasks-tile${solved ? ' is-solved' : ''}`}
                      data-task-id={task.id}
                      title={`${n}. ${task.title}`}
                      aria-label={t.allTasks.tileAria(n, task.title, t.allTasks.modes[task.mode], solved)}
                      onClick={() => onPick(task.id)}
                    >
                      <span className="all-tasks-n">{n}</span>
                      {glyph && (
                        <span className="all-tasks-glyph" aria-hidden="true">
                          {glyph}
                        </span>
                      )}
                      {solved && (
                        <span className="all-tasks-check" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        <p className="muted all-tasks-legend">{t.allTasks.legend}</p>
      </div>
    </>
  );
}
