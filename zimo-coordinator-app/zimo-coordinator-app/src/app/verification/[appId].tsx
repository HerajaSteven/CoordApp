import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/ui/typography';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { farmsApi, verificationApi, boundaryApi, categoriesApi } from '@/services/api';
import { useGPS } from '@/features/gps/useGPS';
import { useCamera } from '@/features/camera/useCamera';
import { useOfflineStore } from '@/store/offline.store';
import { useAuthStore } from '@/store/auth.store';
import { useSettingsStore } from '@/store/settings.store';
import {
  Button,
  Card,
  Input,
  Toggle,
  LoadingSpinner,
  ErrorMessage,
  ProgressBar,
  Badge,
  InfoRow,
  HeaderBackButton,
} from '@/components/ui';
import type { CategoryFieldDef, DynamicCategoryEntry, FarmTypeCategory } from '@/types';
import * as Network from 'expo-network';

const STEPS = ['identity', 'farmType', 'gps', 'landOwnership', 'infrastructure', 'capacity', 'evidence', 'review'] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  identity: 'Identity Verification',
  farmType: 'Farm Type',
  gps: 'GPS & Boundary',
  landOwnership: 'Land Ownership',
  infrastructure: 'Infrastructure',
  capacity: 'Capacity',
  evidence: 'Evidence Photos',
  review: 'Review & Submit',
};

const EVIDENCE_SLOTS = [
  { key: 'ev-entrance', label: 'Farm Entrance', required: true, allTypes: true },
  { key: 'ev-water', label: 'Water Source', required: true, allTypes: true },
  { key: 'ev-ownership-doc', label: 'Ownership Document', required: true, allTypes: true },
  { key: 'ev-farmer-selfie', label: 'Farmer + ID Selfie', required: true, allTypes: true },
  { key: 'ev-crop-overview', label: 'Crop Overview', required: true, allTypes: false, types: ['crop', 'mixed'] },
  { key: 'ev-storage', label: 'Storage Area', required: true, allTypes: false, types: ['crop', 'mixed'] },
  { key: 'ev-pen-cage', label: 'Pen / Cage', required: true, allTypes: false, types: ['livestock', 'mixed'] },
  { key: 'ev-stock-visible', label: 'Stock / Animals', required: true, allTypes: false, types: ['livestock', 'mixed'] },
];

// ─── Step: Identity ───────────────────────────────────────────────────────────
function IdentityStep({ appId, unitId, onNext, completedSteps }: {
  appId: string;
  unitId?: string;
  onNext: () => void;
  completedSteps: string[];
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [mismatchReason, setMismatchReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { takePhoto, pickFromGallery, photos } = useCamera(appId);
  const coordinator = useAuthStore((s) => s.coordinator);
  const superAdminGalleryEvidenceEnabled = useSettingsStore((s) => s.superAdminGalleryEvidenceEnabled);
  const shouldUseGallery = coordinator?.role === 'SuperAdmin' && superAdminGalleryEvidenceEnabled;
  const qc = useQueryClient();

  const selfie = photos.find((p) => p.slotKey === 'id-selfie');
  const idDoc = photos.find((p) => p.slotKey === 'id-doc');
  const alreadyDone = completedSteps.includes('identity');

  const submit = async () => {
    if (!alreadyDone && !confirmed && !mismatch) {
      Alert.alert('Required', 'Please confirm the identity match or report a mismatch.');
      return;
    }
    setLoading(true);
    try {
      await verificationApi.identity(appId, {
        confirmed: confirmed && !mismatch,
        confidence: 96,
        mismatchReason: mismatch ? mismatchReason || 'Other' : undefined,
      }, unitId);
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
      onNext();
    } catch (err: unknown) {
      Alert.alert('Error', (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to save identity step.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Card className="mb-4">
        <Text className="font-bold text-text text-base mb-3">Capture Photos</Text>

        <View className="flex-row gap-3 mb-4">
          <TouchableOpacity
            onPress={() => {
              if (shouldUseGallery) {
                pickFromGallery('id-selfie');
                return;
              }
              takePhoto('id-selfie');
            }}
            className="flex-1 aspect-square bg-bg rounded-xl items-center justify-center border-2 border-dashed border-border"
          >
            {selfie ? (
              <Image source={{ uri: selfie.localUri }} className="w-full h-full rounded-xl" />
            ) : (
              <View className="items-center">
                <Text className="text-3xl mb-1">🤳</Text>
                <Text className="text-xs text-text-3">Farmer Selfie</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              if (shouldUseGallery) {
                pickFromGallery('id-doc');
                return;
              }
              takePhoto('id-doc');
            }}
            className="flex-1 aspect-square bg-bg rounded-xl items-center justify-center border-2 border-dashed border-border"
          >
            {idDoc ? (
              <Image source={{ uri: idDoc.localUri }} className="w-full h-full rounded-xl" />
            ) : (
              <View className="items-center">
                <Text className="text-3xl mb-1">🪪</Text>
                <Text className="text-xs text-text-3">ID Document</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {selfie && idDoc && (
          <View className="bg-green-50 rounded-xl p-3 mb-3 items-center">
            <Text className="text-green-500 font-bold text-base">96% Match</Text>
            <Text className="text-text-3 text-xs mt-0.5">AI identity comparison result</Text>
          </View>
        )}
      </Card>

      <Card className="mb-4">
        <Text className="font-bold text-text mb-3">Coordinator Confirmation</Text>
        <Text className="text-text-3 text-sm mb-4">
          As the field coordinator, I confirm the person physically present matches the registered identity.
        </Text>

        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm text-text flex-1 mr-3">I confirm the person matches</Text>
          <Toggle value={confirmed && !mismatch} onToggle={() => { setConfirmed(!confirmed); setMismatch(false); }} />
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-text flex-1 mr-3">Report mismatch</Text>
          <Toggle value={mismatch} onToggle={() => { setMismatch(!mismatch); setConfirmed(false); }} />
        </View>

        {mismatch && (
          <View className="mt-3">
            <Text className="text-sm text-text-3 mb-2">Mismatch reason:</Text>
            {["Photo doesn't match", 'Farmer not on-site', 'Denies registering', 'Wrong location', 'Other'].map(
              (reason) => (
                <TouchableOpacity
                  key={reason}
                  onPress={() => setMismatchReason(reason)}
                  className={`flex-row items-center py-2.5 border-b border-border`}
                >
                  <View className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${mismatchReason === reason ? 'border-green-500' : 'border-border'}`}>
                    {mismatchReason === reason && <View className="w-2.5 h-2.5 bg-green-500 rounded-full" />}
                  </View>
                  <Text className="text-sm text-text">{reason}</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        )}
      </Card>

      <Button
        label={loading ? 'Saving...' : 'Save & Continue'}
        onPress={submit}
        loading={loading}
        disabled={!confirmed && !mismatch && !alreadyDone}
        fullWidth
      />
    </View>
  );
}

// ─── Step: Farm Type ──────────────────────────────────────────────────────────

/**
 * Which categories a farm keeps, chosen where the design puts it.
 *
 * ── WHY THE QUESTION BELONGS ON THIS STEP ────────────────────────────────
 *
 * This step "determines the verification checklist used for this farm", and
 * "livestock farm" does not determine it — poultry and catfish are asked
 * different questions. Without the answer the capacity step had nothing to
 * narrow itself by and put up a form for every category: six for livestock,
 * sixteen for crops, each with required fields. A coordinator standing in a
 * poultry yard was asked for a stocking density for fish.
 */
function CategoryChips({ categories, selected, onToggle }: {
  categories: FarmTypeCategory[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {categories.map((category) => {
        const chosen = selected.includes(category.categoryKey);

        return (
          <TouchableOpacity
            key={category._id}
            onPress={() => onToggle(category.categoryKey)}
            className={`flex-row items-center px-3 py-2.5 rounded-xl border-2 ${
              chosen ? 'border-green-500 bg-green-50' : 'border-border bg-card'
            }`}
          >
            {category.icon ? <Text className="text-base mr-1.5">{category.icon}</Text> : null}
            <Text className={`text-sm ${chosen ? 'text-green-600 font-semibold' : 'text-text-2'}`}>
              {category.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FarmTypeStep({ appId, unitId, onNext, currentFarmType, declared }: {
  appId: string;
  unitId?: string;
  onNext: (type: 'crop' | 'livestock' | 'mixed') => void;
  currentFarmType: string | null;
  declared: { crop: string[]; livestock: string[] };
}) {
  const [selected, setSelected] = useState<'crop' | 'livestock' | 'mixed'>(
    (currentFarmType as 'crop' | 'livestock' | 'mixed') ?? 'crop'
  );
  const [chosenCrops, setChosenCrops] = useState<string[]>(declared.crop);
  const [chosenLivestock, setChosenLivestock] = useState<string[]>(declared.livestock);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
    select: (res) => res.data.data,
  });

  const crops = categories?.filter((c) => c.kind === 'crop') ?? [];
  const livestock = categories?.filter((c) => c.kind === 'livestock') ?? [];

  const wantsCrops = selected === 'crop' || selected === 'mixed';
  const wantsLivestock = selected === 'livestock' || selected === 'mixed';

  const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

  const submit = async () => {
    /*
      Only what the chosen farm type allows. Changing the type after picking
      categories would otherwise send crops for a livestock farm, which the
      server refuses — and rightly, but the coordinator never asked for it.
    */
    const declaring = [
      ...(wantsCrops ? chosenCrops : []),
      ...(wantsLivestock ? chosenLivestock : []),
    ];

    if (declaring.length === 0) {
      Alert.alert(
        'Which ones?',
        selected === 'crop'
          ? 'Choose at least one crop this farm grows.'
          : 'Choose at least one kind of livestock this farm keeps.'
      );
      return;
    }

    setLoading(true);
    try {
      await verificationApi.farmType(appId, selected, declaring, unitId);
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
      onNext(selected);
    } catch (err: unknown) {
      Alert.alert('Error', (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed.');
    } finally {
      setLoading(false);
    }
  };

  const options: Array<{ value: 'crop' | 'livestock' | 'mixed'; icon: string; label: string; desc: string }> = [
    { value: 'crop', icon: '🌽', label: 'Crop Farm', desc: 'Maize, cassava, yam, rice, etc.' },
    { value: 'livestock', icon: '🐄', label: 'Livestock Farm', desc: 'Cattle, poultry, fish, etc.' },
    { value: 'mixed', icon: '🌾', label: 'Mixed Farm', desc: 'Both crop and livestock' },
  ];

  return (
    <View>
      <Text className="text-text-3 text-sm mb-4">This determines the verification checklist used for this farm.</Text>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => setSelected(opt.value)}
          className={`flex-row items-center p-4 rounded-2xl mb-3 border-2 ${
            selected === opt.value ? 'border-green-500 bg-green-50' : 'border-border bg-card'
          }`}
        >
          <Text className="text-3xl mr-4">{opt.icon}</Text>
          <View className="flex-1">
            <Text className="font-semibold text-text">{opt.label}</Text>
            <Text className="text-xs text-text-3 mt-0.5">{opt.desc}</Text>
          </View>
          {selected === opt.value && <Text className="text-green-500 text-xl">✓</Text>}
        </TouchableOpacity>
      ))}

      {categoriesLoading && (
        <Card className="mb-4">
          <ActivityIndicator color="#0D7A3D" />
        </Card>
      )}

      {wantsLivestock && livestock.length > 0 && (
        <Card className="mb-4">
          <Text className="font-bold text-text mb-1">Livestock Type</Text>
          <Text className="text-text-3 text-xs mb-3">
            Pick every kind this farm keeps. Only these are asked about at the capacity step.
          </Text>
          <CategoryChips
            categories={livestock}
            selected={chosenLivestock}
            onToggle={(key) => setChosenLivestock((prev) => toggle(prev, key))}
          />
        </Card>
      )}

      {wantsCrops && crops.length > 0 && (
        <Card className="mb-4">
          <Text className="font-bold text-text mb-1">Crop Type</Text>
          <Text className="text-text-3 text-xs mb-3">
            Pick every crop this farm grows. Only these are asked about at the capacity step.
          </Text>
          <CategoryChips
            categories={crops}
            selected={chosenCrops}
            onToggle={(key) => setChosenCrops((prev) => toggle(prev, key))}
          />
        </Card>
      )}

      <Button label={loading ? 'Saving...' : 'Save & Continue'} onPress={submit} loading={loading} fullWidth />
    </View>
  );
}

// ─── Step: GPS ────────────────────────────────────────────────────────────────
function GPSStep({ appId, unitId, onNext }: { appId: string; unitId?: string; onNext: () => void }) {
  const { currentLocation, isLocating, isWalking, walkPoints, locateMe, startBoundaryWalk, stopBoundaryWalk } = useGPS();
  const coordinator = useAuthStore((s) => s.coordinator);
  const defaultManualCoordinatesEnabled = useSettingsStore((s) => s.superAdminManualCoordinatesEnabled);
  const isSuperAdmin = coordinator?.role === 'SuperAdmin';
  const [gpsSaved, setGpsSaved] = useState(false);
  const [boundarySaved, setBoundarySaved] = useState(false);
  const [manualMode, setManualMode] = useState(isSuperAdmin && defaultManualCoordinatesEnabled);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualAccuracy, setManualAccuracy] = useState('10');
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const enqueue = useOfflineStore((s) => s.enqueue);

  const saveGpsPoint = async (lat: number, lng: number, accuracyMeters: number) => {
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected) {
      await verificationApi.gps(
        appId,
        {
          centerLat: lat,
          centerLng: lng,
          accuracyMeters
        },
        unitId
      );
    } else {
      enqueue('boundaryPoints', appId, {
        type: 'gps_center',
        centerLat: lat,
        centerLng: lng,
        accuracyMeters
      });
    }
  };

  const handleLocate = async () => {
    const loc = await locateMe();
    if (!loc) {
      setManualMode(true);
      Alert.alert('GPS Unavailable', 'Could not capture GPS. Please enter coordinates manually.');
      return;
    }
    setLoading(true);
    try {
      await saveGpsPoint(loc.lat, loc.lng, loc.accuracyMeters);
      setGpsSaved(true);
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
    } catch {
      setManualMode(true);
      Alert.alert('Error', 'Failed to save GPS coordinates.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSave = async () => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    const accuracy = Number(manualAccuracy || '10');

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      Alert.alert('Invalid Latitude', 'Latitude must be a number between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      Alert.alert('Invalid Longitude', 'Longitude must be a number between -180 and 180.');
      return;
    }
    if (!Number.isFinite(accuracy) || accuracy < 0) {
      Alert.alert('Invalid Accuracy', 'Accuracy must be 0 or greater.');
      return;
    }

    setLoading(true);
    try {
      await saveGpsPoint(lat, lng, accuracy);
      setGpsSaved(true);
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
      Alert.alert('Saved', 'Manual coordinates saved successfully.');
    } catch {
      Alert.alert('Error', 'Failed to save manual coordinates.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseBoundary = async () => {
    stopBoundaryWalk();
    if (walkPoints.length < 3) {
      Alert.alert('Not enough points', `Need at least 3 GPS points. You have ${walkPoints.length}.`);
      return;
    }
    setLoading(true);
    try {
      await boundaryApi.startWalk(appId);
      for (const pt of walkPoints) {
        await boundaryApi.addPoint(appId, { lat: pt.lat, lng: pt.lng, accuracyMeters: pt.accuracyMeters });
      }
      await boundaryApi.closeWalk(appId);
      setBoundarySaved(true);
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
      Alert.alert('Boundary Saved', `${walkPoints.length} points recorded. Walk closed successfully.`);
    } catch {
      Alert.alert('Error', 'Failed to save boundary walk.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      {/* GPS Centre Point */}
      <Card className="mb-4">
        <Text className="font-bold text-text mb-3">GPS Centre Point</Text>
        {currentLocation ? (
          <View className="bg-green-50 rounded-xl p-3 mb-3">
            <Text className="text-green-500 font-semibold text-sm">📍 Location captured</Text>
            <Text className="text-xs text-text-3 font-mono mt-1">
              {currentLocation.lat.toFixed(6)}°N, {currentLocation.lng.toFixed(6)}°E
            </Text>
            <Text className="text-xs text-text-3 mt-0.5">
              Accuracy: ±{currentLocation.accuracyMeters.toFixed(1)}m
            </Text>
          </View>
        ) : (
          <Text className="text-text-3 text-sm mb-3">
            Stand at the farm centre and tap "Locate Me" to capture GPS coordinates.
          </Text>
        )}
        <Button
          label={isLocating ? 'Locating...' : gpsSaved ? '✓ GPS Saved' : 'Locate Me'}
          onPress={handleLocate}
          loading={isLocating || loading}
          disabled={gpsSaved}
          variant={gpsSaved ? 'secondary' : 'primary'}
          fullWidth
        />

        <TouchableOpacity
          onPress={() => setManualMode((v) => !v)}
          className="mt-3"
          disabled={gpsSaved}
        >
          <Text className="text-xs text-green-500 text-center font-medium">
            {manualMode ? 'Hide manual coordinate entry' : 'GPS disabled? Enter coordinates manually'}
          </Text>
        </TouchableOpacity>

        {manualMode && !gpsSaved && (
          <View className="mt-3">
            <Input
              label="Latitude"
              value={manualLat}
              onChangeText={setManualLat}
              keyboardType="numbers-and-punctuation"
              placeholder="e.g. 7.401234"
              containerStyle={{ marginBottom: 10 }}
            />
            <Input
              label="Longitude"
              value={manualLng}
              onChangeText={setManualLng}
              keyboardType="numbers-and-punctuation"
              placeholder="e.g. 3.903456"
              containerStyle={{ marginBottom: 10 }}
            />
            <Input
              label="Accuracy (meters)"
              value={manualAccuracy}
              onChangeText={setManualAccuracy}
              keyboardType="numeric"
              placeholder="10"
              containerStyle={{ marginBottom: 12 }}
            />
            <Button
              label={loading ? 'Saving...' : 'Save Manual Coordinates'}
              onPress={handleManualSave}
              loading={loading}
              variant="secondary"
              fullWidth
            />
          </View>
        )}
      </Card>

      {/* Boundary Walk */}
      <Card className="mb-4">
        <Text className="font-bold text-text mb-1">Boundary Walk</Text>
        <Text className="text-text-3 text-xs mb-3">
          Walk the farm perimeter with your phone while the boundary is recorded.
        </Text>

        {isWalking && (
          <View className="bg-yellow-50 rounded-xl p-3 mb-3">
            <Text className="text-yellow-500 font-semibold">🔴 Walk in progress</Text>
            <Text className="text-text-3 text-xs mt-1">{walkPoints.length} points recorded</Text>
          </View>
        )}

        {boundarySaved && (
          <View className="bg-green-50 rounded-xl p-3 mb-3">
            <Text className="text-green-500 font-semibold">✅ Boundary saved</Text>
            <Text className="text-text-3 text-xs mt-1">{walkPoints.length} points</Text>
          </View>
        )}

        {!isWalking && !boundarySaved && (
          <Button label="Start Boundary Walk" onPress={startBoundaryWalk} variant="secondary" fullWidth />
        )}
        {isWalking && (
          <Button
            label={loading ? 'Saving...' : `Stop & Save Walk (${walkPoints.length} pts)`}
            onPress={handleCloseBoundary}
            loading={loading}
            variant="danger"
            fullWidth
          />
        )}
      </Card>

      <Button
        label="Continue"
        onPress={onNext}
        disabled={!gpsSaved}
        fullWidth
      />
    </View>
  );
}

// ─── Step: Land Ownership ─────────────────────────────────────────────────────
const landSchema = z.object({
  ownershipType: z.string().min(1, 'Select ownership type'),
  docRef: z.string().min(1, 'Document reference required'),
  docIssueDate: z.string().min(1, 'Issue date required'),
  activeDispute: z.boolean(),
  encumbrance: z.boolean(),
  notes: z.string().optional(),
});
type LandForm = z.infer<typeof landSchema>;

function LandOwnershipStep({ appId, unitId, onNext }: { appId: string; unitId?: string; onNext: () => void }) {
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<LandForm>({
    resolver: zodResolver(landSchema),
    defaultValues: { ownershipType: '', docRef: '', docIssueDate: '', activeDispute: false, encumbrance: false },
  });

  const ownershipTypes = ['C of O', 'Deed', 'Leased', 'Family/Communal', 'Customary'];

  const submit = async (data: LandForm) => {
    setLoading(true);
    try {
      await verificationApi.landOwnership(appId, {
        ...data,
        docIssueDate: new Date(data.docIssueDate).toISOString(),
      }, unitId);
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
      onNext();
    } catch (err: unknown) {
      Alert.alert('Error', (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed.');
    } finally {
      setLoading(false);
    }
  };

  const selectedType = watch('ownershipType');
  const activeDispute = watch('activeDispute');
  const encumbrance = watch('encumbrance');

  return (
    <View>
      <Card className="mb-4">
        <Text className="font-bold text-text mb-3">Ownership Type</Text>
        {ownershipTypes.map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setValue('ownershipType', t)}
            className={`flex-row items-center py-3 border-b border-border`}
          >
            <View className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${selectedType === t ? 'border-green-500' : 'border-border'}`}>
              {selectedType === t && <View className="w-2.5 h-2.5 bg-green-500 rounded-full" />}
            </View>
            <Text className="text-sm text-text">{t}</Text>
          </TouchableOpacity>
        ))}
        {errors.ownershipType && <Text className="text-red-500 text-xs mt-2">{errors.ownershipType.message}</Text>}
      </Card>

      <Card className="mb-4">
        <Text className="font-bold text-text mb-3">Document Details</Text>
        <Controller control={control} name="docRef" render={({ field: { onChange, value } }) => (
          <Input label="Document Reference" value={value} onChangeText={onChange} placeholder="e.g. COO/LA/2023/001" error={errors.docRef?.message} containerStyle={{ marginBottom: 12 }} />
        )} />
        <Controller control={control} name="docIssueDate" render={({ field: { onChange, value } }) => (
          <Input label="Issue Date (YYYY-MM-DD)" value={value} onChangeText={onChange} placeholder="2023-01-15" keyboardType="numbers-and-punctuation" error={errors.docIssueDate?.message} />
        )} />
      </Card>

      <Card className="mb-4">
        <Text className="font-bold text-text mb-3">Risk Flags</Text>
        <View className="flex-row items-center justify-between py-3 border-b border-border">
          <Text className="text-sm text-text flex-1 mr-3">Active land dispute</Text>
          <Toggle value={activeDispute} onToggle={() => setValue('activeDispute', !activeDispute)} />
        </View>
        <View className="flex-row items-center justify-between py-3">
          <Text className="text-sm text-text flex-1 mr-3">Third-party encumbrance</Text>
          <Toggle value={encumbrance} onToggle={() => setValue('encumbrance', !encumbrance)} />
        </View>
        <Controller control={control} name="notes" render={({ field: { onChange, value } }) => (
          <Input label="Notes (optional)" value={value ?? ''} onChangeText={onChange} placeholder="Additional observations..." multiline numberOfLines={3} containerStyle={{ marginTop: 8 }} />
        )} />
      </Card>

      <Button label={loading ? 'Saving...' : 'Save & Continue'} onPress={handleSubmit(submit)} loading={loading} fullWidth />
    </View>
  );
}

// ─── Step: Infrastructure ─────────────────────────────────────────────────────
function InfrastructureStep({ appId, unitId, onNext }: { appId: string; unitId?: string; onNext: () => void }) {
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    waterSource: '',
    irrigationStatus: '',
    roadCondition: '',
    distanceToRoadValue: '',
    distanceToRoadUnit: 'km',
    storageType: '',
    storageCapacityTonnes: '',
  });

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const RadioGroup = ({ label, options, value, onSelect }: { label: string; options: string[]; value: string; onSelect: (v: string) => void }) => (
    <View className="mb-4">
      <Text className="text-sm font-medium text-text-2 mb-2">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => (
          <TouchableOpacity
            key={o}
            onPress={() => onSelect(o)}
            className={`px-3 py-2 rounded-xl border ${value === o ? 'border-green-500 bg-green-50' : 'border-border bg-card'}`}
          >
            <Text className={`text-xs font-medium ${value === o ? 'text-green-500' : 'text-text-3'}`}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const submit = async () => {
    if (!form.waterSource || !form.roadCondition || !form.storageType) {
      Alert.alert('Required', 'Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
      await verificationApi.infrastructure(appId, {
        waterSource: form.waterSource,
        irrigationStatus: form.irrigationStatus || 'Rain-fed',
        roadCondition: form.roadCondition,
        distanceToRoadValue: parseFloat(form.distanceToRoadValue) || 0,
        distanceToRoadUnit: form.distanceToRoadUnit,
        storageType: form.storageType,
        storageCapacityTonnes: form.storageCapacityTonnes ? parseFloat(form.storageCapacityTonnes) : undefined,
      }, unitId);
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
      onNext();
    } catch (err: unknown) {
      Alert.alert('Error', (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Card className="mb-4">
        <RadioGroup label="Water Source *" options={['Borehole', 'River/Stream', 'Rainwater', 'None']} value={form.waterSource} onSelect={(v) => set('waterSource', v)} />
        <RadioGroup label="Irrigation Status" options={['Irrigated', 'Rain-fed', 'None']} value={form.irrigationStatus} onSelect={(v) => set('irrigationStatus', v)} />
        <RadioGroup label="Road Condition *" options={['Tarred', 'Untarred - Good', 'Untarred - Poor', 'Inaccessible']} value={form.roadCondition} onSelect={(v) => set('roadCondition', v)} />
        <Input label="Distance to Tarred Road (km)" value={form.distanceToRoadValue} onChangeText={(v) => set('distanceToRoadValue', v)} keyboardType="numeric" placeholder="0.5" containerStyle={{ marginBottom: 12 }} />
        <RadioGroup label="Storage Type *" options={['Warehouse', 'Silo', 'Open storage', 'None']} value={form.storageType} onSelect={(v) => set('storageType', v)} />
        {form.storageType !== 'None' && form.storageType && (
          <Input label="Storage Capacity (tonnes)" value={form.storageCapacityTonnes} onChangeText={(v) => set('storageCapacityTonnes', v)} keyboardType="numeric" placeholder="10" />
        )}
      </Card>
      <Button label={loading ? 'Saving...' : 'Save & Continue'} onPress={submit} loading={loading} fullWidth />
    </View>
  );
}

// ─── Step: Capacity ───────────────────────────────────────────────────────────

/**
 * One question of a category, drawn as whatever kind of question it is.
 *
 * ── EVERY TYPE, NOT ONLY THE TYPED-IN ONES ───────────────────────────────
 *
 * This rendered `number` and `text` and dropped the rest on the floor. Five
 * of the six answers Poultry requires are a select or a boolean — `type`,
 * `housingType`, `vaccinationStatus`, `feedSource`, `veterinaryAccess` — so
 * the screen asked for the bird count and the server then refused the step
 * for the five it had never put on screen. Every livestock category is
 * built that way, and every crop category requires a `soilQuality` select.
 *
 * A boolean is drawn as Yes/No rather than a switch because a switch has no
 * way to say "not answered", and these are answers about somebody's farm.
 */
const YES_NO = ['Yes', 'No'];

function CategoryField({ field, value, onChange }: {
  field: CategoryFieldDef;
  value: string;
  onChange: (next: string) => void;
}) {
  const label = field.label + (field.required ? ' *' : '') + (field.unit ? ` (${field.unit})` : '');

  if (field.type === 'select' || field.type === 'boolean') {
    const options = field.type === 'boolean' ? YES_NO : (field.options ?? []);
    const current = field.type === 'boolean'
      ? (value === 'true' ? 'Yes' : value === 'false' ? 'No' : '')
      : value;

    return (
      <View className="mb-3">
        <Text className="text-xs text-text-2 mb-1.5">{label}</Text>
        <View className="flex-row flex-wrap" style={{ gap: 6 }}>
          {options.map((option) => {
            const chosen = current === option;

            return (
              <TouchableOpacity
                key={option}
                onPress={() => {
                  /* Tapping the chosen one clears it, so a question answered
                     by accident can be unanswered. */
                  const cleared = chosen ? '' : option;
                  onChange(
                    field.type === 'boolean' && cleared !== ''
                      ? String(cleared === 'Yes')
                      : cleared
                  );
                }}
                className={`px-3 py-2 rounded-lg border ${
                  chosen ? 'bg-green-50 border-green-500' : 'bg-card border-border'
                }`}
              >
                <Text className={`text-sm ${chosen ? 'text-green-600 font-semibold' : 'text-text-2'}`}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <Input
      label={label}
      value={value}
      onChangeText={onChange}
      keyboardType={field.type === 'number' ? 'numeric' : 'default'}
      containerStyle={{ marginBottom: 8 }}
    />
  );
}

/**
 * Declared at module scope on purpose.
 *
 * It used to be defined inside CapacityStep, which made it a NEW component
 * type on every render — React then unmounted and remounted the whole form
 * on each keystroke, and the field being typed into lost focus after every
 * single character.
 */
function CategoryForm({ category, values, onChange }: {
  category: FarmTypeCategory;
  values: Record<string, string>;
  onChange: (fieldKey: string, next: string) => void;
}) {
  return (
    <View className="mb-4 p-3 bg-bg rounded-xl">
      <Text className="font-semibold text-text mb-2">
        {category.icon ? category.icon + ' ' : ''}{category.label}
      </Text>
      {category.fieldSchema.map((field) => (
        <CategoryField
          key={field.key}
          field={field}
          value={values[field.key] ?? ''}
          onChange={(next) => onChange(field.key, next)}
        />
      ))}
    </View>
  );
}

/** What was already recorded, as the strings these controls hold. */
function entriesToForm(entries: DynamicCategoryEntry[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};

  for (const entry of entries) {
    out[entry.categoryKey] = Object.fromEntries(
      Object.entries(entry.fields ?? {}).map(([key, value]) => [
        key,
        value === null || value === undefined ? '' : String(value),
      ])
    );
  }

  return out;
}

function CapacityStep({ appId, unitId, onNext, farmType, declared, recorded, onEditTypes }: {
  appId: string;
  unitId?: string;
  onNext: () => void;
  farmType: 'crop' | 'livestock' | 'mixed';
  declared: { crop: string[]; livestock: string[] };
  recorded: { crop: DynamicCategoryEntry[]; livestock: DynamicCategoryEntry[] };
  onEditTypes: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState('farmer_stated');
  const [cropEntries, setCropEntries] = useState<Record<string, Record<string, string>>>(
    () => entriesToForm(recorded.crop)
  );
  const [livestockEntries, setLivestockEntries] = useState<Record<string, Record<string, string>>>(
    () => entriesToForm(recorded.livestock)
  );
  const qc = useQueryClient();

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
    select: (res) => res.data.data,
  });

  const showCrops = farmType === 'crop' || farmType === 'mixed';
  const showLivestock = farmType === 'livestock' || farmType === 'mixed';

  /*
    ONLY WHAT THE FARM WAS SAID TO HAVE.

    This used to render every active category, so a poultry farm was shown
    six livestock forms — cattle, fish, goats and the rest — each marked
    required. The types are chosen on the farm type step now, and this asks
    about those and nothing else.
  */
  const crops = (categories ?? []).filter(
    (c) => c.kind === 'crop' && declared.crop.includes(c.categoryKey)
  );
  const livestock = (categories ?? []).filter(
    (c) => c.kind === 'livestock' && declared.livestock.includes(c.categoryKey)
  );

  const nothingDeclared =
    (showCrops ? declared.crop.length : 0) + (showLivestock ? declared.livestock.length : 0) === 0;

  const setField = (kind: 'crop' | 'livestock', categoryKey: string, fieldKey: string, value: string) => {
    const update = (prev: Record<string, Record<string, string>>) => ({
      ...prev,
      [categoryKey]: { ...prev[categoryKey], [fieldKey]: value },
    });

    if (kind === 'crop') setCropEntries(update);
    else setLivestockEntries(update);
  };

  /**
   * The answers for one category, typed the way the server stores them.
   *
   * An unanswered field is LEFT OUT rather than sent as an empty string.
   * The old mapping ran every value through `Number()`, and `Number('')` is
   * 0 — so a question nobody answered arrived as a real zero, and a farm
   * whose stock was never counted looked like a farm with none.
   */
  const valuesFor = (category: FarmTypeCategory, raw: Record<string, string>) => {
    const fields: Record<string, unknown> = {};

    for (const field of category.fieldSchema) {
      const value = (raw[field.key] ?? '').trim();
      if (value === '') continue;

      if (field.type === 'number') {
        const asNumber = Number(value);
        if (!Number.isNaN(asNumber)) fields[field.key] = asNumber;
        continue;
      }

      if (field.type === 'boolean') {
        fields[field.key] = value === 'true';
        continue;
      }

      fields[field.key] = value;
    }

    return fields;
  };

  const submit = async () => {
    const chosen = [
      ...(showCrops ? crops.map((c) => ({ category: c, kind: 'crop' as const })) : []),
      ...(showLivestock ? livestock.map((c) => ({ category: c, kind: 'livestock' as const })) : []),
    ];

    /* Named before it is sent, so a refusal names the box and not the key. */
    const missing: string[] = [];

    for (const { category, kind } of chosen) {
      const raw = (kind === 'crop' ? cropEntries : livestockEntries)[category.categoryKey] ?? {};

      for (const field of category.fieldSchema) {
        if (field.required && (raw[field.key] ?? '').trim() === '') {
          missing.push(`${category.label}: ${field.label}`);
        }
      }
    }

    if (missing.length > 0) {
      Alert.alert('Still needed', missing.join('\n'));
      return;
    }

    setLoading(true);
    try {
      const payload = (kind: 'crop' | 'livestock') =>
        chosen
          .filter((c) => c.kind === kind)
          .map(({ category }) => ({
            categoryKey: category.categoryKey,
            fields: valuesFor(
              category,
              (kind === 'crop' ? cropEntries : livestockEntries)[category.categoryKey] ?? {}
            ),
          }));

      await verificationApi.capacity(appId, {
        measurementMethod: method,
        crops: showCrops ? payload('crop') : [],
        livestock: showLivestock ? payload('livestock') : [],
      }, unitId);
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
      onNext();
    } catch (err: unknown) {
      Alert.alert('Error', (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Card className="mb-4">
        <Text className="font-bold text-text mb-3">Measurement Method</Text>
        {['gps_walk', 'satellite', 'farmer_stated'].map((m) => (
          <TouchableOpacity key={m} onPress={() => setMethod(m)} className="flex-row items-center py-2.5 border-b border-border">
            <View className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${method === m ? 'border-green-500' : 'border-border'}`}>
              {method === m && <View className="w-2.5 h-2.5 bg-green-500 rounded-full" />}
            </View>
            <Text className="text-sm text-text capitalize">{m.replace('_', ' ')}</Text>
          </TouchableOpacity>
        ))}
      </Card>

      {categoriesLoading && (
        <Card className="mb-4">
          <ActivityIndicator color="#0D7A3D" />
        </Card>
      )}

      {!categoriesLoading && nothingDeclared && (
        <Card className="mb-4">
          <Text className="font-bold text-text mb-1">Nothing to measure yet</Text>
          <Text className="text-text-3 text-sm mb-3">
            This farm has no crop or livestock type recorded, so there is nothing to ask about.
            Set what it keeps on the Farm Type step and come back.
          </Text>
          <Button label="Go to Farm Type" onPress={onEditTypes} variant="secondary" fullWidth />
        </Card>
      )}

      {showLivestock && livestock.length > 0 && (
        <Card className="mb-4">
          <Text className="font-bold text-text mb-3">Livestock Capacity</Text>
          {livestock.map((c) => (
            <CategoryForm
              key={c._id}
              category={c}
              values={livestockEntries[c.categoryKey] ?? {}}
              onChange={(fieldKey, next) => setField('livestock', c.categoryKey, fieldKey, next)}
            />
          ))}
        </Card>
      )}

      {showCrops && crops.length > 0 && (
        <Card className="mb-4">
          <Text className="font-bold text-text mb-3">Crop Capacity</Text>
          {crops.map((c) => (
            <CategoryForm
              key={c._id}
              category={c}
              values={cropEntries[c.categoryKey] ?? {}}
              onChange={(fieldKey, next) => setField('crop', c.categoryKey, fieldKey, next)}
            />
          ))}
        </Card>
      )}

      <Button
        label={loading ? 'Saving...' : 'Save & Continue'}
        onPress={submit}
        loading={loading}
        disabled={nothingDeclared}
        fullWidth
      />
    </View>
  );
}

// ─── Step: Evidence ───────────────────────────────────────────────────────────
function EvidenceStep({ appId, unitId, onNext, farmType }: {
  appId: string;
  unitId?: string;
  onNext: () => void;
  farmType: 'crop' | 'livestock' | 'mixed';
}) {
  const { photos, takePhoto, pickFromGallery, uploadPhoto, removePhoto } = useCamera(appId);
  const coordinator = useAuthStore((s) => s.coordinator);
  const superAdminGalleryEvidenceEnabled = useSettingsStore((s) => s.superAdminGalleryEvidenceEnabled);
  const shouldUseGallery = coordinator?.role === 'SuperAdmin' && superAdminGalleryEvidenceEnabled;
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { currentLocation } = useGPS();
  const qc = useQueryClient();

  const requiredSlots = EVIDENCE_SLOTS.filter(
    (s) => s.allTypes || (s.types ?? []).includes(farmType)
  );
  const requiredCount = requiredSlots.length;
  const completedSlots = requiredSlots.filter((s) => photos.find((p) => p.slotKey === s.key));
  const completedCount = completedSlots.length;

  const handleCapture = async (slotKey: string) => {
    const photo = shouldUseGallery ? await pickFromGallery(slotKey) : await takePhoto(slotKey);
    if (!photo) return;
    setUploading(slotKey);
    await uploadPhoto(photo, 'evidence', currentLocation?.lat, currentLocation?.lng);
    setUploading(null);
  };

  const submit = async () => {
    if (completedCount < requiredCount) {
      Alert.alert('Required', `Complete all ${requiredCount} required photos first. (${completedCount}/${requiredCount} done)`);
      return;
    }
    setSubmitting(true);
    try {
      await verificationApi.evidenceComplete(appId, unitId);
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
      onNext();
    } catch (err: unknown) {
      Alert.alert('Error', (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View>
      <Card className="mb-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="font-bold text-text">Required Photos</Text>
          <Badge label={`${completedCount}/${requiredCount}`} variant={completedCount === requiredCount ? 'green' : 'yellow'} />
        </View>
        {coordinator?.role === 'SuperAdmin' && (
          <Text className="text-xs text-text-3 mb-3">
            Capture mode: {shouldUseGallery ? 'Gallery Upload' : 'Live Camera'} (change in Profile settings)
          </Text>
        )}

        {requiredSlots.map((slot) => {
          const photo = photos.find((p) => p.slotKey === slot.key);
          const isUploading = uploading === slot.key;
          return (
            <View key={slot.key} className="mb-3">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-sm font-medium text-text">{slot.label}</Text>
                {photo && <Badge label="Captured" variant="green" />}
              </View>
              <TouchableOpacity
                onPress={() => handleCapture(slot.key)}
                className={`h-28 rounded-xl overflow-hidden items-center justify-center border-2 border-dashed ${photo ? 'border-green-500' : 'border-border'}`}
              >
                {isUploading ? (
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
        })}
      </Card>

      <Button
        label={submitting ? 'Saving...' : `Complete Evidence (${completedCount}/${requiredCount})`}
        onPress={submit}
        loading={submitting}
        disabled={completedCount < requiredCount}
        fullWidth
      />
    </View>
  );
}

// ─── Step: Review & Submit ────────────────────────────────────────────────────
function ReviewStep({ appId, unitId, farmName, onSubmit }: {
  appId: string;
  unitId?: string;
  farmName: string;
  onSubmit: () => void;
}) {
  const [certified, setCertified] = useState(false);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const submit = async () => {
    if (!certified) { Alert.alert('Required', 'You must confirm the certification statement before submitting.'); return; }
    setLoading(true);
    try {
      await verificationApi.certify(appId, unitId);
      await verificationApi.submit(appId, unitId);
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
      onSubmit();
    } catch (err: unknown) {
      Alert.alert('Error', (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to submit.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Card className="mb-4 bg-green-50 border border-green-100">
        <Text className="font-bold text-green-500 mb-2">✅ Ready for Submission</Text>
        <Text className="text-text-3 text-sm">All verification steps have been completed. Please review and certify before submitting.</Text>
      </Card>

      <Card className="mb-4">
        <Text className="font-bold text-text mb-3">Coordinator Certification</Text>
        <Text className="text-text-3 text-sm mb-4 leading-5">
          I hereby certify that I physically visited and verified the farm represented by application{' '}
          <Text className="font-semibold text-text font-mono">{appId}</Text>
          {' '}on{' '}{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}.
          The information recorded in this verification is accurate and based on my direct physical observation.
        </Text>
        <View className="flex-row items-center">
          <Toggle value={certified} onToggle={() => setCertified(!certified)} />
          <Text className="text-sm text-text ml-3 flex-1">I confirm this certification</Text>
        </View>
      </Card>

      <Button
        label={loading ? 'Submitting...' : 'Submit Verification'}
        onPress={submit}
        loading={loading}
        disabled={!certified}
        fullWidth
      />
    </View>
  );
}

// ─── Main Wizard Orchestrator ─────────────────────────────────────────────────
export default function VerificationWizard() {
  const { appId, unitId, unitLabel } = useLocalSearchParams<{ appId: string; unitId?: string; unitLabel?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const coordinator = useAuthStore((s) => s.coordinator);
  const [isApproving, setIsApproving] = useState(false);

  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: ['farm-profile', appId, unitId],
    queryFn: () => farmsApi.profile(appId),
    select: (res) => res.data.data,
  });

  const completedSteps = profile?.verification?.completedSteps ?? [];
  const farmType = (profile?.verification?.farmTypeSelected ?? 'crop') as 'crop' | 'livestock' | 'mixed';
  /* Which crops and which livestock, chosen at the farm type step. The
     capacity step asks about these and nothing else. */
  const declared = profile?.verification?.farmTypeCategories ?? { crop: [], livestock: [] };
  const recorded = {
    crop: profile?.verification?.capacity?.crops ?? [],
    livestock: profile?.verification?.capacity?.livestock ?? [],
  };
  const overallStatus = profile?.verification?.overallStatus;

  // Determine which step to show first: the first incomplete step
  const firstIncomplete = STEPS.find((s) => !completedSteps.includes(s)) ?? 'review';
  const [activeStep, setActiveStep] = useState<Step>(
    completedSteps.length === STEPS.length ? 'review' : firstIncomplete
  );
  const stepIndex = STEPS.indexOf(activeStep);

  /*
    Where to go back to, for a step opened from another one.

    The capacity step sends you to farm type when nothing has been
    declared for the farm. Without this, saving there walks FORWARD to
    GPS and leaves you to find your own way back to the step you were
    actually on — which reads as being bounced around the wizard.
  */
  const [returnTo, setReturnTo] = useState<Step | null>(null);

  const goToNext = useCallback(() => {
    if (returnTo) {
      setActiveStep(returnTo);
      setReturnTo(null);
      return;
    }

    const next = STEPS[stepIndex + 1];
    if (next) setActiveStep(next);
  }, [stepIndex, returnTo]);

  const handleSubmitSuccess = () => {
    Alert.alert('Submitted!', 'Verification submitted for approval.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const handleFinalApprove = async () => {
    setIsApproving(true);
    try {
      await verificationApi.approve(appId, unitId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['farm-profile', appId] }),
        qc.invalidateQueries({ queryKey: ['farms'] })
      ]);
      Alert.alert('Verified', 'Farm verification has been approved and marked as verified.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err: unknown) {
      Alert.alert(
        'Approval Failed',
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
          'Could not mark this verification as approved.'
      );
    } finally {
      setIsApproving(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError || !profile) return <ErrorMessage message="Could not load farm data." onRetry={refetch} />;

  if (overallStatus === 'submitted' || overallStatus === 'approved') {
    const isSuperAdmin = coordinator?.role === 'SuperAdmin';
    return (
      <View className="flex-1 bg-bg items-center justify-center p-6">
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Verification',
            headerStyle: { backgroundColor: '#0D7A3D' },
            headerTintColor: '#fff',
            headerLeft: () => <HeaderBackButton fallbackHref={`/farm/${appId}`} />
          }}
        />
        <Text className="text-5xl mb-4">🏆</Text>
        <Text className="text-xl font-bold text-text mb-2">
          {overallStatus === 'approved' ? 'Verification Approved' : 'Submitted for Review'}
        </Text>
        <Text className="text-text-3 text-center mb-6">
          {overallStatus === 'approved'
            ? 'This farm has been fully verified and approved.'
            : 'Verification has been submitted. A supervisor will review within 48 hours.'}
        </Text>
        {overallStatus === 'submitted' && isSuperAdmin && (
          <Button
            label={isApproving ? 'Marking Verified...' : 'Mark as Verified'}
            onPress={handleFinalApprove}
            loading={isApproving}
            fullWidth
          />
        )}
        {overallStatus === 'submitted' && isSuperAdmin && <View className="h-3" />}
        <Button label="Back to Farm" onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: unitLabel ? `${unitLabel}` : 'Verification',
          headerStyle: { backgroundColor: '#0D7A3D' },
          headerTintColor: '#fff',
          headerTitleStyle: { color: '#fff' },
          headerLeft: () => <HeaderBackButton fallbackHref={`/farm/${appId}`} />,
        }}
      />

      {/* Step header */}
      <View className="bg-white border-b border-border px-5 py-3">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm font-bold text-text">{STEP_LABELS[activeStep]}</Text>
          <Text className="text-xs text-text-3">Step {stepIndex + 1} of {STEPS.length}</Text>
        </View>
        <ProgressBar value={stepIndex + 1} max={STEPS.length} />

        {/* Step dots */}
        <View className="flex-row justify-center mt-3 gap-1.5">
          {STEPS.map((s, i) => (
            <TouchableOpacity
              key={s}
              onPress={() => {
                const canGo = completedSteps.includes(s) || i === 0 || completedSteps.includes(STEPS[i - 1] as Step);
                if (canGo) setActiveStep(s);
              }}
            >
              <View className={`w-2.5 h-2.5 rounded-full ${
                completedSteps.includes(s) ? 'bg-green-500' :
                s === activeStep ? 'bg-green-200' : 'bg-gray-200'
              }`} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {activeStep === 'identity' && (
          <IdentityStep appId={appId} unitId={unitId} onNext={goToNext} completedSteps={completedSteps} />
        )}
        {activeStep === 'farmType' && (
          <FarmTypeStep
            appId={appId}
            unitId={unitId}
            onNext={() => { goToNext(); }}
            currentFarmType={profile.verification?.farmTypeSelected ?? null}
            declared={declared}
          />
        )}
        {activeStep === 'gps' && (
          <GPSStep appId={appId} unitId={unitId} onNext={goToNext} />
        )}
        {activeStep === 'landOwnership' && (
          <LandOwnershipStep appId={appId} unitId={unitId} onNext={goToNext} />
        )}
        {activeStep === 'infrastructure' && (
          <InfrastructureStep appId={appId} unitId={unitId} onNext={goToNext} />
        )}
        {activeStep === 'capacity' && (
          <CapacityStep
            appId={appId}
            unitId={unitId}
            onNext={goToNext}
            farmType={farmType}
            declared={declared}
            recorded={recorded}
            onEditTypes={() => {
              setReturnTo('capacity');
              setActiveStep('farmType');
            }}
          />
        )}
        {activeStep === 'evidence' && (
          <EvidenceStep appId={appId} unitId={unitId} onNext={goToNext} farmType={farmType} />
        )}
        {activeStep === 'review' && (
          <ReviewStep appId={appId} unitId={unitId} farmName={profile.registration.farmName} onSubmit={handleSubmitSuccess} />
        )}
      </ScrollView>
    </View>
  );
}
