/**
 * ═══════════════════════════════════════════════════════
 * 🛠️  Lapras Fleet — Movement Simulator ("Ghost" Mode)
 * ═══════════════════════════════════════════════════════
 *
 * Randomly nudges the GPS coordinates of all active
 * plumbers in the Supabase `profiles` table every 5 s.
 *
 *   Usage
 *   ─────
 *   1. Install tsx globally if not already: npm i -g tsx
 *   2. Set environment variables:
 *        export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
 *        export SUPABASE_SERVICE_KEY="eyJhbGci..."
 *   3. Run:
 *        npx tsx scripts/simulateMovement.ts
 *      or use the npm script:
 *        npm run simulate
 *
 *   The script will continuously update plumber positions
 *   until you press Ctrl+C.
 * ═══════════════════════════════════════════════════════
 */

import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

// ─── Configuration ───
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';

const UPDATE_INTERVAL_MS = 5000; // 5 seconds between updates
const MAX_DRIFT = 0.003; // ~300 m max per tick
const SPEED_BIAS = 0.6; // tendency to drift toward service area center

// Portland service area center
const CENTER = { lat: 45.5052, lng: -122.6784 };

// ─── Supabase client ───
console.log('Initializing simulation with URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'FOUND' : 'MISSING');

let supabase: any;
try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (error) {
    console.error('Failed to initialize Supabase client:', error);
}

// ─── Helpers ───
function nudge(
    current: { lat: number; lng: number },
    center: { lat: number; lng: number },
    maxDrift: number,
    bias: number
): { lat: number; lng: number } {
    // Random component
    const randLat = (Math.random() - 0.5) * 2 * maxDrift;
    const randLng = (Math.random() - 0.5) * 2 * maxDrift;

    // Bias toward center (prevents drifting into the ocean)
    const biasLat = (center.lat - current.lat) * bias * 0.02;
    const biasLng = (center.lng - current.lng) * bias * 0.02;

    return {
        lat: current.lat + randLat + biasLat,
        lng: current.lng + randLng + biasLng,
    };
}

// ─── Main loop ───
async function main() {
    console.log('');
    console.log('  🚀  Lapras Movement Simulator');
    console.log('  ─────────────────────────────');

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.log('');
        console.log('  ⚠️  Supabase credentials not found. Running local-only demo.');
        console.log('');
        console.log('  This script requires:');
        console.log('    • NEXT_PUBLIC_SUPABASE_URL');
        console.log('    • SUPABASE_SERVICE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
        console.log('');
        console.log('  For now, simulating with console output only…');
        console.log('');

        // Demo-only mode: just log random movements
        const fakeIds = ['Mike Henderson', 'Carlos Vega', 'Tony Russo', 'Alex Rivera'];
        const positions = [
            { lat: 45.523, lng: -122.682 },
            { lat: 45.495, lng: -122.635 },
            { lat: 45.421, lng: -122.671 },
            { lat: 45.4875, lng: -122.804 },
        ];

        setInterval(() => {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`  ⏱  [${timestamp}] Tick`);

            fakeIds.forEach((name, i) => {
                positions[i] = nudge(positions[i], CENTER, MAX_DRIFT, SPEED_BIAS);
                const { lat, lng } = positions[i];
                console.log(
                    `     📍 ${name.padEnd(18)} → ${lat.toFixed(5)}, ${lng.toFixed(5)}`
                );
            });

            console.log('');
        }, UPDATE_INTERVAL_MS);

        return;
    }

    // Real Supabase mode
    console.log(`  📡  Connected to ${SUPABASE_URL}`);
    console.log(`  🔁  Update interval: ${UPDATE_INTERVAL_MS / 1000}s`);
    console.log(`  📏  Max drift: ~${(MAX_DRIFT * 111).toFixed(0)}m per tick`);
    console.log('  ─────────────────────────────');
    console.log('  Press Ctrl+C to stop.');
    console.log('');

    setInterval(async () => {
        try {
            const { data: plumbers, error } = await supabase
                .from('profiles')
                .select('id, full_name, current_location, status')
                .eq('status', 'active');

            if (error) {
                console.error('  ❌  Fetch error:', error.message);
                return;
            }

            if (!plumbers || plumbers.length === 0) {
                console.log('  ⚠️  No active plumbers found in profiles table.');
                return;
            }

            const timestamp = new Date().toLocaleTimeString();
            console.log(`  ⏱  [${timestamp}] Updating ${plumbers.length} plumber(s)…`);

            for (const plumber of plumbers) {
                const oldPos = plumber.current_location || {
                    lat: plumber.lat || CENTER.lat,
                    lng: plumber.lng || CENTER.lng,
                };
                const newPos = nudge(oldPos, CENTER, MAX_DRIFT, SPEED_BIAS);

                const updatePayload: any = { current_location: newPos };

                const { error: updateErr } = await supabase
                    .from('profiles')
                    .update(updatePayload)
                    .eq('id', plumber.id);

                if (updateErr) {
                    console.error(
                        `  ❌  Failed to update ${plumber.full_name || plumber.name || plumber.id}:`,
                        updateErr.message
                    );
                } else {
                    const name = plumber.full_name || plumber.name || plumber.id;
                    console.log(
                        `     📍 ${String(name).padEnd(18)} → ${newPos.lat.toFixed(5)}, ${newPos.lng.toFixed(5)}`
                    );
                }
            }

            console.log('');
        } catch (err) {
            console.error('  ❌  Unexpected error:', err);
        }
    }, UPDATE_INTERVAL_MS);
}

main();
