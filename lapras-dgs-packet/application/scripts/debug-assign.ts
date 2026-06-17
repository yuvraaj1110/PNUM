/**
 * Verify the full assignment chain live (after migrations 0002/0003).
 * Run: npx tsx scripts/debug-assign.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { pickSupabaseKey } from '../lib/supabase-key';
import { listJobs, findNearestAvailableTech } from '../lib/fleet-ops';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  pickSupabaseKey(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  ),
  { auth: { persistSession: false } }
);

async function main() {
  // Sanity: new tables + seed
  const { data: skills } = await sb.from('skills').select('name');
  console.log('skills:', (skills ?? []).map((s) => (s as { name: string }).name));
  const { count } = await sb.from('technician_skills').select('*', { count: 'exact', head: true });
  console.log('technician_skills rows:', count);

  // Pick an emergency/pending job and rank technicians
  const jobs = await listJobs(sb, {});
  const job = jobs.find((j) => j.priority === 'emergency') ?? jobs[0];
  console.log(`\nRanking for job: "${job.title}" (${job.priority}) @ ${job.lat},${job.lng}`);

  const { requiredSkill, candidates } = await findNearestAvailableTech(sb, job.id, 3);
  console.log('requiredSkill:', requiredSkill);
  for (const c of candidates) {
    console.log(
      `  ${(c.name as string).padEnd(16)} score=${c.score.toFixed(3)} ` +
        `dist=${(c.distanceKm as number).toFixed(1)}km load=${c.activeLoad} skill=${c.skillMatch}`
    );
  }
  console.log('\n✅ Assignment algorithm produced a live ranking.');
}

main().then(() => process.exit(0));
