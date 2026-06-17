/**
 * ════════════════════════════════════════════════════════════════════════
 *  Lapras — Assignment Scoring Algorithm  (pure, dependency-free, testable)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Given a job and a candidate technician, produce a score in [0, 1] where
 *  higher = better fit. The score is a weighted sum of four sub-scores:
 *
 *      distance      — closer is better          (great-circle km, normalized)
 *      load          — fewer active jobs is better
 *      skill         — has the required skill?
 *      availability  — active > busy > offline
 *
 *  The weights shift with job priority: an EMERGENCY weights *distance*
 *  heavily (get *someone* there fast), while routine jobs weight *skill* more.
 *
 *  This module has no I/O and no external dependencies, so it is trivially
 *  unit-testable and fully specifiable for regeneration.
 */

export type Priority = 'emergency' | 'high' | 'medium' | 'low';
export type TechStatus = 'active' | 'busy' | 'offline';

export interface ScoreInput {
  distanceKm: number;
  activeLoad: number;      // number of jobs currently assigned to this tech
  skillMatch: boolean;     // does the tech have the job's required skill?
  status: TechStatus;
  priority: Priority;
  maxDistanceKm?: number;  // distance at which distanceScore hits 0 (default 25)
}

export interface ScoreBreakdown {
  distance: number;
  load: number;
  skill: number;
  availability: number;
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdown;
}

const DEFAULT_MAX_DISTANCE_KM = 25;

// Weight vectors per priority. Each vector sums to 1, so score ∈ [0, 1].
const WEIGHTS: Record<Priority, ScoreBreakdown> = {
  emergency: { distance: 0.55, load: 0.15, skill: 0.15, availability: 0.15 },
  high: { distance: 0.45, load: 0.15, skill: 0.25, availability: 0.15 },
  medium: { distance: 0.30, load: 0.15, skill: 0.40, availability: 0.15 },
  low: { distance: 0.30, load: 0.15, skill: 0.40, availability: 0.15 },
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Great-circle distance between two lat/lng points, in kilometers. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // mean Earth radius (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Score a single candidate technician for a job. */
export function scoreCandidate(input: ScoreInput): ScoreResult {
  const maxDist = input.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM;
  const w = WEIGHTS[input.priority];

  const distance = clamp01(1 - input.distanceKm / maxDist);
  const load = 1 / (1 + Math.max(0, input.activeLoad));
  const skill = input.skillMatch ? 1 : 0.4;
  const availability =
    input.status === 'active' ? 1 : input.status === 'busy' ? 0.3 : 0;

  const score =
    w.distance * distance +
    w.load * load +
    w.skill * skill +
    w.availability * availability;

  return {
    score: clamp01(score),
    breakdown: { distance, load, skill, availability },
  };
}

export interface Candidate {
  id: string;
  distanceKm: number;
  activeLoad: number;
  skillMatch: boolean;
  status: TechStatus;
  [key: string]: unknown; // allow passthrough fields (name, phone, …)
}

export type RankedCandidate = Candidate & ScoreResult;

/** Score every candidate for a job, sort best-first, keep the top N. */
export function rankCandidates(
  candidates: Candidate[],
  priority: Priority,
  topN = 3
): RankedCandidate[] {
  return candidates
    .map((c) => ({
      ...c,
      ...scoreCandidate({
        distanceKm: c.distanceKm,
        activeLoad: c.activeLoad,
        skillMatch: c.skillMatch,
        status: c.status,
        priority,
      }),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
