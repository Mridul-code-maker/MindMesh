import { create } from 'zustand';
import axios from 'axios';

// Get API base URL
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:5000`
  : 'http://localhost:5000');

// Setup axios default configurations
export const api = axios.create({
  baseURL: API_BASE
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('mindmesh_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'Admin' | 'Member';
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  initialize: () => void;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: false,
  error: null,

  initialize: () => {
    if (typeof window !== 'undefined') {
      const savedToken = window.localStorage.getItem('mindmesh_token');
      const savedUserStr = window.localStorage.getItem('mindmesh_user');
      
      if (savedToken && savedUserStr) {
        try {
          const savedUser = JSON.parse(savedUserStr);
          set({ token: savedToken, user: savedUser, error: null });
        } catch (e) {
          window.localStorage.removeItem('mindmesh_token');
          window.localStorage.removeItem('mindmesh_user');
        }
      }
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/api/v1/auth/login', { email, password });
      const { token, user } = res.data.data;

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('mindmesh_token', token);
        window.localStorage.setItem('mindmesh_user', JSON.stringify(user));
      }

      set({ token, user, loading: false });
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Authentication login failed.';
      set({ error: msg, loading: false });
      return false;
    }
  },

  signup: async (name, email, password) => {
    set({ loading: true, error: null });
    try {
      await api.post('/api/v1/auth/signup', { name, email, password });
      set({ loading: false });
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Account registration failed.';
      set({ error: msg, loading: false });
      return false;
    }
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('mindmesh_token');
      window.localStorage.removeItem('mindmesh_user');
    }
    set({ token: null, user: null, error: null });
  }
}));
