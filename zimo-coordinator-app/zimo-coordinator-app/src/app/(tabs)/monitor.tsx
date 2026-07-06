import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { farmsApi, incidentsApi } from '@/services/api';
import { Card, SectionHeader, StatusBadge, LoadingSpinner } from '@/components/ui';
import type { FarmRegistration } from '@/types';

function AlertCard({ farm, onPress }: { farm: FarmRegistration; onPress: () => void }) {
  const isOverdue = farm.status === 'reviewing';
  const isMismatch = farm.status === 'flagged';
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Card className="mb-3 border-l-4" style={{ borderLeftColor: isMismatch ? '#EF4444' : '#F4B400' }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="font-bold text-text">{farm.farmName}</Text>
            <Text className="text-xs text-text-3 mt-0.5">{farm.farmLocation} · {farm.appId}</Text>
            <Text className="text-xs mt-1" style={{ color: isMismatch ? '#EF4444' : '#F4B400' }}>
              {isMismatch ? '⚠ Flagged for review' : '⏱ Verification in progress'}
            </Text>
          </View>
          <StatusBadge status={farm.status} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

export default function MonitorScreen() {
  const router = useRouter();

  const { data: farmsData, isLoading: farmsLoading, refetch, isRefetching } = useQuery({
    queryKey: ['farms'],
    queryFn: () => farmsApi.all({ limit: 50 }),
    select: (res) => res.data.data,
  });

  const farms = farmsData?.items ?? [];
  const flagged = farms.filter((f) => f.status === 'flagged');
  const inProgress = farms.filter((f) => f.status === 'reviewing');
  const unvisited = farms.filter((f) => f.paymentStatus === 'paid' && f.status === 'reviewing' && !flagged.includes(f));

  const alerts = [...flagged, ...unvisited].slice(0, 10);

  if (farmsLoading) return <LoadingSpinner />;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0D7A3D" />}
    >
      <View className="bg-white pt-14 pb-4 px-5 border-b border-border mb-4">
        <Text className="text-xl font-bold text-text">Monitoring</Text>
        <Text className="text-text-3 text-sm mt-0.5">Alerts and farm status overview</Text>
      </View>

      <View className="px-5">
        {/* Summary stats */}
        <View className="flex-row gap-3 mb-6">
          <Card className="flex-1 items-center py-4">
            <Text className="text-2xl font-bold text-red-500">{flagged.length}</Text>
            <Text className="text-xs text-text-3 mt-1 text-center">Flagged</Text>
          </Card>
          <Card className="flex-1 items-center py-4">
            <Text className="text-2xl font-bold text-yellow-500">{inProgress.length}</Text>
            <Text className="text-xs text-text-3 mt-1 text-center">In Progress</Text>
          </Card>
          <Card className="flex-1 items-center py-4">
            <Text className="text-2xl font-bold text-green-500">
              {farms.filter((f) => f.status === 'verified').length}
            </Text>
            <Text className="text-xs text-text-3 mt-1 text-center">Verified</Text>
          </Card>
        </View>

        {/* Alerts */}
        {alerts.length > 0 && (
          <>
            <SectionHeader title={`Alerts (${alerts.length})`} />
            {alerts.map((farm) => (
              <AlertCard
                key={farm.appId}
                farm={farm}
                onPress={() => router.push(`/farm/${farm.appId}`)}
              />
            ))}
          </>
        )}

        {alerts.length === 0 && (
          <Card className="items-center py-10">
            <Text className="text-4xl mb-3">✅</Text>
            <Text className="font-semibold text-text">All clear</Text>
            <Text className="text-text-3 text-sm mt-1">No alerts at this time.</Text>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
