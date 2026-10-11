import { useI18n } from '../i18n/context';
import { packForTrack } from '../content';
import showcase from '../content/showcase.json';
import { hangLead, hangStyle } from './CodeBlock';

/**
 * Окно с настоящим заданием в карточке кампании новичка: неверный запрос →
 * что он вернул → разбор от проверки → исправленная строка → «сходится».
 *
 * Заменило сетку недель кампании (была справа в этой же карточке) и серую
 * картинку QueryLoop внизу главной. Человеку, который ещё ничего не решал,
 * сетка «Неделя 1…7» не говорит ничего, а картинка из полосок показывала
 * идею «сверяется результат», но не то, чем тренажёр отличается: проверка
 * объясняет ошибку. Приём A из скилла landing-showcase.
 *
 * **Текст не скопирован, а взят из пака**: название задания, код ловушки
 * и её разбор — то же, что человек увидит в карточке «Знакомая ошибка»,
 * и перевод приходит вместе с паком. Числа результатов лежат в
 * showcase.json, и это не второй источник правды без присмотра (довод, по
 * которому у QueryLoop чисел не было): verify-content выполняет ловушку,
 * исправленный запрос и эталон задания и сверяет их с этим файлом.
 */
export function TaskShowcase() {
  const { t, locale } = useI18n();
  const s = t.welcome.showcase;
  const task = packForTrack('sql', locale)?.tasks.find((x) => x.id === showcase.taskId);
  const trap = task?.traps?.[showcase.trap];
  // Гейт держит задание и ловушку на месте; если пак всё же разошёлся, окна просто нет.
  if (!task || !trap) return null;

  const lines = trap.code.split('\n');
  const fixed = lines.find((l) => l.includes(showcase.fixFrom))?.replace(showcase.fixFrom, showcase.fixTo);
  const value = (r: { rows: (string | number)[][] }) => r.rows[0]?.[0];
  const column = showcase.wrong.columns[0];
  const fmt = (v: string | number | undefined) =>
    typeof v === 'number' ? v.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US') : String(v ?? '');

  return (
    <figure className="task-showcase" aria-label={s.aria}>
      <div className="ts-window">
        <p className="ts-tab">
          <span className="ts-tab-id">{task.id}</span> {s.tab}
        </p>
        <p className="ts-title">{task.title}</p>

        <p className="ts-label">{s.query}</p>
        <pre className="sql-block ts-code">
          {lines.map((line, i) => (
            <span
              key={i}
              className={line.includes(showcase.fixFrom) ? 'code-line ts-bad' : 'code-line'}
              style={hangStyle(hangLead(line))}
            >
              {line || ' '}
            </span>
          ))}
        </pre>
        <p className="ts-result">
          {/* Эталон здесь не печатается: разбор ниже начинается с «0 вместо 61», второй раз было бы задвоением. */}
          {s.result}: <code>{column}</code> <b className="ts-num-bad">{fmt(value(showcase.wrong))}</b>
        </p>

        <div className="feedback warn ts-feedback">
          <h3>{t.task.trapTitle}</h3>
          <p>{trap.message}</p>
        </div>

        {fixed && (
          <>
            <p className="ts-label">{s.fixed}</p>
            <pre className="sql-block ts-code">
              <span className="code-line ts-good" style={hangStyle(hangLead(fixed))}>
                {fixed}
              </span>
            </pre>
            <p className="ts-result ts-result-ok">
              <span aria-hidden className="ts-check">
                ✓
              </span>{' '}
              <code>{column}</code> <b>{fmt(value(showcase.right))}</b> · {s.matches}
            </p>
          </>
        )}
      </div>
      <figcaption className="ts-note">{s.note}</figcaption>
    </figure>
  );
}
