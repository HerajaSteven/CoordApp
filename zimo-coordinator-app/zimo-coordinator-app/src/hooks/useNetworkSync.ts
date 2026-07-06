import { useEffect, useRef } from 'react';
import * as Network from 'expo-network';
import { useOfflineStore } from '@/store/offline.store';

/**
 * Polls network state every 10 seconds. When connectivity is restored
 * and there are items in the offline queue, triggers a sync automatically.
 * Drop this hook into the root layout so it runs for the entire app session.
 */
export function useNetworkSync() {
  const { queue, sync, isSyncing } = useOfflineStore();
  const wasOffline = useRef(false);

  useEffect(() => {
    const check = async () => {
      const state = await Network.getNetworkStateAsync();
      const isOnline = state.isConnected && state.isInternetReachable !== false;

      if (!isOnline) {
        wasOffline.current = true;
        return;
      }

      // Just came back online and we have pending items
      if (wasOffline.current && queue.length > 0 && !isSyncing) {
        wasOffline.current = false;
        sync();
      }
    };

    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [queue.length, isSyncing, sync]);
}
