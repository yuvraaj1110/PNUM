'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Wrench, Clock, AlertTriangle, Activity, Users, CheckCircle2, Gauge,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import {
  summarizeJobs, slaBreachRate, avgResponseMinutes, utilizationSummary,
} from '@/lib/analytics';

const STATUS_COLORS: Record<string, string> = {
  pending: '#fb923c', assigned: '#fde047', in_progress: '#facc15', completed: '#22c55e', cancelled: '#6b7280',
};
const PRIORITY_COLORS: Record<string, string> = {
  emergency: '#ef4444', high: '#f97316', medium: '#facc15', low: '#22c55e',
};
const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

interface UtilRow { full_name: string; active_jobs: number; completed_jobs: number; is_busy: boolean }

export default function AnalyticsPage() {
  const [mounted, setMounted] = useState(false);
  const [jobs, setJobs] = useState<{ status: string; priority: string }[]>([]);
  const [util, setUtil] = useState<UtilRow[]>([]);
  const [resp, setResp] = useState<{ response_minutes: number | null }[]>([]);
  const [sla, setSla] = useState<{ is_breach: boolean }[]>([]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [jobsRes, utilRes, respRes, slaRes] = await Promise.all([
      supabase.from('jobs').select('status,priority'),
      supabase.from('v_technician_utilization').select('*'),
      supabase.from('v_job_response_times').select('response_minutes'),
      supabase.from('v_sla_breaches').select('is_breach'),
    ]);
    setJobs((jobsRes.data as typeof jobs) ?? []);
    setUtil((utilRes.data as UtilRow[]) ?? []);
    setResp((respRes.data as typeof resp) ?? []);
    setSla((slaRes.data as typeof sla) ?? []);
  }, []);

  useEffect(() => {
    setMounted(true);
    load();
    if (!supabase) return;
    // Live refresh whenever the fleet state changes.
    const ch = supabase
      .channel('analytics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_events' }, load)
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [load]);

  const summary = useMemo(() => summarizeJobs(jobs), [jobs]);
  const breachRate = useMemo(() => slaBreachRate(sla), [sla]);
  const avgResp = useMemo(() => avgResponseMinutes(resp), [resp]);
  const fleet = useMemo(() => utilizationSummary(util), [util]);

  const statusData = useMemo(
    () => Object.entries(summary.byStatus).map(([name, value]) => ({ name, value })),
    [summary]
  );
  const priorityData = useMemo(
    () => ['emergency', 'high', 'medium', 'low']
      .map((p) => ({ name: label(p), key: p, value: summary.byPriority[p] ?? 0 })),
    [summary]
  );
  const workloadData = useMemo(
    () => util.map((u) => ({
      name: u.full_name?.split(' ')[0] ?? '?',
      Active: u.active_jobs ?? 0,
      Completed: u.completed_jobs ?? 0,
    })),
    [util]
  );

  const kpis = [
    { label: 'Total Jobs', value: summary.total, icon: Wrench, color: 'text-gray-300' },
    { label: 'Pending', value: summary.pending, icon: Clock, color: 'text-orange-400' },
    { label: 'In Progress', value: summary.inProgress + summary.assigned, icon: Activity, color: 'text-yellow-400' },
    { label: 'Completed', value: summary.completed, icon: CheckCircle2, color: 'text-green-400' },
    { label: 'Emergencies', value: summary.emergencies, icon: AlertTriangle, color: 'text-red-500' },
    { label: 'Avg Response', value: avgResp == null ? '—' : `${avgResp}m`, icon: Clock, color: 'text-yellow-400' },
    { label: 'SLA Breaches', value: `${breachRate}%`, icon: AlertTriangle, color: breachRate > 25 ? 'text-red-500' : 'text-green-400' },
    { label: 'Fleet Utilization', value: `${fleet.pct}%`, icon: Gauge, color: 'text-purple-400' },
  ];

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-gray-100 font-sans">
      {/* Header */}
      <nav className="flex items-center justify-between px-6 py-4 bg-[#161616] border-b border-gray-800 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group">
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold">Dashboard</span>
          </Link>
          <div className="h-6 w-px bg-gray-800" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-600 rounded-lg text-white"><Activity size={16} /></div>
            <span className="text-white font-black text-lg tracking-tight">Operations Analytics</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1f1f1f] border border-gray-800">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Live</span>
        </div>
      </nav>

      <main className="p-8 max-w-[1500px] mx-auto">
        {/* KPI grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-10">
          {kpis.map((k) => (
            <div key={k.label} className="bg-[#161616] p-5 rounded-3xl border border-gray-800/50 flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-[#1f1f1f]"><k.icon size={26} className={k.color} /></div>
              <div>
                <div className="text-2xl font-black tracking-tight">{k.value}</div>
                <div className="text-gray-500 text-[10px] font-bold uppercase tracking-[0.1em] mt-0.5">{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Jobs by status (donut) */}
          <div className="bg-[#161616] p-6 rounded-[2rem] border border-gray-800/50">
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-400 mb-4">Jobs by Status</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {statusData.map((d) => <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? '#6b7280'} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1f1f1f', border: '1px solid #374151', borderRadius: 12 }}
                  formatter={(v, n) => [v as number, label(String(n))]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {statusData.map((d) => (
                <span key={d.name} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[d.name] ?? '#6b7280' }} />
                  {label(d.name)} ({d.value})
                </span>
              ))}
            </div>
          </div>

          {/* Jobs by priority (bar) */}
          <div className="bg-[#161616] p-6 rounded-[2rem] border border-gray-800/50">
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-400 mb-4">Jobs by Priority</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={priorityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#ffffff08' }}
                  contentStyle={{ background: '#1f1f1f', border: '1px solid #374151', borderRadius: 12 }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {priorityData.map((d) => <Cell key={d.key} fill={PRIORITY_COLORS[d.key]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Technician workload (bar) */}
          <div className="bg-[#161616] p-6 rounded-[2rem] border border-gray-800/50">
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-400 mb-4">Technician Workload</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={workloadData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#ffffff08' }}
                  contentStyle={{ background: '#1f1f1f', border: '1px solid #374151', borderRadius: 12 }} />
                <Bar dataKey="Active" stackId="a" fill="#facc15" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Completed" stackId="a" fill="#22c55e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 justify-center mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Active</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Completed</span>
            </div>
          </div>
        </div>

        <p className="text-gray-600 text-xs mt-8 flex items-center gap-2">
          <Users size={12} /> Metrics derive from the <code className="text-gray-500">v_technician_utilization</code>,{' '}
          <code className="text-gray-500">v_job_response_times</code>, and <code className="text-gray-500">v_sla_breaches</code> SQL views and update live via Supabase realtime.
        </p>
      </main>
    </div>
  );
}
