import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { sitesApi } from '@/services/api';
import { useGPS } from '@/features/gps/useGPS';
import { Card, Button, Input, LoadingSpinner, ErrorMessage, ProgressBar } from '@/components/ui';
import type { FarmSite } from '@/types';
import { getErrorMessage } from '@/utils/errors';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: '#8896A7', bg: '#F5F7FA' },
  in_progress: { label: 'In Progress', color: '#F4B400', bg: '#FEF9E7' },
  verified:    { label: 'Verified',    color: '#0D7A3D', bg: '#E8F5EE' },
  flagged:     { label: 'Flagged',     color: '#EF4444', bg: '#FEF2F2' },
};

const createSiteSchema = z.object({
  label: z.string().min(2, 'Label must be at least 2 characters').max(200),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});
type CreateSiteForm = z.infer<typeof createSiteSchema>;

function SiteCard({ site, onPress }: { site: FarmSite; onPress: () => void }) {
  const status = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.pending;
  const units = site.unitSummary;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Card className="mb-3">
        <View className="flex-row items-center justify-between mb-1">
          <View className="flex-row items-center flex-1 mr-3">
            <Text className="text-2xl mr-2">📍</Text>
            <View className="flex-1">
              <Text className="font-bold text-text" numberOfLines={1}>{site.label}</Text>
              <Text className="text-xs text-text-3 font-mono mt-0.5">{site.siteId}</Text>
            </View>
          </View>
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: status.bg }}>
            <Text className="text-xs font-semibold" style={{ color: status.color }}>{status.label}</Text>
          </View>
        </View>

        {site.address && (
          <Text className="text-xs text-text-3 mt-1" numberOfLines={1}>📌 {site.address}</Text>
        )}

        {units && units.total > 0 ? (
          <View className="mt-2">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-xs text-text-3">{units.verified} of {units.total} units verified</Text>
            </View>
            <ProgressBar value={units.verified} max={units.total} />
          </View>
        ) : (
          <Text className="text-xs text-yellow-500 font-medium mt-2">No units added yet — tap to add</Text>
        )}
      </Card>
    </TouchableOpacity>
  );
}

function AddSiteModal({
  appId,
  visible,
  onClose,
  onCreated,
}: {
  appId: string;
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const { currentLocation, isLocating, locateMe } = useGPS();

  const { control, handleSubmit, reset, formState: { errors } } = useForm<CreateSiteForm>({
    resolver: zodResolver(createSiteSchema),
    defaultValues: { label: '', address: '', notes: '' },
  });

  const submit = async (data: CreateSiteForm) => {
    setLoading(true);
    try {
      const created = await sitesApi.create(appId, {
        label: data.label,
        address: data.address || undefined,
        notes: data.notes || undefined,
      });

      // If GPS was captured, immediately verify the site with it
      if (currentLocation) {
        const siteId = created.data.data.siteId;
        await sitesApi.verify(appId, siteId, {
          gpsLat: currentLocation.lat,
          gpsLng: currentLocation.lng,
          accuracyMeters: currentLocation.accuracyMeters,
        });
      }

      reset();
      onCreated();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View className="flex-1 bg-bg">
        <View className="flex-row items-center justify-between px-5 pt-6 pb-4 bg-white border-b border-border">
          <Text className="text-lg font-bold text-text">Add New Site</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-green-500 font-medium">Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Card className="mb-4">
            <Text className="text-text-3 text-sm mb-3">
              A site is a physical location (e.g. a cluster of ponds, or a farm plot).
              You'll add individual ponds/plots inside this site next.
            </Text>
            <Controller
              control={control}
              name="label"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Site Name *"
                  placeholder='e.g. "Orolu Pond Cluster" or "North Field"'
                  value={value}
                  onChangeText={onChange}
                  error={errors.label?.message}
                  containerStyle={{ marginBottom: 12 }}
                />
              )}
            />
            <Controller
              control={control}
              name="address"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Address (optional)"
                  placeholder="Free-text address or landmark"
                  value={value ?? ''}
                  onChangeText={onChange}
                />
              )}
            />
          </Card>

          <Card className="mb-4">
            <Text className="font-bold text-text mb-3">GPS Location</Text>
            {currentLocation ? (
              <View className="bg-green-50 rounded-xl p-3 mb-3">
                <Text className="text-green-500 font-semibold text-sm">📍 Location captured</Text>
                <Text className="text-xs text-text-3 font-mono mt-1">
                  {currentLocation.lat.toFixed(6)}°N, {currentLocation.lng.toFixed(6)}°E
                </Text>
              </View>
            ) : (
              <Text className="text-text-3 text-sm mb-3">
                Stand at the site entrance and capture GPS (optional — you can verify the site later).
              </Text>
            )}
            <Button
              label={isLocating ? 'Locating...' : 'Capture GPS'}
              onPress={locateMe}
              loading={isLocating}
              variant="secondary"
              fullWidth
            />
          </Card>

          <Card className="mb-6">
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Notes (optional)"
                  placeholder="Access instructions, landmarks, observations..."
                  value={value ?? ''}
                  onChangeText={onChange}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              )}
            />
          </Card>

          <Button
            label={loading ? 'Creating...' : 'Create Site'}
            onPress={handleSubmit(submit)}
            loading={loading}
            fullWidth
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function SitesScreen() {
  const { appId } = useLocalSearchParams<{ appId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['sites', appId],
    queryFn: () => sitesApi.list(appId),
    select: (res) => res.data.data,
  });

  const sites = data?.sites ?? [];
  const summary = data?.summary;

  const handleSiteCreated = async () => {
    setShowAddModal(false);
    await qc.invalidateQueries({ queryKey: ['sites', appId] });
    await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorMessage message="Could not load sites." onRetry={refetch} />;

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Farm Sites',
          headerStyle: { backgroundColor: '#0D7A3D' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold', color: '#fff' },
        }}
      />

      {summary && summary.total > 0 && (
        <View className="bg-white px-5 py-3 border-b border-border">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-sm font-medium text-text">
              {summary.verified} of {summary.total} sites verified
            </Text>
            <Text className="text-xs text-text-3">
              {summary.inProgress} in progress · {summary.pending} pending
            </Text>
          </View>
          <ProgressBar value={summary.verified} max={summary.total} />
          {summary.allVerified && (
            <Text className="text-xs text-green-500 font-semibold mt-1.5">
              ✅ All sites verified — farmer registration complete
            </Text>
          )}
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0D7A3D" />}
      >
        {sites.length === 0 ? (
          <Card className="items-center py-12 mt-4">
            <Text className="text-5xl mb-3">📍</Text>
            <Text className="font-bold text-text text-base mb-1">No sites added yet</Text>
            <Text className="text-text-3 text-sm text-center mb-4">
              Travel to each location and tap "Add Site" to register it, then add ponds/plots within it.
            </Text>
          </Card>
        ) : (
          sites.map((site) => (
            <SiteCard
              key={site.siteId}
              site={site}
              onPress={() =>
                router.push({
                  pathname: '/units/[appId]',
                  params: { appId, siteId: site.siteId, siteLabel: site.label },
                })
              }
            />
          ))
        )}
      </ScrollView>

      <View className="absolute bottom-8 left-5 right-5">
        <Button label="＋ Add New Site" onPress={() => setShowAddModal(true)} fullWidth size="lg" />
      </View>

      <AddSiteModal
        appId={appId}
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={handleSiteCreated}
      />
    </View>
  );
}
