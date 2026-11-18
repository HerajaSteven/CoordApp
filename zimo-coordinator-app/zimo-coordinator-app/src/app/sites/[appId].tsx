import React, { useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { Text, FACE } from '@/components/ui/typography';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sitesApi } from '@/services/api';
import { useGPS } from '@/features/gps/useGPS';
import { Card, Button, Input, LoadingSpinner, ErrorMessage, ProgressBar, HeaderBackButton } from '@/components/ui';
import type { FarmSite, OfflineQueueItem } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { offlineSiteId } from '@/utils/offlineIds';
import { useOfflineStore } from '@/store/offline.store';

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

function SiteCard({ site, onPress, onVerify, syncStatus }: {
  site: FarmSite;
  onPress: () => void;
  onVerify: () => void;
  syncStatus?: 'pending' | 'failed';
}) {
  const status = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.pending;
  const units = site.unitSummary;

  return (
    <Card className="mb-3">
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <View className="flex-row items-center justify-between mb-1">
          <View className="flex-row items-center flex-1 mr-3">
            <Text className="text-2xl mr-2">📍</Text>
            <View className="flex-1">
              <Text className="font-bold text-text" numberOfLines={1}>{site.label}</Text>
              <Text className="text-xs text-text-3 font-mono mt-0.5">
                {syncStatus ? (syncStatus === 'failed' ? 'Sync failed · retry pending' : 'Saved on this device') : site.siteId}
              </Text>
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
      </TouchableOpacity>
      <TouchableOpacity onPress={onVerify} className="mt-3 pt-3 border-t border-border">
        <Text className="text-sm text-green-500 font-semibold">Boundary walk & full site verification →</Text>
      </TouchableOpacity>
    </Card>
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
  const insets = useSafeAreaInsets();
  const enqueue = useOfflineStore((state) => state.enqueue);
  const { currentLocation, isLocating, locateMe } = useGPS();

  const { control, handleSubmit, reset, formState: { errors } } = useForm<CreateSiteForm>({
    resolver: zodResolver(createSiteSchema),
    defaultValues: { label: '', address: '', notes: '' },
  });

  const submit = async (data: CreateSiteForm) => {
    setLoading(true);
    try {
      const body = {
        label: data.label,
        address: data.address || undefined,
        notes: data.notes || undefined,
      };
      const clientId = enqueue('sites', appId, { body });
      if (currentLocation) {
        enqueue('fieldActions', appId, {
          action: 'verifySite',
          siteId: offlineSiteId(clientId),
          body: {
            gpsLat: currentLocation.lat,
            gpsLng: currentLocation.lng,
            accuracyMeters: currentLocation.accuracyMeters,
          },
        });
        enqueue('gpsCenters', appId, {
          centerLat: currentLocation.lat,
          centerLng: currentLocation.lng,
          accuracyMeters: currentLocation.accuracyMeters,
          siteId: offlineSiteId(clientId),
          unitId: null,
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
        <View className="flex-row items-center justify-between px-5 pb-4 bg-white border-b border-border" style={{ paddingTop: insets.top + 8 }}>
          <Text className="text-lg font-bold text-text">Add New Site</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-green-500 font-medium">Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Card className="mb-4">
            <Text className="text-text-3 text-sm mb-3">
              A site is a physical location (e.g. a cluster of ponds, or a farm plot).
              After creating it, record its boundary walk and complete site verification, then add its ponds/plots.
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
  const queue = useOfflineStore((state) => state.queue);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['sites', appId],
    queryFn: () => sitesApi.list(appId),
    select: (res) => res.data.data,
  });

  const sites = data?.sites ?? [];
  const localSites = queue
    .filter((item) => item.collection === 'sites' && item.appId === appId && item.status !== 'synced')
    .map((item: OfflineQueueItem) => {
      const body = item.payload.body as Record<string, unknown>;
      const timestamp = item.clientTimestamp;
      const site: FarmSite = {
        _id: item.clientId,
        registrationId: '',
        appId,
        siteId: offlineSiteId(item.clientId),
        siteNumber: 0,
        label: String(body.label ?? 'New site'),
        address: typeof body.address === 'string' ? body.address : null,
        notes: typeof body.notes === 'string' ? body.notes : null,
        status: 'pending',
        verification: {
          gpsLat: null,
          gpsLng: null,
          accuracyMeters: null,
          gpsVerifiedAt: null,
          entrancePhotoUrl: null,
          overviewPhotoUrl: null,
          coordinatorNotes: null,
          verifiedAt: null,
          verifiedBy: null,
        },
        createdBy: '',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return { item, site };
    });
  const summary = data?.summary;

  const handleSiteCreated = async () => {
    setShowAddModal(false);
    await qc.invalidateQueries({ queryKey: ['sites', appId] });
    await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
  };

  if (isLoading && localSites.length === 0) return <LoadingSpinner />;
  if (!data && localSites.length === 0) {
    return (
      <ErrorMessage
        message="No saved site list is available on this device. Connect once to download this farm’s sites for offline use."
        onRetry={refetch}
      />
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Farm Sites',
          headerStyle: { backgroundColor: '#0D7A3D' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontFamily: FACE.bold, color: '#fff' },
          headerLeft: () => <HeaderBackButton fallbackHref={`/farm/${appId}`} />,
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
        {sites.length === 0 && localSites.length === 0 ? (
          <Card className="items-center py-12 mt-4">
            <Text className="text-5xl mb-3">📍</Text>
            <Text className="font-bold text-text text-base mb-1">No sites added yet</Text>
            <Text className="text-text-3 text-sm text-center mb-4">
              Add each location, complete its boundary walk and site verification, then add ponds/plots within it.
            </Text>
          </Card>
        ) : (
          <>
            {sites.map((site) => (
              <SiteCard
                key={site.siteId}
                site={site}
                onVerify={() =>
                  router.push({
                    pathname: '/verification/[appId]',
                    params: { appId, siteId: site.siteId, siteLabel: site.label },
                  })
                }
                onPress={() =>
                  router.push({
                    pathname: '/units/[appId]',
                    params: { appId, siteId: site.siteId, siteLabel: site.label },
                  })
                }
              />
            ))}
            {localSites.map(({ item, site }) => (
              <SiteCard
                key={item.clientId}
                site={site}
                syncStatus={item.status === 'failed' ? 'failed' : 'pending'}
                onVerify={() =>
                  router.push({
                    pathname: '/verification/[appId]',
                    params: { appId, siteId: site.siteId, siteLabel: site.label },
                  })
                }
                onPress={() =>
                  router.push({
                    pathname: '/units/[appId]',
                    params: { appId, siteId: site.siteId, siteLabel: site.label },
                  })
                }
              />
            ))}
          </>
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
