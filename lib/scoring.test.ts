import { describe, it, expect } from 'vitest';
import { haversineKm, scoreCandidate, rankCandidates } from './scoring';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(45.5, -122.6, 45.5, -122.6)).toBe(0);
  });

  it('is ~111 km for one degree of latitude', () => {
    const d = haversineKm(45.0, -122.6, 46.0, -122.6);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe('scoreCandidate', () => {
  const base = {
    distanceKm: 5,
    activeLoad: 0,
    skillMatch: true,
    status: 'active' as const,
    priority: 'medium' as const,
  };

  it('always returns a score within [0,1]', () => {
    const { score } = scoreCandidate(base);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('scores a closer technician higher than a farther one (all else equal)', () => {
    const close = scoreCandidate({ ...base, distanceKm: 2 }).score;
    const far = scoreCandidate({ ...base, distanceKm: 20 }).score;
    expect(close).toBeGreaterThan(far);
  });

  it('rewards a skill match over no skill match', () => {
    const matched = scoreCandidate({ ...base, skillMatch: true }).score;
    const unmatched = scoreCandidate({ ...base, skillMatch: false }).score;
    expect(matched).toBeGreaterThan(unmatched);
  });

  it('prefers a less-loaded technician', () => {
    const light = scoreCandidate({ ...base, activeLoad: 0 }).score;
    const heavy = scoreCandidate({ ...base, activeLoad: 4 }).score;
    expect(light).toBeGreaterThan(heavy);
  });

  it('ranks an offline technician below an active one', () => {
    const active = scoreCandidate({ ...base, status: 'active' }).score;
    const offline = scoreCandidate({ ...base, status: 'offline' }).score;
    expect(active).toBeGreaterThan(offline);
  });

  it('for an EMERGENCY, a very close unskilled tech beats a far skilled tech', () => {
    const closeUnskilled = scoreCandidate({
      ...base, priority: 'emergency', distanceKm: 1, skillMatch: false,
    }).score;
    const farSkilled = scoreCandidate({
      ...base, priority: 'emergency', distanceKm: 22, skillMatch: true,
    }).score;
    expect(closeUnskilled).toBeGreaterThan(farSkilled);
  });

  it('for a MEDIUM job, a skilled tech can beat a slightly-closer unskilled tech', () => {
    const closeUnskilled = scoreCandidate({
      ...base, priority: 'medium', distanceKm: 6, skillMatch: false,
    }).score;
    const skilled = scoreCandidate({
      ...base, priority: 'medium', distanceKm: 9, skillMatch: true,
    }).score;
    expect(skilled).toBeGreaterThan(closeUnskilled);
  });

  it('exposes a breakdown of the component sub-scores', () => {
    const { breakdown } = scoreCandidate(base);
    expect(breakdown).toHaveProperty('distance');
    expect(breakdown).toHaveProperty('load');
    expect(breakdown).toHaveProperty('skill');
    expect(breakdown).toHaveProperty('availability');
  });
});

describe('rankCandidates', () => {
  it('sorts candidates by descending score and keeps the top N', () => {
    const candidates = [
      { id: 'far', distanceKm: 25, activeLoad: 3, skillMatch: false, status: 'active' as const },
      { id: 'near', distanceKm: 1, activeLoad: 0, skillMatch: true, status: 'active' as const },
      { id: 'mid', distanceKm: 8, activeLoad: 1, skillMatch: true, status: 'active' as const },
    ];
    const ranked = rankCandidates(candidates, 'high', 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].id).toBe('near');
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });
});
