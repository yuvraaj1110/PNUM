import { describe, it, expect } from 'vitest';
import { describeEvent } from './audit';

describe('describeEvent', () => {
  it('describes a job creation', () => {
    expect(describeEvent({ event_type: 'created', actor: 'dispatcher', payload: {} })).toMatch(/created/i);
  });

  it('names the technician on an assignment', () => {
    const text = describeEvent({
      event_type: 'assigned',
      actor: 'copilot',
      payload: { technician_name: 'Alex Rivera' },
    });
    expect(text).toMatch(/Alex Rivera/);
  });

  it('shows the new status on a status change', () => {
    const text = describeEvent({
      event_type: 'status_changed',
      actor: 'dispatcher',
      payload: { to: 'in_progress' },
    });
    expect(text).toMatch(/in progress/i);
  });

  it('describes completion and cancellation', () => {
    expect(describeEvent({ event_type: 'completed', actor: 'dispatcher', payload: {} })).toMatch(/complete/i);
    expect(describeEvent({ event_type: 'cancelled', actor: 'dispatcher', payload: {} })).toMatch(/cancel/i);
  });

  it('falls back gracefully for an unknown event type', () => {
    const text = describeEvent({ event_type: 'frobnicated', actor: 'system', payload: {} });
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });
});
