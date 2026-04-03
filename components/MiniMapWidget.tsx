'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Radio, ArrowUpRight, Users, AlertCircle } from 'lucide-react';
import { useFleetSubscription } from '@/hooks/useFleetSubscription';

const FleetMap = dynamic(() => import('@/components/FleetMapClient'), {
    ssr: false,
    loading: () => (
        <div className="mini-map-loader">
            <div className="loader-pulse" />
        </div>
    ),
});

export default function MiniMapWidget() {
    const { plumbers, jobs, isLive, connectionStatus } = useFleetSubscription();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const activePlumbers = plumbers.filter((p) => p.status === 'active');
    const pendingJobs = jobs.filter((j) => j.status === 'pending');

    if (!mounted) return null;

    return (
        <div className="relative group">
            {/* Map container */}
            <div className="relative h-[280px] rounded-[2rem] overflow-hidden border border-gray-800/50 bg-[#161922]">
                <FleetMap plumbers={plumbers} jobs={jobs} mini />

                {/* Gradient overlay at top */}
                <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#161922] to-transparent z-10 pointer-events-none" />

                {/* Header overlay */}
                <div className="absolute top-0 left-0 right-0 z-20 px-6 pt-5 flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-2 pointer-events-auto">
                        <div className="p-1.5 bg-blue-500/20 rounded-lg">
                            <Radio size={14} className="text-blue-400" />
                        </div>
                        <span className="text-white font-black text-sm">Live Fleet</span>
                        <div className="flex items-center gap-1.5 ml-2 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/5">
                            <div
                                className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected'
                                        ? 'bg-green-500 animate-pulse'
                                        : 'bg-yellow-400 animate-pulse'
                                    }`}
                            />
                            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                                {isLive ? 'LIVE' : 'DEMO'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pointer-events-auto">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/5 text-[10px] font-bold text-gray-400">
                            <Users size={11} className="text-blue-400" />
                            {activePlumbers.length}
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/5 text-[10px] font-bold text-gray-400">
                            <AlertCircle size={11} className="text-red-400" />
                            {pendingJobs.length}
                        </div>
                    </div>
                </div>

                {/* Bottom gradient */}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#161922] to-transparent z-10 pointer-events-none" />
            </div>

            {/* View Full Map link */}
            <Link
                href="/fleet"
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-blue-600/90 backdrop-blur-sm text-white text-xs font-bold hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 group/btn"
            >
                Open Fleet Map
                <ArrowUpRight
                    size={14}
                    className="group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform"
                />
            </Link>
        </div>
    );
}
