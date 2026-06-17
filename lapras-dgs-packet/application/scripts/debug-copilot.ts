/**
 * Stress the copilot loop with the REAL system prompt to catch Groq
 * `failed_generation`. Run: npx tsx scripts/debug-copilot.ts "prompt" [iterations]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { FLEET_TOOLS, executeTool } from '../lib/fleet-tools';
import { pickSupabaseKey } from '../lib/supabase-key';

const SYSTEM_PROMPT = `You are the dispatch copilot for Lapras, a real-time plumbing fleet operations platform serving the Portland, OR metro area.

You help a human dispatcher monitor technicians and assign jobs. You have tools to read fleet state and to assign a technician to a job.

Guidelines:
- When asked who should take a job, call find_nearest_available_tech and explain the ranking in plain language (distance, current load, skill match, availability). Name the top recommendation and 1-2 alternatives.
- Refer to jobs and technicians by name/title, not raw UUIDs, in your prose.
- Only call assign_job when the dispatcher clearly wants to assign someone. Call it ALONE, not alongside other tools in the same turn. The dispatcher must confirm before the assignment is written.
- Be concise and operational. Lead with the answer.
- If a tool returns no candidates or an error, say so plainly and suggest a next step.`;

const client = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY });
const model = process.env.COPILOT_MODEL || 'llama-3.3-70b-versatile';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  pickSupabaseKey(process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY),
  { auth: { persistSession: false } }
);
const tools = FLEET_TOOLS.map((t) => ({
  type: 'function' as const,
  function: { name: t.name, description: t.description, parameters: t.inputSchema as Record<string, unknown> },
}));

const prompt = process.argv[2] || 'Who can take the fastest emergency right now?';
const iters = parseInt(process.argv[3] || '15', 10);

async function once(): Promise<{ ok: boolean; detail?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];
  for (let turn = 0; turn < 6; turn++) {
    let r;
    try {
      r = await client.chat.completions.create({ model, temperature: 0.2, tools, tool_choice: 'auto', messages });
    } catch (e) {
      const err = e as { status?: number; error?: { error?: { failed_generation?: string; message?: string } } };
      const inner = err.error?.error ?? (err.error as { failed_generation?: string; message?: string });
      return { ok: false, detail: `status=${err.status} msg=${inner?.message} failed_generation=${(inner?.failed_generation || '').slice(0, 300)}` };
    }
    const msg = r.choices[0].message;
    messages.push(msg);
    const calls = (msg.tool_calls ?? []).filter((c) => c.type === 'function');
    if (calls.length === 0) return { ok: true };
    for (const c of calls) {
      const fc = c as { id: string; function: { name: string; arguments: string } };
      let out: unknown;
      try { out = await executeTool(sb, fc.function.name, JSON.parse(fc.function.arguments || '{}')); }
      catch (err) { out = `ERROR: ${(err as Error).message}`; }
      messages.push({ role: 'tool', tool_call_id: fc.id, content: JSON.stringify(out) });
    }
  }
  return { ok: true };
}

async function main() {
  console.log(`prompt="${prompt}" x${iters}`);
  let fail = 0;
  for (let i = 0; i < iters; i++) {
    const r = await once();
    if (!r.ok) { fail++; console.log(`  [${i}] ❌ ${r.detail}`); }
    else process.stdout.write('.');
  }
  console.log(`\n${iters - fail}/${iters} ok, ${fail} failed`);
}
main();
