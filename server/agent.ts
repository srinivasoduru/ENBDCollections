import Anthropic from '@anthropic-ai/sdk';

import type { AgentReply, AgentStatus } from '../src/shared/api';
import { personaById } from '../src/shared/personas';
import { SESSION_OPENER, systemPrompt } from '../src/shared/prompt';
import { TOOL_DEFS, traceTool, type ToolCall } from '../src/shared/tools';

/**
 * Server side of the Live Agent view.
 *
 * The model call happens here so the API key never reaches the browser. The
 * tools themselves are simulated (see src/shared/tools.ts) — in production
 * these are adapters into Finacle, the collections system of record, the PCI
 * gateway and document services, and the compliance floor is enforced by the
 * orchestrator rather than by the agent choosing to call escalate_to_human.
 */

/**
 * Opus 5 is the default. The prototype named an older model; that was a
 * design-time artifact, not a requirement. Override with AGENT_MODEL.
 */
const DEFAULT_MODEL = 'claude-opus-5';

/** Replies are one to three spoken sentences; the ceiling only needs to cover thinking. */
const MAX_TOKENS = 4096;

/** A turn that needs more tool round-trips than this is misbehaving. */
const MAX_ITERATIONS = 8;

/** Guards against an oversized history being posted back. */
const MAX_HISTORY_ENTRIES = 120;

let client: Anthropic | null = null;

const model = (): string => process.env.AGENT_MODEL || DEFAULT_MODEL;

const hasCredentials = (): boolean =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export function agentStatus(): AgentStatus {
  if (!hasCredentials()) {
    return {
      live: false,
      model: null,
      reason:
        'No ANTHROPIC_API_KEY in the server environment — the Live Agent view will run its offline script.',
    };
  }
  return { live: true, model: model() };
}

const getClient = (): Anthropic => (client ??= new Anthropic());

/** Tool definitions in the shape the Messages API expects. */
const apiTools = TOOL_DEFS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema as Anthropic.Tool.InputSchema,
}));

export class AgentRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function parseRequest(body: unknown): { personaId: string; messages: Anthropic.MessageParam[]; say?: string } {
  if (!body || typeof body !== 'object') throw new AgentRequestError('Request body must be an object.');
  const { personaId, messages, say } = body as Record<string, unknown>;

  if (typeof personaId !== 'string' || !personaById(personaId)) {
    throw new AgentRequestError('Unknown personaId.');
  }
  if (!Array.isArray(messages)) throw new AgentRequestError('messages must be an array.');
  if (messages.length > MAX_HISTORY_ENTRIES) throw new AgentRequestError('Conversation history is too long.');
  if (say !== undefined && typeof say !== 'string') throw new AgentRequestError('say must be a string.');

  return { personaId, messages: messages as Anthropic.MessageParam[], say };
}

/**
 * Runs one customer turn to completion: calls the model, executes whatever
 * tools it decides to call, and loops until it produces a spoken reply.
 */
export async function handleAgentTurn(body: unknown): Promise<AgentReply> {
  const { personaId, messages: incoming, say } = parseRequest(body);
  const persona = personaById(personaId)!;

  const messages: Anthropic.MessageParam[] = [...incoming];
  // An empty history means this is the opening turn.
  messages.push({ role: 'user', content: say ?? SESSION_OPENER });

  const toolCalls: ToolCall[] = [];
  let reply = '';

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await getClient().messages.create({
      model: model(),
      max_tokens: MAX_TOKENS,
      // The system prompt and tool list are identical on every turn of a
      // session, so they are worth caching across the conversation.
      system: [
        { type: 'text', text: systemPrompt(persona), cache_control: { type: 'ephemeral' } },
      ],
      // Short conversational turns; depth of reasoning is not the constraint,
      // responsiveness in the room is.
      output_config: { effort: 'low' },
      tools: apiTools,
      messages,
    });

    if (response.stop_reason === 'refusal') {
      throw new AgentRequestError('The model declined to continue this conversation.', 502);
    }

    for (const block of response.content) {
      if (block.type === 'text') reply += (reply ? '\n\n' : '') + block.text;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (toolUses.length === 0) break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      // Tool inputs are parsed JSON from the SDK; never string-match them.
      const input = (use.input ?? {}) as Record<string, unknown>;
      const { result, call } = traceTool(persona, use.name, input);
      toolCalls.push(call);
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: results });
  }

  return { reply: reply.trim() || '…', toolCalls, messages };
}
