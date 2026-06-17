'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { describeEvent } from '@/lib/audit';

/**
 * Live audit feed backed by the job_events table. Replaces the dashboard's
 * old hardcoded activity list. Subscribes to realtime inserts so new events
 * (job created, assigned, status changed, completed) appear instantly.
 */

interface FeedEvent {
  id: string;
  event_type: string;
  actor: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  job_id: string;
  jobs?: { title?: string } | null;
}

const DOT: Record<string, string> = {
  created: 'bg-purple-500',
  assigned: 'bg-yellow-400',
  status_changed: 'bg-orange-400',
  completed: 'bg-green-500',
  cancelled: 'bg-red-500',
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('job_events')
      .select('id, event_type, actor, payload, created_at, job_id, jobs(title)')
      .order('created_at', { ascending: false })
      .limit(12);
    setEvents((data as unknown as FeedEvent[]) ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase
      .channel('activity-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_events' }, load)
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [load]);

  if (loaded && events.length === 0) {
    return (
      <div className="text-center py-10 text-gray-600 text-sm">
        No activity yet. Create or assign a job to see the audit trail.
      </div>
    );
  }

  return (
    <div className="space-y-8 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-800/50">
      {events.map((e) => (
        <div key={e.id} className="flex gap-6 items-start relative z-10 group">
          <div className={`mt-1.5 w-3.5 h-3.5 rounded-full border-[3px] border-[#161616] shadow-sm shrink-0 transition-transform group-hover:scale-125 ${DOT[e.event_type] ?? 'bg-gray-500'}`} />
          <div className="flex-1">
            <div className="text-sm leading-relaxed">
              <span className="font-black text-white capitalize">{e.actor ?? 'system'}</span>
              <span className="text-gray-500 mx-1.5">·</span>
              <span className="text-gray-300">{describeEvent(e)}</span>
              {e.jobs?.title && (
                <>
                  <span className="text-gray-500 mx-1.5">on</span>
                  <span className="text-yellow-400 font-bold">{e.jobs.title}</span>
                </>
              )}
            </div>
            <div className="text-[10px] text-gray-600 font-bold mt-1.5 uppercase tracking-widest flex items-center gap-1.5">
              <Clock size={10} /> {timeAgo(e.created_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
