import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { pickSupabaseKey } from '@/lib/supabase-key';
import { logJobEvent } from '@/lib/audit';

/**
 * PATCH /api/jobs/[id]  — update a job's status and write an audit event.
 *   Body: { status: 'pending'|'assigned'|'in_progress'|'completed'|'cancelled' }
 *
 * On completion/cancellation, the assigned technician is freed (status → active).
 */

const VALID = new Set(['pending', 'assigned', 'in_progress', 'completed', 'cancelled']);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = pickSupabaseKey(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  );
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const status = body.status;
  if (!status || !VALID.has(status)) {
    return NextResponse.json({ error: `status must be one of: ${[...VALID].join(', ')}` }, { status: 400 });
  }

  const sb = getSupabase();

  // Read current state for the audit "from" value + assigned tech.
  const { data: current, error: readErr } = await sb
    .from('jobs')
    .select('status, assigned_plumber_id')
    .eq('id', id)
    .single();
  if (readErr || !current) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const { error: updErr } = await sb.from('jobs').update({ status }).eq('id', id);
  if (updErr) {
    return NextResponse.json({ error: `Update failed: ${updErr.message}` }, { status: 500 });
  }

  // Free the technician when the job is finished.
  if ((status === 'completed' || status === 'cancelled') && current.assigned_plumber_id) {
    await sb.from('profiles').update({ status: 'active' }).eq('id', current.assigned_plumber_id);
  }

  await logJobEvent(sb, {
    jobId: id,
    actor: 'dispatcher',
    eventType: status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'status_changed',
    payload: { from: current.status, to: status },
  });

  return NextResponse.json({ success: true, id, status });
}
