import { useI18n } from '../i18n/context';
import { useLabDone } from './LabDoneToast';
import { LAB_PIPELINE, openFamilyLink } from '../links';
import './pipelinePreview.css';

/**
 * Тихая строка под карточкой сборки на карте данных: обзор того же пути на готовых
 * блоках (`#pipeline=kaiyo-sellout`). Отдельной карточкой он больше не стоит (решение
 * хозяина 2026-11-10): главная карточка — «Собрать руками» (LabBuildCard). Отметка
 * «Собран в Lab ✓» остаётся, если Lab уже вернул `pipeline:kaiyo-sellout`.
 */
export function PipelinePreview() {
  const { t } = useI18n();
  const done = Boolean(useLabDone()['pipeline:kaiyo-sellout']);
  return (
    <p className="pp-overview">
      <a className="link-row" href={LAB_PIPELINE} target="_blank" rel="noreferrer" onClick={(ev) => openFamilyLink(ev.currentTarget, ev.nativeEvent, 'lab')}>
        {t.labDone.overview} ↗
      </a>
      {done && <span className="pp-badge pp-done">{t.labDone.mark}</span>}
    </p>
  );
}
