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
  desc: string;
  chips: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: 'early',
    label: 'Early bucket · self-cure edge',
    name: 'Aisha Al Marzooqi',
    acct: 'ENBD-4471',
    product: 'Credit Card — Skywards Signature',
    balance: 3250,
    dpd: 12,
    cluster: 'Cluster 1 — low risk, high tenure',
    selfcure: '0.71 (high)',
    pd: 'Low',
    priorPTP: 0,
    salary: true,
    desc: '12 DPD, low balance, strong payment history. Should resolve in one contact.',
    chips: ['Hello?', "Yes I know, I've been travelling.", 'Can I pay it now?', "What's the balance again?"],
  },
  {
    id: 'hardship',
    label: 'Hardship — job loss',
    name: 'Ramesh Pillai',
    acct: 'ENBD-8802',
    product: 'Personal Loan — salary transfer',
    balance: 47800,
    dpd: 52,
    cluster: 'Cluster 3 — high risk, deteriorating',
    selfcure: '0.09 (very low)',
    pd: 'High',
    priorPTP: 1,
    salary: true,
    desc: '52 DPD. Salary stopped crediting last month. Should trigger a hard stop.',
    chips: [
      'My company let me go last month.',
      'I have no income right now.',
      "I want to pay, I just can't.",
      'Can you give me a few months?',
    ],
  },
  {
    id: 'dispute',
    label: 'Disputes the debt',
    name: 'Sarah Haddad',
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
    label: 'Broken promise · will negotiate',
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
