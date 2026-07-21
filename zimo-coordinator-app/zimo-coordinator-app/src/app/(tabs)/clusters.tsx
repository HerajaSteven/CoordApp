import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { clustersApi } from '@/services/api';
import { LoadingSpinner, ErrorMessage, ProgressBar, Card } from '@/components/ui';
import type { ClusterFarm } from '@/types';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: '#8896A7', bg: '#F5F7FA' },
  in_progress: { label: 'In Progress', color: '#F4B400', bg: '#FEF9E7' },
  verified:    { label: 'Verified',    color: '#0D7A3D', bg: '#E8F5EE' },
  flagged:     { label: 'Flagged',     color: '#EF4444', bg: '#FEF2F2' },
};

function ClusterCard({ cluster, onPress }: { cluster: ClusterFarm; onPress: () => void }) {
  const status = STATUS_CONFIG[cluster.status] ?? STATUS_CONFIG.pending;
  const memberCount = cluster.memberFarms?.length ?? 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Card className="mb-3">
        <View className="flex-row items-center justify-between mb-1">
          <View className="flex-row items-center flex-1 mr-3">
            <Text className="text-2xl mr-2">🗂️</Text>
            <View className="flex-1">
              <Text className="font-bold text-text" numberOfLines={1}>{cluster.label}</Text>
              <Text className="text-xs text-text-3 mt-0.5" numberOfLines={1}>
                {cluster.state} · {cluster.lga}
              </Text>
            </View>
          </View>
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: status.bg }}>
            <Text className="text-xs font-semibold" style={{ color: status.color }}>{status.label}</Text>
          </View>
        </View>

        {cluster.address && (
          <Text className="text-xs text-text-3 mt-1" numberOfLines={1}>📌 {cluster.address}</Text>
        )}

        <Text className="text-xs text-text-3 mt-2">
          👥 {memberCount} member farm{memberCount === 1 ? '' : 's'}
        </Text>
      </Card>
    </TouchableOpacity>
  );
}

export default function ClustersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => clustersApi.list(),
    select: (res) => res.data.data,
  });

  const allClusters = data?.clusters ?? [];
  const summary = data?.summary;

  const clusters = allClusters.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.label.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        c.lga.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const statusOptions = ['', 'pending', 'in_progress', 'verified', 'flagged'];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorMessage message="Could not load cluster farms." onRetry={refetch} />;

  return (
    <View className="flex-1 bg-bg">
      {/* Header */}
      <View className="bg-white pb-3 px-5 border-b border-border" style={{ paddingTop: insets.top + 12 }}>
        <Text className="text-xl font-bold text-text mb-3">Cluster Farms</Text>

        {/* Search */}
        <View className="flex-row items-center bg-bg rounded-xl px-3 py-2.5 mb-3">
          <Text className="text-text-3 mr-2">🔍</Text>
          <TextInput
            className="flex-1 text-sm text-text"
            placeholder="Search by name, state, LGA..."
            placeholderTextColor="#8896A7"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text className="text-text-3 ml-2">✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status filters */}
        <View className="flex-row gap-2">
          {statusOptions.map((s) => (
            <TouchableOpacity
              key={s || 'all'}
              onPress={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full border ${
                statusFilter === s ? 'bg-green-500 border-green-500' : 'bg-white border-border'
              }`}
            >
              <Text className={`text-xs font-medium ${statusFilter === s ? 'text-white' : 'text-text-3'}`}>
                {s ? STATUS_CONFIG[s].label : 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Summary bar */}
      {summary && summary.total > 0 && (
        <View className="bg-white px-5 py-3 border-b border-border">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-sm font-medium text-text">
              {summary.verified} of {summary.total} clusters verified
            </Text>
            <Text className="text-xs text-text-3">{summary.pending} pending</Text>
          </View>
          <ProgressBar value={summary.verified} max={summary.total} />
        </View>
      )}

      <FlatList
        data={clusters}
        keyExtractor={(c) => c.clusterId}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0D7A3D" />}
        renderItem={({ item }) => (
          <ClusterCard
            cluster={item}
            onPress={() =>
              router.push({ pathname: '/cluster/[clusterId]', params: { clusterId: item.clusterId } })
            }
          />
        )}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">🗂️</Text>
            <Text className="text-text-3 text-center">
              {search || statusFilter ? 'No cluster farms match your filters.' : 'No cluster farms assigned yet.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}
