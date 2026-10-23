import React from 'react';
import { View, ScrollView, TouchableOpacity, Alert, RefreshControl, Image } from 'react-native';
import { Text, FACE } from '@/components/ui/typography';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { clustersApi, verificationApi } from '@/services/api';
import { Card, LoadingSpinner, ErrorMessage, HeaderBackButton } from '@/components/ui';
import { VerificationProgress } from '@/components/VerificationProgress';
import { STEPS } from '@/features/verification/steps';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: '#8896A7', bg: '#F5F7FA' },
  in_progress: { label: 'In Progress', color: '#F4B400', bg: '#FEF9E7' },
  verified:    { label: 'Verified',    color: '#0D7A3D', bg: '#E8F5EE' },
  flagged:     { label: 'Flagged',     color: '#EF4444', bg: '#FEF2F2' },
};

export default function ClusterDetailScreen() {
  const { clusterId } = useLocalSearchParams<{ clusterId: string }>();
  const router = useRouter();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['cluster', clusterId],
    queryFn: () => clustersApi.get(clusterId),
    select: (res) => res.data.data,
  });

  /*
    The same verification record a farm has.

    This screen used to carry a verification of its own: a GPS pin, two
    optional photos and a note, submitted in one go. It asked nothing about
    farm type, land ownership, infrastructure or capacity, it had no
    boundary walk, and because it posted only at the end, a coordinator who
    ran out of daylight came back to an empty form.

    A cluster is a subject of the eight-step verification now, so the record
    is read from the same endpoint a farm's is and the wizard is the same
    wizard. Every step saves on its own, which is what makes a half-finished
    visit resumable.
  */
  const { data: verification } = useQuery({
    queryKey: ['verification-record', clusterId, undefined],
    queryFn: () => verificationApi.get(clusterId),
    select: (res) => res.data.data,
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.cluster) return <ErrorMessage message="Could not load cluster farm." onRetry={refetch} />;

  const cluster = data.cluster;
  const status = STATUS_CONFIG[cluster.status] ?? STATUS_CONFIG.pending;
  const memberFarms = cluster.memberFarms ?? [];

  const completedSteps = verification?.completedSteps ?? [];
  const overallStatus = verification?.overallStatus;
  const underReview = overallStatus === 'submitted' || overallStatus === 'approved';
  /*
    A cluster verified before the eight steps existed, whose GPS pin and two
    photos are the only record of that visit.
  */
  const legacy = cluster.verification ?? null;
  const legacyOnly = cluster.status === 'verified' && completedSteps.length === 0;

  const openWizard = () => {
    if (underReview) {
      Alert.alert(
        'Already submitted',
        'This verification has been submitted. It can’t be changed while it is being reviewed.'
      );
      return;
    }

    router.push(`/verification/${clusterId}?subjectLabel=${encodeURIComponent(cluster.label)}`);
  };

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: cluster.label,
          headerStyle: { backgroundColor: '#0D7A3D' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontFamily: FACE.bold, color: '#fff' },
          headerLeft: () => <HeaderBackButton fallbackHref="/(tabs)/farms" />,
        }}
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0D7A3D" />}
      >
        <Card className="mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="font-bold text-text text-base flex-1 mr-3">{cluster.label}</Text>
            <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: status.bg }}>
              <Text className="text-xs font-semibold" style={{ color: status.color }}>{status.label}</Text>
            </View>
          </View>
          {cluster.description && (
            <Text className="text-text-3 text-sm mb-2">{cluster.description}</Text>
          )}
          <Text className="text-xs text-text-3">📍 {cluster.state} · {cluster.lga}</Text>
          {cluster.address && (
            <Text className="text-xs text-text-3 mt-1">📌 {cluster.address}</Text>
          )}
        </Card>

        <Card className="mb-4">
          <Text className="font-bold text-text mb-3">Member Farms ({memberFarms.length})</Text>
          {memberFarms.length === 0 ? (
            <Text className="text-text-3 text-sm">No member farms listed.</Text>
          ) : (
            memberFarms.map((m, idx) => (
              <View
                key={`${m.name}-${idx}`}
                className={`py-2.5 ${idx < memberFarms.length - 1 ? 'border-b border-border' : ''}`}
              >
                <Text className="text-sm font-medium text-text">{m.name}</Text>
                <Text className="text-xs text-text-3 mt-0.5">{m.farmerName} · {m.size}</Text>
              </View>
            ))
          )}
        </Card>

        {!legacyOnly && (
          <Card className="mb-4">
            <Text className="font-bold text-text mb-1">Field Verification</Text>
            <VerificationProgress completedSteps={completedSteps} />
          </Card>
        )}

        {/*
          Kept for the clusters verified under the old one-shot form — their
          GPS pin and two photos are the only record of that visit, and
          dropping the display would lose it.
        */}
        {legacyOnly && (
          <Card className="mb-4 bg-green-50 border border-green-100">
            <Text className="font-bold text-green-500 mb-3">✅ Verified</Text>
            {legacy?.gpsLat != null && legacy.gpsLng != null && (
              <Text className="text-xs text-text-3 font-mono mb-3">
                {legacy.gpsLat.toFixed(6)}°N, {legacy.gpsLng.toFixed(6)}°E
                {legacy?.accuracyMeters != null ? ` (±${Math.round(legacy.accuracyMeters)}m)` : ''}
              </Text>
            )}
            {(legacy?.entrancePhotoUrl || legacy?.overviewPhotoUrl) && (
              <View className="flex-row gap-3 mb-3">
                {legacy?.entrancePhotoUrl && (
                  <View className="flex-1">
                    <Text className="text-xs text-text-3 mb-1">Entrance</Text>
                    <Image
                      source={{ uri: legacy.entrancePhotoUrl }}
                      className="w-full h-24 rounded-xl"
                      resizeMode="cover"
                    />
                  </View>
                )}
                {legacy?.overviewPhotoUrl && (
                  <View className="flex-1">
                    <Text className="text-xs text-text-3 mb-1">Overview</Text>
                    <Image
                      source={{ uri: legacy.overviewPhotoUrl }}
                      className="w-full h-24 rounded-xl"
                      resizeMode="cover"
                    />
                  </View>
                )}
              </View>
            )}
            {legacy?.coordinatorNotes && (
              <Text className="text-sm text-text-3 mb-2">&ldquo;{legacy.coordinatorNotes}&rdquo;</Text>
            )}
            {legacy?.verifiedAt && (
              <Text className="text-xs text-text-3">
                Verified{' '}
                {new Date(legacy.verifiedAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            )}
          </Card>
        )}

        <TouchableOpacity
          onPress={openWizard}
          className={`rounded-2xl p-4 items-center ${underReview ? 'bg-gray-300' : 'bg-green-500'}`}
          activeOpacity={0.85}
        >
          <Text className={`font-bold text-base ${underReview ? 'text-text-3' : 'text-white'}`}>
            {overallStatus === 'approved'
              ? 'Verification Approved'
              : overallStatus === 'submitted'
                ? 'Submitted: Waiting for Review'
                : completedSteps.length === 0
                  ? legacyOnly
                    ? 'Re-verify With Full Checklist'
                    : 'Start Verification'
                  : `Continue Verification (${completedSteps.length} of ${STEPS.length} done)`}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
