'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Activity, Shield, User as UserIcon, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, initialize, user, loading, error } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showSeedTips, setShowSeedTips] = useState(true);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    const success = await login(email, password);
    if (success) {
      router.push('/dashboard');
    }
  };

  const fillCredentials = (role: 'admin' | 'member') => {
    if (role === 'admin') {
      setEmail('admin@mindmesh.com');
      setPassword('Mridul123!');
    } else {
      setEmail('member@mindmesh.com');
      setPassword('Mridul123!');
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 overflow-hidden font-sans radial-glow grid-bg px-4">
      {/* Background decoration elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Brand Header */}
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

        {/* Login Form Panel */}
        <div className="glass-panel rounded-2xl border border-slate-800 bg-slate-900/50 shadow-2xl p-8 mb-6 animate-in fade-in duration-300">
          <h2 className="text-xl font-bold text-white mb-6">Workspace Sign In</h2>

          {error && (
            <div className="p-3 mb-4 rounded-lg bg-red-950/40 border border-red-800 text-red-400 text-xs font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                  <UserIcon size={14} />
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
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-bold text-sm tracking-wide shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
            >
              <span>{loading ? 'Authenticating...' : 'Access Workspace'}</span>
              {!loading && <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>
        </div>

        {/* Demo Seed Credentials Panel */}
        {showSeedTips && (
          <div className="p-5 rounded-2xl border border-teal-900/30 bg-teal-950/20 backdrop-blur-md animate-in slide-in-from-bottom-6 duration-300">
            <div className="flex items-center justify-between mb-3 border-b border-teal-900/20 pb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                <Shield size={10} />
                Evaluator Quick Logins
              </span>
              <button 
                onClick={() => setShowSeedTips(false)}
                className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3.5">
              <button
                onClick={() => fillCredentials('admin')}
                className="p-3 text-left rounded-xl bg-slate-900/70 border border-slate-800 hover:border-teal-500/50 hover:bg-slate-900 transition-all text-xs cursor-pointer group"
              >
                <div className="font-bold text-slate-200 group-hover:text-teal-400 flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-teal-500" />
                  Admin Account
                </div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono">admin@mindmesh.com</div>
              </button>

              <button
                onClick={() => fillCredentials('member')}
                className="p-3 text-left rounded-xl bg-slate-900/70 border border-slate-800 hover:border-teal-500/50 hover:bg-slate-900 transition-all text-xs cursor-pointer group"
              >
                <div className="font-bold text-slate-200 group-hover:text-teal-400 flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-teal-500" />
                  Member Account
                </div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono">member@mindmesh.com</div>
              </button>
            </div>
            <div className="text-[10px] text-teal-600/75 mt-2.5 text-center font-mono">
              Password for both: <span className="font-bold text-teal-500">Mridul123!</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
