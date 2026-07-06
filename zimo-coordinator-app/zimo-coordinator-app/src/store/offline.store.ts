import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import * as Crypto from 'expo-crypto';
import { syncApi } from '@/services/api';
import type { OfflineQueueItem, SyncCollection } from '@/types';

const storage = new MMKV({ id: 'offline-queue' });
const QUEUE_KEY = 'queue';

function generateId(): string {
  return Crypto.randomUUID();
}

function loadQueue(): OfflineQueueItem[] {
  try {
    const raw = storage.getString(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(items: OfflineQueueItem[]) {
  storage.set(QUEUE_KEY, JSON.stringify(items));
}

interface OfflineState {
  queue: OfflineQueueItem[];
  isSyncing: boolean;
  lastSyncAt: number | null;
  enqueue: (
    collection: SyncCollection,
    appId: string,
    payload: Record<string, unknown>
  ) => void;
  sync: () => Promise<{ synced: number; conflicts: number; errors: number }>;
  clearQueue: () => void;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  queue: loadQueue(),
  isSyncing: false,
  lastSyncAt: null,

  enqueue: (collection, appId, payload) => {
    const item: OfflineQueueItem = {
      clientId: generateId(),
      collection,
      appId,
      payload,
      clientTimestamp: new Date().toISOString(),
      createdAt: Date.now(),
    };
    const updated = [...get().queue, item];
    saveQueue(updated);
    set({ queue: updated });
  },

  sync: async () => {
    const { queue, isSyncing } = get();
    if (isSyncing || queue.length === 0) {
      return { synced: 0, conflicts: 0, errors: 0 };
    }
    set({ isSyncing: true });
    try {
      const { data } = await syncApi.batch(queue);
      const summary = data.data.summary as {
        synced: number;
        conflicts: number;
        errors: number;
        duplicates: number;
      };
      // Remove successfully synced items; keep conflicts and errors for retry
      const results = data.data.results as Array<{
        clientId: string;
        status: string;
      }>;
      const successIds = new Set(
        results.filter((r) => r.status === 'synced' || r.status === 'duplicate').map((r) => r.clientId)
      );
      const remaining = queue.filter((item) => !successIds.has(item.clientId));
      saveQueue(remaining);
      set({ queue: remaining, lastSyncAt: Date.now() });
      return { synced: summary.synced, conflicts: summary.conflicts, errors: summary.errors };
    } finally {
      set({ isSyncing: false });
    }
  },

  clearQueue: () => {
    storage.delete(QUEUE_KEY);
    set({ queue: [] });
  },
}));
