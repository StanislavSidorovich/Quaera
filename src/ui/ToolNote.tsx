import { architecture } from '../content/architecture';
import { familyPeers, toolLearning } from '../content/tool-learning';
import type { LearnSource, QuaeraTarget } from '../content/tool-learning';
import { useI18n } from '../i18n/context';
import { DATASET_CSV_ZIP, FAMILY, LAB_PRACTICE_PYTHON, LAB_PRACTICE_SQL, LAB_QUAERA, STRATASQL_MODEL } from '../links';

const pandasUrl = FAMILY.find((a) => a.key === 'pandas')?.url ?? '';

const TARGETS: Record<QuaeraTarget, string> = {
  labSql: LAB_PRACTICE_SQL,
  labPython: LAB_PRACTICE_PYTHON,
  labData: LAB_QUAERA,
  model: STRATASQL_MODEL,
  pandas: pandasUrl,
  csv: DATASET_CSV_ZIP,
};

/**
 * Подсказка инструмента на карте данных и в «Проекте от и до». Порядок намеренный:
 * что это, потом шаг внутри Quaera, и только потом чужой сервис с его условиями.
 */
export function ToolNote({ name }: { name: string }) {
  const { t, locale } = useI18n();
  const m = t.career.map.toolLearn;
  const entry = toolLearning.tools[name];
  const family = toolLearning.families[entry.family];
  const peers = familyPeers(name);
  const source = (id: string) => toolLearning.sources[id];
  const line = (s: LearnSource) => (
    <span key={s.url} className="arch-learn-line">
      <a href={s.url} target="_blank" rel="noreferrer">
        {s.title}
      </a>
      . {s.access[locale]}
    </span>
  );

  return (
    <div className="arch-tool-note" role="note">
      <p>
        <strong>{name}.</strong> {architecture.tools[name][locale]}
      </p>
      <dl className="arch-learn">
        {entry.quaera && (
          <>
            <dt>{m.quaera}</dt>
            <dd>
              {entry.quaera.text[locale]}
              {entry.quaera.to && (
                <>
                  {' '}
                  {entry.quaera.to === 'csv' ? (
                    <a href={TARGETS.csv} download>
                      {m.download}
                    </a>
                  ) : (
                    <a href={TARGETS[entry.quaera.to]} target="_blank" rel="noreferrer">
                      {m.open}
                    </a>
                  )}
                </>
              )}
            </dd>
          </>
        )}
        {(entry.try || entry.note) && (
          <>
            <dt>{m.tryIt}</dt>
            <dd>
              {entry.try && line(source(entry.try))}
              {entry.note && <span className="arch-learn-line">{entry.note[locale]}</span>}
            </dd>
          </>
        )}
        {entry.learn && (
          <>
            <dt>{m.learn}</dt>
            <dd>{entry.learn.map((id) => line(source(id)))}</dd>
          </>
        )}
        <dt>{m.carries}</dt>
        <dd>
          <span className="arch-learn-line">{family.carries[locale]}</span>
          <span className="arch-learn-line">
            {m.relearn}: {family.relearn[locale]}
          </span>
          {family.peers && <span className="arch-learn-line">{m.sameWork(family.title[locale], peers.join(' · '))}</span>}
        </dd>
      </dl>
      <p className="arch-learn-checked">{m.checked(new Date(toolLearning.checked).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))}</p>
    </div>
  );
}
