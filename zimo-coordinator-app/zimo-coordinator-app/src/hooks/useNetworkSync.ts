import { useEffect, useRef } from 'react';
import * as Network from 'expo-network';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineStore } from '@/store/offline.store';
import { cacheOfflineReferenceData } from '@/store/offlineBootstrap';
import { useAuthStore } from '@/store/auth.store';

/**
 * Drains the offline queue by itself, which is the only way it should ever
 * be drained.
 *
 * A coordinator may sync manually in the Sync Center; this background
 * drain is the backup that handles reconnection and cold starts.
 *
 * It used to sync only after SEEING the device go offline, because it
 * latched `wasOffline` before comparing. That misses the case that matters
 * most: the app is killed in the field with work queued, and reopened on
 * wifi. Nothing had been observed going offline, so nothing synced, and the
 * queue sat there until somebody found the button. Now any poll that finds
 * the network up and the queue non-empty syncs, which covers a cold start
 * and a reconnection with the same rule.
 *
 * Every 10 seconds. The queue is small and the check is a local system call,
 * so the cost is a timer rather than traffic.
 */
export function useNetworkSync() {
  const queryClient = useQueryClient();
  const { queue, sync, isSyncing, markSyncCompleted } = useOfflineStore();
  const { offlineBootstrapPending, requestOfflineBootstrap, completeOfflineBootstrap } = useAuthStore();

  /*
    Read through a ref so the interval is not torn down and rebuilt on every
    queue change, which would reset the 10-second clock each time a
    coordinator saved something.
  */
  const latest = useRef({
    queue, sync, isSyncing, markSyncCompleted, offlineBootstrapPending, requestOfflineBootstrap, completeOfflineBootstrap,
  });
  latest.current = {
    queue, sync, isSyncing, markSyncCompleted, offlineBootstrapPending, requestOfflineBootstrap, completeOfflineBootstrap,
  };

  useEffect(() => {
    let cancelled = false;
    let checking = false;

    const check = async () => {
      const {
        queue: pending,
        sync: run,
        isSyncing: busy,
        markSyncCompleted: recordSync,
        offlineBootstrapPending: bootstrapPending,
        requestOfflineBootstrap: requestBootstrap,
        completeOfflineBootstrap: completeBootstrap,
      } = latest.current;

      if ((!pending.some((item) => item.status !== 'synced') && !bootstrapPending) || busy) {
        return;
      }

      let online = false;

      try {
        const state = await Network.getNetworkStateAsync();
        online = Boolean(state.isConnected) && state.isInternetReachable !== false;
      } catch {
        /*
          The network module itself failed. Treated as offline: attempting a
          sync here would surface a transport error to somebody who did not
          ask for one.
        */
        return;
      }

      if (online && !cancelled && !checking) {
        checking = true;
        try {
          if (bootstrapPending) {
            if (await cacheOfflineReferenceData(queryClient)) {
              completeBootstrap();
              recordSync();
            }
          }
          const result = await run();
          if (result.synced > 0 && !cancelled) {
            await queryClient.invalidateQueries();
            if (!(await cacheOfflineReferenceData(queryClient))) {
              requestBootstrap();
            }
            recordSync();
          }
        } finally {
          checking = false;
        }
      }
    };

    void check();
    const interval = setInterval(() => void check(), 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [queryClient]);
}
