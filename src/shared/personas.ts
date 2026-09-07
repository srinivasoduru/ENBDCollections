export interface Persona {
  id: string;
  /** Card heading — the scenario, not the customer. */
  label: string;
  name: string;
  acct: string;
  product: string;
  balance: number;
  dpd: number;
  cluster: string;
  selfcure: string;
  pd: string;
  priorPTP: number;
  salary: boolean;
  /**
   * The Segment Agent suppresses outreach on this account entirely — the
   * self-cure model expects the customer to pay on their own. No session opens
   * unless a presenter overrides it.
   */
  suppress?: boolean;
  desc: string;
  chips: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: 'early',
    label: 'Maya · self-cure',
    name: 'Maya Haddad',
    acct: 'ENBD-4471',
    product: 'Credit Card — Skywards Signature',
    balance: 6800,
    dpd: 5,
    cluster: 'Cluster 1 — low risk, high tenure',
    selfcure: '0.86 (very high)',
    pd: 'Low',
    priorPTP: 0,
    salary: true,
    suppress: true,
    desc: 'Priority customer, pays in full, missed a card payment abroad. Model says leave her alone.',
    chips: [
      'Why was I charged a late fee?',
      "I've been travelling.",
      'Can I pay it now?',
      'Set up auto-pay please',
    ],
  },
  {
    id: 'hardship',
    label: 'Ahmed · hardship',
    name: 'Ahmed Al Balushi',
    acct: 'ENBD-8802',
    product: 'Personal Loan — salary transfer',
    balance: 47800,
    dpd: 8,
    cluster: 'Cluster 3 — high risk, deteriorating',
    selfcure: '0.09 (very low)',
    pd: 'High',
    priorPTP: 1,
    salary: true,
    desc: 'Made redundant in March, salary credit stopped. Should trigger a hard stop.',
    chips: [
      'I lost my job in March.',
      'I cannot pay right now.',
      "I want to pay, I just can't.",
      'Can you give me a few months?',
    ],
  },
  {
    id: 'dispute',
    label: 'Disputes the debt',
    name: 'Sara Al Suwaidi',
    acct: 'ENBD-2319',
    product: 'Credit Card — Platinum',
    balance: 8940,
    dpd: 38,
    cluster: 'Cluster 2 — moderate risk',
    selfcure: '0.34',
    pd: 'Moderate',
    priorPTP: 0,
    salary: false,
    desc: 'Believes the charges are not hers. Must not be negotiated with.',
    chips: [
      "These charges aren't mine.",
      'I cancelled this card in March.',
      'I want this investigated.',
      'Send me something in writing.',
    ],
  },
  {
    id: 'negotiate',
    label: 'Broken promise',
    name: 'Mohammed Yusuf',
    acct: 'ENBD-6155',
    product: 'Personal Loan — salary transfer',
    balance: 22100,
    dpd: 74,
    cluster: 'Cluster 3 — high risk',
    selfcure: '0.12',
    pd: 'High',
    priorPTP: 2,
    salary: true,
    desc: '74 DPD, two broken promises. The real negotiation test.',
    chips: [
      'Something came up again, sorry.',
      'I can pay half now.',
      'Can we restructure it properly this time?',
      'What if I give you 5,000 today?',
    ],
  },
];

export const personaById = (id: string): Persona | undefined => PERSONAS.find((p) => p.id === id);

/** First name, used for the identity check the agent must pass before disclosing. */
export const firstName = (p: Persona): string => p.name.split(' ')[0];
