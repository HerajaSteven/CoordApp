import React, { useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/typography';
import { FlatList } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { farmsApi, clustersApi } from '@/services/api';
import { StatusBadge, LoadingSpinner, ErrorMessage, ProgressBar, Card } from '@/components/ui';
import type { FarmRegistration, ClusterFarm } from '@/types';

/**
 * Everything a coordinator is responsible for, in one place.
 *
 * Clusters used to be their own tab, which made the two halves of one
 * question — what am I looking after — sit in two places. They are
 * categories here instead, and the tab is gone.
 *
 * THE CATEGORIES ARE "FARMS" AND "CLUSTERS", not clustered and unclustered
 * farms, and that is a data limit rather than a preference. A
 * `ClusterFarmMember` carries `{ name, farmerName, size }` and no appId, and
 * a `FarmRegistration` carries no cluster field, so nothing joins the two.
 * Splitting the farm list by membership would mean matching on farm names,
 * and a coordinator filing an inspection against the wrong farm because two
 * are called "Okafor Farm" is worse than not offering the split.
 *
 * Each category keeps its own search and its own status filter, because the
 * statuses are different vocabularies: a farm is submitted or reviewing, a
 * cluster is pending or in_progress.
 */

function FarmListItem({ farm, onPress }: { farm: FarmRegistration; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className="bg-card mx-4 mb-3 rounded-2xl p-4 shadow-sm"
      style={{ elevation: 2 }}
    >
      <View className="flex-row items-start justify-between mb-1">
        <View className="flex-1 mr-3">
          <Text className="font-bold text-text text-base" numberOfLines={1}>
            {farm.farmName}
          </Text>
          <Text className="text-text-3 text-xs mt-0.5" numberOfLines={1}>
            {farm.name} · {farm.farmLocation}
          </Text>
        </View>
        <StatusBadge status={farm.status} />
      </View>

      <View className="flex-row items-center justify-between mt-2">
        <Text className="text-xs text-text-3 font-mono">{farm.appId}</Text>
        <View className="flex-row gap-2">
          {farm.farmType.slice(0, 2).map((t) => (
            <View key={t} className="bg-green-50 rounded-full px-2 py-0.5">
              <Text className="text-xs text-green-500 font-medium">{t}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="flex-row items-center mt-2 gap-3">
        <Text className="text-xs text-text-3">📍 {farm.state}</Text>
        <Text className="text-xs text-text-3">📐 {farm.farmSize} {farm.farmUnit}</Text>
        <Text className="text-xs text-text-3">🌱 {farm.farmerType}</Text>
      </View>
    </TouchableOpacity>
  );
}

const CLUSTER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: '#8896A7', bg: '#F5F7FA' },
  in_progress: { label: 'In Progress', color: '#F4B400', bg: '#FEF9E7' },
  verified:    { label: 'Verified',    color: '#0D7A3D', bg: '#E8F5EE' },
  flagged:     { label: 'Flagged',     color: '#EF4444', bg: '#FEF2F2' },
};

function ClusterCard({ cluster, onPress }: { cluster: ClusterFarm; onPress: () => void }) {
  const status = CLUSTER_STATUS[cluster.status] ?? CLUSTER_STATUS.pending;
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

const LIMIT = 20;

type Category = 'farms' | 'clusters';

const FARM_STATUSES = ['', 'reviewing', 'verified', 'submitted', 'flagged'];
const CLUSTER_STATUSES = ['', 'pending', 'in_progress', 'verified', 'flagged'];

export default function FarmsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [category, setCategory] = useState<Category>('farms');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const handleSearch = useCallback((text: string) => {
    setSearch(text);
    const t = setTimeout(() => setDebouncedSearch(text), 400);
    return () => clearTimeout(t);
  }, []);

  /*
    Switching category clears the filter. The two vocabularies do not
    overlap, so carrying "submitted" into the cluster list would filter
    every cluster away and look like an empty assignment.
  */
  const switchTo = (next: Category) => {
    setCategory(next);
    setStatusFilter('');
    setSearch('');
    setDebouncedSearch('');
  };

  const farmsQuery = useInfiniteQuery({
    queryKey: ['farms', debouncedSearch, statusFilter],
    queryFn: ({ pageParam = 1 }) =>
      farmsApi.all({ search: debouncedSearch, status: statusFilter || undefined, page: pageParam, limit: LIMIT }),
    getNextPageParam: (last) => {
      const d = last.data.data;
      return d.page < d.totalPages ? d.page + 1 : undefined;
    },
    initialPageParam: 1,
    select: (d) => ({ pages: d.pages, pageParams: d.pageParams }),
    enabled: category === 'farms',
  });

  const clustersQuery = useQuery({
    queryKey: ['clusters'],
    queryFn: () => clustersApi.list(),
    select: (res) => res.data.data,
    enabled: category === 'clusters',
  });

  const farms = farmsQuery.data?.pages.flatMap((p) => p.data.data.items) ?? [];

  const allClusters = clustersQuery.data?.clusters ?? [];
  const summary = clustersQuery.data?.summary;
  const clusters = allClusters.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      return (
        c.label.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        c.lga.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const onFarms = category === 'farms';
  const statusOptions = onFarms ? FARM_STATUSES : CLUSTER_STATUSES;
  const active = onFarms ? farmsQuery : clustersQuery;

  return (
    <View className="flex-1 bg-bg">
      <View className="bg-white pb-3 px-5 border-b border-border" style={{ paddingTop: insets.top + 12 }}>
        <Text className="text-xl font-bold text-text mb-3">My Farms</Text>

        {/* The two categories. */}
        <View className="flex-row bg-bg rounded-xl p-1 mb-3">
          {([
            ['farms', 'Farms'],
            ['clusters', 'Clusters'],
          ] as const).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              onPress={() => switchTo(value)}
              className={`flex-1 py-2 rounded-lg items-center ${
                category === value ? 'bg-green-500' : ''
              }`}
              activeOpacity={0.8}
            >
              <Text
                className={`text-sm font-semibold ${
                  category === value ? 'text-white' : 'text-text-3'
                }`}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className="flex-row items-center bg-bg rounded-xl px-3 py-2.5 mb-3">
          <Text className="text-text-3 mr-2">🔍</Text>
          <TextInput
            className="flex-1 text-sm text-text"
            placeholder={
              onFarms ? 'Search by name, farmer, App ID...' : 'Search by name, state, LGA...'
            }
            placeholderTextColor="#8896A7"
            value={search}
            onChangeText={handleSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); setDebouncedSearch(''); }}>
              <Text className="text-text-3 ml-2">✕</Text>
            </TouchableOpacity>
          )}
        </View>

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
                {s ? (onFarms ? s : CLUSTER_STATUS[s]?.label ?? s) : 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {active.isLoading ? (
        <LoadingSpinner />
      ) : active.isError ? (
        <ErrorMessage
          message={onFarms ? 'Could not load farms.' : 'Could not load cluster farms.'}
          onRetry={active.refetch}
        />
      ) : onFarms ? (
        <FlatList
          data={farms}
          keyExtractor={(f) => f.appId}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={farmsQuery.isRefetching}
              onRefresh={farmsQuery.refetch}
              tintColor="#0D7A3D"
            />
          }
          onEndReached={() =>
            farmsQuery.hasNextPage && !farmsQuery.isFetchingNextPage && farmsQuery.fetchNextPage()
          }
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <FarmListItem farm={item} onPress={() => router.push(`/farm/${item.appId}`)} />
          )}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-4xl mb-3">🌾</Text>
              <Text className="text-text-3 text-center">
                {debouncedSearch ? `No farms match "${debouncedSearch}"` : 'No farms assigned yet.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            farmsQuery.isFetchingNextPage ? (
              <View className="py-4">
                <LoadingSpinner size="small" />
              </View>
            ) : null
          }
        />
      ) : (
        <>
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
            refreshControl={
              <RefreshControl
                refreshing={clustersQuery.isRefetching}
                onRefresh={clustersQuery.refetch}
                tintColor="#0D7A3D"
              />
            }
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
                  {debouncedSearch || statusFilter
                    ? 'No cluster farms match your filters.'
                    : 'No cluster farms assigned yet.'}
                </Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}
