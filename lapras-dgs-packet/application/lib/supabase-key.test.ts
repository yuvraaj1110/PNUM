import { describe, it, expect } from 'vitest';
import { pickSupabaseKey, isUsableKey } from './supabase-key';

const REAL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'x'.repeat(170);

describe('pickSupabaseKey', () => {
  it('ignores the short "eyJ..." placeholder service key and uses anon', () => {
    expect(pickSupabaseKey('eyJ...', REAL_KEY)).toBe(REAL_KEY);
  });

  it('prefers a valid service key when present', () => {
    const svc = 'eyJservice' + 'y'.repeat(80);
    expect(pickSupabaseKey(svc, REAL_KEY)).toBe(svc);
  });

  it('falls back to anon when service key is undefined', () => {
    expect(pickSupabaseKey(undefined, REAL_KEY)).toBe(REAL_KEY);
  });

  it('returns empty string when neither key is usable', () => {
    expect(pickSupabaseKey('eyJ...', '')).toBe('');
  });
});

describe('isUsableKey', () => {
  it('rejects short/placeholder/empty values', () => {
    expect(isUsableKey('eyJ...')).toBe(false);
    expect(isUsableKey('')).toBe(false);
    expect(isUsableKey(undefined)).toBe(false);
  });
  it('accepts a long key', () => {
    expect(isUsableKey(REAL_KEY)).toBe(true);
  });
});
