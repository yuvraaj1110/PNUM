/**
 * ════════════════════════════════════════════════════════════════════════
 *  Lapras — Fleet Operations Core
 * ════════════════════════════════════════════════════════════════════════
 *
 *  The single source of truth for fleet-ops business logic. Every function
 *  takes a SupabaseClient (dependency injection) so the SAME code backs:
 *
 *    • the MCP server   (mcp-server/index.ts)   — exposes these as MCP tools
 *    • the copilot route (app/api/copilot/route.ts) — Anthropic tool-calling
 *    • any server route / script
 *
 *  Pure scoring/ranking lives in ./scoring (unit-tested). This module is the
 *  I/O layer that feeds it real database rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  haversineKm,
  rankCandidates,
  type Priority,
  type RankedCandidate,
  type TechStatus,
} from './scoring';

// ─── Domain shapes returned by the tools ───
export interface FleetTechnician {
  id: string;
  name: string;
  status: TechStatus;
  specialty: string | null;
  phone: string | null;
  location: { lat: number; lng: number } | null;
  activeLoad: number;
}

export interface FleetJob {
  id: string;
  title: string;
  status: string;
  priority: string;
  customer_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  created_at?: string;
}

export interface AssignmentResult {
  assignmentId: string;
  jobId: string;
  technicianId: string;
  technicianName: string;
  score: number | null;
  distanceKm: number | null;
}

// ════════════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════════════

/** Count of currently-active assignments per technician id. */
async function activeLoadByTech(
  sb: SupabaseClient
): Promise<Record<string, number>> {
  const { data } = await sb
    .from('assignments')
    .select('technician_id')
    .eq('status', 'active');
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = (row as { technician_id: string }).technician_id;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Determine the skill a job requires by matching skill keywords against the
 * job's title + description. Deterministic and easy to specify: a skill
 * matches if the job text contains the skill's first word (lowercased).
 * Returns the matched skill name, or null if none matched.
 */
export function requiredSkillForJob(
  job: { title?: string; description?: string; category?: string },
  skillNames: string[]
): string | null {
  const text = `${job.category ?? ''} ${job.title ?? ''} ${job.description ?? ''}`.toLowerCase();
  for (const skill of skillNames) {
    const firstWord = skill.split(' ')[0].toLowerCase();
    if (text.includes(firstWord)) return skill;
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════
//  Tool 1 — get_fleet_status
// ════════════════════════════════════════════════════════════════════════
export async function getFleetStatus(
  sb: SupabaseClient
): Promise<FleetTechnician[]> {
  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, status, specialty, phone, current_location, role')
    .in('role', ['plumber', 'technician']);
  if (error) throw new Error(`get_fleet_status failed: ${error.message}`);

  const loads = await activeLoadByTech(sb);

  return (data ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    name: (p.full_name as string) ?? 'Unknown',
    status: ((p.status as TechStatus) ?? 'offline'),
    specialty: (p.specialty as string) ?? null,
    phone: (p.phone as string) ?? null,
    location: (p.current_location as { lat: number; lng: number }) ?? null,
    activeLoad: loads[p.id as string] ?? 0,
  }));
}

// ════════════════════════════════════════════════════════════════════════
//  Tool 2 — list_jobs
// ════════════════════════════════════════════════════════════════════════
export async function listJobs(
  sb: SupabaseClient,
  filters: { status?: string; priority?: string } = {}
): Promise<FleetJob[]> {
  let q = sb
    .from('jobs')
    .select('id, title, status, priority, customer_name, address, lat, lng, created_at')
    .order('created_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.priority) q = q.eq('priority', filters.priority);

  const { data, error } = await q;
  if (error) throw new Error(`list_jobs failed: ${error.message}`);
  return (data ?? []) as FleetJob[];
}

// ════════════════════════════════════════════════════════════════════════
//  Tool 3 — find_nearest_available_tech  (the assignment algorithm)
// ════════════════════════════════════════════════════════════════════════
export async function findNearestAvailableTech(
  sb: SupabaseClient,
  jobId: string,
  topN = 3
): Promise<{ job: FleetJob; requiredSkill: string | null; candidates: RankedCandidate[] }> {
  // 1) Load the job
  const { data: job, error: jobErr } = await sb
    .from('jobs')
    .select('id, title, description, category, status, priority, customer_name, address, lat, lng')
    .eq('id', jobId)
    .single();
  if (jobErr || !job) throw new Error(`Job ${jobId} not found`);
  if (job.lat == null || job.lng == null)
    throw new Error(`Job ${jobId} has no coordinates`);

  // 2) Active technicians
  const { data: techs, error: techErr } = await sb
    .from('profiles')
    .select('id, full_name, status, specialty, phone, current_location, role')
    .in('role', ['plumber', 'technician'])
    .eq('status', 'active');
  if (techErr) throw new Error(`find_nearest failed: ${techErr.message}`);

  // 3) Skill catalog + per-tech skills
  const { data: skills } = await sb.from('skills').select('id, name');
  const skillNames = (skills ?? []).map((s: { name: string }) => s.name);
  const requiredSkill = requiredSkillForJob(job, skillNames);

  const { data: techSkills } = await sb
    .from('technician_skills')
    .select('technician_id, skill_id');
  const skillIdByName: Record<string, string> = {};
  for (const s of skills ?? []) skillIdByName[(s as { name: string }).name] = (s as { id: string }).id;
  const requiredSkillId = requiredSkill ? skillIdByName[requiredSkill] : null;
  const techHasSkill = new Set(
    (techSkills ?? [])
      .filter((ts: Record<string, unknown>) => ts.skill_id === requiredSkillId)
      .map((ts: Record<string, unknown>) => ts.technician_id as string)
  );

  const loads = await activeLoadByTech(sb);

  // 4) Build candidates and rank via the tested scoring module
  const candidates = (techs ?? [])
    .filter((t: Record<string, unknown>) => t.current_location)
    .map((t: Record<string, unknown>) => {
      const loc = t.current_location as { lat: number; lng: number };
      return {
        id: t.id as string,
        name: (t.full_name as string) ?? 'Unknown',
        specialty: (t.specialty as string) ?? null,
        phone: (t.phone as string) ?? null,
        distanceKm: haversineKm(job.lat, job.lng, loc.lat, loc.lng),
        activeLoad: loads[t.id as string] ?? 0,
        skillMatch: requiredSkillId ? techHasSkill.has(t.id as string) : true,
        status: 'active' as TechStatus,
      };
    });

  const ranked = rankCandidates(candidates, job.priority as Priority, topN);
  return { job: job as FleetJob, requiredSkill, candidates: ranked };
}

// ════════════════════════════════════════════════════════════════════════
//  Tool 4 — assign_job  (writes assignment + audit trail; has side effects)
// ════════════════════════════════════════════════════════════════════════
export async function assignJob(
  sb: SupabaseClient,
  params: { jobId: string; technicianId: string; assignedBy?: string }
): Promise<AssignmentResult> {
  const { jobId, technicianId, assignedBy = 'dispatcher' } = params;

  // Recompute the score for an auditable record (don't trust caller input).
  const ranking = await findNearestAvailableTech(sb, jobId, 50);
  const chosen = ranking.candidates.find((c) => c.id === technicianId);

  const { data: tech } = await sb
    .from('profiles')
    .select('full_name')
    .eq('id', technicianId)
    .single();
  const technicianName = (tech?.full_name as string) ?? 'Unknown';

  // 1) Insert the assignment record
  const { data: assignment, error: aErr } = await sb
    .from('assignments')
    .insert({
      job_id: jobId,
      technician_id: technicianId,
      status: 'active',
      score: chosen?.score ?? null,
      distance_km: chosen?.distanceKm ?? null,
      assigned_by: assignedBy,
    })
    .select('id')
    .single();
  if (aErr) throw new Error(`assign_job failed: ${aErr.message}`);

  // 2) Update the job + technician
  await sb.from('jobs').update({ status: 'assigned', assigned_plumber_id: technicianId }).eq('id', jobId);
  await sb.from('profiles').update({ status: 'busy' }).eq('id', technicianId);

  // 3) Append an audit event
  await sb.from('job_events').insert({
    job_id: jobId,
    actor: assignedBy,
    event_type: 'assigned',
    payload: { technician_id: technicianId, technician_name: technicianName, score: chosen?.score ?? null },
  });

  return {
    assignmentId: (assignment as { id: string }).id,
    jobId,
    technicianId,
    technicianName,
    score: chosen?.score ?? null,
    distanceKm: chosen?.distanceKm ?? null,
  };
}

// ════════════════════════════════════════════════════════════════════════
//  Tool 5 — get_job_history
// ════════════════════════════════════════════════════════════════════════
export async function getJobHistory(
  sb: SupabaseClient,
  params: { technicianId?: string; customerId?: string; limit?: number }
): Promise<FleetJob[]> {
  const { technicianId, customerId, limit = 20 } = params;

  if (technicianId) {
    const { data: rows } = await sb
      .from('assignments')
      .select('job_id')
      .eq('technician_id', technicianId)
      .order('assigned_at', { ascending: false })
      .limit(limit);
    const jobIds = (rows ?? []).map((r: { job_id: string }) => r.job_id);
    if (jobIds.length === 0) return [];
    const { data } = await sb
      .from('jobs')
      .select('id, title, status, priority, customer_name, address, lat, lng, created_at')
      .in('id', jobIds);
    return (data ?? []) as FleetJob[];
  }

  let q = sb
    .from('jobs')
    .select('id, title, status, priority, customer_name, address, lat, lng, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (customerId) q = q.eq('customer_id', customerId);
  const { data } = await q;
  return (data ?? []) as FleetJob[];
}
