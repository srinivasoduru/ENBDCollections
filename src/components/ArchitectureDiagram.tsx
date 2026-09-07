import { C } from '../shared/colors';

/**
 * The estate diagram, drawn light-on-white at full bleed with 12–20px type
 * inside the SVG so it reads from across a meeting room.
 *
 * Layers top to bottom: customer channels, the supervisor, the agent row, the
 * deterministic compliance floor, the integration adapter, and the existing
 * ENBD estate — which is drawn dashed because nothing in it changes.
 *
 * The Remediation Agent sits in the agent row but is drawn in the post-handover
 * colour: it runs only after a conversation has stopped, and the enhanced terms
 * it prepares are never reachable from a live call.
 */

const MONO = 'IBM Plex Mono, monospace';
const DISPLAY = 'Outfit, sans-serif';

const AGENT_WIDTH = 226;

const AGENTS = [
  { x: 40, lever: 'LEVER 1', name: 'Segment Agent', sub: 'risk · self-cure · cluster', accent: C.blue },
  { x: 286, lever: 'LEVER 2', name: 'Treatment Agent', sub: 'contact scale · cadence', accent: C.blue },
  { x: 532, lever: 'LEVER 3', name: 'Engagement Agent', sub: 'omnichannel · AR / EN / HI / TL', accent: C.blue },
  { x: 778, lever: 'LEVER 4', name: 'Negotiation Agent', sub: 'Debt Assist · PTP · payment', accent: C.blue },
  // Deliberately set apart: it runs after the conversation has stopped, and its
  // terms are never reachable from a live call.
  { x: 1024, lever: 'HARDSHIP', name: 'Remediation Agent', sub: 'officer pack · post-handover', accent: C.green },
];

/** Column centres shared by the agent boxes and the estate boxes below them. */
const AGENT_STEMS = [153, 399, 645, 891, 1137];
const ESTATE_STEMS = [199, 493, 787, 1081];

const ESTATE = [
  { x: 64, y: 662, cx: 199, label: 'DCORE · collections SoR' },
  { x: 358, y: 662, cx: 493, label: 'Core banking · balances' },
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
  { fill: '#FFFFFF', stroke: C.green, label: 'post-handover, officer only' },
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
        aria-label="The agent fleet sits above the existing ENBD estate: customer channels feed a supervisor agent; four lever agents plus a post-handover remediation agent pass through a deterministic compliance floor into a tool-calling integration adapter, which reaches the unchanged existing systems.">
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
          SMS · outbound voice · email · secure in-app messaging in ENBD X · inbound
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

        {AGENTS.map((a, i) => (
          <path
            key={`b${AGENT_STEMS[i]}`}
            d={`M${AGENT_STEMS[i]},176 L${AGENT_STEMS[i]},212`}
            stroke={a.accent}
            strokeWidth="1.6"
            markerEnd={a.accent === C.green ? 'url(#arG)' : 'url(#arB)'}
          />
        ))}

        {/* Agent layer */}
        {AGENTS.map((a) => (
          <g key={a.name}>
            <rect x={a.x} y="214" width={AGENT_WIDTH} height="112" fill="#FFFFFF" stroke={a.accent} strokeWidth="1.5" />
            <text x={a.x + 22} y="244" fill={a.accent} fontFamily={MONO} fontSize="12" fontWeight="600" letterSpacing="1">
              {a.lever}
            </text>
            <text x={a.x + 22} y="276" fill={C.navy} fontFamily={DISPLAY} fontSize="18" fontWeight="500">
              {a.name}
            </text>
            <text x={a.x + 22} y="302" fill="#6B7686" fontFamily={MONO} fontSize="11">
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
          CBUAE contact hours &amp; frequency · identity before disclosure · 7-day letter SLA ·
          hardship + dispute hard stop · AECB disclosure · PDPL consent
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
