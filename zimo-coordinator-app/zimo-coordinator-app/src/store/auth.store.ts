import { create } from 'zustand';
import { authApi, coordinatorApi } from '@/services/api';
import { tokenStorage } from '@/services/api/client';
import type { Coordinator } from '@/types';

interface AuthState {
  coordinator: Coordinator | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  coordinator: null,
  isAuthenticated: false,
  isLoading: true,

  loadSession: async () => {
    set({ isLoading: true });
    try {
      const token = await tokenStorage.getAccess();
      if (!token) {
        set({ isAuthenticated: false, isLoading: false });
        return;
      }
      const { data } = await coordinatorApi.me();
      set({ coordinator: data.data, isAuthenticated: true, isLoading: false });
    } catch {
      await tokenStorage.clear();
      set({ coordinator: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password) => {
    const { data } = await authApi.login({ email, password });
    try {
      await tokenStorage.setTokens(data.data.accessToken, data.data.refreshToken);
    } catch (err) {
      const details = err instanceof Error && err.message
        ? ` ${err.message}`
        : '';
      throw new Error(`Login succeeded but failed to save your session securely.${details}`);
    }
    set({ coordinator: data.data.coordinator, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors — clear local state regardless
    }
    await tokenStorage.clear();
    set({ coordinator: null, isAuthenticated: false });
  },
}));
