import React from 'react';
import { View, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Text } from '@/components/ui/typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOfflineStore } from '@/store/offline.store';
import { Card, Button, SectionHeader, Badge } from '@/components/ui';

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { queue, clearQueue, isSyncing, lastSyncAt } = useOfflineStore();

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
    const walks = queue.filter((item) => item.collection === 'boundaryWalks');
    const points = walks.reduce(
      (total, item) => total + ((item.payload?.points as unknown[] | undefined)?.length ?? 0),
      0
    );

    const detail = walks.length
      ? `${walks.length} boundary walk${walks.length === 1 ? '' : 's'} (${points} GPS points) `
        + `${walks.length === 1 ? 'is' : 'are'} waiting here and ${walks.length === 1 ? 'has' : 'have'} `
        + 'NOT reached the server. Clearing deletes them permanently — the walks would have to be done again on foot.'
      : `${queue.length} pending item${queue.length === 1 ? '' : 's'} will be deleted permanently.`;

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
              label={queue.length > 0 ? `${queue.length} pending` : 'All synced'}
              variant={queue.length > 0 ? 'yellow' : 'green'}
            />
          </View>

          {lastSyncAt && (
            <Text className="text-xs text-text-3 mb-3">
              Last sync: {new Date(lastSyncAt).toLocaleString()}
            </Text>
          )}

          {/*
            No Sync button. The queue drains itself whenever there is a
            network, so this card reports and does not ask.
          */}
          <Text className="text-xs text-text-3">
            {isSyncing
              ? 'Sending now…'
              : queue.length === 0
                ? 'Everything here has been sent.'
                : 'These will send by themselves as soon as there is a network.'}
          </Text>

          {queue.length > 0 && (
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
        {queue.length > 0 && (
          <>
            <SectionHeader title="Pending Items" />
            {queue.map((item) => (
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
                  <Badge label="Pending" variant="yellow" />
                </View>
              </Card>
            ))}
          </>
        )}

        {queue.length === 0 && (
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
