import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testProfileInsertion() {
  console.log('Testing profile insertion...');

  const dummyId = '00000000-0000-0000-0000-000000000000';

  const { data, error } = await supabase
    .from('profiles')
    .insert([
      {
        id: dummyId,
        full_name: 'Test User',
        role: 'Dispatcher',
      }
    ])
    .select();

  if (error) {
    console.error(' Insertion Error:', error);
    console.error('Error Details:', JSON.stringify(error, null, 2));
  } else {
    console.log(' Success:', data);

    // Cleanup
    await supabase.from('profiles').delete().eq('id', dummyId);
  }
}

testProfileInsertion();
