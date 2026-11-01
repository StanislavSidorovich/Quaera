import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { architecture } from '../content/architecture';
import { useI18n } from '../i18n/context';
import { FLOW_KAIYO, openFamilyLink } from '../links';

const p = architecture.artifacts.process;

/** Текст с `кодом` в обратных кавычках: тот же разбор, что у подписей артефактов слоёв. */
const rich = (s: string): ReactNode => s.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>));

const LH = 12.5;

/** Подпись в несколько строк: `\n` в тексте — перенос; `y` — базовая линия первой строки. */
function Label({ x, y, text, anchor = 'middle', cls = 'pf-t' }: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end'; cls?: string }) {
  return (
    <text className={cls} textAnchor={anchor}>
      {text.split('\n').map((line, i) => (
        <tspan key={i} x={x} y={y + i * LH}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Текст внутри фигуры: по центру (cx, cy) независимо от числа строк. */
function Inside({ cx, cy, text }: { cx: number; cy: number; text: string }) {
  const n = text.split('\n').length;
  return <Label x={cx} y={cy - ((n - 1) * LH) / 2 + 4} text={text} />;
}

type TaskKind = 'user' | 'manual' | 'send' | 'receive';

function Task({ x, y, text, kind }: { x: number; y: number; text: string; kind: TaskKind }) {
  const w = 88;
  const h = 46;
  return (
    <g>
      <rect className="pf-shape" x={x} y={y} width={w} height={h} rx={8} />
      <Inside cx={x + w / 2} cy={y + h / 2 + 3} text={text} />
      {(kind === 'send' || kind === 'receive') && (
        <g transform={`translate(${x + 7} ${y + 6})`} className={kind === 'send' ? 'pf-env pf-env-solid' : 'pf-env'}>
          <rect width={12} height={8} rx={1} />
          <polyline points="0,0 6,5 12,0" />
        </g>
      )}
      {kind === 'user' && (
        <g transform={`translate(${x + 7} ${y + 5})`} className="pf-icon">
          <circle cx={5} cy={3} r={2.4} />
          <path d="M0.5 10 Q5 3.5 9.5 10" />
        </g>
      )}
      {kind === 'manual' && (
        <g transform={`translate(${x + 7} ${y + 5})`} className="pf-icon">
          <path d="M1 9 V3.5 M3.5 9 V1.5 M6 9 V2.5 M8.5 9 V4.5 M1 9 Q1 11 4.5 11 Q8.5 11 8.5 8" />
        </g>
      )}
    </g>
  );
}

function Gateway({ cx, cy, r, mark }: { cx: number; cy: number; r: number; mark: 'x' | 'plus' }) {
  const k = r * 0.42;
  return (
    <g>
      <polygon className="pf-shape" points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} />
      {mark === 'x' ? (
        <path className="pf-mark" d={`M${cx - k} ${cy - k} L${cx + k} ${cy + k} M${cx - k} ${cy + k} L${cx + k} ${cy - k}`} />
      ) : (
        <path className="pf-mark" d={`M${cx - k * 1.2} ${cy} H${cx + k * 1.2} M${cx} ${cy - k * 1.2} V${cy + k * 1.2}`} />
      )}
    </g>
  );
}

function Envelope({ cx, cy, solid }: { cx: number; cy: number; solid?: boolean }) {
  return (
    <g transform={`translate(${cx - 6} ${cy - 4})`} className={solid ? 'pf-env pf-env-solid' : 'pf-env'}>
      <rect width={12} height={8} rx={1} />
      <polyline points="0,0 6,5 12,0" />
    </g>
  );
}

function Badge({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle className="pf-badge" cx={x} cy={y} r={9.5} />
      <text className="pf-badge-t" x={x} y={y + 4} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

/**
 * Схема «заказ дистрибьютора Kaiyo Trading» в нотации BPMN: те же элементы, что в примере
 * Flow (`flow/cases/kaiyo-order.flow.json`), геометрия упрощена и расставлена вручную,
 * чтобы линии не шли сквозь фигуры. Рукописный SVG без интерактива; цвета только
 * через токены темы (классы `.pf-*` в styles.css). Две пометки связывают шаги с
 * `fact_sellin`; числа в них сверяет `test:architecture` с запросом.
 */
export function ProcessFigure() {
  const { locale } = useI18n();
  const L = (k: keyof typeof p.labels) => p.labels[k][locale];
  const lane = (k: keyof typeof p.lanes) => p.lanes[k][locale];

  return (
    <figure className="pf">
      <figcaption className="pf-title">{p.title[locale]}</figcaption>
      <p className="muted pf-hint">{p.scrollHint[locale]}</p>
      <div className="pf-scroll" tabIndex={0}>
        <svg className="pf-svg" viewBox="0 0 920 512" role="img" aria-label={p.aria[locale]} focusable="false">
          <defs>
            <marker id="pf-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path className="pf-arr" d="M0 1 L10 5 L0 9 z" />
            </marker>
            <marker id="pf-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path className="pf-open" d="M0.5 1 L9 5 L0.5 9 z" />
            </marker>
            <marker id="pf-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse">
              <circle className="pf-open" cx={5} cy={5} r={3.2} />
            </marker>
          </defs>

          {/* Пул, дорожки */}
          <rect className="pf-pool" x={0} y={0} width={920} height={440} />
          <path className="pf-lane" d="M24 0 V440 M48 0 V440 M24 150 H920 M24 260 H920" />
          <text className="pf-t pf-pool-t" transform="rotate(-90 12 220)" x={12} y={224} textAnchor="middle">
            Kaiyo Trading
          </text>
          <text className="pf-t pf-lane-t" transform="rotate(-90 36 75)" x={36} y={79} textAnchor="middle">
            {lane('sales')}
          </text>
          <text className="pf-t pf-lane-t" transform="rotate(-90 36 205)" x={36} y={209} textAnchor="middle">
            {lane('warehouse')}
          </text>
          <text className="pf-t pf-lane-t" transform="rotate(-90 36 350)" x={36} y={354} textAnchor="middle">
            {lane('finance')}
          </text>

          {/* Чёрный ящик */}
          <rect className="pf-pool" x={0} y={470} width={920} height={40} />
          <text className="pf-t pf-pool-t" x={460} y={494} textAnchor="middle">
            {lane('distributor')}
          </text>

          {/* Потоки управления */}
          <g className="pf-seq">
            <path d="M89 60 H115" markerEnd="url(#pf-arr)" />
            <path d="M204 60 H229" markerEnd="url(#pf-arr)" />
            <path d="M250 80 V99" markerEnd="url(#pf-arr)" />
            <path d="M270 60 H311" markerEnd="url(#pf-arr)" />
            <path d="M330 78 V291" markerEnd="url(#pf-arr)" />
            <path d="M348 60 H430 V181" markerEnd="url(#pf-arr)" />
            <path d="M474 205 H513" markerEnd="url(#pf-arr)" />
            <path d="M602 205 H650 V296" markerEnd="url(#pf-arr)" />
            <path d="M374 315 H631" markerEnd="url(#pf-arr)" />
            <path d="M668 315 H699" markerEnd="url(#pf-arr)" />
            <path d="M788 315 H836" markerEnd="url(#pf-arr)" />
          </g>
          <path className="pf-seq pf-seq-dashed" d="M772 349 V395 H836" markerEnd="url(#pf-arr)" />
          <path className="pf-assoc" d="M160 83 V103" markerEnd="url(#pf-arr)" />

          {/* Сообщения: дистрибьютор и обратно */}
          <g className="pf-msg">
            <path d="M76 470 V74" markerStart="url(#pf-dot)" markerEnd="url(#pf-open)" />
            <path d="M250 127 V470" markerStart="url(#pf-dot)" markerEnd="url(#pf-open)" />
            <path d="M330 338 V470" markerStart="url(#pf-dot)" markerEnd="url(#pf-open)" />
            <path d="M558 228 V470" markerStart="url(#pf-dot)" markerEnd="url(#pf-open)" />
            <path d="M716 470 V339" markerStart="url(#pf-dot)" markerEnd="url(#pf-open)" />
            <path d="M850 408 V470" markerStart="url(#pf-dot)" markerEnd="url(#pf-open)" />
          </g>

          {/* Продажи */}
          <circle className="pf-shape" cx={76} cy={60} r={13} />
          <Envelope cx={76} cy={60} />
          <Label x={76} y={24} text={L('start')} />
          <Task x={116} y={37} text={L('post')} kind="user" />
          <g transform="translate(160 104)">
            <path className="pf-shape" d="M-15 5 a15 5 0 0 1 30 0 v20 a15 5 0 0 1 -30 0 z" />
            <path className="pf-assoc pf-arc" d="M-15 5 a15 5 0 0 0 30 0" />
            <text className="pf-t pf-erp" x={0} y={23} textAnchor="middle">
              ERP
            </text>
          </g>
          <Gateway cx={250} cy={60} r={20} mark="x" />
          <Label x={250} y={28} text={L('stock')} />
          <Label x={256} y={94} text={L('no')} anchor="start" />
          <Label x={278} y={52} text={L('yes')} anchor="start" />
          <circle className="pf-shape pf-end" cx={250} cy={114} r={13} />
          <Envelope cx={250} cy={114} solid />
          <Label x={270} y={111} text={L('declined')} anchor="start" />
          <Badge x={218} y={114} n={2} />
          <Gateway cx={330} cy={60} r={18} mark="plus" />

          {/* Склад */}
          <Task x={386} y={182} text={L('pack')} kind="manual" />
          <Task x={514} y={182} text={L('ship')} kind="send" />
          <Badge x={611} y={178} n={1} />

          {/* Финансы */}
          <Task x={286} y={292} text={L('invoice')} kind="send" />
          <Gateway cx={650} cy={315} r={18} mark="plus" />
          <Task x={700} y={292} text={L('pay')} kind="receive" />
          <circle className="pf-shape pf-end" cx={850} cy={315} r={13} />
          <Label x={850} y={280} text={L('paid')} />
          {/* Таймер просрочки на границе задачи: не прерывающий, поэтому пунктирный двойной круг */}
          <circle className="pf-shape pf-dashed" cx={772} cy={338} r={11} />
          <circle className="pf-dashed pf-inner" cx={772} cy={338} r={8} />
          <path className="pf-clock" d="M772 338 V333 M772 338 L775.5 340" />
          <Label x={788} y={357} text={L('overdue')} anchor="start" />
          <circle className="pf-shape pf-end" cx={850} cy={395} r={13} />
          <Envelope cx={850} cy={395} solid />
          <Label x={842} y={420} text={L('reminder')} anchor="end" />
        </svg>
      </div>
      <ol className="pf-notes">
        {p.notes.map((n, i) => (
          <li key={i}>
            <span className="pf-num" aria-hidden="true">
              {i + 1}
            </span>
            <span>{rich(n[locale])}</span>
          </li>
        ))}
      </ol>
      <p className="muted pf-caption">{p.caption[locale]}</p>
      <a
        className="link-row pf-open-flow"
        href={FLOW_KAIYO}
        target="_blank"
        rel="noreferrer"
        // Уже открытый Flow получил бы только фокус, и пример бы не открылся: Flow всегда новая вкладка.
        onClick={(e) => openFamilyLink(e.currentTarget, e.nativeEvent, 'flow')}
      >
        {p.openFlow[locale]} ↗
      </a>
    </figure>
  );
}
