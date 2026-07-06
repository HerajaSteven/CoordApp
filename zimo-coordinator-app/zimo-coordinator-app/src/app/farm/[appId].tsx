import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { farmsApi } from '@/services/api';
import {
  Card,
  StatusBadge,
  LoadingSpinner,
  ErrorMessage,
  InfoRow,
  SectionHeader,
  ProgressBar,
  Divider,
  Badge,
} from '@/components/ui';
import type { TimelineEvent } from '@/types';

function StepRow({ step, completed }: { step: string; completed: boolean }) {
  const labels: Record<string, string> = {
    identity: 'Identity Verification',
    farmType: 'Farm Type',
    gps: 'GPS Verification',
    landOwnership: 'Land Ownership',
    infrastructure: 'Infrastructure',
    capacity: 'Capacity Assessment',
    evidence: 'Evidence Collection',
    review: 'Review & Certify',
  };
  return (
    <View className="flex-row items-center py-2.5 border-b border-border">
      <View className={`w-6 h-6 rounded-full items-center justify-center mr-3 ${completed ? 'bg-green-500' : 'bg-gray-100'}`}>
        <Text className={`text-xs font-bold ${completed ? 'text-white' : 'text-text-3'}`}>
          {completed ? '✓' : '○'}
        </Text>
      </View>
      <Text className={`text-sm ${completed ? 'text-text font-medium' : 'text-text-3'}`}>
        {labels[step] ?? step}
      </Text>
    </View>
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const icons: Record<string, string> = {
    identity_confirmed: '✅',
    identity_mismatch: '❌',
    step_completed: '✓',
    verification_submitted: '📤',
    verification_approved: '🏆',
    boundary_closed: '📐',
    visit_completed: '📍',
    incident_created: '⚠️',
    incident_escalated: '🚨',
    coordinator_assigned: '👤',
  };
  return (
    <View className="flex-row mb-4">
      <View className="w-8 h-8 bg-green-50 rounded-full items-center justify-center mr-3 mt-0.5">
        <Text className="text-base">{icons[event.eventType] ?? '●'}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-text">{event.summary}</Text>
        <Text className="text-xs text-text-3 mt-0.5">
          {new Date(event.occurredAt).toLocaleString()}
        </Text>
      </View>
    </View>
  );
}

const STEPS = ['identity', 'farmType', 'gps', 'landOwnership', 'infrastructure', 'capacity', 'evidence', 'review'];

export default function FarmDetailScreen() {
  const { appId } = useLocalSearchParams<{ appId: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'verification' | 'timeline'>('overview');

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['farm-profile', appId],
    queryFn: () => farmsApi.profile(appId),
    select: (res) => res.data.data,
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorMessage message="Could not load farm profile." onRetry={refetch} />;

  const { registration: reg, verification: ver, timeline, boundary, computed } = data;
  const completedSteps = ver?.completedSteps ?? [];
  const profileCompletion = computed.profileCompletion ?? 0;

  const canVerify = reg.paymentStatus === 'paid' && computed.verificationStatus !== 'approved';

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: reg.farmName,
          headerStyle: { backgroundColor: '#0D7A3D' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold', color: '#fff' },
          headerBackTitle: 'Back',
        }}
      />

      {/* Farm header */}
      <View className="bg-green-500 px-5 pb-5">
        <View className="flex-row items-center justify-between mb-2">
          <StatusBadge status={computed.verificationStatus} />
          <Text className="text-white/70 text-xs font-mono">{reg.appId}</Text>
        </View>
        <Text className="text-white text-lg font-bold">{reg.farmName}</Text>
        <Text className="text-white/70 text-sm">{reg.farmLocation}</Text>

        <View className="mt-3">
          <View className="flex-row justify-between mb-1">
            <Text className="text-white/70 text-xs">Verification Progress</Text>
            <Text className="text-white text-xs font-semibold">{profileCompletion}%</Text>
          </View>
          <View className="h-2 bg-white/20 rounded-full overflow-hidden">
            <View
              className="h-full bg-white rounded-full"
              style={{ width: `${profileCompletion}%` }}
            />
          </View>
        </View>
      </View>

      {/* Tab bar */}
      <View className="flex-row bg-white border-b border-border">
        {(['overview', 'verification', 'timeline'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 py-3 items-center border-b-2 ${
              activeTab === tab ? 'border-green-500' : 'border-transparent'
            }`}
          >
            <Text className={`text-sm font-medium capitalize ${activeTab === tab ? 'text-green-500' : 'text-text-3'}`}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0D7A3D" />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {/* ── Overview Tab ─────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <View>
            {/* Farmer Info */}
            <Card className="mb-4">
              <View className="flex-row items-center mb-3">
                <View className="w-12 h-12 bg-green-50 rounded-full items-center justify-center mr-3">
                  <Text className="text-green-500 text-lg font-bold">
                    {reg.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View>
                  <Text className="font-bold text-text text-base">{reg.name}</Text>
                  <Text className="text-text-3 text-xs">{reg.phone}</Text>
                </View>
              </View>
              <Divider className="mb-2" />
              <InfoRow label="Email" value={reg.email} />
              <InfoRow label="Address" value={reg.address} />
              <InfoRow label="State" value={reg.state} />
              <InfoRow label="LGA" value={reg.lga} />
              <InfoRow label="ID Type" value={reg.idType?.toUpperCase()} />
            </Card>

            {/* Farm Details */}
            <Card className="mb-4">
              <Text className="font-bold text-text mb-2">Farm Details</Text>
              <Divider className="mb-2" />
              <InfoRow label="Farm Name" value={reg.farmName} />
              <InfoRow label="Location" value={reg.farmLocation} />
              <InfoRow label="Size" value={`${reg.farmSize} ${reg.farmUnit}`} />
              <InfoRow label="Farmer Type" value={reg.farmerType} />
              <InfoRow label="Farm Type" value={reg.farmType.join(', ')} />
              <InfoRow label="Payment" value={reg.paymentStatus} />
              {ver?.gps?.centerLat && (
                <InfoRow
                  label="GPS"
                  value={`${ver.gps.centerLat.toFixed(4)}°N, ${ver.gps.centerLng?.toFixed(4)}°E`}
                />
              )}
              {boundary?.areaHectares && (
                <InfoRow label="Measured Area" value={`${boundary.areaHectares} ha`} />
              )}
            </Card>

            {/* Boundary summary */}
            {boundary && (
              <Card className="mb-4">
                <Text className="font-bold text-text mb-2">Boundary Walk</Text>
                <Divider className="mb-2" />
                <InfoRow label="Points" value={String(boundary.pointCount)} />
                {boundary.areaHectares && <InfoRow label="Area" value={`${boundary.areaHectares} ha`} />}
                {boundary.areaDiscrepancyPct != null && (
                  <InfoRow
                    label="Discrepancy"
                    value={`${boundary.areaDiscrepancyPct.toFixed(1)}%`}
                    style={{ color: Math.abs(boundary.areaDiscrepancyPct) > 20 ? '#EF4444' : undefined }}
                  />
                )}
              </Card>
            )}

            {/* Units summary card */}
            {data.computed.totalSites > 0 ? (
              <TouchableOpacity
                onPress={() => router.push(`/sites/${appId}`)}
                activeOpacity={0.8}
              >
                <Card className="mb-4 border border-green-100 bg-green-50">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="font-bold text-green-500">🗺️ Farm Sites</Text>
                    <Text className="text-xs text-green-500 font-medium">Manage →</Text>
                  </View>
                  <Text className="text-text-3 text-sm mb-2">
                    {data.computed.verifiedSites} of {data.computed.totalSites} sites verified
                  </Text>
                  <ProgressBar value={data.computed.verifiedSites} max={data.computed.totalSites} />
                </Card>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => router.push(`/sites/${appId}`)}
                activeOpacity={0.8}
              >
                <Card className="mb-4 border-2 border-dashed border-green-200 bg-green-50 items-center py-5">
                  <Text className="text-3xl mb-1">🗺️</Text>
                  <Text className="font-semibold text-green-500">Add Farm Sites</Text>
                  <Text className="text-xs text-text-3 mt-0.5 text-center">
                    Register site locations (e.g. pond clusters, plots)
                  </Text>
                </Card>
              </TouchableOpacity>
            )}

            {/* Action buttons */}
            <View className="flex-row gap-3 mb-4">
              <TouchableOpacity
                onPress={() => router.push(`/sites/${appId}`)}
                className="flex-1 bg-green-500 rounded-2xl p-4 items-center"
                activeOpacity={0.85}
              >
                <Text className="text-white font-bold text-sm">🗺️ Manage Sites</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push(`/incident/${appId}`)}
                className="bg-red-50 border border-red-100 rounded-2xl p-4 items-center"
                activeOpacity={0.85}
                style={{ minWidth: 90 }}
              >
                <Text className="text-red-500 font-bold text-sm">⚠ Report</Text>
              </TouchableOpacity>
            </View>

            {computed.verificationStatus === 'approved' && (
              <Card className="mb-4 bg-green-50 border border-green-100">
                <Text className="text-green-500 font-bold text-center">✅ Verification Approved</Text>
                {ver?.approvedAt && (
                  <Text className="text-text-3 text-xs text-center mt-1">
                    {new Date(ver.approvedAt).toLocaleString()}
                  </Text>
                )}
              </Card>
            )}
          </View>
        )}

        {/* ── Verification Tab ──────────────────────────────────── */}
        {activeTab === 'verification' && (
          <View>
            <Card className="mb-4">
              <Text className="font-bold text-text mb-1">Verification Wizard</Text>
              <Text className="text-xs text-text-3 mb-3">
                {completedSteps.length} of {STEPS.length} steps completed
              </Text>
              <ProgressBar value={completedSteps.length} max={STEPS.length} />
              <View className="mt-4">
                {STEPS.map((step) => (
                  <StepRow key={step} step={step} completed={completedSteps.includes(step as never)} />
                ))}
              </View>
            </Card>

            {ver?.identity && (
              <Card className="mb-4">
                <Text className="font-bold text-text mb-2">Identity</Text>
                <Divider className="mb-2" />
                <InfoRow label="Status" value={ver.identity.status} />
                {ver.identity.confidence !== null && (
                  <InfoRow label="Match Confidence" value={`${ver.identity.confidence}%`} />
                )}
                {ver.identity.mismatchReason && (
                  <InfoRow label="Mismatch Reason" value={ver.identity.mismatchReason} />
                )}
              </Card>
            )}

            {ver?.landOwnership?.ownershipType && (
              <Card className="mb-4">
                <Text className="font-bold text-text mb-2">Land Ownership</Text>
                <Divider className="mb-2" />
                <InfoRow label="Type" value={ver.landOwnership.ownershipType} />
                <InfoRow label="Doc Ref" value={ver.landOwnership.docRef ?? ''} />
                <InfoRow label="Active Dispute" value={ver.landOwnership.activeDispute ? 'Yes ⚠️' : 'No'} />
              </Card>
            )}

            {canVerify && (
              <TouchableOpacity
                onPress={() => router.push(`/verification/${appId}`)}
                className="bg-green-500 rounded-2xl p-4 items-center"
                activeOpacity={0.85}
              >
                <Text className="text-white font-bold text-base">Open Verification Wizard</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Timeline Tab ──────────────────────────────────────── */}
        {activeTab === 'timeline' && (
          <Card>
            {timeline.length === 0 ? (
              <Text className="text-text-3 text-center py-6">No events yet.</Text>
            ) : (
              timeline.map((event) => <TimelineItem key={event._id} event={event} />)
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
