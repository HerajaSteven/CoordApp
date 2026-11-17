import React, { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { nanoid } from 'nanoid';
import { uploadCapturedFile } from '@/features/camera/platformFile';
import { View, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import { Text } from '@/components/ui/typography';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { harvestApi } from '@/services/api';
import { Card, Button, Input, LoadingSpinner, ErrorMessage, HeaderBackButton, Badge } from '@/components/ui';
import type { CollectableBatch, CollectableFarm } from '@/types';
import { useHarvestDraftStore, type HarvestPickupDraft, type HarvestPhotoDraft } from '@/store/harvestDraft.store';
import { getErrorMessage } from '@/utils/errors';

/*
  What a coordinator does when a cohort is ready: they arrive, count what
  they are taking, weigh a sample, and the platform settles it — money
  reaching a farmer.

  No amount. Nothing on this screen calculates what anybody is paid; the
  platform does that from the headcount and the weight, and a second
  opinion computed on a phone would be a number somebody argues with.

  An offline draft is never replayed automatically. Before money or
  inventory can change, a coordinator must reconnect, review the draft,
  recheck the live batch, and explicitly confirm it.

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
  const drafts = useHarvestDraftStore((state) => state.drafts);
  const savePickupDraft = useHarvestDraftStore((state) => state.saveDraft);
  const removePickupDraft = useHarvestDraftStore((state) => state.removeDraft);
  const [farm, setFarm] = useState<CollectableFarm | null>(null);
  const [batch, setBatch] = useState<CollectableBatch | null>(null);
  const [headcount, setHeadcount] = useState('');
  const [avgWeight, setAvgWeight] = useState('');
  const [saving, setSaving] = useState(false);
  /*
    A pickup used to be paid the moment it was confirmed here, on this
    screen's numbers alone. Now the farmer and, when a driver takes it,
    logistics each record the weight with photos, and the farmer and driver
    are paid only when those weights agree with the coordinator's. So this
    screen asks for photos of the weighing, and for the driver.
  */
  const [driverId, setDriverId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<HarvestPhotoDraft[]>([]);
  const [savingPhoto, setSavingPhoto] = useState(false);

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

    const sourceUri = shot.assets[0].uri;
    const directory = FileSystem.documentDirectory;
    if (!directory) {
      Alert.alert('Photo not saved', 'Persistent photo storage is unavailable on this device.');
      return;
    }

    const filename = `${nanoid(16)}-weighing.jpg`;
    const photoDirectory = `${directory}harvest-photos/`;
    const localUri = `${photoDirectory}${filename}`;
    setSavingPhoto(true);
    try {
      await FileSystem.makeDirectoryAsync(photoDirectory, { intermediates: true });
      await FileSystem.copyAsync({ from: sourceUri, to: localUri });
      setPhotos((prev) => [...prev, {
        localUri,
        filename,
        mimeType: 'image/jpeg',
        clientId: nanoid(32),
      }]);
    } catch (error) {
      console.error('Harvest weighing photo could not be saved locally.', error);
      Alert.alert('Photo not saved', 'The photo could not be stored on this device. Please take it again.');
    } finally {
      setSavingPhoto(false);
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

  const resetForm = () => {
    setFarm(null);
    setBatch(null);
    setHeadcount('');
    setAvgWeight('');
    setDriverId(null);
    setPhotos([]);
  };

  const makeDraft = (): HarvestPickupDraft | null => {
    if (!farm || !batch) return null;
    return {
      id: nanoid(32),
      farm,
      batch,
      headcount,
      avgWeightKg: avgWeight,
      driverId,
      photos,
      savedAt: Date.now(),
    };
  };

  const saveCurrentDraft = () => {
    const draft = makeDraft();
    if (!draft) {
      Alert.alert('Choose a cohort', 'Select a farm and cohort before saving a pickup draft.');
      return;
    }

    savePickupDraft(draft);
    resetForm();
    Alert.alert('Draft saved', 'This pickup is saved on this device. It will not be sent until you review and confirm it online.');
  };

  const sendDraft = async (draft: HarvestPickupDraft) => {
    const count = Number(draft.headcount);
    const weight = draft.avgWeightKg.trim();
    if (!Number.isInteger(count) || count <= 0) {
      Alert.alert('Incomplete draft', 'Remove this draft, enter a valid headcount, and save it again before confirming.');
      return;
    }
    if (weight === '' || Number(weight) <= 0) {
      Alert.alert('Incomplete draft', 'Remove this draft, enter a valid average weight, and save it again before confirming.');
      return;
    }
    if (draft.photos.length === 0) {
      Alert.alert('Incomplete draft', 'Remove this draft, add a weighing photo, and save it again before confirming.');
      return;
    }

    let online = false;
    try {
      const network = await Network.getNetworkStateAsync();
      online = Boolean(network.isConnected) && network.isInternetReachable !== false;
    } catch (error) {
      console.warn('Network status could not be checked; harvest draft remains local.', error);
    }
    if (!online) {
      Alert.alert('Still saved on this device', 'Reconnect before reviewing and confirming this pickup.');
      return;
    }

    setSaving(true);
    try {
      const response = await harvestApi.collectableFarms();
      const currentFarm = response.data.data.find(
        (option) => option.farm_profile_id === draft.farm.farm_profile_id
      );
      const currentBatch = currentFarm?.batches.find((option) => option.id === draft.batch.id);
      if (!currentFarm || !currentBatch) {
        Alert.alert('Cohort unavailable', 'This cohort is no longer available. The draft is retained for review.');
        return;
      }
      if (count > currentBatch.remaining_quantity) {
        Alert.alert(
          'More than is available',
          `The latest server count is ${currentBatch.remaining_quantity}. The draft was kept and nothing was submitted.`
        );
        return;
      }

      const evidence: string[] = [];
      for (const photo of draft.photos) {
        evidence.push(await uploadCapturedFile({
          localUri: photo.localUri,
          filename: photo.filename,
          mimeType: photo.mimeType,
          clientId: photo.clientId,
        }));
      }

      await harvestApi.confirm({
        livestock_batch_id: currentBatch.id,
        farm_identity_id: currentFarm.farm_identity_id,
        category: currentBatch.category,
        headcount_collected: count,
        avg_weight_kg: weight,
        driver_id: draft.driverId ?? undefined,
        evidence_file_ids: evidence,
      }, draft.id);

      removePickupDraft(draft.id);
      await qc.invalidateQueries({ queryKey: ['harvest'] });
      Alert.alert(
        'Recorded',
        draft.driverId
          ? 'The pickup is recorded. The farmer and driver are paid once their weights match yours.'
          : 'The pickup is recorded. The farmer is paid once their weight matches yours.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert('Not recorded', `${getErrorMessage(error)} The draft is retained so you can safely retry.`);
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    const draft = makeDraft();
    if (!draft) return;

    const count = Number(draft.headcount);
    if (!Number.isInteger(count) || count <= 0) {
      Alert.alert('Headcount', 'Enter how many were actually collected.');
      return;
    }
    if (!draft.avgWeightKg.trim() || Number(draft.avgWeightKg) <= 0) {
      Alert.alert('Average weight', 'Enter the average weight in kilograms.');
      return;
    }
    if (draft.photos.length === 0) {
      Alert.alert('Photo of the weighing', 'Take at least one photo showing the weighing scale.');
      return;
    }

    savePickupDraft(draft);
    resetForm();
    const rule = ruleFor(draft.batch.category);
    const belowRule =
      (rule.headcount !== undefined && count < rule.headcount) ||
      (rule.weight !== undefined && Number(draft.avgWeightKg) < rule.weight);

    let online = false;
    try {
      const network = await Network.getNetworkStateAsync();
      online = Boolean(network.isConnected) && network.isInternetReachable !== false;
    } catch (error) {
      console.warn('Network status could not be checked; pickup will remain a draft.', error);
    }
    if (!online) {
      Alert.alert('Pickup saved', 'The pickup is saved on this device. It will not be submitted until you review and confirm it online.');
      return;
    }

    if (belowRule) {
      Alert.alert(
        'Below the minimum',
        'This is under what the platform expects for this category. Confirm only if the count and weight are right.',
        [{ text: 'Review later', style: 'cancel' }, { text: 'Confirm anyway', onPress: () => void sendDraft(draft) }]
      );
      return;
    }

    await sendDraft(draft);
  };

  const deleteDraft = async (draft: HarvestPickupDraft) => {
    removePickupDraft(draft.id);
    for (const photo of draft.photos) {
      try {
        await FileSystem.deleteAsync(photo.localUri, { idempotent: true });
      } catch (error) {
        console.warn('A removed harvest draft photo could not be deleted.', error);
      }
    }
  };

  if (farmsQuery.isLoading && !farmsQuery.data && drafts.length === 0) return <LoadingSpinner />;

  if (farmsQuery.isError && !farmsQuery.data && drafts.length === 0) {
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
        {drafts.length > 0 && (
          <Card className="mb-4">
            <Text className="font-bold text-text mb-1">Pickup drafts · {drafts.length}</Text>
            <Text className="text-text-3 text-xs mb-3">
              Drafts stay on this device. Review a draft and confirm it manually while online; saved drafts are never submitted automatically.
            </Text>
            {drafts.map((draft) => (
              <View key={draft.id} className="border-t border-border py-3">
                <Text className="font-semibold text-text">{draft.farm.farm_name}</Text>
                <Text className="text-xs text-text-3 mt-0.5">
                  {draft.batch.category} · {draft.headcount || 'count not entered'} collected · Saved on this device
                </Text>
                <Text className="text-xs text-text-3 mt-0.5">
                  {draft.photos.length} weighing photo{draft.photos.length === 1 ? '' : 's'} · {new Date(draft.savedAt).toLocaleString()}
                </Text>
                <View className="flex-row items-center mt-2">
                  <View className="flex-1 mr-2">
                    <Button
                      label={saving ? 'Checking…' : 'Review & confirm online'}
                      onPress={() => void sendDraft(draft)}
                      loading={saving}
                      disabled={saving}
                      fullWidth
                    />
                  </View>
                  <TouchableOpacity onPress={() => void deleteDraft(draft)} disabled={saving}>
                    <Text className="text-red-500 text-xs font-semibold px-2">Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </Card>
        )}

        {farmsQuery.isError && !farmsQuery.data && (
          <Card className="mb-4">
            <Text className="text-text-3 text-sm">
              Farm and cohort lists are not available right now. Saved pickup drafts are still available above.
            </Text>
          </Card>
        )}

        {farms.length === 0 && farmsQuery.data ? (
          <Card>
            <Text className="font-bold text-text mb-1">Nothing ready to collect</Text>
            <Text className="text-text-3 text-sm">
              None of the farms enrolled in your clusters has an open cohort. A farm appears here
              once it has livestock placed and still on hand.
            </Text>
          </Card>
        ) : farms.length > 0 ? (
          <>
            <Text className="font-bold text-text mb-3">Which farm?</Text>
            {farms.map((option) => (
              <TouchableOpacity
                key={option.farm_profile_id}
                activeOpacity={0.85}
                onPress={() => {
                  setFarm(option);
                  setBatch(null);
                  setHeadcount('');
                  setAvgWeight('');
                  setDriverId(null);
                  setPhotos([]);
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
        ) : null}

        {farm && (
          <Card className="mb-4">
            <Text className="font-bold text-text mb-3">Which cohort?</Text>
            {farm.batches.map((option) => (
              <BatchRow
                key={option.id}
                batch={option}
                chosen={batch?.id === option.id}
                onPress={() => {
                  setBatch(option);
                  setHeadcount('');
                  setAvgWeight('');
                  setPhotos([]);
                }}
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
                <View key={photo.clientId} className="w-20 h-20 rounded-lg overflow-hidden border border-border">
                  <Image source={{ uri: photo.localUri }} style={{ width: '100%', height: '100%' }} />
                  <View className="absolute inset-0 items-center justify-center bg-black/30">
                    <Text className="text-white text-[10px]">Saved locally</Text>
                  </View>
                </View>
              ))}
            </View>
            <Button
              label={photos.length === 0 ? 'Photograph the Scale' : 'Add Another Photo'}
              onPress={addWeighingPhoto}
              variant="secondary"
              loading={savingPhoto}
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
          <View>
            <Button
              label={saving ? 'Confirming…' : 'Confirm Pickup'}
              onPress={confirm}
              loading={saving}
              fullWidth
            />
            <Button
              label="Save Pickup Draft"
              onPress={saveCurrentDraft}
              variant="secondary"
              fullWidth
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
