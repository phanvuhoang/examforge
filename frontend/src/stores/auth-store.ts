import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  setTokens: (access: string, refresh: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      _hasHydrated: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/api/auth/login', { email, password });
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            isAuthenticated: true,
          });
          // Fetch user after successful login — errors are non-fatal here
          try {
            await get().fetchUser();
          } catch {
            // User fetch can fail due to network issues, keep session alive
          }
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          await api.post('/api/auth/register', { email, password });
          await get().login(email, password);
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        try {
          await api.post('/api/auth/logout');
        } catch {
          // ignore
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      fetchUser: async () => {
        try {
          const { data } = await api.get('/api/auth/me');
          set({ user: data, isAuthenticated: true });
        } catch (error: any) {
          // The axios interceptor handles 401 → refresh → retry automatically.
          // If we reach here with 401, it means refresh also failed.
          // Only then clear the session.
          if (error?.response?.status === 401) {
            // Double-check: only clear if we truly have no valid tokens left
            const state = get();
            if (!state.accessToken && !state.refreshToken) {
              set({ user: null, isAuthenticated: false });
            }
            // If tokens still exist, the interceptor may have already refreshed them.
            // Don't clear auth state in that case — the retry should have succeeded.
          }
          // Network errors, 5xx, etc → keep session alive, just don't set user
        }
      },

      setTokens: (access: string, refresh: string) => {
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ _hasHydrated: true });
      },
    }
  )
);
