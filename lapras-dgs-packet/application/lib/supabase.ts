import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || 'placeholder';

// Debug logging
console.log('Supabase URL:', supabaseUrl ? 'SET' : 'NOT SET');
console.log('Supabase Anon Key:', supabaseAnonKey ? 'SET' : 'NOT SET');
if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'https://placeholder.supabase.co' || supabaseAnonKey === 'placeholder') {
    console.warn('API key or URL is missing or using placeholder');
}

// Create a real client if credentials exist, otherwise create a no-op client
// that won't crash the app during development without Supabase configured.
function createSafeClient(): SupabaseClient | null {
    if (supabaseUrl && supabaseAnonKey && supabaseAnonKey !== 'placeholder') {
        console.log('Creating real Supabase client');
        return createClient(supabaseUrl, supabaseAnonKey);
    }

    // Return a stub client when credentials aren't configured.
    // Any call to .from() etc. will return empty data / harmless errors.
    console.log('Creating placeholder Supabase client');
    return createClient(
        'https://placeholder.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTkwMDAwMDAwMH0.placeholder'
    );
}

export const supabase = createSafeClient();
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);
