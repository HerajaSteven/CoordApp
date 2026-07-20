import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Network from 'expo-network';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { farmsApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { useOfflineStore } from '@/store/offline.store';
import { Card, StatusBadge, LoadingSpinner, SectionHeader, ProgressBar } from '@/components/ui';
import type { FarmRegistration } from '@/types';

function StatCard({ value, label, color = '#0D7A3D' }: { value: number | string; label: string; color?: string }) {
  return (
    <Card className="flex-1 items-center py-4">
      <Text className="text-2xl font-bold" style={{ color }}>{value}</Text>
      <Text className="text-xs text-text-3 text-center mt-1">{label}</Text>
    </Card>
  );
}

function FarmCard({ farm, onPress }: { farm: FarmRegistration; onPress: () => void }) {
  const completion = farm.status === 'verified' ? 100 : farm.status === 'reviewing' ? 50 : 0;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Card className="mb-3">
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1 mr-3">
            <Text className="font-bold text-text" numberOfLines={1}>{farm.farmName}</Text>
            <Text className="text-xs text-text-3 mt-0.5">{farm.name} · {farm.farmLocation}</Text>
          </View>
          <StatusBadge status={farm.status} />
        </View>
        <Text className="text-xs text-text-3 font-mono mb-2">{farm.appId}</Text>
        <ProgressBar value={completion} max={100} />
        <Text className="text-xs text-text-3 mt-1">{completion}% complete</Text>
      </Card>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const coordinator = useAuthStore((s) => s.coordinator);
  const { queue, sync, isSyncing, lastSyncAt } = useOfflineStore();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['farms'],
    queryFn: () => farmsApi.allPages({ limit: 100 }),
    select: (res) => res.data.data,
  });

  // Auto-sync on load if connected
  useEffect(() => {
    (async () => {
      if (queue.length > 0) {
        const state = await Network.getNetworkStateAsync();
        if (state.isConnected) sync();
      }
    })();
  }, []);

  const farms = data?.items ?? [];
  const verified = farms.filter((f) => f.status === 'verified').length;
  const inProgress = farms.filter((f) => ['reviewing', 'in_progress'].includes(f.status)).length;
  const pending = farms.filter((f) => f.paymentStatus === 'paid' && f.status !== 'verified').length;

  if (isLoading) return <LoadingSpinner />;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0D7A3D" />}
    >
      {/* Header */}
      <View className="bg-green-500 pb-6 px-5" style={{ paddingTop: insets.top + 16 }}>
        <Text className="text-white/70 text-sm">Welcome back</Text>
        <Text className="text-white text-xl font-bold mt-0.5">{coordinator?.name}</Text>
        <Text className="text-white/70 text-xs mt-1">{coordinator?.lga}, {coordinator?.state}</Text>

        {/* Sync indicator */}
        {queue.length > 0 && (
          <TouchableOpacity
            onPress={sync}
            className="mt-3 flex-row items-center bg-white/20 rounded-xl px-3 py-2 self-start"
          >
            <Text className="text-white text-xs font-medium">
              {isSyncing ? '⟳ Syncing...' : `⚠ ${queue.length} pending · Tap to sync`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View className="px-5 -mt-4">
        {/* Stats */}
        <View className="flex-row gap-3 mb-6">
          <StatCard value={farms.length} label="Total Farms" />
          <StatCard value={verified} label="Verified" color="#0D7A3D" />
          <StatCard value={inProgress} label="In Progress" color="#F4B400" />
          <StatCard value={pending} label="Pending" color="#8896A7" />
        </View>

        {/* Recent farms */}
        <SectionHeader
          title="My Farms"
          action="See all"
          onAction={() => router.push('/(tabs)/farms')}
        />
        {farms.slice(0, 5).map((farm) => (
          <FarmCard
            key={farm.appId}
            farm={farm}
            onPress={() => router.push(`/farm/${farm.appId}`)}
          />
        ))}

        {farms.length === 0 && (
          <Card>
            <Text className="text-text-3 text-center py-4">No farms assigned yet.</Text>
          </Card>
        )}

        {lastSyncAt && (
          <Text className="text-xs text-text-3 text-center mt-4 mb-6">
            Last synced: {new Date(lastSyncAt).toLocaleTimeString()}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
