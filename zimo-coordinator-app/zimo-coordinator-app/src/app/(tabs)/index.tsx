import React, { useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Text } from '@/components/ui/typography';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import * as Network from 'expo-network';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { farmsApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { useOfflineStore } from '@/store/offline.store';
import { Card, StatusBadge, LoadingSpinner, SectionHeader, ProgressBar } from '@/components/ui';
import type { FarmRegistration } from '@/types';

/*
  ── THE FIELD AGENT'S HOME ───────────────────────────────────────────────

  Drawn to the prototype: a dark header carrying who they are and a strip
  of figures that SCROLLS rather than four boxes squeezed into one row,
  then the actions they actually start a day from, then today's work, then
  their farms.

  ── WHY THE STATS SCROLL ─────────────────────────────────────────────────

  There are five worth showing and a phone is 390dp wide. Four crammed
  into one row gave each about 80dp — enough for a number and a truncated
  word, which is how "In Progress" became unreadable. A horizontal strip
  keeps each one legible and lets a sixth be added later without
  redesigning the row.

  ── AND WHY EVERY ACTION HERE GOES SOMEWHERE ─────────────────────────────

  A tile that opens nothing teaches people not to trust the grid. The
  prototype has eight; these are the ones this app can actually carry out
  today. Harvest pickup and market pickup are real on the platform and
  deliberately absent until a field agent's identity can reach them —
  recording a collection against the wrong person is worse than not
  offering the button.
*/

function StatPill({ label, value, colour = '#FFFFFF' }: {
  label: string;
  value: number | string;
  colour?: string;
}) {
  return (
    <View className="bg-white/10 rounded-xl px-4 py-3 mr-2.5 min-w-[104px]">
      <Text className="text-white/60 text-xs" numberOfLines={1}>{label}</Text>
      <Text className="text-xl font-bold mt-0.5" style={{ color: colour }}>{value}</Text>
    </View>
  );
}

function QuickAction({ icon, label, tone, onPress }: {
  icon: string;
  label: string;
  tone: 'green' | 'dark' | 'amber' | 'red';
  onPress: () => void;
}) {
  const tones = {
    green: 'bg-green-500',
    dark: 'bg-text',
    amber: 'bg-yellow-500',
    red: 'bg-red-500',
  } as const;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className={`${tones[tone]} rounded-2xl px-3 py-4 flex-1 flex-row items-center`}
    >
      <Text className="text-lg mr-2">{icon}</Text>
      <Text className="text-white font-semibold text-sm flex-1" numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
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
            {/*
              The FARMER and what they keep — the prototype's second line.
              It is what tells two farms of one cooperative apart, now that
              every OGFMF farm carries the cooperative's name.
            */}
            <Text className="text-xs text-text-3 mt-0.5" numberOfLines={1}>
              {farm.name}
              {farm.farmType?.length ? ` · ${farm.farmType.join(', ')}` : ''}
              {farm.farmSize ? ` · ${farm.farmSize} ${farm.farmUnit ?? ''}`.trimEnd() : ''}
            </Text>
          </View>
          <StatusBadge status={farm.status} />
        </View>
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
  /*
    Today's work, derived from the caseload itself.

    KYM has no caseload-wide visits endpoint — /visits is per farm — so
    inventing a due date here would be inventing a fact. What is TRUE is
    which farms are still unfinished, and that is the work.
  */
  const unfinished = farms.filter((f) => f.status !== 'verified');

  const go = (href: Href) => () => router.push(href);

  if (isLoading) return <LoadingSpinner />;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0D7A3D" />}
    >
      <View className="bg-green-500 pb-5 px-5" style={{ paddingTop: insets.top + 16 }}>
        <Text className="text-white/60 text-xs font-semibold tracking-wide">FIELD AGENT</Text>
        <Text className="text-white text-xl font-bold mt-0.5">{coordinator?.name}</Text>
        <Text className="text-white/70 text-xs mt-1">
          {[coordinator?.lga, coordinator?.state].filter(Boolean).join(', ') || 'Unposted'}
        </Text>

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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-4 -mx-5 px-5"
        >
          <StatPill label="Assigned" value={farms.length} />
          <StatPill label="Verified" value={verified} colour="#C3E6D1" />
          <StatPill label="In progress" value={inProgress} colour="#FDEFC2" />
          <StatPill label="Awaiting visit" value={pending} />
          <StatPill label="Outstanding" value={unfinished.length} colour="#FDEFC2" />
        </ScrollView>
      </View>

      <View className="px-5 pt-5">
        <Text className="font-bold text-text mb-3">Quick Actions</Text>
        <View className="mb-6" style={{ gap: 10 }}>
          <View className="flex-row" style={{ gap: 10 }}>
            <QuickAction icon="🧾" label="My Farms" tone="green" onPress={go('/(tabs)/farms')} />
            <QuickAction icon="🗺️" label="Farm Map" tone="dark" onPress={go('/map')} />
          </View>
          <View className="flex-row" style={{ gap: 10 }}>
            {/* Named for what it opens. That tab is the offline queue, not a
                task list, and a tile promising tasks would be a lie told
                twice a day. */}
            <QuickAction icon="🔄" label="Offline Sync" tone="amber" onPress={go('/(tabs)/tasks')} />
            <QuickAction icon="📡" label="Monitoring" tone="green" onPress={go('/(tabs)/monitor')} />
          </View>
          <View className="flex-row" style={{ gap: 10 }}>
            <QuickAction icon="🧩" label="Clusters" tone="dark" onPress={go('/(tabs)/clusters')} />
            <QuickAction
              icon="🚨"
              label="Report Incident"
              tone="red"
              onPress={go('/(tabs)/farms')}
            />
          </View>
        </View>

        {unfinished.length > 0 && (
          <>
            <SectionHeader
              title="Still to do"
              action="See all"
              onAction={() => router.push('/(tabs)/farms')}
            />
            {unfinished.slice(0, 3).map((farm) => (
              <TouchableOpacity
                key={farm.appId}
                activeOpacity={0.8}
                onPress={() => router.push(`/farm/${farm.appId}`)}
              >
                <Card className="mb-3">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 mr-3">
                      <Text className="font-bold text-text text-sm" numberOfLines={1}>
                        {farm.farmName}
                      </Text>
                      <Text className="text-xs text-text-3 mt-0.5" numberOfLines={1}>
                        {farm.status === 'reviewing' ? 'Verification in progress' : 'Not started'}
                        {farm.lga ? ` · ${farm.lga}` : ''}
                      </Text>
                    </View>
                    <StatusBadge status={farm.status} />
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}

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
