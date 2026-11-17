import { create } from 'zustand';
import axios from 'axios';
import * as Network from 'expo-network';
import { authApi } from '@/services/api';
import { extractAuthPayload } from '@/services/api/authPayload';
import { API_BASE_URL, onCredentialsRejected, tokenStorage } from '@/services/api/client';
import type { Coordinator } from '@/types';

interface AuthState {
  coordinator: Coordinator | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  offlineBootstrapPending: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
  completeOfflineBootstrap: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  coordinator: null,
  isAuthenticated: false,
  isLoading: true,
  offlineBootstrapPending: false,

  loadSession: async () => {
    set({ isLoading: true });
    try {
      const token = await tokenStorage.getAccess();
      const coordinator = await tokenStorage.getCoordinator<Coordinator>();
      if (!token || !coordinator) {
        set({ isAuthenticated: false, isLoading: false });
        return;
      }

      set({ coordinator, isAuthenticated: true, isLoading: false });
      void refreshSessionSilently();
    } catch (error) {
      console.error('Saved session could not be restored securely.', error);
      set({ isLoading: false });
    }
  },

  login: async (email, password) => {
    const { data } = await authApi.login({ email, password });
    const auth = extractAuthPayload(data);
    if (!auth.coordinator) {
      throw new Error('Login response did not include a coordinator profile.');
    }
    try {
      await tokenStorage.setTokens(auth.accessToken, auth.refreshToken);
      await tokenStorage.setCoordinator(auth.coordinator);
    } catch (err) {
      const details = err instanceof Error && err.message
        ? ` ${err.message}`
        : '';
      throw new Error(`Login succeeded but failed to save your session securely.${details}`);
    }
    set({
      coordinator: auth.coordinator,
      isAuthenticated: true,
      isLoading: false,
      offlineBootstrapPending: true,
    });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors — clear local state regardless
    }
    await tokenStorage.clear();
    set({ coordinator: null, isAuthenticated: false, offlineBootstrapPending: false });
  },

  completeOfflineBootstrap: () => set({ offlineBootstrapPending: false }),
}));

async function refreshSessionSilently(): Promise<void> {
  try {
    const refreshToken = await tokenStorage.getRefresh();
    if (!refreshToken) return;

    const network = await Network.getNetworkStateAsync();
    if (!network.isConnected || network.isInternetReachable === false) return;

    const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken }, { timeout: 15000 });
    const tokens = extractAuthPayload(data);
    await tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      useAuthStore.setState({
        coordinator: null,
        isAuthenticated: false,
        offlineBootstrapPending: false,
      });
      try {
        await tokenStorage.clear();
      } catch (clearError) {
        console.error('Rejected session credentials could not be fully cleared.', clearError);
      }
    } else {
      console.warn('Session refresh was skipped because the server is unavailable.', error);
    }
  }
}

onCredentialsRejected(() => {
  useAuthStore.setState({
    coordinator: null,
    isAuthenticated: false,
    offlineBootstrapPending: false,
  });
});
