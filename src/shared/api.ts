import type { ToolCall } from './tools';

/** Whether the Live Agent view can reach a real model, decided by the server. */
export interface AgentStatus {
  live: boolean;
  model: string | null;
  /** Present when live is false — why the server cannot make model calls. */
  reason?: string;
}

export interface AgentRequest {
  personaId: string;
  /**
   * Opaque Anthropic message history. The client holds it and sends it back
   * unchanged so the agent keeps its tool results across turns; only the server
   * interprets the shape.
   */
  messages: unknown[];
  /** The customer's turn. Omitted on the opening call. */
  say?: string;
}

export interface AgentReply {
  reply: string;
  toolCalls: ToolCall[];
  /** Updated history to send back on the next turn. */
  messages: unknown[];
}

export interface AgentError {
  error: string;
}

export const isAgentError = (r: AgentReply | AgentError): r is AgentError =>
  typeof (r as AgentError).error === 'string';
