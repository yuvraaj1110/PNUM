'use client';

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
    Wrench,
    ArrowLeft,
    Search,
    Users,
    AlertCircle,
    Clock,
    Navigation,
    MapPin,
    Radio,
    ChevronRight,
    X,
    Phone,
    Route,
} from 'lucide-react';
import { useFleetSubscription } from '@/hooks/useFleetSubscription';
import { Job } from '@/lib/types';

const FleetMap = dynamic(() => import('@/components/FleetMapClient'), {
    ssr: false,
    loading: () => (
        <div className="fleet-map-loader">
            <div className="loader-pulse" />
            <span>Initializing map…</span>
        </div>
    ),
});

// Haversine for sidebar
function haversine(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function FleetPage() {
    const { plumbers, jobs, isLive, connectionStatus } = useFleetSubscription();
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'emergency'>(
        'all'
    );
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const activePlumbers = plumbers.filter((p) => p.status === 'active');
    const pendingJobs = jobs.filter((j) => j.status === 'pending');
    const emergencyJobs = jobs.filter((j) => j.priority === 'EMERGENCY');

    // Filter jobs for sidebar
    const filteredJobs = useMemo(() => {
        let result = jobs;
        if (filterTab === 'pending')
            result = result.filter((j) => j.status === 'pending');
        if (filterTab === 'emergency')
            result = result.filter((j) => j.priority === 'EMERGENCY');
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(
                (j) =>
                    j.title.toLowerCase().includes(q) ||
                    j.customer.toLowerCase().includes(q) ||
                    j.address.toLowerCase().includes(q) ||
                    j.id.toLowerCase().includes(q)
            );
        }
        return result;
    }, [jobs, filterTab, searchQuery]);

    // Selected job details
    const selectedJob = jobs.find((j) => j.id === selectedJobId);

    // Nearest plumbers to selected job
    const nearestPlumbers = useMemo(() => {
        if (!selectedJob) return [];
        return plumbers
            .filter((p) => p.status === 'active')
            .map((p) => ({
                ...p,
                dist: haversine(
                    selectedJob.lat,
                    selectedJob.lng,
                    p.current_location.lat,
                    p.current_location.lng
                ),
            }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 3);
    }, [selectedJob, plumbers]);

    const priorityColor = (priority: string) => {
        switch (priority) {
            case 'EMERGENCY':
                return 'bg-red-500/10 text-red-500 border-red-500/20';
            case 'HIGH':
                return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
            case 'MEDIUM':
                return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            default:
                return 'bg-green-500/10 text-green-400 border-green-500/20';
        }
    };

    const statusDot = (status: string) => {
        switch (status) {
            case 'pending':
                return 'bg-orange-400';
            case 'in_progress':
                return 'bg-blue-400 animate-pulse';
            case 'completed':
                return 'bg-green-500';
            default:
                return 'bg-gray-500';
        }
    };

    return (
        <div className="relative w-screen h-screen overflow-hidden bg-[#0f1117]">
            {/* ─── Full-screen map ─── */}
            <div className="absolute inset-0 z-0">
                <FleetMap
                    plumbers={plumbers}
                    jobs={jobs}
                    selectedJobId={selectedJobId}
                    onJobSelect={setSelectedJobId}
                />
            </div>

            {/* ─── Floating header bar ─── */}
            <header className="absolute top-0 left-0 right-0 z-30 px-4 pt-4">
                <div className="fleet-glass-bar flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
                        >
                            <ArrowLeft
                                size={18}
                                className="group-hover:-translate-x-1 transition-transform"
                            />
                            <span className="text-sm font-bold hidden sm:inline">
                                Dashboard
                            </span>
                        </Link>

                        <div className="h-6 w-px bg-gray-700" />

                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-blue-600 rounded-lg text-white">
                                <Radio size={16} />
                            </div>
                            <span className="text-white font-black text-lg tracking-tight">
                                Live Fleet Map
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Stats pills */}
                        <div className="hidden md:flex items-center gap-3">
                            <div className="fleet-stat-pill">
                                <Users size={14} className="text-blue-400" />
                                <span className="text-white font-bold">
                                    {activePlumbers.length}
                                </span>
                                <span className="text-gray-500 text-[11px]">Active</span>
                            </div>
                            <div className="fleet-stat-pill">
                                <Clock size={14} className="text-orange-400" />
                                <span className="text-white font-bold">
                                    {pendingJobs.length}
                                </span>
                                <span className="text-gray-500 text-[11px]">Pending</span>
                            </div>
                            <div className="fleet-stat-pill">
                                <AlertCircle size={14} className="text-red-500" />
                                <span className="text-white font-bold">
                                    {emergencyJobs.length}
                                </span>
                                <span className="text-gray-500 text-[11px]">SOS</span>
                            </div>
                        </div>

                        {/* Connection status */}
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1f232d]/80 border border-gray-800/50">
                            <div
                                className={`w-2 h-2 rounded-full ${connectionStatus === 'connected'
                                        ? 'bg-green-500 animate-pulse'
                                        : connectionStatus === 'connecting'
                                            ? 'bg-yellow-400 animate-pulse'
                                            : 'bg-red-500'
                                    }`}
                            />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                {isLive ? 'LIVE' : 'DEMO'}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* ─── Toggle sidebar button (mobile) ─── */}
            {!sidebarOpen && (
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="absolute top-20 left-4 z-30 p-3 fleet-glass-bar rounded-2xl text-gray-400 hover:text-white transition-colors"
                >
                    <MapPin size={20} />
                </button>
            )}

            {/* ─── Dispatch sidebar ─── */}
            <aside
                className={`absolute top-20 bottom-4 left-4 z-20 w-[380px] fleet-glass-panel flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-[420px]'
                    }`}
            >
                {/* Sidebar header */}
                <div className="px-5 pt-5 pb-4 border-b border-white/5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-white font-black text-base flex items-center gap-2">
                            <Navigation size={16} className="text-blue-400" />
                            Dispatch Panel
                        </h2>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all lg:hidden"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="relative mb-3">
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"
                            size={14}
                        />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search jobs, customers…"
                            className="w-full bg-white/5 border border-white/5 focus:border-blue-500/40 outline-none rounded-xl py-2.5 pl-9 pr-4 text-sm text-gray-200 placeholder:text-gray-600 transition-all"
                        />
                    </div>

                    {/* Filter tabs */}
                    <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
                        {(
                            [
                                ['all', 'All'],
                                ['pending', 'Pending'],
                                ['emergency', 'SOS'],
                            ] as const
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setFilterTab(key)}
                                className={`flex-1 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${filterTab === key
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                                        : 'text-gray-500 hover:text-white'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Job list */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 scrollbar-thin">
                    {filteredJobs.length === 0 && (
                        <div className="text-center py-12 text-gray-600 text-sm">
                            No jobs match your filters
                        </div>
                    )}
                    {filteredJobs.map((job) => (
                        <JobCard
                            key={job.id}
                            job={job}
                            isSelected={selectedJobId === job.id}
                            onSelect={() =>
                                setSelectedJobId(selectedJobId === job.id ? null : job.id)
                            }
                            statusDot={statusDot}
                            priorityColor={priorityColor}
                        />
                    ))}
                </div>

                {/* Nearest plumbers panel */}
                {selectedJob && nearestPlumbers.length > 0 && (
                    <div className="px-4 py-4 border-t border-white/5">
                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                            <Route size={12} className="text-blue-400" />
                            Nearest Available ({nearestPlumbers.length})
                        </div>
                        <div className="space-y-2">
                            {nearestPlumbers.map((p, i) => (
                                <div
                                    key={p.id}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-blue-500/20 transition-all"
                                >
                                    <div className="fleet-rank-badge">
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-white truncate">
                                            {p.name}
                                        </div>
                                        <div className="text-[11px] text-gray-500">
                                            {p.dist.toFixed(1)} km away · {p.specialty}
                                        </div>
                                    </div>
                                    <button className="p-2 rounded-lg bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 transition-colors">
                                        <Phone size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </aside>
        </div>
    );
}

// ─── Job Card sub-component ───
function JobCard({
    job,
    isSelected,
    onSelect,
    statusDot,
    priorityColor,
}: {
    job: Job;
    isSelected: boolean;
    onSelect: () => void;
    statusDot: (s: string) => string;
    priorityColor: (p: string) => string;
}) {
    return (
        <button
            onClick={onSelect}
            className={`w-full text-left p-4 rounded-2xl border transition-all group ${isSelected
                    ? 'bg-blue-600/10 border-blue-500/30 shadow-lg shadow-blue-600/10'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10'
                }`}
        >
            <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-bold text-white leading-tight pr-2">
                    {job.title}
                </h3>
                <span
                    className={`text-[9px] font-black px-2 py-1 rounded-md border whitespace-nowrap ${priorityColor(
                        job.priority
                    )}`}
                >
                    {job.priority}
                </span>
            </div>

            <div className="space-y-1 mb-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Users size={11} className="text-blue-500/40 shrink-0" />
                    <span className="truncate">{job.customer}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <MapPin size={11} className="opacity-40 shrink-0" />
                    <span className="truncate">{job.address}</span>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${statusDot(job.status)}`} />
                    <span className="text-[11px] font-bold text-gray-400 capitalize">
                        {job.status.replace('_', ' ')}
                    </span>
                </div>
                <ChevronRight
                    size={14}
                    className={`text-gray-700 transition-transform ${isSelected ? 'rotate-90 text-blue-400' : 'group-hover:translate-x-0.5'
                        }`}
                />
            </div>
        </button>
    );
}
