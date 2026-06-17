'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Wrench, Mail, Lock, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    console.log('Login attempt with email:', email);

    try {
      if (!supabase) {
        setError('Supabase client is not initialized. Please check your environment variables.');
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        console.error('Login error details:', JSON.stringify(error, null, 2));
        setError(error.message || 'Unknown error');
        setLoading(false);
      } else {
        console.log('Login successful, user:', data.user?.email);
        console.log('Session:', data.session ? 'Present' : 'None');
        if (data.session) {
          console.log('Session access token:', data.session.access_token?.substring(0, 20) + '...');
        }
        router.push('/');
        router.refresh();
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('Exception during login:', err);
      console.error('Exception details:', JSON.stringify(err, null, 2));
      setError('An unexpected error occurred: ' + (err.message || String(err)));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center p-6 text-gray-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-yellow-400 font-bold text-3xl tracking-tighter italic mb-4">
            <div className="p-2 bg-yellow-400 rounded-xl text-black shadow-lg shadow-yellow-500/20">
              <Wrench size={28} />
            </div>
            Lapras
          </div>
          <h1 className="text-xl font-medium text-gray-400">Dispatcher Portal Access</h1>
        </div>

        <div className="bg-[#161616] p-8 rounded-[2rem] border border-gray-800 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2 ml-1">
                Email Address
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-yellow-400 transition-colors" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-[#1f1f1f] border border-gray-800 focus:border-yellow-500/50 outline-none rounded-2xl py-4 pl-12 pr-4 text-sm transition-all placeholder:text-gray-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2 ml-1">
                Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-yellow-400 transition-colors" size={18} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#1f1f1f] border border-gray-800 focus:border-yellow-500/50 outline-none rounded-2xl py-4 pl-12 pr-4 text-sm transition-all placeholder:text-gray-700"
                />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-black py-4 rounded-2xl font-bold transition-all shadow-lg shadow-yellow-500/20 flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  Sign In to Dashboard
                  <Wrench size={18} className="group-hover:rotate-45 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-8 text-gray-600 text-sm">
          Secure end-to-end encrypted dispatcher session
        </p>
      </div>
    </div>
  );
}