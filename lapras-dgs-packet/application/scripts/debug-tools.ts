/**
 * Debug: run the fleet-ops tools directly against Supabase (no LLM) and print
 * raw results/errors. Run: npx tsx scripts/debug-tools.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

console.log('URL set:', !!url, '| service key set:', !!serviceKey, '| anon key set:', !!anonKey);

const sb = createClient(url, serviceKey || anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function probe(label: string, fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    console.log(`\n✅ ${label}:`, JSON.stringify(out, null, 2).slice(0, 1200));
  } catch (e) {
    console.log(`\n❌ ${label} threw:`, e instanceof Error ? e.message : e);
  }
}

async function main() {
  // Raw table probes — these reveal exactly which table/column is the problem.
  await probe('profiles select *', async () => {
    const { data, error } = await sb.from('profiles').select('*').limit(3);
    if (error) throw new Error(error.message);
    return { count: data?.length, sample: data?.[0] };
  });
  await probe('jobs select *', async () => {
    const { data, error } = await sb.from('jobs').select('*').limit(3);
    if (error) throw new Error(error.message);
    return { count: data?.length, sample: data?.[0] };
  });
  await probe("profiles role in ('plumber','technician')", async () => {
    const { data, error } = await sb
      .from('profiles')
      .select('id, full_name, role, status, current_location')
      .in('role', ['plumber', 'technician']);
    if (error) throw new Error(error.message);
    return { count: data?.length, roles: data?.map((d) => (d as { role: string }).role) };
  });
  await probe('assignments table exists?', async () => {
    const { data, error } = await sb.from('assignments').select('id').limit(1);
    if (error) throw new Error(error.message);
    return { ok: true, rows: data?.length };
  });

  // Now the actual tool functions
  const { getFleetStatus, listJobs } = await import('../lib/fleet-ops');
  await probe('getFleetStatus()', () => getFleetStatus(sb));
  await probe("listJobs({status:'in_progress'})", () => listJobs(sb, { status: 'in_progress' }));
  await probe('listJobs({})', () => listJobs(sb, {}));
}

main().then(() => process.exit(0));
