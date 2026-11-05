import { useI18n } from '../i18n/context';
import { useLabDone } from './LabDoneToast';
import { LAB_PIPELINE, openFamilyLink } from '../links';
import './pipelinePreview.css';

/**
 * Анонс «конвейер в Lab» на карте данных. Это не рабочая функция, а честная
 * схема того, что в планах (статус «В планах»). Конвейер строим после разговоров
 * с пользователями, а на показе нужно видеть, что готовится. Цвета только токенами
 * темы (см. pipelinePreview.css), чисел, похожих на данные Kaiyo, на схеме нет.
 */

const DOTS = ['ok', 'run', 'wait'] as const;

export function PipelinePreview() {
  const { t } = useI18n();
  const p = t.career.map.pipeline;
  const done = Boolean(useLabDone()['pipeline:kaiyo-sellout']);
  const rows = [
    { name: 'stg', time: '0:04' },
    { name: 'silver', time: '0:09' },
    { name: 'gold', time: '' },
  ];
  const top = [
    { x: 0, t: p.src, s: p.srcSub, tone: 'erp' },
    { x: 180, t: p.stg, s: p.stgSub, tone: 'bronze' },
    { x: 360, t: p.steps, s: '', tone: 'steps' },
    { x: 540, t: p.silver, s: '', tone: 'silver' },
    { x: 720, t: p.gold, s: p.goldSub, tone: 'gold' },
  ];
  return (
    <section className="card pp" aria-labelledby="pp-title">
      <span className="pp-badge">{p.badge}</span>
      {done && <span className="pp-badge pp-done">{t.labDone.mark}</span>}
      <h2 id="pp-title">{p.title}</h2>
      <p className="pp-lead">{p.lead}</p>
      <p>
        <a className="link-row" href={LAB_PIPELINE} target="_blank" rel="noreferrer" onClick={(ev) => openFamilyLink(ev.currentTarget, ev.nativeEvent, 'lab')}>
          {t.labDone.open} ↗
        </a>
      </p>

      <div className="pp-fig">
        <svg className="pp-svg" viewBox="0 0 860 320" role="img" aria-label={p.aria}>
          <defs>
            <marker id="pp-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" className="pp-head" />
            </marker>
          </defs>

          {/* верхний ряд: источник, stg, шаги, silver, gold */}
          {top.map((n) => (
            <g key={n.x} className={`pp-${n.tone}`}>
              <rect x={n.x} y={10} width={140} height={70} rx={8} className="pp-box" />
              <rect x={n.x} y={10} width={140} height={5} rx={2} className="pp-stripe" />
              <text x={n.x + 70} y={n.s ? 44 : 50} textAnchor="middle" className="pp-t">
                {n.t}
              </text>
              {n.s && (
                <text x={n.x + 70} y={64} textAnchor="middle" className="pp-s">
                  {n.s}
                </text>
              )}
            </g>
          ))}
          {[140, 320, 500, 680].map((x) => (
            <line key={x} x1={x + 2} y1={45} x2={x + 38} y2={45} className="pp-edge" markerEnd="url(#pp-ah)" />
          ))}

          {/* список Applied steps под шагом обработки */}
          {p.applied.map((a, i) => (
            <text key={a} x={364} y={104 + i * 16} className="pp-s">
              {`${i + 1}. ${a}`}
            </text>
          ))}

          {/* gold ведёт к запуску */}
          <path d="M790 80 V168 H230 V188" className="pp-edge" fill="none" markerEnd="url(#pp-ah)" />

          {/* нижний ряд: журнал, дашборд, решение */}
          <rect x={0} y={190} width={460} height={124} rx={8} className="pp-box" />
          <text x={16} y={214} className="pp-t">
            {p.run}
          </text>
          <text x={38} y={238} className="pp-s">{p.colStep}</text>
          <text x={170} y={238} className="pp-s">{p.colStatus}</text>
          <text x={400} y={238} className="pp-s">{p.colTime}</text>
          <line x1={12} y1={244} x2={448} y2={244} className="pp-rule" />
          {rows.map((r, i) => (
            <g key={r.name}>
              <circle cx={22} cy={260 + i * 20} r={5} className={`pp-dot-${DOTS[i]}`} />
              <text x={38} y={264 + i * 20} className="pp-s pp-row">{r.name}</text>
              <text x={170} y={264 + i * 20} className="pp-s pp-row">{p.status[i]}</text>
              <text x={400} y={264 + i * 20} className="pp-s pp-row">{r.time}</text>
            </g>
          ))}
          <line x1={462} y1={252} x2={536} y2={252} className="pp-edge" markerEnd="url(#pp-ah)" />
          {[
            { x: 540, t: p.dashboard },
            { x: 720, t: p.decision },
          ].map((n) => (
            <g key={n.x}>
              <rect x={n.x} y={217} width={140} height={70} rx={8} className="pp-box" />
              <text x={n.x + 70} y={257} textAnchor="middle" className="pp-t">
                {n.t}
              </text>
            </g>
          ))}
          <line x1={682} y1={252} x2={718} y2={252} className="pp-edge" markerEnd="url(#pp-ah)" />
        </svg>
      </div>

      <h3 className="pp-do-title">{p.doTitle}</h3>
      <ul className="pp-do">
        {p.does.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <p className="pp-source">{p.source}</p>
    </section>
  );
}
