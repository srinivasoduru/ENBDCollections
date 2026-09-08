/**
 * The single colour ladder for the whole prototype.
 *
 * Discipline matters more than range here: crimson is reserved exclusively for
 * the compliance floor and escalation, deep green exclusively for the
 * integration surface and passed gates. Nothing else uses either.
 */
export const C = {
  navy: '#072448',
  slate: '#3A4A63',
  blue: '#2665FF',
  steel: '#6B8CB8',
  green: '#1E6B4F',
  red: '#A8323C',
  grey: '#8A94A3',
} as const;

export type AgentKey =
  | 'SEGMENT'
  | 'TREATMENT'
  | 'ENGAGEMENT'
  | 'NEGOTIATION'
  | 'REMEDIATION'
  | 'SUPERVISOR'
  | 'SYSTEM';

export const AGENT_COLORS: Record<AgentKey, string> = {
  SEGMENT: C.navy,
  TREATMENT: C.slate,
  ENGAGEMENT: C.blue,
  NEGOTIATION: C.steel,
  REMEDIATION: C.green,
  SUPERVISOR: C.red,
  SYSTEM: C.grey,
};
