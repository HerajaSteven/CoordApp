import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clustersApi, uploadsApi } from '@/services/api';
import { useGPS } from '@/features/gps/useGPS';
import { useCamera, type CapturedPhoto } from '@/features/camera/useCamera';
import { Card, Button, Input, LoadingSpinner, ErrorMessage, HeaderBackButton } from '@/components/ui';
import { getErrorMessage } from '@/utils/errors';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: '#8896A7', bg: '#F5F7FA' },
  in_progress: { label: 'In Progress', color: '#F4B400', bg: '#FEF9E7' },
  verified:    { label: 'Verified',    color: '#0D7A3D', bg: '#E8F5EE' },
  flagged:     { label: 'Flagged',     color: '#EF4444', bg: '#FEF2F2' },
};

interface UploadedPhotoState {
  localUri: string;
  remoteUrl?: string;
}

function PhotoCaptureButton({
  label,
  photo,
  uploading,
  onCapture,
}: {
  label: string;
  photo: UploadedPhotoState | null;
  uploading: boolean;
  onCapture: () => void;
}) {
  return (
    <View className="mb-3">
      <Text className="text-sm font-medium text-text mb-1.5">{label}</Text>
      <TouchableOpacity
        onPress={onCapture}
        className={`h-28 rounded-xl overflow-hidden items-center justify-center border-2 border-dashed ${
          photo ? 'border-green-500' : 'border-border'
        }`}
      >
        {uploading ? (
          <ActivityIndicator color="#0D7A3D" />
        ) : photo ? (
          <Image source={{ uri: photo.localUri }} className="w-full h-full" resizeMode="cover" />
        ) : (
          <View className="items-center">
            <Text className="text-2xl">📷</Text>
            <Text className="text-xs text-text-3 mt-1">Tap to capture</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function ClusterDetailScreen() {
  const { clusterId } = useLocalSearchParams<{ clusterId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { currentLocation, isLocating, locateMe } = useGPS();
  const { takePhoto } = useCamera(clusterId);

  const [entrancePhoto, setEntrancePhoto] = useState<UploadedPhotoState | null>(null);
  const [overviewPhoto, setOverviewPhoto] = useState<UploadedPhotoState | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<'entrance' | 'overview' | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['cluster', clusterId],
    queryFn: () => clustersApi.get(clusterId),
    select: (res) => res.data.data,
  });

  const cluster = data?.cluster;

  // Cluster verification photos don't map to a farm application, so we upload
  // straight to Cloudinary via the presign step and skip the confirmPhoto call
  // (that endpoint is farm-application specific — see useCamera.ts uploadPhoto).
  const uploadToCloudinary = async (photo: CapturedPhoto): Promise<string | null> => {
    const { data: presignData } = await uploadsApi.presign(photo.filename, photo.mimeType);
    const { uploadUrl, signature, apiKey, timestamp, folder, publicId } = presignData.data;

    const formData = new FormData();
    formData.append('file', {
      uri: photo.localUri,
      type: photo.mimeType,
      name: photo.filename,
    } as unknown as Blob);
    formData.append('api_key', apiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
    formData.append('folder', folder);
    formData.append('public_id', publicId);

    const uploadResponse = await fetch(uploadUrl, { method: 'POST', body: formData });
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${errorText}`);
    }
    const result = (await uploadResponse.json()) as { secure_url: string };
    return result.secure_url;
  };

  const handleCapturePhoto = async (slot: 'entrance' | 'overview') => {
    const photo = await takePhoto(slot);
    if (!photo) return;
    setUploadingSlot(slot);
    try {
      const url = await uploadToCloudinary(photo);
      if (url) {
        const next = { localUri: photo.localUri, remoteUrl: url };
        if (slot === 'entrance') setEntrancePhoto(next);
        else setOverviewPhoto(next);
      }
    } catch (err) {
      Alert.alert('Upload Failed', getErrorMessage(err));
    } finally {
      setUploadingSlot(null);
    }
  };

  const submit = async () => {
    if (!currentLocation) {
      Alert.alert('GPS Required', 'Capture GPS location before submitting verification.');
      return;
    }
    setSubmitting(true);
    try {
      await clustersApi.verify(clusterId, {
        gpsLat: currentLocation.lat,
        gpsLng: currentLocation.lng,
        accuracyMeters: currentLocation.accuracyMeters,
        coordinatorNotes: notes || undefined,
        entrancePhotoUrl: entrancePhoto?.remoteUrl,
        overviewPhotoUrl: overviewPhoto?.remoteUrl,
      });
      await qc.invalidateQueries({ queryKey: ['cluster', clusterId] });
      await qc.invalidateQueries({ queryKey: ['clusters'] });
      router.back();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError || !cluster) return <ErrorMessage message="Could not load cluster farm." onRetry={refetch} />;

  const status = STATUS_CONFIG[cluster.status] ?? STATUS_CONFIG.pending;
  const isVerified = cluster.status === 'verified';
  const memberFarms = cluster.memberFarms ?? [];

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: cluster.label,
          headerStyle: { backgroundColor: '#0D7A3D' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold', color: '#fff' },
          headerLeft: () => <HeaderBackButton fallbackHref="/(tabs)/clusters" />,
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

        {isVerified ? (
          <Card className="mb-4 bg-green-50 border border-green-100">
            <Text className="font-bold text-green-500 mb-3">✅ Verified</Text>
            {cluster.verification.gpsLat != null && cluster.verification.gpsLng != null && (
              <Text className="text-xs text-text-3 font-mono mb-3">
                {cluster.verification.gpsLat.toFixed(6)}°N, {cluster.verification.gpsLng.toFixed(6)}°E
                {cluster.verification.accuracyMeters != null
                  ? ` (±${Math.round(cluster.verification.accuracyMeters)}m)`
                  : ''}
              </Text>
            )}
            {(cluster.verification.entrancePhotoUrl || cluster.verification.overviewPhotoUrl) && (
              <View className="flex-row gap-3 mb-3">
                {cluster.verification.entrancePhotoUrl && (
                  <View className="flex-1">
                    <Text className="text-xs text-text-3 mb-1">Entrance</Text>
                    <Image
                      source={{ uri: cluster.verification.entrancePhotoUrl }}
                      className="w-full h-24 rounded-xl"
                      resizeMode="cover"
                    />
                  </View>
                )}
                {cluster.verification.overviewPhotoUrl && (
                  <View className="flex-1">
                    <Text className="text-xs text-text-3 mb-1">Overview</Text>
                    <Image
                      source={{ uri: cluster.verification.overviewPhotoUrl }}
                      className="w-full h-24 rounded-xl"
                      resizeMode="cover"
                    />
                  </View>
                )}
              </View>
            )}
            {cluster.verification.coordinatorNotes && (
              <Text className="text-sm text-text-3 mb-2">&ldquo;{cluster.verification.coordinatorNotes}&rdquo;</Text>
            )}
            {cluster.verification.verifiedAt && (
              <Text className="text-xs text-text-3">
                Verified{' '}
                {new Date(cluster.verification.verifiedAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            )}
          </Card>
        ) : (
          <>
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
                  Stand at the cluster entrance and capture GPS. This is required before submitting.
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

            <Card className="mb-4">
              <Text className="font-bold text-text mb-3">Verification Photos (optional)</Text>
              <PhotoCaptureButton
                label="Entrance Photo"
                photo={entrancePhoto}
                uploading={uploadingSlot === 'entrance'}
                onCapture={() => handleCapturePhoto('entrance')}
              />
              <PhotoCaptureButton
                label="Overview Photo"
                photo={overviewPhoto}
                uploading={uploadingSlot === 'overview'}
                onCapture={() => handleCapturePhoto('overview')}
              />
            </Card>

            <Card className="mb-6">
              <Input
                label="Notes (optional)"
                placeholder="Observations, access instructions..."
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </Card>

            <Button
              label={submitting ? 'Submitting...' : 'Submit Verification'}
              onPress={submit}
              loading={submitting}
              disabled={!currentLocation || submitting}
              fullWidth
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}
