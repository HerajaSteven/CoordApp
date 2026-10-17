import { useEffect, useRef } from 'react';
import * as Network from 'expo-network';
import { useOfflineStore } from '@/store/offline.store';

/**
 * Drains the offline queue by itself, which is the only way it should ever
 * be drained.
 *
 * A coordinator works where there is no signal. Asking them to remember to
 * press Sync when they get back to town is asking them to remember the one
 * thing the app knows better than they do — so there is no Sync button
 * anywhere any more, and this runs for the whole session from the root
 * layout.
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
  const { queue, sync, isSyncing } = useOfflineStore();

  /*
    Read through a ref so the interval is not torn down and rebuilt on every
    queue change, which would reset the 10-second clock each time a
    coordinator saved something.
  */
  const latest = useRef({ queue, sync, isSyncing });
  latest.current = { queue, sync, isSyncing };

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { queue: pending, sync: run, isSyncing: busy } = latest.current;

      if (pending.length === 0 || busy) {
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

      if (online && !cancelled) {
        run();
      }
    };

    void check();
    const interval = setInterval(() => void check(), 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
}
