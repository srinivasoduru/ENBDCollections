import type { AgentKey } from '../shared/colors';

export interface SimEvent {
  /** Days past due at the moment of the event; negative is pre-due. */
  d: number;
  a: AgentKey;
  m: string;
}

export const BUCKETS = [
  { name: 'CURRENT', range: '0 DPD', w: 12 },
  { name: 'BUCKET 1', range: '1–30 DPD', w: 22 },
  { name: 'BUCKET 2', range: '31–60 DPD', w: 22 },
  { name: 'BUCKET 3', range: '61–90 DPD', w: 22 },
  { name: 'PRE-LEGAL', range: '90+ DPD', w: 22 },
];

/** The delinquency track is piecewise so each bucket occupies its own band. */
export const dpdToPct = (dpd: number): number => {
  const v = Math.max(0, Math.min(dpd, 100));
  if (v === 0) return 6;
  if (v <= 30) return 12 + (v / 30) * 22;
  if (v <= 60) return 34 + ((v - 30) / 30) * 22;
  if (v <= 90) return 56 + ((v - 60) / 30) * 22;
  return 78 + ((v - 90) / 10) * 22;
};

export const SIM_SCRIPT: SimEvent[] = [
  {
    d: -3,
    a: 'SEGMENT',
    m: 'Pre-due scan. Salary credit for Rahul Menon not received on expected date — early warning flag raised three days before due date.',
  },
  {
    d: -3,
    a: 'SEGMENT',
    m: 'Scores pulled: cluster 2 — moderate risk, self-cure propensity 0.41, PD band moderate. Not suppressible.',
  },
  {
    d: 0,
    a: 'TREATMENT',
    m: 'Cluster 2 treatment plan loaded. Contact scale set: soft digital day 3, voice day 15, intensity steps at day 30 and 60.',
  },
  {
    d: 3,
    a: 'ENGAGEMENT',
    m: 'WhatsApp reminder sent in English (language inferred from prior servicing history). Delivered, read, no reply.',
  },
  {
    d: 7,
    a: 'ENGAGEMENT',
    m: 'SMS follow-up. No response. Disposition logged; contact frequency counter at 2 of the permitted window.',
  },
  {
    d: 15,
    a: 'TREATMENT',
    m: 'Escalating intensity per plan. Contact eligibility checked — inside CBUAE permitted hours, under frequency cap. Voice contact authorised.',
  },
  {
    d: 15,
    a: 'ENGAGEMENT',
    m: 'Outbound voice call placed. Right-party contact achieved. Customer says he is travelling and will pay on return.',
  },
  {
    d: 15,
    a: 'NEGOTIATION',
    m: 'Offer matrix pulled for cluster 2. Customer commits verbally. PTP logged: AED 6,200 by day 24. Broken-promise monitor armed.',
  },
  { d: 24, a: 'SYSTEM', m: 'PTP date reached. No payment received. Promise broken.' },
  {
    d: 25,
    a: 'SUPERVISOR',
    m: 'Broken PTP detected. Account re-scored — self-cure propensity drops to 0.18. Reallocated to a firmer treatment path.',
  },
  {
    d: 26,
    a: 'ENGAGEMENT',
    m: 'Voice contact. Customer engages, asks for a structured plan rather than a lump sum.',
  },
  {
    d: 26,
    a: 'NEGOTIATION',
    m: 'Six-month plan offered from the approved matrix at AED 3,067/month. Customer accepts. First instalment taken on the tokenised gateway.',
  },
  {
    d: 26,
    a: 'NEGOTIATION',
    m: 'Confirmation sent via WhatsApp and email. Account flagged as arrangement-in-force; contact suppressed while the plan performs.',
  },
  {
    d: 56,
    a: 'SYSTEM',
    m: 'Instalment 2 received on time. Arrangement performing. No contact made — suppression holding.',
  },
  {
    d: 86,
    a: 'SYSTEM',
    m: 'Instalment 3 missed. Arrangement broken. Account re-enters active treatment at 86 DPD.',
  },
  {
    d: 87,
    a: 'ENGAGEMENT',
    m: 'Voice contact. Customer states his employer has terminated his contract and he is on a grace period visa.',
  },
  {
    d: 87,
    a: 'SUPERVISOR',
    m: 'Hardship signal detected mid-conversation. Negotiation Agent halted immediately — no further terms may be discussed autonomously.',
  },
  {
    d: 87,
    a: 'REMEDIATION',
    m: 'Debt Assist hardship case opened. EOSB offset position calculated against salary-transfer terms and attached to the case file.',
  },
  {
    d: 87,
    a: 'SUPERVISOR',
    m: 'Escalated to human FR officer with full conversation transcript, decision trace and hardship context pre-loaded. Zero re-explanation required from the customer.',
  },
  {
    d: 88,
    a: 'SYSTEM',
    m: 'Run complete. 19 agent actions · 1 human touch · 0 conduct breaches. Account did not roll past 90 DPD.',
  },
];

/** Wall-clock spacing between events when the simulation runs. */
export const SIM_TICK_MS = 900;
