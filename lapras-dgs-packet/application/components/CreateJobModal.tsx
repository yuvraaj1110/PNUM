'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X, Wrench, User, MapPin, AlertTriangle, FileText,
  ChevronDown, Loader2, CheckCircle2, Radio
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ActivePlumber {
  id: string;
  full_name: string;
  specialty?: string;
  status: string;
}

interface CreateJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobCreated?: () => void;
}

const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  { value: 'high', label: 'High', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  { value: 'emergency', label: 'Emergency', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
] as const;

export default function CreateJobModal({ isOpen, onClose, onJobCreated }: CreateJobModalProps) {
  // ── Form State ──
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string>('medium');
  const [assignMode, setAssignMode] = useState<'later' | 'now'>('later');
  const [selectedPlumberId, setSelectedPlumberId] = useState<string>('');

  // ── Async State ──
  const [activePlumbers, setActivePlumbers] = useState<ActivePlumber[]>([]);
  const [loadingPlumbers, setLoadingPlumbers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // ── Fetch active plumbers when "Assign Now" is selected ──
  useEffect(() => {
    if (assignMode !== 'now' || !supabase) return;

    setLoadingPlumbers(true);
    supabase
      .from('profiles')
      .select('id, full_name, specialty, status')
      .eq('status', 'active')
      .then(({ data, error: fetchErr }) => {
        if (fetchErr) {
          console.error('Failed to fetch active plumbers:', fetchErr);
          setActivePlumbers([]);
        } else {
          setActivePlumbers((data as ActivePlumber[]) || []);
        }
        setLoadingPlumbers(false);
      });
  }, [assignMode]);

  // ── ESC key handler ──
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // ── Reset form when modal opens ──
  useEffect(() => {
    if (isOpen) {
      setCustomerName('');
      setAddress('');
      setJobTitle('');
      setDescription('');
      setPriority('medium');
      setAssignMode('later');
      setSelectedPlumberId('');
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  // ── Submit handler ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!customerName.trim() || !address.trim() || !jobTitle.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    if (assignMode === 'now' && !selectedPlumberId) {
      setError('Please select a technician or switch to "Assign Later".');
      return;
    }

    setSubmitting(true);

    try {
      // Call the server-side API route (bypasses RLS)
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          address: address.trim(),
          jobTitle: jobTitle.trim(),
          description: description.trim(),
          priority,
          assignMode,
          selectedPlumberId: assignMode === 'now' ? selectedPlumberId : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create job');
      }

      // Success!
      setSuccess(true);
      onJobCreated?.();

      // Auto-close after brief success animation
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };


  if (!isOpen) return null;

  return (
    // ── Overlay ──
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0f0f0f] border border-gray-800/80 rounded-[2rem] shadow-2xl shadow-black/60 animate-in"
        style={{
          animation: 'modalSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* ── Success Overlay ── */}
        {success && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0f0f0f]/95 rounded-[2rem]">
            <div className="p-4 bg-green-500/10 rounded-full border border-green-500/20 mb-4">
              <CheckCircle2 size={48} className="text-green-400" />
            </div>
            <h3 className="text-xl font-black text-white">Job Created!</h3>
            <p className="text-sm text-gray-400 mt-1">It will appear on the map momentarily.</p>
          </div>
        )}

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-gray-800/60">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-500/15 rounded-2xl border border-yellow-500/20">
              <Wrench size={24} className="text-yellow-400" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Create New Job</h2>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">Dispatch a new service request</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-[#1f1f1f] hover:bg-[#2a2a2a] text-gray-400 hover:text-white transition-all group"
          >
            <X size={20} className="group-hover:rotate-90 transition-transform duration-200" />
          </button>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-6">
          {/* Customer Section */}
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">
              <User size={12} className="text-yellow-500/60" />
              Customer Information
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <input
                  id="create-job-customer-name"
                  type="text"
                  placeholder="Customer Name *"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-[#161616] border border-gray-800 focus:border-yellow-500/50 outline-none rounded-xl py-3 px-4 text-sm text-white placeholder:text-gray-600 transition-colors"
                  required
                />
              </div>
              <div>
                <input
                  id="create-job-address"
                  type="text"
                  placeholder="Address *"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-[#161616] border border-gray-800 focus:border-yellow-500/50 outline-none rounded-xl py-3 px-4 text-sm text-white placeholder:text-gray-600 transition-colors"
                  required
                />
              </div>
            </div>
          </div>

          {/* Job Details Section */}
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">
              <FileText size={12} className="text-yellow-500/60" />
              Job Details
            </label>
            <input
              id="create-job-title"
              type="text"
              placeholder="Job Title (e.g. Pipe Burst - Kitchen) *"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full bg-[#161616] border border-gray-800 focus:border-yellow-500/50 outline-none rounded-xl py-3 px-4 text-sm text-white placeholder:text-gray-600 transition-colors"
              required
            />
            <textarea
              id="create-job-description"
              placeholder="Description (optional — add details for the technician)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-[#161616] border border-gray-800 focus:border-yellow-500/50 outline-none rounded-xl py-3 px-4 text-sm text-white placeholder:text-gray-600 transition-colors resize-none"
            />
          </div>

          {/* Urgency Level */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">
              <AlertTriangle size={12} className="text-yellow-500/60" />
              Urgency Level
            </label>
            <div className="grid grid-cols-4 gap-2">
              {URGENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                    priority === opt.value
                      ? `${opt.bg} ${opt.color} scale-[1.02] shadow-lg`
                      : 'bg-[#161616] border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Technician Assignment */}
          <div className="space-y-4 p-5 bg-[#161616] rounded-2xl border border-gray-800/60">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">
              <MapPin size={12} className="text-yellow-500/60" />
              Technician Assignment
            </label>

            {/* Radio Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setAssignMode('later');
                  setSelectedPlumberId('');
                }}
                className={`flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-bold border transition-all ${
                  assignMode === 'later'
                    ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                    : 'bg-[#161616] border-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                <Radio size={16} className={assignMode === 'later' ? 'text-yellow-400' : 'text-gray-600'} />
                Assign Later
              </button>
              <button
                type="button"
                onClick={() => setAssignMode('now')}
                className={`flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-bold border transition-all ${
                  assignMode === 'now'
                    ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                    : 'bg-[#161616] border-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                <Radio size={16} className={assignMode === 'now' ? 'text-yellow-400' : 'text-gray-600'} />
                Assign Now
              </button>
            </div>

            {/* Technician Dropdown (visible when "Assign Now" selected) */}
            {assignMode === 'now' && (
              <div
                className="mt-2"
                style={{ animation: 'modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
              >
                {loadingPlumbers ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-gray-500 text-sm">
                    <Loader2 size={16} className="animate-spin" />
                    Loading active technicians…
                  </div>
                ) : activePlumbers.length === 0 ? (
                  <div className="py-4 text-center text-gray-500 text-sm">
                    No active technicians available right now.
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      id="create-job-technician"
                      value={selectedPlumberId}
                      onChange={(e) => setSelectedPlumberId(e.target.value)}
                      className="w-full appearance-none bg-[#161616] border border-gray-800 focus:border-yellow-500/50 outline-none rounded-xl py-3 px-4 pr-10 text-sm text-white transition-colors cursor-pointer"
                    >
                      <option value="" className="text-gray-500">Select a technician…</option>
                      {activePlumbers.map((p) => (
                        <option key={p.id} value={p.id} className="text-white">
                          {p.full_name}{p.specialty ? ` — ${p.specialty}` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                    />
                  </div>
                )}

                <p className="mt-2 text-[10px] text-gray-600 font-medium">
                  Assigning now will mark this technician as <span className="text-orange-400">busy</span> and set job status to <span className="text-yellow-400">assigned</span>.
                </p>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/8 border border-red-500/20 rounded-xl text-sm text-red-400">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-xl text-sm font-bold text-gray-400 hover:text-white bg-[#1f1f1f] hover:bg-[#2a2a2a] border border-gray-800 transition-all"
            >
              Cancel
            </button>
            <button
              id="create-job-submit"
              type="submit"
              disabled={submitting}
              className="px-8 py-3 rounded-xl text-sm font-bold text-black bg-yellow-400 hover:bg-yellow-300 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-yellow-500/20 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Wrench size={16} />
                  Create Job
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
