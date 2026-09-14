import React, { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { uploadCapturedFile } from '@/features/camera/platformFile';
import { View, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import { Text } from '@/components/ui/typography';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { harvestApi } from '@/services/api';
import { Card, Button, Input, LoadingSpinner, ErrorMessage, HeaderBackButton, Badge } from '@/components/ui';
import type { CollectableBatch, CollectableFarm } from '@/types';

/*
  ── HARVEST PICKUP ───────────────────────────────────────────────────────

  What a coordinator does when a cohort is ready: they arrive, count what
  they are taking, weigh a sample, and the platform settles it — money
  reaching a farmer.

  ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────

  No amount. Nothing on this screen calculates what anybody is paid; the
  platform does that from the headcount and the weight, and a second
  opinion computed on a phone would be a number somebody argues with.

  No offline queue, alone among this app's actions. A collection confirmed
  with no signal and replayed an hour later is a payment made against a
  cohort that may since have emptied — so it asks for a connection and
  says so, rather than promising to send it later.

  ── AND THE FARM LIST IS THE PLATFORM'S ──────────────────────────────────

  It offers only farms with open batches, because offering an emptied
  cohort produces a confirmation the platform then refuses, and offering a
  farm nobody enrolled invites a collection nobody arranged.
*/

function BatchRow({ batch, chosen, onPress }: {
  batch: CollectableBatch;
  chosen: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className={`p-3 rounded-xl mb-2 border-2 ${
        chosen ? 'border-green-500 bg-green-50' : 'border-border bg-card'
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text className="font-semibold text-text capitalize">
            {batch.category}
            {batch.breed ? ` · ${batch.breed}` : ''}
          </Text>
          <Text className="text-xs text-text-3 mt-0.5">
            {batch.remaining_quantity} remaining
            {batch.placed_at ? ` · placed ${new Date(batch.placed_at).toLocaleDateString()}` : ''}
          </Text>
        </View>
        {chosen && <Text className="text-green-500 text-lg">✓</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function HarvestPickupScreen() {
  const qc = useQueryClient();
  const [farm, setFarm] = useState<CollectableFarm | null>(null);
  const [batch, setBatch] = useState<CollectableBatch | null>(null);
  const [headcount, setHeadcount] = useState('');
  const [avgWeight, setAvgWeight] = useState('');
  const [saving, setSaving] = useState(false);
  /*
    ── WHAT THE PAYMENT NOW WAITS ON ─────────────────────────────────────

    A pickup used to be paid the moment it was confirmed here, on this
    screen's numbers alone. Now the farmer and, when a driver takes it,
    logistics each record the weight with photos, and the farmer and driver
    are paid only when those weights agree with the coordinator's. So this
    screen asks for photos of the weighing, and for the driver.
  */
  const [driverId, setDriverId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<Array<{ uri: string; fileId: string | null }>>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const driversQuery = useQuery({
    queryKey: ['harvest', 'drivers'],
    queryFn: () => harvestApi.drivers(),
    select: (res) => res.data.data,
  });

  const addWeighingPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Camera', 'Camera access is needed to photograph the weighing.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75, exif: false });
    if (shot.canceled || !shot.assets[0]) return;

    const uri = shot.assets[0].uri;
    setPhotos((prev) => [...prev, { uri, fileId: null }]);
    setUploadingPhoto(true);
    try {
      const fileId = await uploadCapturedFile({ localUri: uri, filename: `${Date.now()}-weighing.jpg`, mimeType: 'image/jpeg' });
      setPhotos((prev) => prev.map((p) => (p.uri === uri ? { ...p, fileId } : p)));
    } catch (err: unknown) {
      setPhotos((prev) => prev.filter((p) => p.uri !== uri));
      Alert.alert(
        'Photo not uploaded',
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
          'The photo could not be uploaded. Check your connection and take it again.'
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const farmsQuery = useQuery({
    queryKey: ['harvest', 'collectable-farms'],
    queryFn: () => harvestApi.collectableFarms(),
    select: (res) => res.data.data,
  });

  const thresholdsQuery = useQuery({
    queryKey: ['harvest', 'thresholds'],
    queryFn: () => harvestApi.thresholds(),
    select: (res) => res.data.data,
  });

  const farms = farmsQuery.data ?? [];

  /*
    The platform holds these as settings and they are empty today, which
    means nothing is enforced. Said out loud rather than left implied: a
    coordinator should know whether a rule exists before they rely on one
    catching a mistake.
  */
  const minHeadcount = thresholdsQuery.data?.min_headcount_by_category ?? {};
  const minWeight = thresholdsQuery.data?.min_avg_weight_kg_by_category ?? {};
  const ruleFor = (category: string) => ({
    headcount: (minHeadcount as Record<string, number>)[category],
    weight: (minWeight as Record<string, number>)[category],
  });

  const confirm = async () => {
    if (!farm || !batch) return;

    const count = Number(headcount);
    const weight = avgWeight.trim();

    if (!Number.isInteger(count) || count <= 0) {
      Alert.alert('Headcount', 'Enter how many were actually collected.');
      return;
    }

    if (count > batch.remaining_quantity) {
      Alert.alert(
        'More than is there',
        `This cohort has ${batch.remaining_quantity} remaining. Collecting ${count} is not possible — check the count before confirming.`
      );
      return;
    }

    if (weight === '' || Number(weight) <= 0) {
      Alert.alert('Average weight', 'Enter the average weight in kilograms.');
      return;
    }

    const evidence = photos.map((p) => p.fileId).filter((id): id is string => id !== null);
    if (evidence.length === 0) {
      Alert.alert('Photo of the weighing', 'Take at least one photo of the harvest being weighed, showing the scale.');
      return;
    }
    if (uploadingPhoto) {
      Alert.alert('Still uploading', 'Wait for the photo to finish uploading.');
      return;
    }

    /*
      Asked for, not queued. This settles money, and a replay against an
      emptied cohort pays for animals nobody collected.
    */
    const network = await Network.getNetworkStateAsync();
    if (!network.isConnected) {
      Alert.alert(
        'No connection',
        'A pickup is recorded against the cohort the moment it is confirmed, so it cannot be saved for later. Find signal and confirm it then.'
      );
      return;
    }

    const rule = ruleFor(batch.category);
    const belowRule =
      (rule.headcount !== undefined && count < rule.headcount) ||
      (rule.weight !== undefined && Number(weight) < rule.weight);

    const send = async () => {
      setSaving(true);
      try {
        await harvestApi.confirm({
          livestock_batch_id: batch.id,
          farm_identity_id: farm.farm_identity_id,
          category: batch.category,
          headcount_collected: count,
          avg_weight_kg: weight,
          driver_id: driverId ?? undefined,
          evidence_file_ids: evidence,
        });

        await qc.invalidateQueries({ queryKey: ['harvest'] });

        Alert.alert(
          'Recorded',
          driverId
            ? 'The pickup is recorded. The farmer and driver are paid once their weights match yours.'
            : 'The pickup is recorded. The farmer is paid once their weight matches yours.',
          [{ text: 'OK' }]
        );

        setFarm(null);
        setBatch(null);
        setHeadcount('');
        setAvgWeight('');
        setDriverId(null);
        setPhotos([]);
      } catch (err: unknown) {
        Alert.alert(
          'Not recorded',
          (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
            ?.message ?? 'The platform refused this pickup.'
        );
      } finally {
        setSaving(false);
      }
    };

    if (belowRule) {
      Alert.alert(
        'Below the minimum',
        'This is under what the platform expects for this category. Confirm only if the count and weight are right.',
        [{ text: 'Check again', style: 'cancel' }, { text: 'Confirm anyway', onPress: send }]
      );
      return;
    }

    await send();
  };

  if (farmsQuery.isLoading) return <LoadingSpinner />;

  if (farmsQuery.isError) {
    return (
      <View className="flex-1 bg-bg">
        <Stack.Screen options={{ title: 'Harvest Pickup', headerShown: true }} />
        <ErrorMessage message="Could not load what is ready to collect." onRetry={farmsQuery.refetch} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          title: 'Harvest Pickup',
          headerShown: true,
          headerLeft: () => <HeaderBackButton fallbackHref="/(tabs)" />,
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {farms.length === 0 ? (
          <Card>
            <Text className="font-bold text-text mb-1">Nothing ready to collect</Text>
            <Text className="text-text-3 text-sm">
              None of the farms enrolled in your clusters has an open cohort. A farm appears here
              once it has livestock placed and still on hand.
            </Text>
          </Card>
        ) : (
          <>
            <Text className="font-bold text-text mb-3">Which farm?</Text>
            {farms.map((option) => (
              <TouchableOpacity
                key={option.farm_profile_id}
                activeOpacity={0.85}
                onPress={() => {
                  setFarm(option);
                  setBatch(null);
                }}
              >
                <Card
                  className={`mb-3 ${
                    farm?.farm_profile_id === option.farm_profile_id ? 'border border-green-500' : ''
                  }`}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <Text className="font-bold text-text" numberOfLines={1}>
                        {option.farm_name}
                      </Text>
                      <Text className="text-xs text-text-3 mt-0.5">
                        {option.batches.length}{' '}
                        {option.batches.length === 1 ? 'open cohort' : 'open cohorts'}
                      </Text>
                    </View>
                    <Badge
                      label={`${option.batches.reduce((n, b) => n + b.remaining_quantity, 0)}`}
                      variant="green"
                    />
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}

        {farm && (
          <Card className="mb-4">
            <Text className="font-bold text-text mb-3">Which cohort?</Text>
            {farm.batches.map((option) => (
              <BatchRow
                key={option.id}
                batch={option}
                chosen={batch?.id === option.id}
                onPress={() => setBatch(option)}
              />
            ))}
          </Card>
        )}

        {farm && batch && (
          <Card className="mb-4">
            <Text className="font-bold text-text mb-1">What was collected</Text>
            <Text className="text-text-3 text-xs mb-3">
              The farmer and driver are paid only when their own weights match this one. Nothing
              on this screen decides what anybody is paid.
            </Text>

            <Input
              label={`Headcount collected (of ${batch.remaining_quantity})`}
              value={headcount}
              onChangeText={setHeadcount}
              keyboardType="numeric"
              placeholder="120"
            />

            <Input
              label="Average weight (kg)"
              value={avgWeight}
              onChangeText={setAvgWeight}
              keyboardType="numeric"
              placeholder="2.4"
            />

            <Text className="font-semibold text-text mt-2 mb-2">Photos of the weighing</Text>
            <View className="flex-row flex-wrap gap-2 mb-2">
              {photos.map((photo) => (
                <View key={photo.uri} className="w-20 h-20 rounded-lg overflow-hidden border border-border">
                  <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} />
                  {photo.fileId === null && (
                    <View className="absolute inset-0 items-center justify-center bg-black/40">
                      <Text className="text-white text-[10px]">Uploading</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
            <Button
              label={photos.length === 0 ? 'Photograph the Scale' : 'Add Another Photo'}
              onPress={addWeighingPhoto}
              variant="secondary"
              loading={uploadingPhoto}
              fullWidth
            />

            <Text className="font-semibold text-text mt-4 mb-1">Driver collecting</Text>
            <Text className="text-text-3 text-xs mb-2">
              The driver records the weight at pickup too, and is paid when it matches.
            </Text>
            {(driversQuery.data ?? []).length === 0 ? (
              <Text className="text-text-3 text-xs mb-2">
                {driversQuery.isError ? 'Could not load drivers.' : 'No drivers are registered, so this pickup has no logistics weight.'}
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-2 mb-2">
                <TouchableOpacity onPress={() => setDriverId(null)} className={`px-3 py-2 rounded-full border ${driverId === null ? 'bg-green-500 border-green-500' : 'border-border'}`}>
                  <Text className={driverId === null ? 'text-white text-xs' : 'text-text text-xs'}>No driver</Text>
                </TouchableOpacity>
                {(driversQuery.data ?? []).map((d) => (
                  <TouchableOpacity key={d.id} onPress={() => setDriverId(d.id)} className={`px-3 py-2 rounded-full border ${driverId === d.id ? 'bg-green-500 border-green-500' : 'border-border'}`}>
                    <Text className={driverId === d.id ? 'text-white text-xs' : 'text-text text-xs'}>{d.fullName}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {thresholdsQuery.data &&
              ruleFor(batch.category).headcount === undefined &&
              ruleFor(batch.category).weight === undefined && (
                <Text className="text-text-3 text-xs mt-1">
                  No minimum is set for {batch.category} yet, so nothing here will be checked
                  against one.
                </Text>
              )}
          </Card>
        )}

        {farm && batch && (
          <Button
            label={saving ? 'Confirming…' : 'Confirm Pickup'}
            onPress={confirm}
            loading={saving}
            fullWidth
          />
        )}
      </ScrollView>
    </View>
  );
}
