/**
 * The wire contract between the browser and the orchestrator.
 *
 * Types only — this module compiles to nothing, so importing it from the client
 * cannot leak tool schemas or prompts into the bundle. The browser renders what
 * the server sends and computes none of it.
 */

export type StageKey = 'identify' | 'verify' | 'assess' | 'resolve' | 'confirm' | 'close';

export type GuardStatus = 'pass' | 'flag' | 'info' | 'pending';

/** Whether this session's replies come from the model or the offline script. */
export type SessionMode = 'live' | 'offline';

/** Which post-generation rule a blocked reply broke. */
export type OutputRule =
  | 'legal_threat'
  | 'bureau_promise'
  | 'third_party_contact'
  | 'off_matrix_offer'
  | 'premature_disclosure'
  | 'narration';

export type EscalationCategory =
  | 'hardship'
  | 'dispute'
  | 'legal_representation'
  | 'stop_contact_request'
  | 'other';

export interface PipelineStep {
  key: StageKey;
  label: string;
  status: 'done' | 'active' | 'pending';
}

export interface GuardView {
  id: string;
  status: GuardStatus;
  title: string;
  detail: string;
}

/** One row of the on-screen tool trace. Values are pre-truncated for display. */
export interface ToolTraceEntry {
  name: string;
  inp: string;
  out: string;
}

/** Everything the right-hand panels render. */
export interface SessionState {
  sessionId: string;
  personaId: string;
  mode: SessionMode;
  model: string | null;
  stage: StageKey;
  pipeline: PipelineStep[];
  guards: GuardView[];
  trace: ToolTraceEntry[];
  escalated: boolean;
  escalationReason: EscalationCategory | null;
  /**
   * What decided the escalation — shown in the compliance panel.
   * `preflight` means the model was never invoked for that turn; `postgen`
   * means it ran and its reply was suppressed before anyone saw it.
   */
  escalationVia: 'model' | 'script' | 'preflight' | 'postgen' | 'system' | null;
  /** Set when the post-generation gate blocked a reply. */
  blockedRule: OutputRule | null;
  resolved: boolean;
  /** Null until the agent's opening turn has been checked. */
  disclosed: boolean | null;
  locked: boolean;

  /* ---- pre-contact outcomes: no conversation exists in either case ---- */
  /** The Segment Agent suppressed outreach on this account. */
  suppressed: boolean;
  /** Contact was refused before placement, outside the CBUAE window. */
  contactRefused: boolean;
  /** Hour of day the contact was attempted. */
  contactHour: number;
  /** The permitted window, e.g. "09:00–20:00". */
  contactWindow: string;

  /* ---- right-party verification ---- */
  identityConfirmed: boolean;
  thirdParty: boolean;
  aiDisclosed: boolean | null;

  /**
   * The Remediation Agent's officer handover pack, present only after a
   * hardship escalation. These terms were never spoken to the customer.
   */
  officerPack: OfficerPack | null;
}

export interface OfficerPack {
  caseId: string;
  status: string;
  extendedPlanMonths: number;
  extendedPlanMonthlyAed: number;
  arrearsWaiverPct: number;
  settlementFloorAed: number;
  eosbEstimateAed: number | null;
  netAfterOffsetAed: number | null;
}

export interface CreateSessionRequest {
  personaId: string;
  /** Hour of day to attempt contact, 0–23. Drives the eligibility check. */
  contactHour?: number;
  /** Show the conversation anyway on an account the Segment Agent suppressed. */
  override?: boolean;
}

export interface CreateSessionResponse {
  sessionId: string;
  /** Empty when contact was suppressed or refused — no conversation opened. */
  openingTurn: string;
  state: SessionState;
  /** Set when the server had to explain something to the room, e.g. a fallback. */
  notice?: string;
}

export interface TurnRequest {
  sessionId: string;
  text: string;
}

export interface TurnResponse {
  reply: string;
  state: SessionState;
  trace: ToolTraceEntry[];
  escalated: boolean;
  locked: boolean;
  notice?: string;
}

export interface StatusResponse {
  live: boolean;
  model: string | null;
  reason?: string;
}

/** Audit trace entry kinds. `gates` is present from the start and stays empty
 *  until the compliance gates land, so the record shape does not change later. */
export type TraceEntry =
  | { seq: number; at: string; kind: 'session_created'; personaId: string; mode: SessionMode }
  | { seq: number; at: string; kind: 'customer_turn'; text: string }
  | { seq: number; at: string; kind: 'model_call'; model: string; iterations: number; latencyMs: number; stopReason: string | null }
  | { seq: number; at: string; kind: 'tool_call'; name: string; input: unknown; output: unknown; gates: string[] }
  /** A compliance gate ran. Recorded whether or not it fired: an examiner
   *  needs to see that the check happened, not only that it caught something. */
  | {
      seq: number;
      at: string;
      kind: 'gate';
      gate: 'preflight' | 'postgeneration';
      decision: 'pass' | 'escalate' | 'block';
      via?: 'pattern' | 'classifier' | 'system';
      category?: EscalationCategory;
      /** Which post-generation rule fired. */
      rule?: OutputRule;
      /** The offending fragment or figure. */
      evidence?: string;
      confidence?: number;
      detail?: string;
      latencyMs: number;
      /** Versions in force for this decision, so the audit is reproducible. */
      versions: Record<string, string | number>;
    }
  /** `suppressed` marks a turn the post-generation gate blocked. It is recorded
   *  precisely because the customer never saw it — an examiner needs to know
   *  what was stopped, not just what was sent. */
  | {
      seq: number;
      at: string;
      kind: 'agent_turn';
      text: string;
      source: 'model' | 'script' | 'canned';
      suppressed?: boolean;
    }
  /** `source` records what actually decided, so a system failure or a scripted
   *  turn is never filed in the audit as a customer hardship signal. */
  | { seq: number; at: string; kind: 'escalation'; reason: EscalationCategory; source: 'model' | 'script' | 'gate' | 'system' }
  | { seq: number; at: string; kind: 'error'; message: string; action: string };

export interface TraceResponse {
  sessionId: string;
  personaId: string;
  createdAt: string;
  mode: SessionMode;
  model: string | null;
  escalated: boolean;
  locked: boolean;
  entries: TraceEntry[];
}

export interface ApiError {
  error: string;
  code?: string;
}
