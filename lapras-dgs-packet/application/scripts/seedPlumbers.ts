import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MOCK_PLUMBERS = [
    {
        name: 'Mike Henderson',
        email: 'mike.henderson@example.com',
        lat: 45.523,
        lng: -122.682,
        specialty: 'Commercial Plumbing',
        phone: '555-0101'
    },
    {
        name: 'Carlos Vega',
        email: 'carlos.vega@example.com',
        lat: 45.495,
        lng: -122.635,
        specialty: 'Pipe Burst & Emergency',
        phone: '555-0102'
    },
    {
        name: 'Tony Russo',
        email: 'tony.russo@example.com',
        lat: 45.421,
        lng: -122.671,
        specialty: 'Routine Maintenance',
        phone: '555-0103'
    },
    {
        name: 'Alex Rivera',
        email: 'alex.rivera@example.com',
        lat: 45.4875,
        lng: -122.804,
        specialty: 'Water Heater Replacement',
        phone: '555-0104'
    }
];

async function seed() {
    console.log('🌱 Seeding Supabase with mock plumbers...');

    for (const p of MOCK_PLUMBERS) {
        // 1. Create the Auth User
        console.log(`Creating auth user for ${p.name}...`);
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: p.email,
            password: 'SecurePassword123!',
            options: {
                data: {
                    full_name: p.name
                }
            }
        });

        if (authError && authError.message !== 'User already registered') {
            console.error(`Failed to register ${p.name}:`, authError.message);
            continue;
        }

        // Wait to allow potential database triggers to create the profile record 
        await new Promise(r => setTimeout(r, 1000));

        // Let's explicitly try to fetch or update the profile object (or upsert if RLS allows)
        let userId = authData?.user?.id;
        
        if (!userId) {
            // Need to login to get ID if already registered
             const { data: loginData } = await supabase.auth.signInWithPassword({
                email: p.email,
                password: 'SecurePassword123!'
             });
             userId = loginData?.user?.id;
        }

        if (!userId) {
             console.error(`Could not resolve Auth UUID for ${p.name}`);
             continue;
        }

        // 2. Update the Profiles table with 'active' status and coordinates
        console.log(`Setting ${p.name} as active on the map...`);
        const { error: profileError } = await supabase
            .from('profiles')
            .update({
                full_name: p.name,
                role: 'plumber',
                status: 'active',
                current_location: { lat: p.lat, lng: p.lng },
                phone: p.phone,
                specialty: p.specialty
            })
            .eq('id', userId);

        if (profileError) {
             console.error(`   Failed to set profile data for ${p.name}:`, profileError.message);
        } else {
             console.log(`   ✅ Success! ${p.name} is now LIVE on your map.`);
        }
    }

    console.log('\n✅ Seeding complete! You can now run the movement simulator.');
}

seed();
