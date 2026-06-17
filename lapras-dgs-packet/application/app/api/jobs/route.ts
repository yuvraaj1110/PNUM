import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { pickSupabaseKey } from '@/lib/supabase-key';
import { logJobEvent } from '@/lib/audit';

/**
 * Server-side API route for creating jobs.
 * 
 * This uses the SUPABASE_SERVICE_ROLE_KEY (if available) to bypass RLS,
 * or falls back to the anon key (which requires RLS policies).
 * 
 * The client modal calls this instead of inserting directly,
 * ensuring the customers table insert is not blocked by RLS.
 */

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Prefer a real service-role key (bypasses RLS); ignore the placeholder and
  // fall back to the anon key (which relies on the demo RLS policies).
  const key = pickSupabaseKey(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  );
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      customerName,
      address,
      jobTitle,
      description,
      priority,
      assignMode,
      selectedPlumberId,
    } = body;

    // Validate
    if (!customerName?.trim() || !address?.trim() || !jobTitle?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields: customerName, address, jobTitle' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Step 1: Create customer using the DB function (bypasses RLS)
    const { data: customerId, error: fnError } = await supabase.rpc(
      'create_customer',
      {
        p_name: customerName.trim(),
        p_address: address.trim(),
      }
    );

    if (fnError) {
      return NextResponse.json(
        { error: `Customer creation failed: ${fnError.message}` },
        { status: 500 }
      );
    }

    // Step 2: Generate Portland-area coordinates
    const lat = 45.5052 + (Math.random() - 0.5) * 0.06;
    const lng = -122.6784 + (Math.random() - 0.5) * 0.1;

    // Step 3: Insert the job
    const { data: jobData, error: jobError } = await supabase
      .from('jobs')
      .insert({
        customer_id: customerId,
        customer_name: customerName.trim(),
        title: jobTitle.trim(),
        description: description?.trim() || null,
        address: address.trim(),
        priority: priority || 'medium',
        status: assignMode === 'now' ? 'assigned' : 'pending',
        assigned_plumber_id: assignMode === 'now' ? selectedPlumberId : null,
        lat,
        lng,
        date: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      })
      .select('id')
      .single();

    if (jobError) {
      return NextResponse.json(
        { error: `Job creation failed: ${jobError.message}` },
        { status: 500 }
      );
    }

    // Audit: job created
    await logJobEvent(supabase, {
      jobId: jobData!.id,
      actor: 'dispatcher',
      eventType: 'created',
      payload: { title: jobTitle.trim(), priority: priority || 'medium', customer_name: customerName.trim() },
    });

    // Step 4: If "Assign Now", mark plumber as busy
    if (assignMode === 'now' && selectedPlumberId) {
      const { error: plumberError } = await supabase
        .from('profiles')
        .update({ status: 'busy' })
        .eq('id', selectedPlumberId);

      if (plumberError) {
        return NextResponse.json(
          {
            error: 'Job created but plumber status update failed.',
            jobId: jobData?.id,
          },
          { status: 207 }
        );
      }

      // Audit: assigned at creation time
      await logJobEvent(supabase, {
        jobId: jobData!.id,
        actor: 'dispatcher',
        eventType: 'assigned',
        payload: { technician_id: selectedPlumberId },
      });
    }

    return NextResponse.json(
      { success: true, jobId: jobData?.id },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
