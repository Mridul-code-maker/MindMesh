'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Activity, User as UserIcon, Mail, Lock, ArrowRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const { signup, error: authError, loading } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name || !email || !password) {
      setError('Please fill in all input fields.');
      return;
    }

    const ok = await signup(name, email, password);
    if (ok) {
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 overflow-hidden font-sans radial-glow grid-bg px-4">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/25 mb-4 animate-bounce">
            <Activity className="text-white" size={24} />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Mind<span className="text-teal-400">Mesh</span>
          </h1>
          <p className="text-xs text-slate-400 mt-2 font-medium">
            AI Agent & Data Science Playground Workspace
          </p>
        </div>

        <div className="glass-panel rounded-2xl border border-slate-800 bg-slate-900/50 shadow-2xl p-8 animate-in fade-in duration-300">
          <h2 className="text-xl font-bold text-white mb-6">Create Operator Account</h2>

          {(error || authError) && (
            <div className="p-3 mb-4 rounded-lg bg-red-950/40 border border-red-800 text-red-400 text-xs font-semibold animate-shake">
              {error || authError}
            </div>
          )}

          {success && (
            <div className="p-3 mb-4 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-400 text-xs font-semibold">
              Account created successfully! Redirecting to login...
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Full Name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                  <UserIcon size={14} />
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-200 placeholder-slate-600 text-sm outline-none transition-all"
                  placeholder="Enter full name"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                  <Mail size={14} />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-200 placeholder-slate-600 text-sm outline-none transition-all"
                  placeholder="Enter email address"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                  <Lock size={14} />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-200 placeholder-slate-600 text-sm outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="w-full py-3 px-4 rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-bold text-sm tracking-wide shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
            >
              <span>{loading ? 'Creating Account...' : 'Register Operator'}</span>
              {!loading && <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

          <div className="mt-6 text-center border-t border-slate-800/80 pt-4">
            <Link 
              href="/login" 
              className="text-xs text-teal-400 hover:text-teal-300 transition-colors inline-flex items-center gap-1.5 cursor-pointer font-medium"
            >
              <ArrowLeft size={12} />
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
