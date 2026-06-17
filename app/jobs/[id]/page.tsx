'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Wrench, Users, MapPin, Clock, AlertTriangle,
  Phone, CheckCircle2, Loader2, FileText, Navigation
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { describeEvent } from '@/lib/audit';

interface AuditEvent {
  id: string;
  event_type: string;
  actor: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface JobDetails {
  id: string;
  title: string;
  description?: string;
  customer_name?: string;
  address?: string;
  priority: string;
  status: string;
  assigned_plumber_id?: string;
  lat?: number;
  lng?: number;
  date?: string;
  created_at?: string;
}

interface PlumberInfo {
  id: string;
  full_name: string;
  phone?: string;
  specialty?: string;
  status: string;
}

function priorityConfig(p: string) {
  const val = (p || '').toLowerCase();
  switch (val) {
    case 'emergency':
      return { label: 'EMERGENCY', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-500' };
    case 'high':
      return { label: 'HIGH', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-500' };
    case 'low':
      return { label: 'LOW', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', dot: 'bg-green-500' };
    default:
      return { label: 'MEDIUM', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', dot: 'bg-yellow-400' };
  }
}

function statusConfig(s: string) {
  switch (s) {
    case 'assigned':
      return { label: 'Assigned', color: 'text-yellow-400', dot: 'bg-yellow-400' };
    case 'in_progress':
      return { label: 'In Progress', color: 'text-yellow-400', dot: 'bg-yellow-400 animate-pulse' };
    case 'completed':
      return { label: 'Completed', color: 'text-green-400', dot: 'bg-green-500' };
    default:
      return { label: 'Pending', color: 'text-orange-400', dot: 'bg-orange-400' };
  }
}

export default function JobDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [job, setJob] = useState<JobDetails | null>(null);
  const [plumber, setPlumber] = useState<PlumberInfo | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!supabase || !jobId) return;
    const sb = supabase;

    const { data, error: fetchErr } = await sb.from('jobs').select('*').eq('id', jobId).single();
    if (fetchErr) {
      setError('Job not found');
      setLoading(false);
      return;
    }
    setJob(data as JobDetails);

    if (data.assigned_plumber_id) {
      const { data: plumberData } = await sb
        .from('profiles')
        .select('id, full_name, phone, specialty, status')
        .eq('id', data.assigned_plumber_id)
        .single();
      if (plumberData) setPlumber(plumberData as PlumberInfo);
    }

    // Audit trail for this job (newest first)
    const { data: evs } = await sb
      .from('job_events')
      .select('id, event_type, actor, payload, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    setEvents((evs as AuditEvent[]) ?? []);

    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const markCompleted = async () => {
    if (!job || marking) return;
    setMarking(true);
    try {
      await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      await refresh();
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="text-yellow-400 animate-spin" />
          <p className="text-gray-500 text-sm font-medium">Loading job details…</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <div className="text-center">
          <div className="p-4 bg-red-500/10 rounded-full border border-red-500/20 inline-block mb-4">
            <AlertTriangle size={40} className="text-red-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Job Not Found</h2>
          <p className="text-gray-500 text-sm mb-6">{error || 'This job does not exist or has been deleted.'}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-400 hover:bg-yellow-300 text-black rounded-xl text-sm font-bold transition-all"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const prio = priorityConfig(job.priority);
  const stat = statusConfig(job.status);

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-gray-100 font-sans">
      {/* Header */}
      <nav className="flex items-center justify-between px-6 py-4 bg-[#161616] border-b border-gray-800 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold">Back</span>
          </button>
          <div className="h-6 w-px bg-gray-800" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-yellow-400 rounded-lg text-black">
              <Wrench size={16} />
            </div>
            <span className="text-white font-black text-lg tracking-tight">Job Details</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-black px-3 py-1.5 rounded-full tracking-wider border ${prio.bg} ${prio.color}`}>
            {prio.label}
          </span>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1f1f1f] border border-gray-800">
            <div className={`w-2 h-2 rounded-full ${stat.dot}`} />
            <span className={`text-[11px] font-bold ${stat.color}`}>{stat.label}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-[1200px] mx-auto p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Job Title Card */}
            <div className="bg-[#161616] rounded-[2rem] border border-gray-800/50 p-8">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl ${prio.bg}`}>
                    <Wrench size={28} className={prio.color} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-black text-white tracking-tight">{job.title}</h1>
                    <p className="text-gray-500 text-sm mt-1 font-medium">
                      ID: {job.id.slice(0, 8)}… · Created {job.date || new Date(job.created_at || '').toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {job.description && (
                <div className="mb-6">
                  <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 mb-3">
                    <FileText size={12} className="text-yellow-500/60" />
                    Description
                  </h3>
                  <p className="text-gray-300 text-sm leading-relaxed bg-[#161616] rounded-xl p-4 border border-gray-800/50">
                    {job.description}
                  </p>
                </div>
              )}

              {/* Customer & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#161616] rounded-xl p-4 border border-gray-800/50">
                  <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-500 mb-2">
                    <Users size={12} className="text-yellow-500/60" />
                    Customer
                  </h3>
                  <p className="text-white font-bold text-sm">{job.customer_name || 'Unknown'}</p>
                </div>
                <div className="bg-[#161616] rounded-xl p-4 border border-gray-800/50">
                  <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-500 mb-2">
                    <MapPin size={12} className="text-yellow-500/60" />
                    Address
                  </h3>
                  <p className="text-white font-bold text-sm">{job.address || 'Not specified'}</p>
                </div>
              </div>
            </div>

            {/* Timeline / Activity */}
            <div className="bg-[#161616] rounded-[2rem] border border-gray-800/50 p-8">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-gray-400 mb-6">
                <Clock size={14} className="text-yellow-500/60" />
                Job Timeline
              </h3>
              <div className="space-y-6 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-800/50">
                {events.length > 0 ? (
                  // Real audit trail from job_events (oldest first)
                  [...events].reverse().map((e) => {
                    const dot =
                      e.event_type === 'completed' ? 'bg-green-500'
                        : e.event_type === 'assigned' ? 'bg-yellow-400'
                        : e.event_type === 'status_changed' ? 'bg-orange-400'
                        : e.event_type === 'cancelled' ? 'bg-red-500'
                        : 'bg-purple-500';
                    return (
                      <div key={e.id} className="flex gap-4 items-start relative z-10">
                        <div className={`mt-1.5 w-3.5 h-3.5 rounded-full border-[3px] border-[#161616] shrink-0 ${dot}`} />
                        <div>
                          <div className="text-sm text-white font-bold">{describeEvent(e)}</div>
                          <div className="text-[10px] text-gray-600 font-bold mt-1 uppercase tracking-widest">
                            {new Date(e.created_at).toLocaleString()} · {e.actor ?? 'system'}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  // Fallback: derive a minimal timeline from the job's current status
                  <div className="flex gap-4 items-start relative z-10">
                    <div className="mt-1.5 w-3.5 h-3.5 rounded-full border-[3px] border-[#161616] bg-green-500 shrink-0" />
                    <div>
                      <div className="text-sm text-white font-bold">Job Created</div>
                      <div className="text-[10px] text-gray-600 font-bold mt-1 uppercase tracking-widest">
                        {job.date || new Date(job.created_at || '').toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Assigned Technician */}
            <div className="bg-[#161616] rounded-[2rem] border border-gray-800/50 p-6">
              <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 mb-4">
                <Navigation size={12} className="text-yellow-500/60" />
                Assigned Technician
              </h3>
              {plumber ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-yellow-500/15 border border-yellow-500/20 flex items-center justify-center text-yellow-400 font-black text-sm">
                      {plumber.full_name.split(' ').map(w => w[0]).join('')}
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm">{plumber.full_name}</div>
                      <div className="text-gray-500 text-xs">{plumber.specialty || 'General Plumbing'}</div>
                    </div>
                  </div>
                  {plumber.phone && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#161616] rounded-xl border border-gray-800/50">
                      <Phone size={14} className="text-yellow-500/50" />
                      <span className="text-sm text-gray-300">{plumber.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${plumber.status === 'active' ? 'bg-green-500' : plumber.status === 'busy' ? 'bg-orange-400' : 'bg-gray-500'}`} />
                    <span className="text-xs font-bold text-gray-400 capitalize">{plumber.status}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="p-3 bg-[#161616] rounded-2xl inline-block mb-3">
                    <Users size={24} className="text-gray-600" />
                  </div>
                  <p className="text-gray-500 text-sm font-medium">No technician assigned</p>
                  <p className="text-gray-600 text-xs mt-1">Use the Fleet Map to dispatch</p>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-[#161616] rounded-[2rem] border border-gray-800/50 p-6 space-y-3">
              <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 mb-4">
                Quick Actions
              </h3>
              <Link
                href="/fleet"
                className="w-full flex items-center justify-center gap-2 py-3 bg-yellow-400 hover:bg-yellow-300 text-black rounded-xl text-sm font-bold transition-all"
              >
                <Navigation size={16} /> View on Fleet Map
              </Link>
              <button
                onClick={markCompleted}
                disabled={marking || job.status === 'completed'}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#1f1f1f] hover:bg-[#2a2a2a] text-gray-400 hover:text-white rounded-xl text-sm font-bold border border-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {marking ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {job.status === 'completed' ? 'Completed' : 'Mark Completed'}
              </button>
            </div>

            {/* Location */}
            {job.lat && job.lng && (
              <div className="bg-[#161616] rounded-[2rem] border border-gray-800/50 p-6">
                <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 mb-3">
                  <MapPin size={12} className="text-yellow-500/60" />
                  Coordinates
                </h3>
                <div className="text-xs text-gray-500 font-mono bg-[#161616] rounded-xl p-3 border border-gray-800/50">
                  {job.lat.toFixed(6)}, {job.lng.toFixed(6)}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
