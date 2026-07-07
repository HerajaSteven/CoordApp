import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { extractAuthPayload } from '@/services/api/authPayload';
import { Sentry } from '@/config/sentry';

const RAW_API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim();

function getDefaultApiBaseUrl(): string {
  // Android emulators must call host machine services through 10.0.2.2.
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
  return 'http://localhost:4000';
}

function normalizeApiBaseUrl(url?: string): string {
  const fallback = getDefaultApiBaseUrl();
  if (!url) return fallback;

  if (Platform.OS === 'android' && /localhost|127\.0\.0\.1/.test(url)) {
    return url.replace(/localhost|127\.0\.0\.1/g, '10.0.2.2');
  }

  return url;
}

export const API_BASE_URL = normalizeApiBaseUrl(RAW_API_BASE_URL);

const KEYS = {
  ACCESS_TOKEN: 'zimo_access_token',
  REFRESH_TOKEN: 'zimo_refresh_token',
} as const;

export const tokenStorage = {
  getAccess: () => SecureStore.getItemAsync(KEYS.ACCESS_TOKEN),
  getRefresh: () => SecureStore.getItemAsync(KEYS.REFRESH_TOKEN),
  setTokens: async (access: string, refresh: string) => {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, access),
      SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refresh),
    ]);
  },
  clear: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
    ]);
  },
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  timeoutErrorMessage: 'Request timed out. Server did not respond.',
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await tokenStorage.getAccess();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshQueue.push((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }
      isRefreshing = true;
      try {
        const refreshToken = await tokenStorage.getRefresh();
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        const { accessToken: newAccess, refreshToken: newRefresh } = extractAuthPayload(data);
        await tokenStorage.setTokens(newAccess, newRefresh);
        refreshQueue.forEach((cb) => cb(newAccess));
        refreshQueue = [];
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch {
        await tokenStorage.clear();
        // Signal to auth store to log out
        refreshQueue = [];
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // Report genuine server errors (5xx) and network failures to Sentry.
    // Skip 4xx — those are expected validation/permission responses the UI
    // already handles, and reporting every one would just be noise.
    const status = error.response?.status;
    if (!status || status >= 500) {
      Sentry.captureException(error, {
        extra: { url: original?.url, method: original?.method, status }
      });
    }

    return Promise.reject(error);
  }
);
