import { architecture } from '../content/architecture';
import { useI18n } from '../i18n/context';
import { Badge, Label, Notes, rich } from './figureParts';

const g = architecture.artifacts.ingest;

const CX = 108;
const AX = 38;

/**
 * Схема загрузки в lakehouse: источники, файлы по расписанию, bronze, silver, gold и
 * «дальше отчёт». Сверху вниз и в узком viewBox (216), чтобы в карточке на телефоне подписи
 * оставались около 11px без прокрутки. Число файлов и первый с последним в bronze сняты
 * запросом к `staging_raw_sellout`, их сверяет `test:architecture`; расписание и
 * подключение нарисованы для примера (пометка 2).
 */
export function IngestFigure() {
  const { locale } = useI18n();
  const L = (k: keyof typeof g.labels) => g.labels[k][locale];
  const arrow = (d: string) => <path className="pf-seq" d={d} markerEnd="url(#ig-arr)" />;

  return (
    <figure className="pf">
      <figcaption className="pf-title">{g.title[locale]}</figcaption>
      <p className="muted pf-hint-n">{g.scrollHint[locale]}</p>
      <div className="pf-scroll" tabIndex={0}>
        <svg className="pf-svg pf-svg-n" viewBox="0 0 216 484" role="img" aria-label={g.aria[locale]} focusable="false">
          <defs>
            <marker id="ig-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path className="pf-arr" d="M0 1 L10 5 L0 9 z" />
            </marker>
          </defs>

          {/* Источники и файлы по расписанию */}
          <rect className="pf-shape" x={8} y={4} width={200} height={44} rx={8} />
          <Label x={CX} y={23} text={L('sources')} cls="pf-t pf-sys-t" />
          <Label x={CX} y={39} text={L('sourcesSub')} />
          {arrow(`M${AX} 48 V112`)}
          <Label x={AX + 14} y={76} text={L('schedule')} anchor="start" />
          <Badge x={AX - 16} y={81} n={2} />

          {/* Рамка lakehouse вокруг трёх слоёв */}
          <rect className="pf-lake" x={2} y={116} width={212} height={316} rx={12} />
          <text className="pf-t pf-lane-t" x={12} y={133}>
            {L('lake')}
          </text>

          {/* Bronze: файлы по месяцам как есть */}
          <rect className="pf-shape" x={10} y={140} width={196} height={128} rx={8} />
          <Label x={CX} y={159} text={L('bronze')} cls="pf-t pf-sys-t" />
          <Label x={CX} y={175} text="staging_raw_sellout" cls="pf-t pf-mono" />
          <rect className="pf-open" x={48} y={185} width={120} height={20} rx={5} />
          <text className="pf-t pf-mono" x={CX} y={199} textAnchor="middle">
            {g.files.first}
          </text>
          <text className="pf-t" x={CX} y={218} textAnchor="middle">
            …
          </text>
          <rect className="pf-open" x={48} y={222} width={120} height={20} rx={5} />
          <text className="pf-t pf-mono" x={CX} y={236} textAnchor="middle">
            {g.files.last}
          </text>
          <Badge x={186} y={213} n={1} />
          <Label x={CX} y={259} text={L('files')} cls="pf-t pf-dim" />

          {/* Silver */}
          {arrow(`M${AX} 268 V298`)}
          <Label x={AX + 14} y={287} text={L('clean')} anchor="start" />
          <rect className="pf-shape" x={10} y={298} width={196} height={44} rx={8} />
          <Label x={CX} y={317} text={L('silver')} cls="pf-t pf-sys-t" />
          <Label x={CX} y={333} text={L('silverSub')} />

          {/* Gold */}
          {arrow(`M${AX} 342 V384`)}
          <Label x={AX + 14} y={366} text={L('model')} anchor="start" />
          <rect className="pf-shape" x={10} y={384} width={196} height={44} rx={8} />
          <Label x={CX} y={403} text={L('gold')} cls="pf-t pf-sys-t" />
          <text className="pf-t" x={CX} y={419} textAnchor="middle">
            <tspan className="pf-mono">fact_sellout</tspan>
            <tspan> {L('goldSub')}</tspan>
          </text>

          {/* Дальше */}
          {arrow(`M${CX} 432 V450`)}
          <rect className="pf-shape pf-dashed" x={48} y={452} width={120} height={26} rx={8} />
          <Label x={CX} y={469} text={L('next')} cls="pf-t pf-dim" />
        </svg>
      </div>
      <Notes notes={g.notes} locale={locale} />
      <p className="muted pf-caption">{rich(g.caption[locale])}</p>
    </figure>
  );
}
