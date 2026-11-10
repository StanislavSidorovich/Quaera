import { useI18n } from '../i18n/context';
import { LAB_BUILD, openFamilyLink } from '../links';
import { useLabDone } from './LabDoneToast';
import { PipelinePreview } from './PipelinePreview';
import './pipelinePreview.css';
import './labBuildCard.css';

/** Карточка «собрать руками в Lab» главная карточка конвейера на карте данных, под ней тихая строка про обзор; «Пройдено ✓», когда Lab вернул `build:kaiyo-sales`. */
export function LabBuildCard() {
  const { t } = useI18n();
  const done = Boolean(useLabDone()['build:kaiyo-sales']);
  return (
    <section className="card pp lbc" aria-labelledby="lbc-title">
      <h2 id="lbc-title">
        {t.labDone.buildTitle}
        {done && <span className="pp-badge pp-done">{t.labDone.buildDone}</span>}
      </h2>
      <p className="pp-lead">{t.labDone.buildLead}</p>
      <p>
        <a className="link-row" href={LAB_BUILD} target="_blank" rel="noreferrer" onClick={(ev) => openFamilyLink(ev.currentTarget, ev.nativeEvent, 'lab')}>
          {t.labDone.buildOpen} ↗
        </a>
      </p>
      <PipelinePreview />
    </section>
  );
}
