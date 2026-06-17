import { describe, it, expect } from 'vitest';
import {
  summarizeJobs,
  slaBreachRate,
  avgResponseMinutes,
  utilizationSummary,
} from './analytics';

describe('summarizeJobs', () => {
  const jobs = [
    { status: 'pending', priority: 'emergency' },
    { status: 'pending', priority: 'medium' },
    { status: 'in_progress', priority: 'high' },
    { status: 'assigned', priority: 'emergency' },
    { status: 'completed', priority: 'low' },
  ];

  it('counts totals and per-status/priority buckets', () => {
    const s = summarizeJobs(jobs);
    expect(s.total).toBe(5);
    expect(s.pending).toBe(2);
    expect(s.inProgress).toBe(1);
    expect(s.assigned).toBe(1);
    expect(s.completed).toBe(1);
    expect(s.emergencies).toBe(2);
    expect(s.byStatus.pending).toBe(2);
    expect(s.byPriority.emergency).toBe(2);
  });

  it('handles an empty list without dividing by zero', () => {
    const s = summarizeJobs([]);
    expect(s.total).toBe(0);
    expect(s.emergencies).toBe(0);
    expect(s.byStatus).toEqual({});
  });
});

describe('slaBreachRate', () => {
  it('returns the percentage of breaching rows', () => {
    expect(slaBreachRate([{ is_breach: true }, { is_breach: false }, { is_breach: true }, { is_breach: false }])).toBe(50);
  });
  it('returns 0 for an empty list', () => {
    expect(slaBreachRate([])).toBe(0);
  });
});

describe('avgResponseMinutes', () => {
  it('averages only the non-null response times', () => {
    expect(avgResponseMinutes([{ response_minutes: 10 }, { response_minutes: 20 }, { response_minutes: null }])).toBe(15);
  });
  it('returns null when there are no recorded responses', () => {
    expect(avgResponseMinutes([{ response_minutes: null }])).toBeNull();
    expect(avgResponseMinutes([])).toBeNull();
  });
});

describe('utilizationSummary', () => {
  it('computes busy count and percentage', () => {
    const s = utilizationSummary([{ is_busy: true }, { is_busy: false }, { is_busy: true }, { is_busy: true }]);
    expect(s.busy).toBe(3);
    expect(s.total).toBe(4);
    expect(s.pct).toBe(75);
  });
  it('is 0% for an empty fleet', () => {
    expect(utilizationSummary([])).toEqual({ busy: 0, total: 0, pct: 0 });
  });
});
