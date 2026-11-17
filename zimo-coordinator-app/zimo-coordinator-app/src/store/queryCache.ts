import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { MMKV } from 'react-native-mmkv';

interface CachedQuery {
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
}

const storage = new MMKV({ id: 'field-query-cache' });
const CACHE_KEY = 'queries';
const MAX_CACHED_QUERIES = 250;

function readCache(): CachedQuery[] {
  const raw = storage.getString(CACHE_KEY);
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

export function restoreQueryCache(queryClient: QueryClient): void {
  try {
    for (const cached of readCache()) {
      queryClient.setQueryData(cached.queryKey, cached.data, { updatedAt: cached.updatedAt });
    }
  } catch (error) {
    storage.delete(CACHE_KEY);
    console.warn('Offline query cache could not be restored.', error);
  }

  let writeScheduled = false;
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.query.state.status !== 'success') return;
    if (writeScheduled) return;

    writeScheduled = true;
    queueMicrotask(() => {
      writeScheduled = false;
      const cached: CachedQuery[] = queryClient.getQueryCache()
        .getAll()
        .filter((query) => query.state.status === 'success' && query.state.data !== undefined)
        .map((query) => ({
          queryKey: query.queryKey,
          data: query.state.data,
          updatedAt: query.state.dataUpdatedAt,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_CACHED_QUERIES);
      storage.set(CACHE_KEY, JSON.stringify(cached));
    });
  });
}
