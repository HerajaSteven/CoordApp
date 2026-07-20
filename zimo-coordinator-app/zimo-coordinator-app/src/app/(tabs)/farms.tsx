import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { FlatList } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { farmsApi } from '@/services/api';
import { StatusBadge, LoadingSpinner, ErrorMessage } from '@/components/ui';
import type { FarmRegistration } from '@/types';

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

const LIMIT = 20;

export default function FarmsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Debounce search
  const handleSearch = useCallback((text: string) => {
    setSearch(text);
    const t = setTimeout(() => setDebouncedSearch(text), 400);
    return () => clearTimeout(t);
  }, []);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isRefetching } =
    useInfiniteQuery({
      queryKey: ['farms', debouncedSearch, statusFilter],
      queryFn: ({ pageParam = 1 }) =>
        farmsApi.all({ search: debouncedSearch, status: statusFilter || undefined, page: pageParam, limit: LIMIT }),
      getNextPageParam: (last) => {
        const d = last.data.data;
        return d.page < d.totalPages ? d.page + 1 : undefined;
      },
      initialPageParam: 1,
      select: (d) => ({ pages: d.pages, pageParams: d.pageParams }),
    });

  const farms = data?.pages.flatMap((p) => p.data.data.items) ?? [];

  const statusOptions = ['', 'reviewing', 'verified', 'submitted', 'flagged'];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorMessage message="Could not load farms." onRetry={refetch} />;

  return (
    <View className="flex-1 bg-bg">
      {/* Header */}
      <View className="bg-white pb-3 px-5 border-b border-border" style={{ paddingTop: insets.top + 12 }}>
        <Text className="text-xl font-bold text-text mb-3">My Farms</Text>

        {/* Search */}
        <View className="flex-row items-center bg-bg rounded-xl px-3 py-2.5 mb-3">
          <Text className="text-text-3 mr-2">🔍</Text>
          <TextInput
            className="flex-1 text-sm text-text"
            placeholder="Search by name, farmer, App ID..."
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
                {s || 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={farms}
        keyExtractor={(f) => f.appId}
        
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0D7A3D" />}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <FarmListItem
            farm={item}
            onPress={() => router.push(`/farm/${item.appId}`)}
          />
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
          isFetchingNextPage ? (
            <View className="py-4">
              <LoadingSpinner size="small" />
            </View>
          ) : null
        }
      />
    </View>
  );
}
