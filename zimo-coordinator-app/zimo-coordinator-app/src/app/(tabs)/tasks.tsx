import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import * as Network from 'expo-network';
import { useOfflineStore } from '@/store/offline.store';
import { Card, Button, SectionHeader, Badge } from '@/components/ui';

export default function TasksScreen() {
  const { queue, sync, clearQueue, isSyncing, lastSyncAt } = useOfflineStore();

  const handleSync = async () => {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) {
      Alert.alert('No Internet', 'Connect to the internet and try again.');
      return;
    }
    const result = await sync();
    Alert.alert(
      'Sync Complete',
      `Synced: ${result.synced}\nConflicts: ${result.conflicts}\nErrors: ${result.errors}`
    );
  };

  const handleClear = () => {
    Alert.alert(
      'Clear Offline Queue',
      'This will discard all pending offline data. Only do this if data has already been submitted. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearQueue },
      ]
    );
  };

  return (
    <ScrollView className="flex-1 bg-bg">
      <View className="bg-white pt-14 pb-4 px-5 border-b border-border mb-4">
        <Text className="text-xl font-bold text-text">Offline Sync</Text>
        <Text className="text-text-3 text-sm mt-0.5">Manage pending offline data</Text>
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

          <Button
            label={isSyncing ? 'Syncing...' : 'Sync Now'}
            onPress={handleSync}
            loading={isSyncing}
            disabled={queue.length === 0}
            fullWidth
          />

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
