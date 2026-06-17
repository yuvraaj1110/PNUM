/**
 * ════════════════════════════════════════════════════════════════════════
 *  Lapras — Demo data generator (idempotent)
 * ════════════════════════════════════════════════════════════════════════
 *  Populates a realistic fleet so the analytics dashboard + activity feed have
 *  something to show: ~10 technicians (with skills), ~45 jobs across the
 *  Portland metro spread over the last 14 days, plus assignments and a full
 *  job_events audit trail (created / assigned / completed) with realistic
 *  response times (some emergencies breach SLA).
 *
 *  Re-runnable: technicians/customer are upserted by fixed UUIDs, and the
 *  previous demo jobs (and their cascade of assignments + events) are wiped
 *  before re-seeding, so running twice does not double the data.
 *
 *  Run:  POSTGRES_URL=<session-pooler-url> npx tsx scripts/seedDemoData.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { Client } from 'pg';
import { haversineKm } from '../lib/scoring';

const CENTER = { lat: 45.5052, lng: -122.6784 };
const CUSTOMER_ID = 'c0000000-0000-4000-8000-000000000001';
const pad2 = (n: number) => String(n).padStart(2, '0');
const techId = (i: number) => `d0000000-0000-4000-8000-0000000000${pad2(i)}`;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const weighted = <T>(pairs: [T, number][]): T => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[0][0];
};
const jitter = () => ({ lat: CENTER.lat + rand(-0.08, 0.08), lng: CENTER.lng + rand(-0.1, 0.1) });

const PLUMBERS = [
  ['Mike Henderson', 'Water Heaters', 'active'],
  ['Carlos Vega', 'Emergency Repair', 'busy'],
  ['Tony Russo', 'Drain Cleaning', 'active'],
  ['Alex Rivera', 'Pipe Fitting', 'active'],
  ['Jake Morris', 'Residential', 'offline'],
  ['Nina Patel', 'Leak Detection', 'active'],
  ['Derek Cole', 'Sewer', 'active'],
  ['Marcus Lee', 'Water Heaters', 'busy'],
  ['Priya Shah', 'Drain Cleaning', 'active'],
  ['Sam Okafor', 'Emergency Repair', 'active'],
] as const;

const JOB_POOL: [string, string][] = [
  ['Burst Pipe - Main Line', 'Pipe Fitting'],
  ['Water Heater Replacement', 'Water Heaters'],
  ['Kitchen Faucet Install', 'Residential'],
  ['Clogged Main Drain', 'Drain Cleaning'],
  ['Sewer Line Backup', 'Sewer'],
  ['Slab Leak Detection', 'Leak Detection'],
  ['Toilet Repair', 'Residential'],
  ['Sump Pump Failure', 'Emergency Repair'],
  ['Garbage Disposal Jam', 'Residential'],
  ['Frozen Pipe Thaw', 'Emergency Repair'],
  ['Bathroom Rough-in', 'Pipe Fitting'],
  ['Water Heater No Hot Water', 'Water Heaters'],
  ['Outdoor Spigot Leak', 'Leak Detection'],
  ['Shower Valve Replacement', 'Residential'],
  ['Main Sewer Camera Inspection', 'Sewer'],
];
const CUSTOMERS = ['Sarah Mitchell', 'James Rodriguez', 'Emily Chen', 'David Thompson', 'Lisa Park', 'Robert Kim', 'Maria Lopez', 'Tom Becker', 'Aisha Khan', 'Greg Foster'];
const STREETS = ['Oak St', 'Pine Ave', 'Willow Creek Dr', 'Riverdale Rd', 'Maple Ln', 'Cedar Blvd', 'Birch Ct', 'Elm Way', 'Hawthorne Blvd', 'Division St'];

async function main() {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('POSTGRES_URL is not set (use the Supabase session pooler URL)');
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log('Connected.');

  // 0) Wipe previous demo jobs (cascades assignments + job_events), then
  //    remove stale demo-only technicians from earlier runs so we don't pile
  //    up duplicate-named plumbers.
  await c.query(`DELETE FROM public.jobs WHERE customer_id=$1`, [CUSTOMER_ID]);
  await c.query(`DELETE FROM auth.users WHERE id::text LIKE 'd0000000-0000-4000-8000-%'`);

  // 1) Build a fleet of exactly PLUMBERS.length technicians. Reuse existing
  //    plumber profiles first (so we re-skin the originals instead of cloning
  //    their names), then create new auth users for any shortfall.
  const existing = await c.query(
    `SELECT id FROM public.profiles WHERE role IN ('plumber','technician') ORDER BY created_at`
  );
  const existingIds: string[] = existing.rows.map((r: { id: string }) => r.id);

  const techLocs: { id: string; lat: number; lng: number; status: string }[] = [];
  for (let i = 0; i < PLUMBERS.length; i++) {
    const [name, specialty, status] = PLUMBERS[i];
    const loc = jitter();
    let id: string;
    if (i < existingIds.length) {
      id = existingIds[i]; // reuse an existing plumber row
    } else {
      id = techId(i + 1); // create a new demo technician
      await c.query(
        `INSERT INTO auth.users (id, email, aud, role, created_at, updated_at, raw_user_meta_data)
         VALUES ($1,$2,'authenticated','authenticated',now(),now(),$3)
         ON CONFLICT (id) DO NOTHING`,
        [id, `demo-tech-${i + 1}@lapras.local`, JSON.stringify({ full_name: name })]
      );
    }
    techLocs.push({ id, lat: loc.lat, lng: loc.lng, status });
    await c.query(
      `UPDATE public.profiles SET full_name=$2, role='plumber', status=$3, current_location=$4,
         phone=$5, specialty=$6, avg_rating=$7, is_emergency_specialist=$8 WHERE id=$1`,
      [id, name, status, JSON.stringify(loc), `(503) 900-${1000 + i}`, specialty, +rand(3.8, 5).toFixed(1), specialty === 'Emergency Repair']
    );
    await c.query(
      `INSERT INTO public.technician_skills (technician_id, skill_id, proficiency)
       SELECT $1, s.id, 5 FROM public.skills s WHERE s.name=$2 ON CONFLICT DO NOTHING`,
      [id, specialty]
    );
    await c.query(
      `INSERT INTO public.technician_skills (technician_id, skill_id, proficiency)
       SELECT $1, s.id, 2 FROM public.skills s WHERE s.name='Emergency Repair' ON CONFLICT DO NOTHING`,
      [id]
    );
  }
  console.log(`Technicians: ${PLUMBERS.length} (reused ${Math.min(existingIds.length, PLUMBERS.length)}, created ${Math.max(0, PLUMBERS.length - existingIds.length)})`);

  // 2) Demo customer
  await c.query(
    `INSERT INTO public.customers (id, name, address) VALUES ($1,'Lapras Demo Customer','Portland, OR')
     ON CONFLICT (id) DO NOTHING`,
    [CUSTOMER_ID]
  );

  // 4) Seed jobs + assignments + events
  const N = 45;
  let counts = { pending: 0, assigned: 0, in_progress: 0, completed: 0 };
  const activeTechs = techLocs.filter((t) => t.status !== 'offline');

  for (let i = 0; i < N; i++) {
    const [title, category] = pick(JOB_POOL);
    const status = weighted([['completed', 35], ['in_progress', 20], ['assigned', 15], ['pending', 30]] as [string, number][]);
    const prio = weighted([['emergency', 15], ['high', 25], ['medium', 35], ['low', 25]] as [string, number][]);
    counts[status as keyof typeof counts]++;
    const loc = jitter();
    const createdAt = new Date(Date.now() - rand(0, 14 * 24 * 60) * 60 * 1000);
    const customerName = pick(CUSTOMERS);
    const address = `${Math.floor(rand(100, 9999))} ${pick(STREETS)}`;

    const jobRes = await c.query(
      `INSERT INTO public.jobs (customer_id, title, description, category, status, priority, customer_name, address, lat, lng, created_at, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [CUSTOMER_ID, title, `${title} reported by ${customerName}.`, category, status, prio, customerName, address,
       loc.lat, loc.lng, createdAt, createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })]
    );
    const jobId = jobRes.rows[0].id;

    // created event
    await c.query(
      `INSERT INTO public.job_events (job_id, actor, event_type, payload, created_at) VALUES ($1,'dispatcher','created',$2,$3)`,
      [jobId, JSON.stringify({ title, priority: prio }), createdAt]
    );

    if (status !== 'pending') {
      const tech = pick(activeTechs);
      // emergencies sometimes dispatched late (creates SLA breaches)
      const delayMin = prio === 'emergency' ? (Math.random() < 0.4 ? rand(16, 45) : rand(3, 12)) : rand(5, 50);
      const assignedAt = new Date(createdAt.getTime() + delayMin * 60 * 1000);
      const dist = +haversineKm(loc.lat, loc.lng, tech.lat, tech.lng).toFixed(1);
      const score = +rand(0.62, 0.95).toFixed(3);
      const assignStatus = status === 'completed' ? 'completed' : 'active';
      const releasedAt = status === 'completed' ? new Date(assignedAt.getTime() + rand(1, 6) * 3600 * 1000) : null;

      await c.query(
        `INSERT INTO public.assignments (job_id, technician_id, status, score, distance_km, assigned_by, assigned_at, released_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [jobId, tech.id, assignStatus, score, dist, pick(['dispatcher', 'copilot']), assignedAt, releasedAt]
      );
      await c.query(`UPDATE public.jobs SET assigned_plumber_id=$1 WHERE id=$2`, [tech.id, jobId]);
      await c.query(
        `INSERT INTO public.job_events (job_id, actor, event_type, payload, created_at) VALUES ($1,$2,'assigned',$3,$4)`,
        [jobId, pick(['dispatcher', 'copilot']), JSON.stringify({ technician_id: tech.id, score }), assignedAt]
      );
      if (status === 'completed') {
        await c.query(
          `INSERT INTO public.job_events (job_id, actor, event_type, payload, created_at) VALUES ($1,'dispatcher','completed',$2,$3)`,
          [jobId, JSON.stringify({ from: 'in_progress', to: 'completed' }), releasedAt]
        );
      }
    }
  }

  await c.end();
  console.log(`Seeded ${N} jobs:`, counts);
  console.log('Done.');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
