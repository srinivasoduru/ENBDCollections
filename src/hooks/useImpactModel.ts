import { useState } from 'react';

import { C } from '../shared/colors';

export interface Assumptions {
  /** Delinquent accounts entering 1–90 DPD per month. */
  acc: number;
  /** Average balance in bucket, AED. */
  bal: number;
  /** Current right-party contact rate, %. */
  rpc: number;
  /** Current roll rate 1→90 DPD, %. */
  roll: number;
  /** Share of contacts the fleet handles autonomously, %. */
  cont: number;
}

const DEFAULTS: Assumptions = { acc: 45000, bal: 9500, rpc: 28, roll: 19, cont: 65 };

export interface ImpactSlider {
  key: keyof Assumptions;
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface ImpactBar {
  label: string;
  value: string;
  width: string;
  color: string;
}

/**
 * Deliberately conservative: no benefit is claimed from late-stage or legal
 * recovery, and no headcount reduction is assumed beyond redeployment of
 * early-bucket capacity.
 */
function model(a: Assumptions) {
  const uplift = Math.min(0.85, a.rpc / 100 + (a.cont / 100) * 0.3);
  const contactGain = uplift - a.rpc / 100;
  const rollNew = Math.max(0.03, (a.roll / 100) * (1 - contactGain * 1.25));
  const rollDelta = a.roll / 100 - rollNew;
  const saved = a.acc * a.bal * 12 * rollDelta;
  return { uplift, contactGain, rollDelta, saved, costIdx: Math.round(100 - a.cont * 0.62) };
}

const formatSaving = (saved: number): string =>
  'AED ' + (saved >= 1e9 ? (saved / 1e9).toFixed(2) + 'bn' : Math.round(saved / 1e6) + 'm');

export interface ImpactModel {
  sliders: ImpactSlider[];
  set: (key: keyof Assumptions, value: number) => void;
  bigSaving: string;
  bigContact: string;
  bigCost: string;
  bars: ImpactBar[];
}

export function useImpactModel(): ImpactModel {
  const [a, setA] = useState<Assumptions>(DEFAULTS);
  const r = model(a);

  const rawBars = [
    { label: 'Contact rate uplift', v: Math.round(r.contactGain * 100), max: 40, color: C.blue, suffix: 'pts' },
    { label: 'Roll rate reduction', v: +(r.rollDelta * 100).toFixed(1), max: 12, color: C.green, suffix: 'pts' },
    { label: 'Self-cure contact suppressed', v: Math.round(a.cont * 0.34), max: 35, color: C.navy, suffix: '%' },
    { label: 'Early-bucket capacity released', v: Math.round(a.cont * 0.72), max: 70, color: C.steel, suffix: '%' },
  ];

  return {
    sliders: [
      {
        key: 'acc',
        label: 'Delinquent accounts entering 1–90 DPD per month',
        display: a.acc.toLocaleString('en-US'),
        min: 10000,
        max: 120000,
        step: 5000,
        value: a.acc,
      },
      {
        key: 'bal',
        label: 'Average balance in bucket',
        display: 'AED ' + a.bal.toLocaleString('en-US'),
        min: 3000,
        max: 30000,
        step: 500,
        value: a.bal,
      },
      {
        key: 'rpc',
        label: 'Current right-party contact rate',
        display: a.rpc + '%',
        min: 10,
        max: 60,
        step: 1,
        value: a.rpc,
      },
      {
        key: 'roll',
        label: 'Current roll rate 1→90 DPD',
        display: a.roll + '%',
        min: 5,
        max: 40,
        step: 1,
        value: a.roll,
      },
      {
        key: 'cont',
        label: 'Share of contacts the fleet handles autonomously',
        display: a.cont + '%',
        min: 20,
        max: 90,
        step: 5,
        value: a.cont,
      },
    ],
    set: (key, value) => setA((prev) => ({ ...prev, [key]: value })),
    bigSaving: formatSaving(r.saved),
    bigContact: Math.round(r.uplift * 100) + '%',
    bigCost: String(r.costIdx),
    bars: rawBars.map((b) => ({
      label: b.label,
      value: b.v + b.suffix,
      width: Math.min(100, (b.v / b.max) * 100) + '%',
      color: b.color,
    })),
  };
}
