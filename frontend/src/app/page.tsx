'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function Home() {
  const router = useRouter();
  const { user, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = window.localStorage.getItem('mindmesh_token');
      if (token) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [user, router]);

  return (
    <div className="flex flex-1 items-center justify-center bg-slate-950 text-slate-400 font-mono text-xs">
      <span>Redirecting to MindMesh workspace...</span>
    </div>
  );
}
