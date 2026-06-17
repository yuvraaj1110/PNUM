'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Wrench, Users, Search, Bell, Plus,
  AlertCircle, Clock, Navigation, ChevronRight, LogOut, Radio
} from 'lucide-react';
import FleetMap, { type Job } from '@/components/FleetMap';
import CreateJobModal from '@/components/CreateJobModal';
import CopilotPanel from '@/components/CopilotPanel';
import ActivityFeed from '@/components/ActivityFeed';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MiniMapWidget = dynamic(() => import('@/components/MiniMapWidget'), {
  ssr: false,
  loading: () => (
    <div className="h-[280px] rounded-[2rem] bg-[#161616] border border-gray-800/50 animate-pulse" />
  ),
});

const SEED_JOBS: Job[] = [
  { id: '#8740BC', title: 'Sewer Leak - Basement', customer: 'Sarah Mitchell', address: '142 Oak Street, Suite 8', date: 'Mar 27, 2026', priority: 'EMERGENCY', status: 'Pending', color: 'border-l-red-500', lat: 45.523062, lng: -122.676482 },
  { id: '#8740BD', title: 'Water Heater Replacement', customer: 'James Rodriguez', address: '890 Pine Avenue, Apt 3', date: 'Mar 27, 2026', priority: 'HIGH', status: 'In Progress', color: 'border-l-orange-500', assigned: 'Mike Henderson', lat: 45.543062, lng: -122.656482 },
  { id: '#8740BE', title: 'Kitchen Faucet Install', customer: 'Emily Chen', address: '2450 Willow Creek Dr', date: 'Mar 28, 2026', priority: 'MEDIUM', status: 'Pending', color: 'border-l-blue-500', lat: 45.513062, lng: -122.686482 },
  { id: '#8740BF', title: 'Pipe Burst - Emergency', customer: 'David Thompson', address: '78 Riverdale Rd, Beaverton', date: 'Mar 27, 2026', priority: 'EMERGENCY', status: 'In Progress', color: 'border-l-red-500', assigned: 'Carlos Vega', lat: 45.483062, lng: -122.806482 },
  { id: '#8740C0', title: 'Toilet Repair', customer: 'Lisa Park', address: '3320 Maple Lane, Lake Oswego', date: 'Mar 26, 2026', priority: 'LOW', status: 'Completed', color: 'border-l-green-500', assigned: 'Tony Russo', lat: 45.413062, lng: -122.666482 },
  { id: '#8740C1', title: 'Drain Cleaning - Main Line', customer: 'Robert Kim', address: '567 Cedar Blvd, Tigard', date: 'Mar 28, 2026', priority: 'HIGH', status: 'Pending', color: 'border-l-orange-500', lat: 45.433062, lng: -122.776482 },
];

// Map a DB priority string to a display border color
function priorityBorderColor(p: string): string {
  const val = p.toUpperCase();
  if (val === 'EMERGENCY') return 'border-l-red-500';
  if (val === 'HIGH') return 'border-l-orange-500';
  if (val === 'LOW') return 'border-l-green-500';
  return 'border-l-blue-500';
}

// Map a DB status string to a display label
function statusLabel(s: string): string {
  if (s === 'in_progress') return 'In Progress';
  if (s === 'completed') return 'Completed';
  if (s === 'assigned') return 'Assigned';
  return 'Pending';
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>(SEED_JOBS);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [userProfile, setUserProfile] = useState<{ full_name?: string } | null>(null);
  const [isCreateJobOpen, setIsCreateJobOpen] = useState(false);
  const router = useRouter();

  // ── Fetch real jobs from Supabase on mount ──
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase; // local binding for TS narrowing

    const fetchJobs = async () => {
      const { data, error } = await sb
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const dbJobs: Job[] = data.map((j: Record<string, unknown>) => ({
          id: j.id as string,
          title: (j.title as string) || 'Untitled Job',
          customer: (j.customer_name as string) || 'Unknown',
          address: (j.address as string) || '',
          date: (j.date as string) || new Date(j.created_at as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          priority: ((j.priority as string) || 'medium').toUpperCase(),
          status: statusLabel((j.status as string) || 'pending'),
          color: priorityBorderColor((j.priority as string) || 'medium'),
          lat: (j.lat as number) || 45.5052,
          lng: (j.lng as number) || -122.6784,
          assigned: j.assigned_plumber_id ? 'Technician Assigned' : undefined,
        }));
        setJobs(dbJobs);
      }
    };

    fetchJobs();

    // ── Real-time subscription for new jobs ──
    const channel = sb
      .channel('dashboard-jobs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        (payload) => {
          const j = payload.new;
          const newJob: Job = {
            id: j.id,
            title: j.title || 'Untitled Job',
            customer: j.customer_name || 'Unknown',
            address: j.address || '',
            date: j.date || new Date(j.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            priority: (j.priority || 'medium').toUpperCase(),
            status: statusLabel(j.status || 'pending'),
            color: priorityBorderColor(j.priority || 'medium'),
            lat: j.lat || 45.5052,
            lng: j.lng || -122.6784,
            assigned: j.assigned_plumber_id ? 'Technician Assigned' : undefined,
          };
          setJobs((prev) => [newJob, ...prev]);
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  // ── Compute stats dynamically from jobs ──
  const stats = useMemo(() => {
    const total = jobs.length;
    const pending = jobs.filter((j) => j.status === 'Pending').length;
    const inProgress = jobs.filter((j) => j.status === 'In Progress' || j.status === 'Assigned').length;
    const emergencies = jobs.filter((j) => j.priority === 'EMERGENCY').length;
    return [
      { label: 'Total Jobs', value: total, icon: Wrench, color: 'text-gray-400' },
      { label: 'Pending', value: pending, icon: Clock, color: 'text-orange-400' },
      { label: 'In Progress', value: inProgress, icon: Navigation, color: 'text-yellow-400' },
      { label: 'Emergencies', value: emergencies, icon: AlertCircle, color: 'text-red-500' },
    ];
  }, [jobs]);

  // ── Callback when a new job is created via modal ──
  const handleJobCreated = useCallback(() => {
    // Real-time subscription will auto-add the job to the list.
    // router.refresh() ensures any server-rendered data also updates.
    router.refresh();
  }, [router]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        setUserProfile(profile || { full_name: user.email });
      }
    };
    fetchProfile();
  }, []);

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-gray-100 font-sans selection:bg-yellow-500/30">
      {/* Top Navigation */}
      <nav className="flex items-center justify-between px-6 py-3 bg-[#161616] border-b border-gray-800 sticky top-0 z-50">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2 text-yellow-400 font-bold text-2xl tracking-tighter italic">
            <div className="p-1.5 bg-yellow-400 rounded-lg text-black shadow-lg shadow-yellow-500/20"><Wrench size={22} /></div>
            Lapras
          </div>
          <div className="flex gap-8 text-sm font-medium text-gray-400">
            <Link href="/fleet" className="flex items-center gap-2 text-white cursor-pointer hover:text-yellow-400 transition-all group">
              <Radio size={18} className="group-hover:scale-110 transition-transform" />
              Live Fleet
              <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full text-[10px]">4 Online</span>
            </Link>
            <span className="cursor-pointer hover:text-white transition-colors">Customers</span>
            <Link href="/analytics" className="cursor-pointer hover:text-white transition-colors">Analytics</Link>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-yellow-400 transition-colors" size={16} />
            <input
              placeholder="Search active jobs..."
              className="bg-[#1f1f1f] border border-transparent focus:border-yellow-500/50 outline-none rounded-xl py-2.5 pl-10 pr-4 text-sm w-72 transition-all placeholder:text-gray-600"
            />
          </div>
          <div className="p-2.5 bg-[#1f1f1f] rounded-xl text-gray-400 cursor-pointer hover:text-white hover:bg-[#2a2a2a] transition-all relative">
            <Bell size={20} />
            <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#1f1f1f]"></div>
          </div>

          <div className="flex items-center gap-4 pl-4 border-l border-gray-800">
            <div className="text-right">
              <div className="text-xs font-black uppercase tracking-widest text-gray-500">Dispatcher</div>
              <div className="text-sm font-bold text-white">{userProfile?.full_name || 'Loading...'}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all group"
              title="Logout"
            >
              <LogOut size={20} className="group-hover:scale-110 transition-transform" />
            </button>
          </div>

          <button
            id="new-job-button"
            onClick={() => setIsCreateJobOpen(true)}
            className="bg-yellow-400 hover:bg-yellow-300 active:scale-95 text-black px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 font-bold transition-all shadow-lg shadow-yellow-500/20"
          >
            <Plus size={20} /> New Job
          </button>
        </div>
      </nav>

      <main className="p-8 max-w-[1680px] mx-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {stats.map((stat, i) => (
            <div key={i} className="bg-[#161616] p-6 rounded-3xl border border-gray-800/50 hover:border-gray-700 transition-colors flex items-center gap-6 group">
              <div className={cn(
                "p-4 rounded-2xl bg-[#1f1f1f] group-hover:scale-110 transition-transform bg-opacity-10",
                stat.color
              )}>
                <stat.icon size={32} />
              </div>
              <div>
                <div className="text-3xl font-black tracking-tight">{stat.value}</div>
                <div className="text-gray-500 text-[11px] font-bold uppercase tracking-[0.1em] mt-0.5">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ═══ Mini-Map Widget ═══ */}
        <div className="mb-12">
          <MiniMapWidget />
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Job Board */}
          <div className="flex-1">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Active Job Board</h2>
                <p className="text-gray-500 text-sm mt-1">Real-time status of all field operations</p>
              </div>
              <div className="flex gap-2 p-1 bg-[#161616] rounded-xl border border-gray-800">
                {['All', 'Pending', 'Active'].map(tab => (
                  <button key={tab} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${tab === 'All' ? 'bg-yellow-400 text-black shadow-md' : 'text-gray-500 hover:text-white'}`}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6 mb-12">
              {jobs.map((job, i) => (
                <div
                  key={i}
                  onClick={() => {
                    // Real DB jobs (UUIDs) → navigate to details page
                    // Seed/mock jobs (starting with #) → select on map
                    if (!job.id.startsWith('#')) {
                      router.push(`/jobs/${job.id}`);
                    } else {
                      setActiveJob(job);
                    }
                  }}
                  className={cn(
                    "bg-[#161616] p-6 rounded-[2rem] border-l-[6px] border-t border-r border-b border-gray-800/40 hover:bg-[#1e1e1e] transition-all cursor-pointer group hover:shadow-2xl hover:shadow-black/40",
                    job.color,
                    activeJob?.id === job.id && "ring-2 ring-yellow-500/50 bg-[#1e1e1e]"
                  )}
                >
                   <div className="flex justify-between items-start mb-6">
                      <div className="p-3 bg-[#1f1f1f] rounded-2xl text-gray-400 group-hover:text-yellow-400 transition-colors"><Wrench size={20}/></div>
                      <div className="text-right">
                        <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest leading-none mb-1">ID {job.id}</div>
                        <div className="text-[10px] text-gray-600 font-medium italic">{job.date}</div>
                      </div>
                   </div>

                  <h3 className="font-black text-xl mb-2 group-hover:text-yellow-50 text-white transition-colors">{job.title}</h3>

                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-300 font-medium">
                      <Users size={14} className="text-yellow-500/50" /> {job.customer}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Navigation size={14} className="opacity-30" /> {job.address}
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-5 border-t border-gray-800/60">
                    <span className={cn(
                      "text-[10px] font-black px-3 py-1.5 rounded-full tracking-wider",
                      job.priority === 'EMERGENCY' && 'bg-red-500/10 text-red-500 border border-red-500/20',
                      job.priority === 'HIGH' && 'bg-orange-500/10 text-orange-500 border border-orange-500/20',
                      job.priority !== 'EMERGENCY' && job.priority !== 'HIGH' && 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    )}>
                      {job.priority}
                    </span>
                    <div className="flex items-center gap-2 group/status">
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]",
                        job.status === 'In Progress' ? 'bg-yellow-400 animate-pulse' :
                          job.status === 'Completed' ? 'bg-green-500' : 'bg-orange-400'
                      )}></div>
                      <span className="text-[11px] font-bold text-gray-300 group-hover/status:text-white transition-colors">{job.status}</span>
                      <ChevronRight size={14} className="text-gray-700 group-hover/status:translate-x-1 transition-transform" />
                    </div>
                  </div>

                  {job.assigned && (
                    <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-yellow-500/5 rounded-xl border border-yellow-500/10">
                      <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></div>
                      <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-tight">Assigned: {job.assigned}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight mb-1">Fleet Location & Dispatch</h2>
              <p className="text-gray-500 text-sm">Real-time plumber recommendations and dispatch control</p>
            </div>
            <FleetMap activeJob={activeJob} />
          </div>

          {/* Activity Feed Sidebar */}
          <aside className="w-full lg:w-96 bg-[#161616] p-8 rounded-[2.5rem] border border-gray-800/50 self-start shadow-xl">
            <div className="flex justify-between items-center mb-10">
              <h3 className="font-black text-lg flex items-center gap-3">
                <div className="p-2 bg-yellow-500/10 rounded-lg"><Navigation size={18} className="text-yellow-400" /></div>
                Activity Feed
              </h3>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
            </div>

            <ActivityFeed />

            <Link
              href="/analytics"
              className="mt-12 w-full flex items-center justify-center py-4 bg-[#1f1f1f] hover:bg-[#252525] text-gray-400 hover:text-white text-xs font-black uppercase tracking-widest rounded-2xl border border-gray-800 transition-all"
            >
              View Operations Analytics
            </Link>
          </aside>
        </div>
      </main>

      {/* ═══ Create Job Modal ═══ */}
      <CreateJobModal
        isOpen={isCreateJobOpen}
        onClose={() => setIsCreateJobOpen(false)}
        onJobCreated={handleJobCreated}
      />

      {/* ═══ Agentic Dispatch Copilot ═══ */}
      <CopilotPanel />
    </div>
  );
}
