import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { MMKV } from 'react-native-mmkv';

interface CachedQuery {
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
}

const storage = new MMKV({ id: 'field-query-cache' });
const LEGACY_CACHE_KEY = 'queries';
const CACHE_KEY_PREFIX = 'queries:';
const MAX_CACHED_QUERIES = 250;
let activeCoordinatorId: string | null = null;
let subscriptionRegistered = false;
const OFFLINE_QUERY_PREFIXES = new Set([
  'farms',
  'farm-profile',
  'sites',
  'units',
  'clusters',
  'cluster',
  'verification-record',
  'boundary',
  'evidence-photos',
  'visits',
  'categories',
  'map-config',
  'harvest',
]);

function cacheKey(coordinatorId: string): string {
  return `${CACHE_KEY_PREFIX}${encodeURIComponent(coordinatorId)}`;
}

function readCache(key: string): CachedQuery[] {
  const raw = storage.getString(key);
  if (!raw) return [];

  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) {
    throw new Error('Stored offline query cache has an invalid shape.');
  }

  return value.filter((item): item is CachedQuery => (
    typeof item === 'object'
    && item !== null
    && Array.isArray((item as CachedQuery).queryKey)
    && 'data' in item
    && typeof (item as CachedQuery).updatedAt === 'number'
  ));
}

export function activateQueryCache(queryClient: QueryClient, coordinatorId: string | null): void {
  storage.delete(LEGACY_CACHE_KEY);
  activeCoordinatorId = coordinatorId;
  queryClient.clear();

  if (coordinatorId) {
    const key = cacheKey(coordinatorId);
    try {
      for (const cached of readCache(key)) {
        queryClient.setQueryData(cached.queryKey, cached.data, { updatedAt: cached.updatedAt });
      }
    } catch (error) {
      storage.delete(key);
      console.warn('Offline query cache could not be restored.', error);
    }
  }

  if (subscriptionRegistered) return;
  subscriptionRegistered = true;
  try {
    let writeScheduled = false;
    queryClient.getQueryCache().subscribe((event) => {
      if (!activeCoordinatorId || event.type !== 'updated' || event.query.state.status !== 'success') return;
      if (writeScheduled) return;

      writeScheduled = true;
      queueMicrotask(() => {
        writeScheduled = false;
        const currentCoordinatorId = activeCoordinatorId;
        if (!currentCoordinatorId) return;

        const cached: CachedQuery[] = queryClient.getQueryCache()
          .getAll()
          .filter((query) => query.state.status === 'success' && query.state.data !== undefined)
          .map((query) => ({
            queryKey: query.queryKey,
            data: query.state.data,
            updatedAt: query.state.dataUpdatedAt,
          }))
          .sort((a, b) => b.updatedAt - a.updatedAt);
        const offlineCritical = cached.filter((query) =>
          typeof query.queryKey[0] === 'string'
          && OFFLINE_QUERY_PREFIXES.has(query.queryKey[0])
        );
        const other = cached.filter((query) => !offlineCritical.includes(query))
          .slice(0, Math.max(0, MAX_CACHED_QUERIES - offlineCritical.length));
        storage.set(cacheKey(currentCoordinatorId), JSON.stringify([...offlineCritical, ...other]));
      });
    });
  } catch (error) {
    subscriptionRegistered = false;
    throw error;
  }
}
