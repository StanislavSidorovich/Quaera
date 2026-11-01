import { careerRole, stagesOfRole } from '../content/career';
import { useI18n } from '../i18n/context';

/**
 * Подсказка роли на карте данных и в «Проекте от и до»: кто это, чем занят,
 * на каких этапах и с какими инструментами. Всё из career.json, своих текстов нет.
 * Подробности (оси, разрыв, отметки) остаются на вкладке «Путь к роли».
 */
export function RoleNote({ id, onMore }: { id: string; onMore: () => void }) {
  const { t, locale } = useI18n();
  const m = t.career.map.roleNote;
  const role = careerRole(id);
  if (!role) return null;
  const stages = stagesOfRole(id);
  const tools = [...new Set(stages.flatMap((s) => s.tools))];

  return (
    <div className="arch-tool-note" role="note">
      <p>
        <strong>{role.title[locale]}.</strong> {role.does[locale]}
      </p>
      <dl className="arch-learn">
        {stages.length > 0 && (
          <>
            <dt>{m.stages}</dt>
            <dd>{stages.map((s) => s.title[locale]).join('; ')}</dd>
          </>
        )}
        {tools.length > 0 && (
          <>
            <dt>{m.tools}</dt>
            <dd>{tools.join(', ')}</dd>
          </>
        )}
        <dt>{m.small}</dt>
        <dd>{role.hybrid[locale]}</dd>
      </dl>
      <button type="button" className="btn secondary arch-note-more" onClick={onMore}>
        {m.more}
      </button>
    </div>
  );
}
