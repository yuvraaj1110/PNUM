/**
 * ════════════════════════════════════════════════════════════════════════
 *  Lapras — Audit trail helpers (job_events)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  job_events is an append-only log. Every meaningful change to a job writes
 *  one row: { job_id, actor, event_type, payload, created_at }. This module
 *  provides the writer (logJobEvent) and a pure formatter (describeEvent) used
 *  by the dashboard Activity Feed and the per-job timeline.
 *
 *  Event vocabulary:
 *    created | assigned | status_changed | completed | cancelled
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface JobEvent {
  event_type: string;
  actor?: string | null;
  payload: Record<string, unknown>;
  created_at?: string;
  job_id?: string;
  id?: string;
}

const prettyStatus = (s: unknown) =>
  String(s ?? '').replace(/_/g, ' ') || 'unknown';

/** Human-readable one-liner for an event. Pure. */
export function describeEvent(e: Pick<JobEvent, 'event_type' | 'actor' | 'payload'>): string {
  const p = e.payload ?? {};
  switch (e.event_type) {
    case 'created':
      return 'Job created';
    case 'assigned':
      return p.technician_name
        ? `Assigned to ${p.technician_name}`
        : 'Technician assigned';
    case 'status_changed':
      return `Status changed to ${prettyStatus(p.to)}`;
    case 'completed':
      return 'Job completed';
    case 'cancelled':
      return 'Job cancelled';
    default:
      return `${e.event_type.replace(/_/g, ' ')} event`;
  }
}

/** Append an audit event. Never throws — auditing must not break the action. */
export async function logJobEvent(
  sb: SupabaseClient,
  params: { jobId: string; eventType: string; actor?: string; payload?: Record<string, unknown> }
): Promise<void> {
  try {
    await sb.from('job_events').insert({
      job_id: params.jobId,
      actor: params.actor ?? 'system',
      event_type: params.eventType,
      payload: params.payload ?? {},
    });
  } catch {
    // Best-effort: a missing table or RLS issue must not fail the caller.
  }
}
