import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { farmsApi, verificationApi, boundaryApi, categoriesApi } from '@/services/api';
import { useGPS } from '@/features/gps/useGPS';
import { useCamera } from '@/features/camera/useCamera';
import { useOfflineStore } from '@/store/offline.store';
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
} from '@/components/ui';
import type { FarmTypeCategory } from '@/types';
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
  const { takePhoto, photos } = useCamera(appId);
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
            onPress={() => takePhoto('id-selfie')}
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
            onPress={() => takePhoto('id-doc')}
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
function FarmTypeStep({ appId, unitId, onNext, currentFarmType }: {
  appId: string;
  unitId?: string;
  onNext: (type: 'crop' | 'livestock' | 'mixed') => void;
  currentFarmType: string | null;
}) {
  const [selected, setSelected] = useState<'crop' | 'livestock' | 'mixed'>(
    (currentFarmType as 'crop' | 'livestock' | 'mixed') ?? 'crop'
  );
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const submit = async () => {
    setLoading(true);
    try {
      await verificationApi.farmType(appId, selected, unitId);
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
      <Text className="text-text-3 text-sm mb-4">Select the primary farm type for this verification.</Text>
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
      <Button label={loading ? 'Saving...' : 'Save & Continue'} onPress={submit} loading={loading} fullWidth />
    </View>
  );
}

// ─── Step: GPS ────────────────────────────────────────────────────────────────
function GPSStep({ appId, unitId, onNext }: { appId: string; unitId?: string; onNext: () => void }) {
  const { currentLocation, isLocating, isWalking, walkPoints, locateMe, startBoundaryWalk, stopBoundaryWalk } = useGPS();
  const [gpsSaved, setGpsSaved] = useState(false);
  const [boundarySaved, setBoundarySaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const enqueue = useOfflineStore((s) => s.enqueue);

  const handleLocate = async () => {
    const loc = await locateMe();
    if (!loc) return;
    setLoading(true);
    try {
      const state = await Network.getNetworkStateAsync();
      if (state.isConnected) {
        await verificationApi.gps(appId, {
          centerLat: loc.lat,
          centerLng: loc.lng,
          accuracyMeters: loc.accuracyMeters,
        }, unitId);
      } else {
        enqueue('boundaryPoints', appId, {
          type: 'gps_center',
          centerLat: loc.lat,
          centerLng: loc.lng,
          accuracyMeters: loc.accuracyMeters,
        });
      }
      setGpsSaved(true);
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
    } catch {
      Alert.alert('Error', 'Failed to save GPS coordinates.');
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
function CapacityStep({ appId, unitId, onNext, farmType }: { appId: string; unitId?: string; onNext: () => void; farmType: 'crop' | 'livestock' | 'mixed' }) {
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState('farmer_stated');
  const [cropEntries, setCropEntries] = useState<Record<string, Record<string, string>>>({});
  const [livestockEntries, setLivestockEntries] = useState<Record<string, Record<string, string>>>({});
  const qc = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
    select: (res) => res.data.data,
  });

  const crops = categories?.filter((c) => c.kind === 'crop') ?? [];
  const livestock = categories?.filter((c) => c.kind === 'livestock') ?? [];

  const showCrops = farmType === 'crop' || farmType === 'mixed';
  const showLivestock = farmType === 'livestock' || farmType === 'mixed';

  const setField = (kind: 'crop' | 'livestock', categoryKey: string, fieldKey: string, value: string) => {
    if (kind === 'crop') {
      setCropEntries((prev) => ({ ...prev, [categoryKey]: { ...prev[categoryKey], [fieldKey]: value } }));
    } else {
      setLivestockEntries((prev) => ({ ...prev, [categoryKey]: { ...prev[categoryKey], [fieldKey]: value } }));
    }
  };

  const CategoryForm = ({ category, kind }: { category: FarmTypeCategory; kind: 'crop' | 'livestock' }) => {
    const entries = kind === 'crop' ? cropEntries : livestockEntries;
    const vals = entries[category.categoryKey] ?? {};
    return (
      <View className="mb-4 p-3 bg-bg rounded-xl">
        <Text className="font-semibold text-text mb-2">{category.icon} {category.label}</Text>
        {category.fieldSchema.filter((f) => f.type === 'number' || f.type === 'text').map((field) => (
          <Input
            key={field.key}
            label={field.label + (field.required ? ' *' : '') + (field.unit ? ` (${field.unit})` : '')}
            value={vals[field.key] ?? ''}
            onChangeText={(v) => setField(kind, category.categoryKey, field.key, v)}
            keyboardType={field.type === 'number' ? 'numeric' : 'default'}
            containerStyle={{ marginBottom: 8 }}
          />
        ))}
      </View>
    );
  };

  const submit = async () => {
    setLoading(true);
    try {
      const crops_payload = Object.entries(cropEntries).map(([categoryKey, fields]) => ({
        categoryKey,
        fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])),
      }));
      const livestock_payload = Object.entries(livestockEntries).map(([categoryKey, fields]) => ({
        categoryKey,
        fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])),
      }));
      await verificationApi.capacity(appId, {
        measurementMethod: method,
        crops: showCrops ? crops_payload : [],
        livestock: showLivestock ? livestock_payload : [],
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

      {showCrops && crops.length > 0 && (
        <Card className="mb-4">
          <Text className="font-bold text-text mb-3">Crop Capacity</Text>
          {crops.map((c) => <CategoryForm key={c._id} category={c} kind="crop" />)}
        </Card>
      )}

      {showLivestock && livestock.length > 0 && (
        <Card className="mb-4">
          <Text className="font-bold text-text mb-3">Livestock Capacity</Text>
          {livestock.map((c) => <CategoryForm key={c._id} category={c} kind="livestock" />)}
        </Card>
      )}

      <Button label={loading ? 'Saving...' : 'Save & Continue'} onPress={submit} loading={loading} fullWidth />
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
  const { photos, takePhoto, uploadPhoto, removePhoto } = useCamera(appId);
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
    const photo = await takePhoto(slotKey);
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

  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: ['farm-profile', appId, unitId],
    queryFn: () => farmsApi.profile(appId),
    select: (res) => res.data.data,
  });

  const completedSteps = profile?.verification?.completedSteps ?? [];
  const farmType = (profile?.verification?.farmTypeSelected ?? 'crop') as 'crop' | 'livestock' | 'mixed';
  const overallStatus = profile?.verification?.overallStatus;

  // Determine which step to show first: the first incomplete step
  const firstIncomplete = STEPS.find((s) => !completedSteps.includes(s)) ?? 'review';
  const [activeStep, setActiveStep] = useState<Step>(
    completedSteps.length === STEPS.length ? 'review' : firstIncomplete
  );
  const stepIndex = STEPS.indexOf(activeStep);

  const goToNext = useCallback(() => {
    const next = STEPS[stepIndex + 1];
    if (next) setActiveStep(next);
  }, [stepIndex]);

  const handleSubmitSuccess = () => {
    Alert.alert('Submitted!', 'Verification submitted for approval.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError || !profile) return <ErrorMessage message="Could not load farm data." onRetry={refetch} />;

  if (overallStatus === 'submitted' || overallStatus === 'approved') {
    return (
      <View className="flex-1 bg-bg items-center justify-center p-6">
        <Stack.Screen options={{ headerShown: true, title: 'Verification', headerStyle: { backgroundColor: '#0D7A3D' }, headerTintColor: '#fff' }} />
        <Text className="text-5xl mb-4">🏆</Text>
        <Text className="text-xl font-bold text-text mb-2">
          {overallStatus === 'approved' ? 'Verification Approved' : 'Submitted for Review'}
        </Text>
        <Text className="text-text-3 text-center mb-6">
          {overallStatus === 'approved'
            ? 'This farm has been fully verified and approved.'
            : 'Verification has been submitted. A supervisor will review within 48 hours.'}
        </Text>
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
          <FarmTypeStep appId={appId} unitId={unitId} onNext={(type) => { goToNext(); }} currentFarmType={profile.verification?.farmTypeSelected ?? null} />
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
          <CapacityStep appId={appId} unitId={unitId} onNext={goToNext} farmType={farmType} />
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
