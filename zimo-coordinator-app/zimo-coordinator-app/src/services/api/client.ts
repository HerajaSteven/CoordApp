import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as Network from 'expo-network';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { extractAuthPayload } from '@/services/api/authPayload';
import { Sentry } from '@/config/sentry';

declare module 'axios' {
  interface AxiosRequestConfig {
    retryOnNetworkError?: boolean;
    maxNetworkRetries?: number;
  }
}

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

const DEFAULT_NETWORK_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 350;
const RETRYABLE_METHODS = new Set(['get', 'head', 'options']);

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

type RequestMeta = {
  startedAt: number;
  appStateAtRequest: AppStateStatus;
  requestId: string;
};

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _retryCount?: number;
  _meta?: RequestMeta;
  retryOnNetworkError?: boolean;
  maxNetworkRetries?: number;
};

let currentAppState: AppStateStatus = AppState.currentState;
let lastAppStateChangeAt = Date.now();

AppState.addEventListener('change', (nextState) => {
  currentAppState = nextState;
  lastAppStateChangeAt = Date.now();
});

function isRetriableNetworkError(error: AxiosError): boolean {
  if (error.response) return false;

  const code = error.code?.toUpperCase();
  return (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    error.message === 'Network Error' ||
    error.message.toLowerCase().includes('timeout')
  );
}

function shouldRetryRequest(config?: RetryableRequestConfig): boolean {
  if (!config) return false;

  if (config.retryOnNetworkError === true) return true;

  const method = (config.method ?? 'get').toLowerCase();
  return RETRYABLE_METHODS.has(method);
}

function getRetryDelayMs(retryCount: number): number {
  const exponentialBackoff = DEFAULT_RETRY_DELAY_MS * 2 ** retryCount;
  const jitter = Math.floor(Math.random() * 120);
  return exponentialBackoff + jitter;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getNetworkStateSnapshot(): Promise<Record<string, unknown>> {
  try {
    const state = await Network.getNetworkStateAsync();
    return {
      networkType: state.type,
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
    };
  } catch {
    return { networkStateReadFailed: true };
  }
}

// Attach access token to every request
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const requestConfig = config as RetryableRequestConfig;
  requestConfig._meta = {
    startedAt: Date.now(),
    appStateAtRequest: currentAppState,
    requestId: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
  };

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
    const original = error.config as RetryableRequestConfig | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
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

    if (isRetriableNetworkError(error) && shouldRetryRequest(original)) {
      const retryCount = original?._retryCount ?? 0;
      const maxRetries = original?.maxNetworkRetries ?? DEFAULT_NETWORK_RETRIES;

      if (original && retryCount < maxRetries) {
        original._retryCount = retryCount + 1;
        await sleep(getRetryDelayMs(retryCount));
        return api(original);
      }
    }

    // Report genuine server errors (5xx) and network failures to Sentry.
    // Skip 4xx — those are expected validation/permission responses the UI
    // already handles, and reporting every one would just be noise.
    const status = error.response?.status;
    if (!status || status >= 500) {
      const meta = original?._meta;
      const now = Date.now();
      const network = await getNetworkStateSnapshot();

      Sentry.captureException(error, {
        tags: {
          axios_error: !status ? 'network_or_timeout' : 'server_error',
          axios_code: error.code ?? 'unknown',
        },
        extra: {
          url: original?.url,
          method: original?.method,
          status,
          code: error.code,
          baseURL: original?.baseURL,
          timeoutMs: original?.timeout,
          retryCount: original?._retryCount ?? 0,
          maxNetworkRetries: original?.maxNetworkRetries ?? DEFAULT_NETWORK_RETRIES,
          requestId: meta?.requestId,
          requestAppState: meta?.appStateAtRequest,
          currentAppState,
          msSinceLastAppStateChange: now - lastAppStateChangeAt,
          requestDurationMs: meta ? now - meta.startedAt : undefined,
          ...network,
        }
      });
    }

    return Promise.reject(error);
  }
);
