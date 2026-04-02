'use client';

import React, { useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Wrench, Users, Search, Bell, Plus,
  AlertCircle, Clock, Navigation, ChevronRight
} from 'lucide-react';
import FleetMap, { type Job } from '@/components/FleetMap';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const stats = [
  { label: 'Total Jobs', value: 8, icon: Wrench, color: 'text-gray-400' },
  { label: 'Pending', value: 4, icon: Clock, color: 'text-orange-400' },
  { label: 'In Progress', value: 3, icon: Navigation, color: 'text-blue-400' },
  { label: 'Emergencies', value: 2, icon: AlertCircle, color: 'text-red-500' },
];

const initialJobs: Job[] = [
  { id: '#8740BC', title: 'Sewer Leak - Basement', customer: 'Sarah Mitchell', address: '142 Oak Street, Suite 8', date: 'Mar 27, 2026', priority: 'EMERGENCY', status: 'Pending', color: 'border-l-red-500', lat: 45.523062, lng: -122.676482 },
  { id: '#8740BD', title: 'Water Heater Replacement', customer: 'James Rodriguez', address: '890 Pine Avenue, Apt 3', date: 'Mar 27, 2026', priority: 'HIGH', status: 'In Progress', color: 'border-l-orange-500', assigned: 'Mike Henderson', lat: 45.543062, lng: -122.656482 },
  { id: '#8740BE', title: 'Kitchen Faucet Install', customer: 'Emily Chen', address: '2450 Willow Creek Dr', date: 'Mar 28, 2026', priority: 'MEDIUM', status: 'Pending', color: 'border-l-blue-500', lat: 45.513062, lng: -122.686482 },
  { id: '#8740BF', title: 'Pipe Burst - Emergency', customer: 'David Thompson', address: '78 Riverdale Rd, Beaverton', date: 'Mar 27, 2026', priority: 'EMERGENCY', status: 'In Progress', color: 'border-l-red-500', assigned: 'Carlos Vega', lat: 45.483062, lng: -122.806482 },
  { id: '#8740C0', title: 'Toilet Repair', customer: 'Lisa Park', address: '3320 Maple Lane, Lake Oswego', date: 'Mar 26, 2026', priority: 'LOW', status: 'Completed', color: 'border-l-green-500', assigned: 'Tony Russo', lat: 45.413062, lng: -122.666482 },
  { id: '#8740C1', title: 'Drain Cleaning - Main Line', customer: 'Robert Kim', address: '567 Cedar Blvd, Tigard', date: 'Mar 28, 2026', priority: 'HIGH', status: 'Pending', color: 'border-l-orange-500', lat: 45.433062, lng: -122.776482 },
];

export default function Dashboard() {
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  return (
    <div className="min-h-screen bg-[#0f1117] text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Top Navigation */}
      <nav className="flex items-center justify-between px-6 py-3 bg-[#161922] border-b border-gray-800 sticky top-0 z-50">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2 text-blue-400 font-bold text-2xl tracking-tighter italic">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white shadow-lg shadow-blue-500/20"><Wrench size={22}/></div>
            Lapras
          </div>
          <div className="flex gap-8 text-sm font-medium text-gray-400">
            <span className="flex items-center gap-2 text-white cursor-pointer hover:text-blue-400 transition-all group">
              <Users size={18} className="group-hover:scale-110 transition-transform"/>
              Live Fleet
              <span className="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full text-[10px]">4 Online</span>
            </span>
            <span className="cursor-pointer hover:text-white transition-colors">Customers</span>
            <span className="cursor-pointer hover:text-white transition-colors">Analytics</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={16}/>
            <input
              placeholder="Search active jobs..."
              className="bg-[#1f232d] border border-transparent focus:border-blue-500/50 outline-none rounded-xl py-2.5 pl-10 pr-4 text-sm w-72 transition-all placeholder:text-gray-600"
            />
          </div>
          <div className="p-2.5 bg-[#1f232d] rounded-xl text-gray-400 cursor-pointer hover:text-white hover:bg-[#2a2f3a] transition-all relative">
            <Bell size={20}/>
            <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#1f232d]"></div>
          </div>
          <button className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 font-bold transition-all shadow-lg shadow-blue-600/20">
            <Plus size={20}/> New Job
          </button>
        </div>
      </nav>

      <main className="p-8 max-w-[1680px] mx-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {stats.map((stat, i) => (
            <div key={i} className="bg-[#161922] p-6 rounded-3xl border border-gray-800/50 hover:border-gray-700 transition-colors flex items-center gap-6 group">
              <div className={cn(
                "p-4 rounded-2xl bg-[#1f232d] group-hover:scale-110 transition-transform bg-opacity-10",
                stat.color
              )}>
                <stat.icon size={32}/>
              </div>
              <div>
                <div className="text-3xl font-black tracking-tight">{stat.value}</div>
                <div className="text-gray-500 text-[11px] font-bold uppercase tracking-[0.1em] mt-0.5">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Job Board */}
          <div className="flex-1">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Active Job Board</h2>
                <p className="text-gray-500 text-sm mt-1">Real-time status of all field operations</p>
              </div>
              <div className="flex gap-2 p-1 bg-[#161922] rounded-xl border border-gray-800">
                {['All', 'Pending', 'Active'].map(tab => (
                  <button key={tab} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${tab === 'All' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-white'}`}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6 mb-12">
              {initialJobs.map((job, i) => (
                <div
                  key={i}
                  onClick={() => setActiveJob(job)}
                  className={cn(
                    "bg-[#161922] p-6 rounded-[2rem] border-l-[6px] border-t border-r border-b border-gray-800/40 hover:bg-[#1c202b] transition-all cursor-pointer group hover:shadow-2xl hover:shadow-black/40",
                    job.color,
                    activeJob?.id === job.id && "ring-2 ring-blue-500/50 bg-[#1c202b]"
                  )}
                >
                   <div className="flex justify-between items-start mb-6">
                      <div className="p-3 bg-[#1f232d] rounded-2xl text-gray-400 group-hover:text-blue-400 transition-colors"><Wrench size={20}/></div>
                      <div className="text-right">
                        <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest leading-none mb-1">ID {job.id}</div>
                        <div className="text-[10px] text-gray-600 font-medium italic">{job.date}</div>
                      </div>
                   </div>

                   <h3 className="font-black text-xl mb-2 group-hover:text-blue-50 text-white transition-colors">{job.title}</h3>

                   <div className="space-y-2 mb-6">
                      <div className="flex items-center gap-2 text-sm text-gray-300 font-medium">
                        <Users size={14} className="text-blue-500/50"/> {job.customer}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Navigation size={14} className="opacity-30"/> {job.address}
                      </div>
                   </div>

                   <div className="flex justify-between items-center pt-5 border-t border-gray-800/60">
                      <span className={cn(
                        "text-[10px] font-black px-3 py-1.5 rounded-full tracking-wider",
                        job.priority === 'EMERGENCY' && 'bg-red-500/10 text-red-500 border border-red-500/20',
                        job.priority === 'HIGH' && 'bg-orange-500/10 text-orange-500 border border-orange-500/20',
                        job.priority !== 'EMERGENCY' && job.priority !== 'HIGH' && 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                      )}>
                        {job.priority}
                      </span>
                      <div className="flex items-center gap-2 group/status">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]",
                          job.status === 'In Progress' ? 'bg-blue-400 animate-pulse' :
                          job.status === 'Completed' ? 'bg-green-500' : 'bg-orange-400'
                        )}></div>
                        <span className="text-[11px] font-bold text-gray-300 group-hover/status:text-white transition-colors">{job.status}</span>
                        <ChevronRight size={14} className="text-gray-700 group-hover/status:translate-x-1 transition-transform"/>
                      </div>
                   </div>

                   {job.assigned && (
                    <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-blue-500/5 rounded-xl border border-blue-500/10">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                      <span className="text-[10px] text-blue-400 font-bold uppercase tracking-tight">Assigned: {job.assigned}</span>
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
          <aside className="w-full lg:w-96 bg-[#161922] p-8 rounded-[2.5rem] border border-gray-800/50 self-start shadow-xl">
            <div className="flex justify-between items-center mb-10">
              <h3 className="font-black text-lg flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg"><Navigation size={18} className="text-blue-400"/></div>
                Activity Feed
              </h3>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
            </div>

            <div className="space-y-8 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-800/50">
              {[
                { name: 'Carlos Vega', action: 'arrived at', job: 'Pipe Burst - Emer...', time: '14 min ago', color: 'bg-green-500' },
                { name: 'Mike Henderson', action: 'started job', job: 'Water Heater Rep...', time: '42 min ago', color: 'bg-blue-500' },
                { name: 'System', action: 'auto-matched', job: 'Sewer Leak - Base...', time: '1 hr ago', color: 'bg-purple-500' },
                { name: 'Tony Russo', action: 'completed', job: 'Toilet Repair', time: '2 hr ago', color: 'bg-green-500' },
                { name: 'Gas leak', action: 'reported at', job: '445 Birch Court', time: '3 hr ago', color: 'bg-red-500' },
              ].map((activity, i) => (
                <div key={i} className="flex gap-6 items-start relative z-10 group">
                  <div className={`mt-1.5 w-3.5 h-3.5 rounded-full border-[3px] border-[#161922] shadow-sm shrink-0 transition-transform group-hover:scale-125 ${activity.color}`}></div>
                  <div className="flex-1">
                    <div className="text-sm leading-relaxed">
                      <span className="font-black text-white">{activity.name}</span>
                      <span className="text-gray-500 mx-1.5">{activity.action}</span>
                      <span className="text-blue-400 font-bold hover:underline cursor-pointer">{activity.job}</span>
                    </div>
                    <div className="text-[10px] text-gray-600 font-bold mt-1.5 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock size={10}/> {activity.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full mt-12 py-4 bg-[#1f232d] hover:bg-[#252a36] text-gray-400 hover:text-white text-xs font-black uppercase tracking-widest rounded-2xl border border-gray-800 transition-all">
              View Full Audit Log
            </button>
          </aside>
        </div>
      </main>
    </div>
  );
}
