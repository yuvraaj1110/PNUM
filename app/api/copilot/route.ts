import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { FLEET_TOOLS, executeTool } from '@/lib/fleet-tools';
import { pickSupabaseKey } from '@/lib/supabase-key';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  Lapras — Agentic Dispatch Copilot  (provider-neutral tool-calling)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  POST /api/copilot
 *
 *  The dispatcher asks a natural-language question ("who can take the
 *  emergency on 5th St fastest?"). The LLM plans, calls the SAME fleet tools
 *  the MCP server exposes (lib/fleet-tools.ts), and answers.
 *
 *  Provider-neutral: uses the OpenAI-compatible Chat Completions API, so it
 *  runs on any compatible endpoint. Default is Groq (free tier); switch with
 *  the LLM_PROVIDER env var:
 *
 *    LLM_PROVIDER=groq    GROQ_API_KEY=...           (default; llama-3.3-70b)
 *    LLM_PROVIDER=ollama  (no key; local llama3.1:8b at :11434)
 *    LLM_PROVIDER=openai  OPENAI_API_KEY=... OPENAI_BASE_URL=...
 *
 *  Human-in-the-loop safety: read-only tools auto-execute. The one
 *  side-effecting tool, `assign_job`, is GATED — the route returns a
 *  `pendingConfirmation` and waits for the dispatcher to approve.
 *
 *  Wire protocol (stateless; client holds the transcript):
 *    Request : { messages: ChatMessage[], confirm?: { approve: boolean } }
 *    Response: { messages, reply, pendingConfirmation?: { tool, input }, done }
 */

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const MAX_TURNS = 8;
const WRITE_TOOLS = new Set(['assign_job']);

const SYSTEM_PROMPT = `You are the dispatch copilot for Lapras, a real-time plumbing fleet operations platform serving the Portland, OR metro area.

You help a human dispatcher monitor technicians and assign jobs. You have tools to read fleet state and to assign a technician to a job.

Guidelines:
- When asked who should take a job, call find_nearest_available_tech and explain the ranking in plain language (distance, current load, skill match, availability). Name the top recommendation and 1-2 alternatives.
- Refer to jobs and technicians by name/title, not raw UUIDs, in your prose.
- Only call assign_job when the dispatcher clearly wants to assign someone. The dispatcher must confirm before the assignment is written.
- Be concise and operational. Lead with the answer.
- If a tool returns no candidates or an error, say so plainly and suggest a next step.`;

// Map the shared tool catalog to OpenAI function-tool format.
const LLM_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = FLEET_TOOLS.map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.inputSchema as Record<string, unknown>,
  },
}));

function resolveLLM(): { client: OpenAI; model: string; label: string } {
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  const model = process.env.COPILOT_MODEL;
  if (provider === 'ollama') {
    return {
      client: new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' }),
      model: model || 'llama3.1:8b',
      label: 'ollama',
    };
  }
  if (provider === 'openai') {
    return {
      client: new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
      }),
      model: model || 'gpt-4o-mini',
      label: 'openai',
    };
  }
  // Default: Groq (OpenAI-compatible, free tier)
  return {
    client: new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
    }),
    model: model || 'llama-3.3-70b-versatile',
    label: 'groq',
  };
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Prefer the service-role key only if it's a real key (not the placeholder).
  const key = pickSupabaseKey(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  );
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall;

const isFunctionCall = (tc: OpenAI.Chat.Completions.ChatCompletionMessageToolCall): tc is ToolCall =>
  tc.type === 'function';

export async function POST(request: NextRequest) {
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  if (provider === 'groq' && !process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY is not set. Get a free key at console.groq.com, or set LLM_PROVIDER=ollama to run locally.' },
      { status: 500 }
    );
  }

  const { client, model } = resolveLLM();
  const sb = getSupabase();

  let body: { messages?: ChatMessage[]; confirm?: { approve: boolean } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const messages: ChatMessage[] = body.messages ?? [];
  if (messages.length === 0) {
    return NextResponse.json({ error: 'messages[] is required' }, { status: 400 });
  }

  try {
    // ── Resume path: dispatcher approved/denied a pending assign_job ──
    if (body.confirm) {
      const last = messages[messages.length - 1];
      const toolCalls = ((last?.role === 'assistant' && last.tool_calls) || []).filter(isFunctionCall);
      if (toolCalls.length === 0) {
        return NextResponse.json(
          { error: 'confirm requires the prior assistant tool_call message last in messages[]' },
          { status: 400 }
        );
      }
      for (const tc of toolCalls) {
        if (WRITE_TOOLS.has(tc.function.name) && !body.confirm.approve) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: 'The dispatcher declined this assignment. Do not retry it; acknowledge and offer alternatives.',
          });
        } else {
          messages.push(await runTool(sb, tc));
        }
      }
    }

    // ── Agentic loop ──
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const completion = await createCompletion(client, {
        model,
        temperature: 0.2,
        tools: LLM_TOOLS,
        tool_choice: 'auto',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      });

      const choice = completion.choices[0].message;
      messages.push(choice);

      const toolCalls = (choice.tool_calls ?? []).filter(isFunctionCall);
      if (toolCalls.length === 0) {
        return NextResponse.json({ messages, reply: choice.content ?? '', done: true });
      }

      // Gate the write tool: stop and ask the dispatcher to confirm.
      const pendingWrite = toolCalls.find((tc) => WRITE_TOOLS.has(tc.function.name));
      if (pendingWrite) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(pendingWrite.function.arguments || '{}');
        } catch {
          /* leave empty */
        }
        return NextResponse.json({
          messages,
          reply: choice.content ?? '',
          pendingConfirmation: { tool: pendingWrite.function.name, input },
          done: false,
        });
      }

      // Auto-execute read-only tools and continue.
      for (const tc of toolCalls) messages.push(await runTool(sb, tc));
    }

    return NextResponse.json({
      messages,
      reply: 'Reached the reasoning-step limit without a final answer. Please rephrase.',
      done: true,
    });
  } catch (err) {
    // Groq occasionally rejects the model's tool-call generation
    // (code "tool_use_failed" / "failed_generation"). If retries didn't clear
    // it, return a friendly message instead of the raw 400.
    if (isToolUseFailed(err)) {
      return NextResponse.json({
        messages,
        reply: "I had trouble forming that request just now — please ask again (e.g. \"list pending jobs\" or \"who's nearest to the emergency?\").",
        done: true,
      });
    }
    const message = err instanceof Error ? err.message : 'Unexpected copilot error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Detect Groq's stochastic tool-call generation failure. */
function isToolUseFailed(err: unknown): boolean {
  const e = err as { status?: number; error?: { code?: string; message?: string; failed_generation?: string } };
  if (e?.status !== 400) return false;
  const body = e.error ?? {};
  return (
    body.code === 'tool_use_failed' ||
    'failed_generation' in body ||
    /failed to call a function/i.test(body.message ?? '')
  );
}

/**
 * Run a chat completion, retrying up to twice when Groq rejects the model's
 * tool-call generation. The failure is stochastic, so a retry (with a small
 * temperature nudge to resample) almost always clears it.
 */
async function createCompletion(
  client: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  attempt = 0
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  try {
    return await client.chat.completions.create(params);
  } catch (err) {
    if (isToolUseFailed(err) && attempt < 2) {
      const bumped = Math.min(0.7, (params.temperature ?? 0.2) + 0.25);
      return createCompletion(client, { ...params, temperature: bumped }, attempt + 1);
    }
    throw err;
  }
}

async function runTool(
  sb: ReturnType<typeof getSupabase>,
  tc: ToolCall
): Promise<ChatMessage> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(tc.function.arguments || '{}');
  } catch {
    /* leave empty */
  }
  try {
    const out = await executeTool(sb, tc.function.name, args);
    return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) };
  } catch (e) {
    return {
      role: 'tool',
      tool_call_id: tc.id,
      content: `ERROR: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
