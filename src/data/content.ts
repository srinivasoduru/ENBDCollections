import { C } from '../shared/colors';

export type ViewId = 'proposition' | 'fleet' | 'arch' | 'live' | 'journey' | 'impact';

export interface Tab {
  id: ViewId;
  label: string;
  /** Kept in the build but off the tab row — figures not in the CRO deck. */
  hidden?: boolean;
}

export const TABS: Tab[] = [
  { id: 'proposition', label: '01 PROPOSITION' },
  { id: 'fleet', label: '02 AGENT FLEET' },
  { id: 'arch', label: '03 ARCHITECTURE' },
  { id: 'live', label: '04 LIVE AGENT' },
  { id: 'journey', label: '05 JOURNEY SIM' },
  { id: 'impact', label: '06 IMPACT & PLAN', hidden: true },
];

export const VISIBLE_TABS = TABS.filter((t) => !t.hidden);

/** Public ENBD figures, from ENBD's own FY-2025 and H1-2026 results releases. */
export const FIGURES = [
  {
    value: 'AED 13.5B',
    label: 'DEFERRED ACROSS 135,031 CUSTOMERS\n127,753 OF THEM INDIVIDUALS · JUL 2026',
  },
  { value: '+36%', label: 'RETAIL BOOK GROWTH\nEND 2024 TO JUNE 2026' },
  {
    value: 'AED 1.4B',
    label: 'GROUP IMPAIRMENT CHARGE H1-2026\nFROM AED 0.3B CREDIT · AED 865M OVERLAY',
  },
  { value: '7 days', label: 'MANDATED LIABILITY-LETTER SLA\nCBUAE — FINED ELSEWHERE AT AED 1.82M' },
];

export const PROPOSITION = {
  title:
    'Deferrals unwind in H2 2026. An agent fleet on top of DCORE absorbs the wave without growing the team in proportion.',
  lede: "Not a replacement for the ENBD estate. A reasoning layer above it. Each agent owns one lever of the collections value chain, calls the systems already in place, and operates inside CBUAE conduct rules that are enforced structurally — not left to a model's judgement. Collectors take months to recruit and train; agents scale in days and hold conduct constant under pressure.",
  footnote:
    "These four levers map onto the A–D journey stages in the proposal deck: Predict & Prevent, Engage Early, Resolve, and Recover. Portfolio figures shown throughout this demo are illustrative and scaled to a representative UAE retail unsecured book. Public ENBD figures cited on this page are from ENBD's own FY-2025 and H1-2026 results releases.",
};

export const STANCES = [
  {
    kicker: 'TODAY',
    accent: '#8A94A3',
    title: 'Capacity is the strategy',
    body: "Contact intensity is set by how many FR officers are on the floor, not by what each account needs. Low-risk self-cure accounts get chased; high-risk accounts get the same script. The lever exists in the model; the operation can't act on it at scale.",
  },
  {
    kicker: 'THE GAP',
    accent: C.slate,
    title: 'Decisioning is upstream, execution is manual',
    body: 'Risk, self-cure and cluster models produce a segment. A human then has to remember what treatment that segment implies, dial it, negotiate it, and log it — with delegated authority approvals sitting in email.',
  },
  {
    kicker: 'THE SHIFT',
    accent: C.blue,
    title: 'Agents close the loop in the conversation',
    body: 'The agent reads the score, applies the treatment rule, picks the channel and language, negotiates inside the pre-approved offer matrix, captures the PTP, takes payment, and books it — in one pass, on every account, every day.',
  },
];

export interface Lever {
  no: string;
  lever: string;
  agent: string;
  owner: string;
  change: string;
}

export const LEVERS: Lever[] = [
  {
    no: '1',
    lever: 'Collection models',
    agent: 'SEGMENT AGENT',
    owner: 'Credit Risk',
    change:
      'Risk / self-cure / cluster scores are consumed at conversation time, not just in a monthly strategy file. Self-cure accounts are suppressed from contact entirely.',
  },
  {
    no: '2',
    lever: 'Collection treatment',
    agent: 'TREATMENT AGENT',
    owner: 'Collections Strategy',
    change:
      'The contact scale (day 0 → 160) becomes an executable schedule per cluster, with CBUAE frequency and hour caps enforced at the orchestrator.',
  },
  {
    no: '3',
    lever: 'Alternative channels',
    agent: 'ENGAGEMENT AGENT',
    owner: 'Financial Remediation',
    change:
      'One agent across SMS, voice, email and secure in-app messaging — generating the message per segment and language rather than maintaining 40 static templates.',
  },
  {
    no: '4',
    lever: 'Product offering',
    agent: 'NEGOTIATION AGENT',
    owner: 'Collections Strategy · Legal',
    change:
      'Offers restructuring, tenor extension, arrears waiver and settlement strictly from the approved matrix, sized to demonstrated ability to pay.',
  },
  {
    no: '5–7',
    lever: 'Ops & performance',
    agent: 'SUPERVISOR AGENT',
    owner: 'Head of Collections',
    change:
      'Allocates work, monitors every conversation for conduct breach, and produces the roll-rate / PTP-kept MIS as a by-product rather than a reporting exercise.',
  },
  {
    no: '8–9',
    lever: 'IT & process',
    agent: 'INTEGRATION LAYER',
    owner: 'Group Technology',
    change:
      'Tool-calling adapters into DCORE, core banking, AECB, the dialer and the payment gateway. No rip-and-replace.',
  },
];

export interface FleetAgent {
  glyph: string;
  name: string;
  lever: string;
  color: string;
  desc: string;
  tools: string[];
}

export const FLEET: FleetAgent[] = [
  {
    glyph: '01',
    name: 'Segment Agent',
    lever: 'LEVER 1 · COLLECTION MODELS',
    color: C.navy,
    desc: 'Reads PD, self-cure propensity and cluster assignment at the moment of contact. Suppresses outreach entirely on accounts the self-cure model expects to pay on their own — the single largest cost saving in the fleet, and the moment to watch in the Live Agent tab.',
    tools: ['get_segment_scores', 'get_account_status', 'suppress_contact'],
  },
  {
    glyph: '02',
    name: 'Treatment Agent',
    lever: 'LEVER 2 · COLLECTION TREATMENT',
    color: C.slate,
    desc: 'Turns the contact scale into an executable per-cluster schedule — which touch, on which day, through which channel, at what intensity. Never exceeds CBUAE frequency or hour limits, because the orchestrator refuses the call.',
    tools: ['get_treatment_plan', 'check_contact_eligibility', 'schedule_touch'],
  },
  {
    glyph: '03',
    name: 'Engagement Agent',
    lever: 'LEVER 3 · ALTERNATIVE CHANNELS',
    color: C.blue,
    desc: 'The customer-facing voice across SMS, outbound voice, email and secure in-app messaging in ENBD X. Generates the message per segment, tenure of debt and language — Arabic, English, Hindi, Malayalam, Tagalog — rather than maintaining static template libraries.',
    tools: ['send_message', 'place_call', 'detect_language', 'log_disposition'],
  },
  {
    glyph: '04',
    name: 'Negotiation Agent',
    lever: 'LEVER 4 · PRODUCT OFFERING',
    color: C.steel,
    desc: 'Handles the actual conversation: ability-to-pay discovery, restructuring, tenor extension, arrears waiver, settlement. Every offer is drawn from the approved matrix — the agent selects, it never invents.',
    tools: ['get_offer_matrix', 'log_promise_to_pay', 'initiate_payment', 'send_confirmation'],
  },
  {
    glyph: '05',
    name: 'Remediation Agent',
    lever: 'HARDSHIP · POST-HANDOVER ONLY',
    color: C.green,
    desc: 'Runs only after the conversation has stopped. Prepares the enhanced Debt Assist options — longer tenor, larger waiver, lower settlement floor — as a recommendation for an approving officer, plus the EOSB offset position and letters against the seven-working-day CBUAE clock. These terms are never reachable from a live conversation.',
    tools: ['open_hardship_case', 'calculate_eosb_offset', 'issue_letter'],
  },
  {
    glyph: '06',
    name: 'Supervisor Agent',
    lever: 'LEVERS 5–7 · OPS & PERFORMANCE',
    color: C.red,
    desc: 'Monitors every conversation in the fleet for conduct breach, allocates work across agents and the human FR queue, holds the kill switch, and produces roll-rate, PTP-kept and cost-to-collect MIS as a by-product of operating.',
    tools: ['monitor_conduct', 'allocate_queue', 'halt_agent', 'emit_mis'],
  },
];

export const FLEET_RATIONALE = [
  {
    kicker: 'AUDITABILITY',
    title: 'Each decision has an owner',
    body: 'When the regulator asks why a customer was contacted six times in a week, the answer is a named agent, a named rule and a logged tool call — not "the model decided."',
  },
  {
    kicker: 'BLAST RADIUS',
    title: 'One agent can be paused',
    body: 'If the Negotiation Agent starts producing off-matrix offers, it can be pulled without taking down reminders, engagement or the escalation path.',
  },
  {
    kicker: 'TUNING',
    title: 'Different owners, different cadences',
    body: 'Credit Risk owns the Segment Agent. Collections Strategy owns Treatment. Legal owns the escalation triggers. Each can change their piece without a full retrain.',
  },
];

export const TOOL_ROWS = [
  {
    fn: 'get_account_status()',
    sys: 'DCORE · core banking',
    con: 'Read-only. Returns balance, DPD, product, bucket, prior PTP history.',
  },
  {
    fn: 'get_segment_scores()',
    sys: 'Risk models',
    con: 'Read-only. PD, self-cure propensity, cluster. Agent consumes, never computes.',
  },
  {
    fn: 'check_contact_eligibility()',
    sys: 'Compliance floor',
    con: 'Blocks the call before it is placed if outside CBUAE hours or over frequency cap.',
  },
  {
    fn: 'get_offer_matrix()',
    sys: 'Collections strategy config',
    con: 'Returns only pre-approved terms for that cluster. Off-matrix offers are structurally impossible.',
  },
  {
    fn: 'log_promise_to_pay()',
    sys: 'DCORE · system of record',
    con: 'Writes PTP amount and date. Monitored for broken-promise escalation.',
  },
  {
    fn: 'initiate_payment()',
    sys: 'PCI payment gateway',
    con: 'Takes an amount only. Tokenised. The model has no path to raw card or IBAN data.',
  },
  {
    fn: 'escalate_to_human()',
    sys: 'FR officer queue',
    con: 'Mandatory on hardship, dispute, legal representation or stop-contact request.',
  },
  {
    fn: 'issue_letter()',
    sys: 'Document services',
    con: 'Liability / clearance letters against the 7-working-day CBUAE SLA clock.',
  },
];

export const ROADMAP = [
  {
    phase: 'WEEKS 1–3',
    title: 'Integration discovery and segment lock',
    body: 'Map what is actually callable across DCORE, core banking, the dialer and the payment gateway. Pick one cluster — early-bucket credit cards with salary transfer is the highest-yield, lowest-risk starting point — and lock the Debt Assist matrix with Collections Strategy and Legal.',
  },
  {
    phase: 'WEEKS 4–7',
    title: 'Fleet build and compliance floor',
    body: 'Stand up Segment, Treatment, Engagement and Negotiation agents against sandboxed APIs, with the CBUAE conduct rules implemented as deterministic gates. Build the adversarial test harness — synthetic customers who dispute, claim hardship, threaten legal action, and try to extract off-matrix concessions.',
  },
  {
    phase: 'WEEKS 8–10',
    title: 'Shadow mode on live traffic',
    body: 'The fleet works real accounts in parallel with FR officers but does not contact anyone. Every proposed action is scored against what the human actually did and reviewed by Compliance. This is the phase that produces the evidence for the go/no-go, and it carries zero customer risk.',
  },
  {
    phase: 'WEEKS 11–12',
    title: 'Contained live pilot and readout',
    body: 'Capped volume, one cluster, one channel, 100% QA review. Readout covers containment rate, PTP-kept rate, roll-rate delta versus a matched control group, and conduct-breach count — which should be zero. Go/no-go decided in that meeting, against numbers agreed before the build started.',
  },
];

export const GATES = [
  {
    kicker: 'GATE 1',
    accent: C.navy,
    title: 'Containment',
    body: 'Share of conversations resolved end to end without an FR officer. Target agreed before build, measured on live pilot traffic only.',
  },
  {
    kicker: 'GATE 2',
    accent: C.blue,
    title: 'Roll-rate delta',
    body: 'Movement into 90+ DPD for the treated cohort versus a matched control. The only outcome metric that survives contact with Finance.',
  },
  {
    kicker: 'GATE 3',
    accent: C.red,
    title: 'Conduct breaches',
    body: 'Count of CBUAE conduct-rule violations across all agent-handled contacts. The pass mark is zero, and it is non-negotiable.',
  },
];
