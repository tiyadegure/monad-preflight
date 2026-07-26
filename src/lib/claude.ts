import Anthropic from '@anthropic-ai/sdk';
import type { Explanation, ParsedIntent, RiskFinding, SimulationResult } from './types';

/**
 * Optional AI layer. The app is fully functional without it — the rule-based
 * parser and deterministic explainer are the default path. When the user
 * provides their own Anthropic API key (Settings), this layer adds:
 *   1. natural-language intent parsing for phrasings the rules can't catch
 *   2. a friendlier narrative on top of the deterministic explanation
 *
 * The AI never invents facts: the narrative prompt receives ONLY numbers the
 * simulator produced, and the UI labels its output as AI-generated.
 *
 * Two ways to connect:
 *   - Bring-your-own-key (local use): the browser talks to Anthropic
 *     directly with the key the user pasted. It is stored only in their
 *     browser (localStorage) and never touches our servers.
 *   - Proxy (production): the browser talks to our own small server
 *     (workers/ai-proxy.ts), which holds the real key. No Anthropic key
 *     ever appears in the page. See docs/ai-proxy.md for setup.
 */

export const DEFAULT_AI_MODEL = 'claude-opus-5';

export function createAiClient(apiKey: string, proxyUrl?: string): Anthropic {
  if (proxyUrl) {
    return new Anthropic({
      baseURL: proxyUrl,
      // The SDK insists on some key string. The proxy holds the real key
      // server-side and never reads or forwards this placeholder.
      apiKey: apiKey || 'proxy-managed',
      dangerouslyAllowBrowser: true,
    });
  }
  return new Anthropic({
    apiKey,
    // Required for browser use; acceptable here because the key is the
    // user's own and never leaves their machine except to Anthropic.
    dangerouslyAllowBrowser: true,
  });
}

/* ------------------------------------------------------------------ */
/* 1. Intent parsing                                                   */
/* ------------------------------------------------------------------ */

const PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'token', 'amountValue', 'amountUnlimited', 'amountAll', 'counterparty', 'notes'],
  properties: {
    action: { type: ['string', 'null'], enum: ['send', 'approve', 'revoke', null] },
    token: {
      type: ['string', 'null'],
      description: 'Token symbol or 0x-address as the user wrote it; null for native MON',
    },
    amountValue: { type: ['string', 'null'], description: 'Decimal amount as a string, no commas' },
    amountUnlimited: { type: 'boolean' },
    amountAll: { type: 'boolean' },
    counterparty: { type: ['string', 'null'], description: '0x-address: recipient for send, spender for approve/revoke' },
    notes: { type: 'array', items: { type: 'string' } },
  },
} as const;

const PARSE_SYSTEM = `You turn a user's plain-language request about the Monad testnet into a structured intent.
Supported actions: "send" (transfer native MON or an ERC-20 token), "approve" (allow a spender to use a token), "revoke" (cancel an approval).
Rules:
- MON / monad is the native coin: represent it as token = null.
- Addresses are 0x followed by 40 hex characters. Never invent or complete an address; if none is present, counterparty = null.
- Never invent amounts. "all"/"everything" => amountAll true. "unlimited"/"infinite"/"max" (approvals) => amountUnlimited true.
- If the request is not one of the supported actions, action = null and explain why in notes.
- notes: plain-language observations about ambiguity, in English, at most 2.`;

export async function aiParseIntent(
  client: Anthropic,
  text: string,
  model: string = DEFAULT_AI_MODEL,
): Promise<ParsedIntent | null> {
  const response = await client.beta.messages.create({
    model,
    max_tokens: 1000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: PARSE_SCHEMA } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: PARSE_SYSTEM,
    messages: [{ role: 'user', content: text }],
  });
  if (response.stop_reason === 'refusal') return null;
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return null;
  let parsed: {
    action: 'send' | 'approve' | 'revoke' | null;
    token: string | null;
    amountValue: string | null;
    amountUnlimited: boolean;
    amountAll: boolean;
    counterparty: string | null;
    notes: string[];
  };
  try {
    parsed = JSON.parse(block.text);
  } catch {
    return null;
  }
  if (!parsed.action) return null;
  const amount =
    parsed.amountValue || parsed.amountUnlimited || parsed.amountAll
      ? {
          value: parsed.amountValue ?? undefined,
          unlimited: parsed.amountUnlimited || undefined,
          all: parsed.amountAll || undefined,
        }
      : undefined;
  return {
    action: parsed.action,
    token: parsed.token ?? undefined,
    amount,
    counterparty: parsed.counterparty ?? undefined,
    notes: parsed.notes ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* 2. Narrative on top of the deterministic explanation                */
/* ------------------------------------------------------------------ */

const NARRATIVE_SYSTEM = `You are the voice of "Monad PreFlight", a tool that explains blockchain transactions before the user signs them.
You receive VERIFIED FACTS from a deterministic simulator. Write a short narrative (2-4 sentences) for a crypto newcomer:
- Use ONLY the facts given. Never invent numbers, addresses, or effects. Repeat amounts exactly as written.
- Second person, plain language, no jargon (never say allowance, calldata, wei, gas limit).
- If there are danger-level warnings, lead with the risk and be direct about it.
- Do not tell the user to sign or not to sign; help them decide.`;

export async function aiNarrative(
  client: Anthropic,
  facts: {
    summary: string;
    explanation: Explanation;
    simulation: Pick<SimulationResult, 'ok' | 'revertReason' | 'notes'>;
    risks: RiskFinding[];
  },
  model: string = DEFAULT_AI_MODEL,
): Promise<string | null> {
  const factSheet = [
    `Transaction: ${facts.summary}`,
    `Simulation outcome: ${facts.simulation.ok ? 'will succeed' : `would fail (${facts.simulation.revertReason ?? 'no reason given'})`}`,
    `Effects:`,
    ...facts.explanation.bullets.map((b) => `- ${b}`),
    facts.risks.length
      ? `Warnings:\n${facts.risks.map((r) => `- [${r.severity}] ${r.title}: ${r.detail}`).join('\n')}`
      : 'Warnings: none',
    facts.simulation.notes.length ? `Caveats: ${facts.simulation.notes.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.beta.messages.create({
    model,
    max_tokens: 1000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: NARRATIVE_SYSTEM,
    messages: [{ role: 'user', content: factSheet }],
  });
  if (response.stop_reason === 'refusal') return null;
  const block = response.content.find((b) => b.type === 'text');
  return block && block.type === 'text' ? block.text.trim() : null;
}
