/**
 * Pick the Supabase key for a server-side client.
 *
 * Prefer the service-role key (bypasses RLS) ONLY when it looks like a real
 * key. A common setup mistake is leaving the `.env.example` placeholder
 * (`eyJ...`) in place — that value is truthy but invalid, and naive
 * `serviceKey || anonKey` logic would pick it and cause every request to 401.
 *
 * Real Supabase keys are long (legacy JWTs are ~200+ chars; new `sb_secret_…`
 * keys are also long), so a short value is treated as "unset".
 */
const MIN_VALID_KEY_LENGTH = 40;

export function isUsableKey(key: string | undefined | null): boolean {
  return !!key && key.trim().length >= MIN_VALID_KEY_LENGTH;
}

export function pickSupabaseKey(
  serviceKey: string | undefined,
  anonKey: string | undefined
): string {
  if (isUsableKey(serviceKey)) return serviceKey as string;
  if (isUsableKey(anonKey)) return anonKey as string;
  return '';
}
