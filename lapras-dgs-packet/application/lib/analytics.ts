/**
 * ════════════════════════════════════════════════════════════════════════
 *  Lapras — Analytics aggregation (pure, dependency-free, testable)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  The /analytics page fetches rows from the database + SQL views
 *  (v_technician_utilization, v_job_response_times, v_sla_breaches) and feeds
 *  them to these pure functions to derive the KPIs it renders. Keeping the
 *  math here (separate from I/O) makes it unit-testable and unambiguous.
 */

export interface JobLite {
  status: string;
  priority: string;
}

export interface JobSummary {
  total: number;
  pending: number;
  inProgress: number;
  assigned: number;
  completed: number;
  emergencies: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

export function summarizeJobs(jobs: JobLite[]): JobSummary {
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  for (const j of jobs) {
    byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
    byPriority[j.priority] = (byPriority[j.priority] ?? 0) + 1;
  }
  return {
    total: jobs.length,
    pending: byStatus['pending'] ?? 0,
    inProgress: byStatus['in_progress'] ?? 0,
    assigned: byStatus['assigned'] ?? 0,
    completed: byStatus['completed'] ?? 0,
    emergencies: byPriority['emergency'] ?? 0,
    byStatus,
    byPriority,
  };
}

/** Percentage (0–100) of rows where is_breach is true. */
export function slaBreachRate(rows: { is_breach: boolean }[]): number {
  if (rows.length === 0) return 0;
  const breaches = rows.filter((r) => r.is_breach).length;
  return Math.round((breaches / rows.length) * 100);
}

/** Average of the non-null response_minutes, or null if none recorded. */
export function avgResponseMinutes(rows: { response_minutes: number | null }[]): number | null {
  const vals = rows.map((r) => r.response_minutes).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.round(avg * 10) / 10;
}

export interface UtilizationSummary {
  busy: number;
  total: number;
  pct: number;
}

export function utilizationSummary(rows: { is_busy: boolean }[]): UtilizationSummary {
  const total = rows.length;
  const busy = rows.filter((r) => r.is_busy).length;
  const pct = total === 0 ? 0 : Math.round((busy / total) * 100);
  return { busy, total, pct };
}
