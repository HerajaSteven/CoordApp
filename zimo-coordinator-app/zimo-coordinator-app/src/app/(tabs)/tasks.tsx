import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text } from '@/components/ui/typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Network from 'expo-network';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineStore } from '@/store/offline.store';
import { cacheOfflineReferenceData } from '@/store/offlineBootstrap';
import { useAuthStore } from '@/store/auth.store';
import { Card, Button, SectionHeader, Badge } from '@/components/ui';

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { queue, boundaryDrafts, clearQueue, isSyncing, lastSyncAt, sync, markSyncCompleted } = useOfflineStore();
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(false);
  const pendingItems = queue.filter((item) => item.status !== 'synced');
  const syncedItems = queue.filter((item) => item.status === 'synced').slice(-20);

  useEffect(() => {
    let active = true;
    const update = (state: Network.NetworkState) => {
      setIsOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    };

    void Network.getNetworkStateAsync().then((state) => {
      if (active) update(state);
    }).catch((error: unknown) => {
      console.warn('Network status could not be read.', error);
    });

    const subscription = Network.addNetworkStateListener(update);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  const queuedBoundaryDraftKeys = new Set(
    queue
      .filter((item) => item.collection === 'boundaryWalks')
      .map((item) => {
        const unitId = item.payload?.unitId;
        return `${item.appId}::${typeof unitId === 'string' ? unitId : ''}`;
      })
  );
  const localBoundaryDrafts = Object.entries(boundaryDrafts).filter(
    ([key, draft]) => draft.points.length > 0 && !queuedBoundaryDraftKeys.has(key)
  );
  const pendingCount = pendingItems.length + localBoundaryDrafts.length;

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;
    try {
      await sync(true);
      await queryClient.invalidateQueries();
      const cacheComplete = await cacheOfflineReferenceData(queryClient);
      if (cacheComplete) {
        useAuthStore.getState().completeOfflineBootstrap();
      } else {
        useAuthStore.getState().requestOfflineBootstrap();
      }
      markSyncCompleted();
    } catch (error) {
      console.error('Manual sync failed.', error);
      Alert.alert('Sync failed', 'Your saved work is still on this device. Try syncing again.');
    }
  };

  /*
    SAY WHAT WOULD BE DESTROYED.

    This warned that clearing "will discard all pending offline data" and
    advised doing it "only if data has already been submitted" — which
    tells somebody nothing about what is in there, and is exactly the
    wrong advice while the queue is holding work the server has not been
    able to take yet. A boundary walk is an hour in a field; it deserves
    to be named before it is deleted.
  */
  const handleClear = () => {
    const walks = pendingItems.filter((item) => item.collection === 'boundaryWalks');
    const points = walks.reduce(
      (total, item) => total + ((item.payload?.points as unknown[] | undefined)?.length ?? 0),
      0
    );

    const detail = walks.length
      ? `${walks.length} boundary walk${walks.length === 1 ? '' : 's'} (${points} GPS points) `
        + `${walks.length === 1 ? 'is' : 'are'} waiting here and ${walks.length === 1 ? 'has' : 'have'} `
        + 'NOT reached the server. Clearing deletes them permanently — the walks would have to be done again on foot.'
      : `${pendingItems.length} pending item${pendingItems.length === 1 ? '' : 's'} will be deleted permanently.`;

    Alert.alert(
      'Clear Offline Queue',
      `${detail}\n\nThis cannot be undone.`,
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Delete anyway', style: 'destructive', onPress: clearQueue },
      ]
    );
  };

  return (
    <ScrollView className="flex-1 bg-bg">
      <View className="bg-white pb-4 px-5 border-b border-border mb-4" style={{ paddingTop: insets.top + 12 }}>
        <Text className="text-xl font-bold text-text">Offline Sync</Text>
        <Text className="text-text-3 text-sm mt-0.5">Work saved on this phone, waiting for a network</Text>
      </View>

      <View className="px-5">
        {/* Sync status card */}
        <Card className="mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="font-bold text-text">Sync Status</Text>
            <Badge
              label={
                pendingCount > 0
                  ? `${pendingCount} pending`
                  : localBoundaryDrafts.length > 0
                    ? `${localBoundaryDrafts.length} on device`
                    : 'All synced'
              }
              variant={pendingCount > 0 ? 'yellow' : 'green'}
            />
          </View>

          {lastSyncAt && (
            <Text className="text-xs text-text-3 mb-3">
              Last sync: {new Date(lastSyncAt).toLocaleString()}
            </Text>
          )}

          <Text className={`text-xs font-semibold mb-2 ${isOnline ? 'text-green-600' : 'text-red-500'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
          <Text className="text-xs text-text-3">
            {isSyncing
              ? 'Uploading saved work, then refreshing server data…'
              : pendingCount === 0
                ? 'No pending work. Sync to refresh server data.'
                : pendingItems.length === 0
                  ? 'Boundary walks saved only on this phone have not been confirmed on the server.'
                : 'These will send by themselves as soon as there is a network.'}
          </Text>

          <Button
            label={isSyncing ? 'Syncing...' : `Sync${pendingCount ? ` (${pendingCount})` : ''}`}
            onPress={handleSync}
            loading={isSyncing}
            disabled={!isOnline || isSyncing}
            fullWidth
            style={{ marginTop: 12 }}
          />

          {pendingItems.length > 0 && (
            <Button
              label="Clear Queue"
              onPress={handleClear}
              variant="danger"
              fullWidth
              style={{ marginTop: 8 }}
              size="sm"
            />
          )}
        </Card>

        {/* Queue items */}
        {pendingItems.length > 0 && (
          <>
            <SectionHeader title="Pending Items" />
            {pendingItems.map((item) => (
              <Card key={item.clientId} className="mb-2">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-text capitalize">
                      {item.collection.replace(/([A-Z])/g, ' $1').trim()}
                    </Text>
                    <Text className="text-xs text-text-3 font-mono mt-0.5">{item.appId}</Text>
                    <Text className="text-xs text-text-3 mt-0.5">
                      {new Date(item.createdAt).toLocaleString()}
                    </Text>
                  </View>
                  <Badge
                    label={item.status === 'failed' ? `Failed · ${item.attempts ?? 0}` : 'Pending'}
                    variant={item.status === 'failed' ? 'red' : 'yellow'}
                  />
                </View>
                {item.lastError ? <Text className="text-xs text-red-500 mt-2">{item.lastError}</Text> : null}
              </Card>
            ))}
          </>
        )}

        {syncedItems.length > 0 && (
          <>
            <SectionHeader title="Recently Synced" />
            {syncedItems.map((item) => (
              <Card key={item.clientId} className="mb-2">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-text capitalize">
                      {item.collection.replace(/([A-Z])/g, ' $1').trim()}
                    </Text>
                    <Text className="text-xs text-text-3 font-mono mt-0.5">{item.appId}</Text>
                  </View>
                  <Badge label="Synced" variant="green" />
                </View>
              </Card>
            ))}
          </>
        )}

        {localBoundaryDrafts.length > 0 && (
          <>
            <SectionHeader title="Boundary Walks Saved on Device" />
            {localBoundaryDrafts.map(([key, draft]) => {
              const separator = key.lastIndexOf('::');
              const appId = separator >= 0 ? key.slice(0, separator) : key;
              const unitId = separator >= 0 ? key.slice(separator + 2) : '';

              return (
                <Card key={key} className="mb-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-text">Boundary walk</Text>
                      <Text className="text-xs text-text-3 font-mono mt-0.5">{appId}</Text>
                      {unitId ? (
                        <Text className="text-xs text-text-3 mt-0.5">Unit: {unitId}</Text>
                      ) : null}
                      <Text className="text-xs text-text-3 mt-0.5">
                        {draft.points.length} GPS points · {draft.endedAt ? 'awaiting upload' : 'unfinished walk'}
                      </Text>
                    </View>
                    <Badge label="On device" variant="yellow" />
                  </View>
                </Card>
              );
            })}
          </>
        )}

        {pendingCount === 0 && (
          <Card className="items-center py-10 mt-2">
            <Text className="text-4xl mb-3">🔄</Text>
            <Text className="font-semibold text-text">Nothing to sync</Text>
            <Text className="text-text-3 text-sm mt-1">All data has been synced to the server.</Text>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
