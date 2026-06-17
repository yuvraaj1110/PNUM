'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Loader2, Check, Ban, Wrench } from 'lucide-react';

/**
 * Agentic Dispatch Copilot panel.
 *
 * Talks to POST /api/copilot. The server holds no state — this component
 * carries the full Anthropic transcript (`transcript`) and replays it on
 * every request. When the copilot wants to assign a job it returns a
 * `pendingConfirmation`; we render Approve / Deny and re-post with `confirm`.
 */

interface DisplayMsg {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

// Anthropic MessageParam — kept opaque on the client; we just shuttle it.
type Transcript = Array<{ role: string; content: unknown }>;

interface PendingConfirmation {
  tool: string;
  input: Record<string, unknown>;
}

const SUGGESTIONS = [
  'Who can take the fastest emergency right now?',
  'Show me all pending jobs',
  'Which technicians are active?',
];

export default function CopilotPanel() {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState<DisplayMsg[]>([]);
  const [transcript, setTranscript] = useState<Transcript>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [display, loading, pending]);

  function handleData(data: {
    messages?: Transcript;
    reply?: string;
    pendingConfirmation?: PendingConfirmation;
    error?: string;
  }) {
    if (data.error) {
      setDisplay((d) => [...d, { role: 'system', text: `⚠️ ${data.error}` }]);
      return;
    }
    if (data.messages) setTranscript(data.messages);
    if (data.reply) setDisplay((d) => [...d, { role: 'assistant', text: data.reply! }]);
    setPending(data.pendingConfirmation ?? null);
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setInput('');
    setPending(null);
    setDisplay((d) => [...d, { role: 'user', text }]);
    const nextTranscript: Transcript = [...transcript, { role: 'user', content: text }];
    setTranscript(nextTranscript);
    setLoading(true);
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextTranscript }),
      });
      handleData(await res.json());
    } catch {
      setDisplay((d) => [...d, { role: 'system', text: '⚠️ Network error reaching the copilot.' }]);
    } finally {
      setLoading(false);
    }
  }

  async function confirm(approve: boolean) {
    if (loading) return;
    setDisplay((d) => [
      ...d,
      { role: 'system', text: approve ? '✅ Assignment approved' : '🚫 Assignment declined' },
    ]);
    setPending(null);
    setLoading(true);
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: transcript, confirm: { approve } }),
      });
      handleData(await res.json());
    } catch {
      setDisplay((d) => [...d, { role: 'system', text: '⚠️ Network error reaching the copilot.' }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[9998] flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold shadow-2xl shadow-yellow-500/30 transition-all active:scale-95"
      >
        <Sparkles size={18} />
        Dispatch Copilot
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9998] w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-3rem)] flex flex-col bg-[#0f0f0f] border border-gray-800/80 rounded-[1.75rem] shadow-2xl shadow-black/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60 bg-[#161616]">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/15 rounded-xl border border-yellow-500/20">
            <Sparkles size={18} className="text-yellow-400" />
          </div>
          <div>
            <div className="text-white font-black text-sm">Dispatch Copilot</div>
            <div className="text-[10px] text-gray-500 font-medium">Agentic · powered by Claude + MCP tools</div>
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin">
        {display.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm mb-4">Ask the copilot about your fleet.</p>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full text-left px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-gray-300 text-xs hover:bg-white/5 hover:border-yellow-500/20 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {display.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-yellow-400 text-black text-sm whitespace-pre-wrap'
                  : m.role === 'system'
                    ? 'max-w-[90%] px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-gray-400 text-xs'
                    : 'max-w-[85%] px-4 py-2.5 rounded-2xl rounded-bl-md bg-[#1f1f1f] text-gray-200 text-sm whitespace-pre-wrap'
              }
            >
              {m.text}
            </div>
          </div>
        ))}

        {/* Pending assignment confirmation */}
        {pending && (
          <div className="px-4 py-4 rounded-2xl bg-orange-500/5 border border-orange-500/20">
            <div className="flex items-center gap-2 text-orange-400 text-xs font-black uppercase tracking-wider mb-2">
              <Wrench size={13} /> Confirm assignment
            </div>
            <p className="text-gray-300 text-xs mb-3">
              The copilot wants to assign job{' '}
              <span className="font-mono text-gray-400">{String(pending.input.job_id ?? '').slice(0, 8)}…</span> to
              technician{' '}
              <span className="font-mono text-gray-400">{String(pending.input.technician_id ?? '').slice(0, 8)}…</span>.
              This updates the database.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => confirm(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-bold transition-all"
              >
                <Check size={14} /> Approve
              </button>
              <button
                onClick={() => confirm(false)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#1f1f1f] hover:bg-[#2a2a2a] text-gray-300 text-xs font-bold border border-gray-800 transition-all"
              >
                <Ban size={14} /> Decline
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-xs px-2">
            <Loader2 size={14} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="p-3 border-t border-gray-800/60 bg-[#161616]"
      >
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about jobs, technicians, dispatch…"
            disabled={loading}
            className="flex-1 bg-[#1f1f1f] border border-gray-800 focus:border-yellow-500/50 outline-none rounded-xl py-2.5 px-4 text-sm text-white placeholder:text-gray-600 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black disabled:opacity-40 transition-all"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
