import { C } from '../shared/colors';

/**
 * The estate diagram, drawn light-on-white at full bleed with 12–20px type
 * inside the SVG so it reads from across a meeting room.
 *
 * Layers top to bottom: customer channels, the supervisor, the four agents,
 * the deterministic compliance floor, the integration adapter, and the existing
 * ENBD estate — which is drawn dashed because nothing in it changes.
 */

const MONO = 'IBM Plex Mono, monospace';
const DISPLAY = 'Outfit, sans-serif';

const AGENTS = [
  { x: 40, lever: 'LEVER 1', name: 'Segment Agent', sub: 'risk · self-cure · cluster' },
  { x: 345, lever: 'LEVER 2', name: 'Treatment Agent', sub: 'contact scale · cadence' },
  { x: 650, lever: 'LEVER 3', name: 'Engagement Agent', sub: 'omnichannel · AR / EN / HI / TL' },
  { x: 955, lever: 'LEVER 4', name: 'Negotiation Agent', sub: 'offer matrix · PTP · payment' },
];

/** Column centres shared by the agent boxes and the estate boxes below them. */
const AGENT_STEMS = [182, 487, 792, 1097];
const ESTATE_STEMS = [199, 493, 787, 1081];

const ESTATE = [
  { x: 64, y: 662, cx: 199, label: 'Finacle core banking' },
  { x: 358, y: 662, cx: 493, label: 'Collections system' },
  { x: 652, y: 662, cx: 787, label: 'Dialer / contact centre' },
  { x: 946, y: 662, cx: 1081, label: 'Payment gateway (PCI)' },
  { x: 64, y: 726, cx: 199, label: 'AECB bureau feed' },
  { x: 358, y: 726, cx: 493, label: 'Risk / analytics models' },
  { x: 652, y: 726, cx: 787, label: 'Legal / DCA handoff' },
  { x: 946, y: 726, cx: 1081, label: 'EOSB / salary transfer' },
];

const LEGEND = [
  { fill: '#EEF2FA', stroke: C.navy, label: 'supervision' },
  { fill: '#FFFFFF', stroke: C.blue, label: 'agent layer' },
  { fill: '#FBF2F3', stroke: C.red, label: 'deterministic compliance floor' },
  { fill: '#F0F6F2', stroke: C.green, label: 'net-new integration surface' },
  { fill: '#F4F5F7', stroke: '#C8CED8', label: 'existing estate' },
];

const Arrow = ({ id, fill }: { id: string; fill: string }) => (
  <marker id={id} markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
    <path d="M0,0 L6,3 L0,6 Z" fill={fill} />
  </marker>
);

export function ArchitectureDiagram() {
  return (
    <>
      <svg viewBox="0 0 1280 800" xmlns="http://www.w3.org/2000/svg" role="img"
        aria-label="The agent fleet sits above the existing ENBD estate: customer channels feed a supervisor agent, four lever agents pass through a deterministic compliance floor into a tool-calling integration adapter, which reaches the unchanged existing systems.">
        <defs>
          <Arrow id="arN" fill={C.slate} />
          <Arrow id="arB" fill={C.blue} />
          <Arrow id="arR" fill={C.red} />
          <Arrow id="arG" fill={C.green} />
        </defs>

        {/* Customer channels */}
        <rect x="280" y="1" width="720" height="64" fill="#FFFFFF" stroke={C.slate} strokeWidth="1.4" />
        <text x="640" y="27" textAnchor="middle" fill={C.navy} fontFamily={MONO} fontSize="14" fontWeight="600" letterSpacing="1.2">
          CUSTOMER CHANNELS
        </text>
        <text x="640" y="50" textAnchor="middle" fill="#6B7686" fontFamily={MONO} fontSize="12">
          WhatsApp · SMS · outbound voice · IVR · email · ENBD app
        </text>
        <path d="M640,65 L640,94" stroke={C.slate} strokeWidth="1.6" markerEnd="url(#arN)" />

        {/* Supervisor */}
        <rect x="40" y="96" width="1200" height="80" fill="#EEF2FA" stroke={C.navy} strokeWidth="1.6" />
        <text x="66" y="128" fill={C.navy} fontFamily={MONO} fontSize="14" fontWeight="600" letterSpacing="1.2">
          SUPERVISOR AGENT
        </text>
        <text x="66" y="152" fill="#4A5A70" fontFamily={MONO} fontSize="12">
          allocation · conduct monitoring on 100% of conversations · kill switch · MIS
        </text>
        <text x="1214" y="141" textAnchor="end" fill={C.navy} fontFamily={MONO} fontSize="12">
          can halt any agent mid-action
        </text>

        {AGENT_STEMS.map((x) => (
          <path key={`b${x}`} d={`M${x},176 L${x},212`} stroke={C.blue} strokeWidth="1.6" markerEnd="url(#arB)" />
        ))}

        {/* Agent layer */}
        {AGENTS.map((a) => (
          <g key={a.name}>
            <rect x={a.x} y="214" width="285" height="112" fill="#FFFFFF" stroke={C.blue} strokeWidth="1.5" />
            <text x={a.x + 24} y="244" fill={C.blue} fontFamily={MONO} fontSize="12" fontWeight="600" letterSpacing="1">
              {a.lever}
            </text>
            <text x={a.x + 24} y="276" fill={C.navy} fontFamily={DISPLAY} fontSize="20" fontWeight="500">
              {a.name}
            </text>
            <text x={a.x + 24} y="302" fill="#6B7686" fontFamily={MONO} fontSize="12">
              {a.sub}
            </text>
          </g>
        ))}

        {AGENT_STEMS.map((x) => (
          <path key={`r${x}`} d={`M${x},326 L${x},362`} stroke={C.red} strokeWidth="1.6" markerEnd="url(#arR)" />
        ))}

        {/* Compliance floor */}
        <rect x="40" y="364" width="1200" height="106" fill="#FBF2F3" stroke={C.red} strokeWidth="1.8" />
        <text x="640" y="399" textAnchor="middle" fill={C.red} fontFamily={MONO} fontSize="15" fontWeight="600" letterSpacing="1.2">
          COMPLIANCE FLOOR — DETERMINISTIC, NOT MODEL-JUDGED
        </text>
        <text x="640" y="426" textAnchor="middle" fill="#4A5A70" fontFamily={MONO} fontSize="12.5">
          CBUAE contact hours &amp; frequency · 7-day letter SLA · hardship + dispute hard stop · AECB
          disclosure · PDPL consent · Sharia messaging for EI
        </text>
        <text x="640" y="450" textAnchor="middle" fill={C.grey} fontFamily={MONO} fontSize="12">
          every agent action passes through this layer before it reaches a customer
        </text>

        <path d="M640,470 L640,500" stroke={C.green} strokeWidth="1.6" markerEnd="url(#arG)" />

        {/* Integration adapter */}
        <rect x="40" y="502" width="1200" height="80" fill="#F0F6F2" stroke={C.green} strokeWidth="1.6" />
        <text x="640" y="536" textAnchor="middle" fill={C.green} fontFamily={MONO} fontSize="15" fontWeight="600" letterSpacing="1.2">
          TOOL-CALLING INTEGRATION ADAPTER
        </text>
        <text x="640" y="561" textAnchor="middle" fill="#4A5A70" fontFamily={MONO} fontSize="12.5">
          the only net-new engineering surface — typed functions, tokenised payments, full decision
          trace
        </text>

        {ESTATE_STEMS.map((x) => (
          <path key={`g${x}`} d={`M${x},582 L${x},614`} stroke={C.green} strokeWidth="1.4" markerEnd="url(#arG)" />
        ))}

        {/* Existing estate */}
        <rect x="40" y="616" width="1200" height="182" fill="#F4F5F7" stroke="#C8CED8" strokeWidth="1.4" strokeDasharray="5,4" />
        <text x="64" y="646" fill={C.grey} fontFamily={MONO} fontSize="12.5" fontWeight="600" letterSpacing="1.2">
          EXISTING ENBD ESTATE — UNCHANGED
        </text>
        {ESTATE.map((box) => (
          <g key={box.label}>
            <rect x={box.x} y={box.y} width="270" height="54" fill="#FFFFFF" stroke="#C8CED8" strokeWidth="1.3" />
            <text x={box.cx} y={box.y + 32} textAnchor="middle" fill={C.navy} fontFamily={MONO} fontSize="13">
              {box.label}
            </text>
          </g>
        ))}
      </svg>

      <div className="legend">
        {LEGEND.map((l) => (
          <span className="legend__item" key={l.label}>
            <span className="legend__swatch" style={{ background: l.fill, borderColor: l.stroke }} />
            {l.label}
          </span>
        ))}
      </div>
    </>
  );
}
