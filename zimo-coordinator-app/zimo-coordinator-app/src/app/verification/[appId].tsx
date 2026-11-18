import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Text, FACE } from '@/components/ui/typography';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { farmsApi, verificationApi, boundaryApi, categoriesApi, uploadsApi } from '@/services/api';
import { useGPS } from '@/features/gps/useGPS';
import { getErrorMessage } from '@/utils/errors';
import { offlineSiteClientId, offlineUnitClientId } from '@/utils/offlineIds';
import { measureWalk, outerEstimate } from '@/features/gps/area';
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
import type { BoundaryRecord, CategoryFieldDef, ClosedWalk, DynamicCategoryEntry, FarmTypeCategory, UploadedPhoto, VerificationRecord } from '@/types';
import { useStoredFileSource } from '@/features/camera/platformFile';
import { STEPS, STEP_LABELS, resumeStep, resumeUnitStep, type Step } from '@/features/verification/steps';

const EVIDENCE_SLOTS = [
  { key: 'ev-entrance', label: 'Farm Entrance', required: true, allTypes: true },
  { key: 'ev-water', label: 'Water Source', required: true, allTypes: true },
  { key: 'ev-ownership-doc', label: 'Ownership Document', required: true, allTypes: true },
  { key: 'ev-farmer-selfie', label: 'Farmer + ID Selfie', required: true, allTypes: true },
  { key: 'ev-crop-overview', label: 'Crop Overview', required: true, allTypes: false, types: ['crop', 'mixed'] },
  { key: 'ev-storage', label: 'Storage Area', required: true, allTypes: false, types: ['crop', 'mixed'] },
  { key: 'ev-pen-cage', label: 'Pen / Cage', required: true, allTypes: false, types: ['livestock', 'mixed'] },
  /* Verification is before the first batch, so there are no animals to photograph: the farm's biosecurity instead. */
  { key: 'ev-biosecurity', label: 'Biosecurity (footbath, fencing)', required: true, allTypes: false, types: ['livestock', 'mixed'] },
];

// ─── Step: Identity ───────────────────────────────────────────────────────────
function IdentityStep({ appId, unitId, siteId, onNext, completedSteps }: {
  appId: string;
  unitId?: string;
  siteId?: string;
  onNext: () => void;
  completedSteps: string[];
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [mismatchReason, setMismatchReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { takePhoto, pickFromGallery, photos, uploadPhoto } = useCamera(appId, siteId);
  const coordinator = useAuthStore((s) => s.coordinator);
  const enqueue = useOfflineStore((s) => s.enqueue);
  const superAdminGalleryEvidenceEnabled = useSettingsStore((s) => s.superAdminGalleryEvidenceEnabled);
  const shouldUseGallery = coordinator?.role === 'SuperAdmin' && superAdminGalleryEvidenceEnabled;

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
      for (const capture of [selfie, idDoc]) {
        if (capture && !capture.fileId) {
          const queued = await uploadPhoto(capture, 'identity');
          if (!queued) {
            setLoading(false);
            return;
          }
        }
      }

      enqueue('fieldActions', appId, {
        action: 'identity',
        unitId: unitId ?? null,
        siteId: siteId ?? null,
        body: {
          confirmed: confirmed && !mismatch,
          confidence: 96,
          mismatchReason: mismatch ? mismatchReason || 'Other' : undefined,
        },
      });
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

function FarmTypeStep({ appId, unitId, siteId, onNext, currentFarmType, declared }: {
  appId: string;
  unitId?: string;
  siteId?: string;
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
  const enqueue = useOfflineStore((s) => s.enqueue);

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
          : 'Choose at least one kind of livestock this farm is set up to keep.'
      );
      return;
    }

    setLoading(true);
    try {
      enqueue('fieldActions', appId, {
        action: 'farmType',
        unitId: unitId ?? null,
        siteId: siteId ?? null,
        body: {
          farmType: selected,
          categories: declaring,
          cropCategories: wantsCrops ? chosenCrops : [],
          livestockCategories: wantsLivestock ? chosenLivestock : [],
        },
      });
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
          <Text className="font-bold text-text mb-1">Livestock the Farm Is Set Up For</Text>
          <Text className="text-text-3 text-xs mb-3">
            Pick every kind this farm is set up to keep. Only these are asked about at the capacity step.
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

/**
 * The measurement in one line, in the units a coordinator thinks in.
 *
 * Hectares to four places because that is a square metre at this scale,
 * and a walk that came to nine square metres has to be able to say so —
 * rounding it to "0.00 ha" would hide exactly the walks worth catching.
 * Metres for the perimeter, whole, since no GPS fix justifies finer.
 */
/**
 * A walk this screen can show, however it arrived.
 *
 * Closing a walk returns a ClosedWalk; reading one already on record
 * returns a BoundaryRecord. They carry the same measurements, and the
 * difference that matters is that only the first has `fraudSignals` —
 * which is why every read of it here is optional.
 */
type HydratedWalk = ClosedWalk | BoundaryRecord;

function describeArea(walk: Pick<ClosedWalk, 'derivedAreaHectares' | 'areaHectares' | 'perimeterMetres'>): string {
  /* The platform's reading, falling back to the service's own. Not zero if
     neither is known — "0 ha" is a measurement and "—" is not. */
  const hectares = walk.derivedAreaHectares ?? walk.areaHectares;
  const area = hectares == null ? '— ha' : `${hectares.toFixed(4)} ha`;

  /*
    `== null`, which also catches undefined. This build can reach a phone
    before the verification service that sends these fields reaches its
    host, and a missing perimeter would otherwise print "NaN m".
  */
  if (walk.perimeterMetres == null) return area;

  return `${area} · ${Math.round(walk.perimeterMetres)} m perimeter`;
}

function boundaryDraftMatchesRecord(
  draft: { points: Array<{ lat: number; lng: number; accuracyMeters: number; timestamp: string }> },
  record: BoundaryRecord
): boolean {
  return record.pointCount === draft.points.length
    && record.boundaryWalk.length === draft.points.length
    && draft.points.every((point, index) => {
      const saved = record.boundaryWalk[index];
      return point.lat === saved.lat
        && point.lng === saved.lng
        && point.accuracyMeters === saved.accuracyMeters;
    });
}

// ─── Step: GPS ────────────────────────────────────────────────────────────────
function GPSStep({
  appId,
  unitId,
  siteId,
  onNext,
  completedSteps,
}: {
  appId: string;
  unitId?: string;
  siteId?: string;
  onNext: () => void;
  completedSteps: readonly string[];
}) {
  /*
    THE DRAFT IS PER UNIT, NOT PER FARM.

    Keyed on `appId` alone, every pond and plot on one farm shared a
    single stored walk — so walking the second overwrote the first before
    either had reached the server, and the saved-walk banner showed one
    unit's points on another unit's screen. A farm walked as a whole gets
    the empty suffix, which is the same three-state the platform uses for
    the unit id itself.
  */
  const draftKey = `${appId}::${siteId ? `site:${siteId}` : unitId ?? ''}`;
  const { currentLocation, isLocating, isWalking, walkPoints, locateMe, startBoundaryWalk, stopBoundaryWalk, markEdgeUnwalkable, restoreBoundaryWalk } = useGPS(draftKey);
  const coordinator = useAuthStore((s) => s.coordinator);
  const isLocalSite = siteId ? offlineSiteClientId(siteId) !== null : false;
  const isLocalUnit = unitId ? offlineUnitClientId(unitId) !== null : false;
  const defaultManualCoordinatesEnabled = useSettingsStore((s) => s.superAdminManualCoordinatesEnabled);
  const isSuperAdmin = coordinator?.role === 'SuperAdmin';

  /*
    Both of these start from what the platform already knows, not from
    false.

    This screen is reachable by tapping its step dot, so a coordinator who
    captured the centre point and came back to walk the boundary mounted it
    fresh: `gpsSaved` was false, Continue was disabled by it, and the walk
    they had just saved did not appear. The work was on the server the
    whole time — the screen was the only thing that had forgotten.

    Every other step is told what has been done. Identity is handed
    `completedSteps`; this one was not.
  */
  const [gpsSaved, setGpsSaved] = useState(() => completedSteps.includes('gps'));
  const [boundarySaved, setBoundarySaved] = useState(false);
  const [walk, setWalk] = useState<HydratedWalk | null>(null);

  /*
    The walk already on record, if there is one.

    Only once — `walkPlaceholder` is replaced by the real response the
    moment a new walk closes, and refetching over a fresh measurement
    would show the coordinator the old one.
  */
  const existingBoundary = useQuery({
    queryKey: ['boundary', appId, unitId ?? '', siteId ?? ''],
    queryFn: async () => (await boundaryApi.get(appId, siteId ? undefined : unitId ?? '', siteId)).data?.data as BoundaryRecord | undefined,
    staleTime: Infinity,
    refetchOnMount: 'always',
    enabled: !isLocalSite && !isLocalUnit,
  });
  const localBoundaryDraft = useOfflineStore((s) => s.boundaryDrafts[draftKey]);
  const hasQueuedUnitBoundary = useOfflineStore((s) => s.queue.some((item) =>
    item.collection === 'boundaryWalks'
    && item.appId === appId
    && item.payload.unitId === (unitId ?? null)
    && item.payload.siteId === (siteId ?? null)
    && Array.isArray(item.payload.points)
    && item.payload.points.length >= 3
  ));
  const lastSyncAt = useOfflineStore((s) => s.lastSyncAt);

  React.useEffect(() => {
    const record = existingBoundary.data;

    /*
      A walk that is still open is not a result. `isWalkActive` means
      somebody started one and never closed it, so there is no area to
      show and the coordinator should walk it again rather than be told
      a half-finished attempt is their boundary.
    */
    if (!record) {
      return;
    }

    const localDraft = localBoundaryDraft;
    const serverUpdatedAt = record.updatedAt ? Date.parse(record.updatedAt) : 0;
    const hasNewerLocalDraft = Boolean(
      localDraft?.points.length
      && !boundaryDraftMatchesRecord(localDraft, record)
      && localDraft.updatedAt > serverUpdatedAt
    );

    if (record.boundaryPolygon && !record.isWalkActive && record.pointCount >= 3) {
      if (hasNewerLocalDraft) return;
      setWalk((current) => current ?? record);
      setBoundarySaved(true);
      useOfflineStore.getState().clearBoundaryDraft(draftKey);
      return;
    }

    if (
      walkPoints.length === 0 &&
      record.boundaryWalk?.length &&
      (!localDraft || serverUpdatedAt > localDraft.updatedAt)
    ) {
      restoreBoundaryWalk(record.boundaryWalk.map((point) => ({
        ...point,
        timestamp: new Date(point.timestamp),
      })));
    }

    /*
      Never over a walk already in hand. A walk closed in this session is
      the newer truth, and the cached record is what the server held
      before it.
    */
  }, [appId, draftKey, existingBoundary.data, localBoundaryDraft, restoreBoundaryWalk, walkPoints.length]);

  React.useEffect(() => {
    if (lastSyncAt) {
      void existingBoundary.refetch();
    }
  }, [existingBoundary.refetch, lastSyncAt]);
  const [manualMode, setManualMode] = useState(isSuperAdmin && defaultManualCoordinatesEnabled);
  /*
    Set when an edge is marked unwalkable, so the resume button says what
    it is for. The reason itself lives in the hook until the next fix.
  */
  const [bridgePending, setBridgePending] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualAccuracy, setManualAccuracy] = useState('10');
  const [loading, setLoading] = useState(false);
  const enqueue = useOfflineStore((s) => s.enqueue);
  const saveBoundaryDraft = useOfflineStore((s) => s.saveBoundaryDraft);
  const endBoundaryDraft = useOfflineStore((s) => s.endBoundaryDraft);
  const clearBoundaryDraft = useOfflineStore((s) => s.clearBoundaryDraft);
  /*
    Ended means the coordinator said the perimeter is complete. It is not
    the same as stopped, and treating them as one is what let a finished
    walk be resumed and extended.
  */
  const walkEnded = localBoundaryDraft?.endedAt != null;
  const localSize = React.useMemo(() => measureWalk(walkPoints), [walkPoints]);

  /*
    The outer envelope, for a perimeter that could not be walked exactly.
    Reported beside the walked figure, never instead of it — see the note
    on `outerEstimate`.
  */
  const localOuter = React.useMemo(() => outerEstimate(walkPoints), [walkPoints]);

  /*
    Worth mentioning when the envelope is materially bigger than what was
    walked, or when the walked shape cannot be trusted at all.

    The second case is not an afterthought. A walk that resumed out of
    order crosses itself, and its area collapses to near zero as the two
    loops cancel — while every point sits ON the envelope, so the
    deepest-detour measure is zero and a detour-only test would stay
    silent exactly when the number is worthless. Five per cent keeps GPS
    noise out of it.
  */
  const detoured =
    localOuter.hectares != null
    && localOuter.walkedHectares != null
    && localOuter.extraHectares != null
    && localOuter.extraHectares > 0.05
    && (localOuter.extraHectares > localOuter.walkedHectares * 0.05 || localSize.rejection !== null);

  const saveGpsPoint = async (lat: number, lng: number, accuracyMeters: number) => {
    enqueue('gpsCenters', appId, {
      centerLat: lat,
      centerLng: lng,
      accuracyMeters,
      unitId: unitId ?? null,
      siteId: siteId ?? null,
    });
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
      Alert.alert('Saved', 'Manual coordinates saved successfully.');
    } catch {
      Alert.alert('Error', 'Failed to save manual coordinates.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * The walk is finished. Measure it here, say so, and then send it.
   *
   * Ending and stopping were the same button, and they are not the same
   * decision. Stopping pauses the receiver; the walk can be picked up
   * again. Ending says the perimeter is complete — which is the point at
   * which a size means anything, and the point after which appending more
   * fixes would join two separate traverses into one nonsense polygon.
   *
   * The size is worked out on the phone and shown before anything is
   * sent, because the only moment walking it again is cheap is while the
   * coordinator is still standing on it. Previously the figure came back
   * in the response to a successful save, so a failed save showed no size
   * at all — and every save on a bad connection failed.
   */
  const handleEndWalk = async () => {
    stopBoundaryWalk();

    if (walkPoints.length < 3) {
      Alert.alert('Not enough points', `A boundary needs at least 3 GPS points. You have ${walkPoints.length}.`);
      return;
    }

    const size = measureWalk(walkPoints);

    saveBoundaryDraft(draftKey, walkPoints);
    endBoundaryDraft(draftKey);

    const measured = size.hectares == null
      ? 'The size could not be worked out.'
      : `${size.hectares.toFixed(4)} ha from ${walkPoints.length} points`
        + (size.pathMetres == null ? '' : `, ${size.pathMetres.toFixed(0)} m walked`);

    /*
      The envelope, when the walk clearly went inside the farm. A
      coordinator who had to cut around bush should be told what the farm
      measures if those detours are ignored — and told that it is an
      estimate, because a farm that is genuinely concave would be
      overstated by exactly this arithmetic.
    */
    const outer = outerEstimate(walkPoints);
    const worthShowing =
      outer.hectares != null
      && outer.walkedHectares != null
      && outer.extraHectares != null
      && outer.extraHectares > 0.05
      && (outer.extraHectares > outer.walkedHectares * 0.05 || size.rejection !== null);

    const detour = worthShowing
      ? `\n\nOuter estimate: about ${outer.hectares?.toFixed(4)} ha`
        + (outer.deepestInwardMetres != null && outer.deepestInwardMetres >= 15
          ? ` — the walk went up to ${outer.deepestInwardMetres} m inside the farm `
            + `(${outer.pointsInsideCount} of ${walkPoints.length} points).`
          : ', taking the farthest point in each direction.')
        + ' An estimate only, and too high if the farm is not a simple shape.'
      : '';

    Alert.alert(
      size.rejection ? 'Walk ended — but check this' : 'Walk ended',
      size.rejection
        ? `${measured}\n\n${size.rejection}${detour}\n\nYou are still on the farm. Walk it again if you can.`
        : `${measured}${detour}\n\nSending it to the server now.`
    );

    await handleCloseBoundary();
  };

  const handleCloseBoundary = async () => {
    stopBoundaryWalk();
    if (walkPoints.length < 3) {
      Alert.alert('Not enough points', `Need at least 3 GPS points. You have ${walkPoints.length}.`);
      return;
    }
    saveBoundaryDraft(draftKey, walkPoints);
    endBoundaryDraft(draftKey);
    setLoading(true);
    try {
      /*
        A WALK THE SERVER STILL HOLDS OPEN IS CLEARED FIRST, and only here.

        `start` refuses while a walk is active. So the first failure — one
        dropped request in the middle of fifty-odd points — left the lock
        set, and every retry after it failed on the lock instead, with a
        different message each time. The `catch` below printed one
        sentence over all of them, so the coordinator saw "failed to save"
        forever with no way out: the app's only path to a walk starts by
        starting one. Two walks sat open on the server like that, 54
        points and 14 points recorded, neither with an area.

        Resetting is safe at this line and nowhere else, because we hold a
        complete walk of our own — checked above — and are about to send
        it. That is also why it is not offered as a button: `forceReset`
        discards the server's points, and pressing it with nothing to put
        in their place would throw away the walk somebody just did.
      */
      /*
        ONE REQUEST FOR THE WHOLE WALK.

        This was `startWalk`, then an `addPoint` for every fix, then
        `closeWalk` — 502 requests for a 500-point walk, each one a chance
        to fail, all of them over a field connection. On 13 November a
        500-point walk of Ogun-osun 65 got 52 points up in 37 seconds and
        stopped there: request 53 hit the 15-second timeout and about 450
        points were never sent. The loop was never going to finish — at
        the 710 ms per request that link managed it needed six
        uninterrupted minutes.

        Sending the walk whole also means there is no `start`, so there is
        no half-open walk left on the server to block the next attempt.
        That removes the lock from this path rather than working around
        it.
      */
      const points = walkPoints.map((pt) => ({
          lat: pt.lat,
          lng: pt.lng,
          accuracyMeters: pt.accuracyMeters,
          /* When the receiver took this fix, not when we got round to sending it. */
          capturedAt: pt.timestamp.toISOString(),
          /* An edge nobody could walk, and why. */
          bridged: pt.bridged,
          bridgeReason: pt.bridgeReason,
        }));
      enqueue('boundaryWalks', appId, { points, unitId: unitId ?? null, siteId: siteId ?? null });
      Alert.alert('Saved on this device', `${walkPoints.length} boundary points are queued for sync.`);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to save boundary walk on this device.');
      Alert.alert('Could not save boundary walk', message);
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
            Stand at the {unitId ? 'unit' : siteId ? 'site' : 'farm'} centre and tap "Locate Me" to capture GPS coordinates.
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
          Walk the {unitId ? 'unit' : siteId ? 'site' : 'farm'} perimeter with your phone while the boundary is recorded.
        </Text>

        {isWalking && (
          <View className="bg-yellow-50 rounded-xl p-3 mb-3">
            <Text className="text-yellow-500 font-semibold">🔴 Walk in progress</Text>
            <Text className="text-text-3 text-xs mt-1">{walkPoints.length} points recorded and saved on this device</Text>
          </View>
        )}

        {!boundarySaved && !isWalking && (localBoundaryDraft?.points.length ?? 0) > 0 && (
          <View className="bg-yellow-50 rounded-xl p-3 mb-3">
            <Text className="text-yellow-500 font-semibold">
              {walkEnded ? 'Walk ended — measured on this device' : 'Walk saved on this device'}
            </Text>
            <Text className="text-text-3 text-xs mt-1">
              {localBoundaryDraft?.points.length} points · not yet finalized on the server
            </Text>
            {/*
              The phone's own figure, shown without waiting for a server
              that may be hours away. The platform measures the polygon it
              stores and keeps its own reading; this is the one for the
              person standing on the farm.
            */}
            {walkEnded && localSize.hectares != null && (
              <Text className="text-text font-semibold text-sm mt-1">
                {localSize.hectares.toFixed(4)} ha
                {localSize.pathMetres == null ? '' : ` · ${localSize.pathMetres.toFixed(0)} m walked`}
              </Text>
            )}
            {walkEnded && localSize.rejection && (
              <Text className="text-yellow-500 text-xs mt-1 font-semibold">{localSize.rejection}</Text>
            )}
            {/*
              Labelled an estimate, every time it is shown. A boundary
              that could not be walked exactly has no measured size, and
              printing one as though it did is how a figure nobody stands
              behind ends up under a loan.
            */}
            {walkEnded && detoured && (
              <Text className="text-text-3 text-xs mt-1">
                Outer estimate {localOuter.hectares?.toFixed(4)} ha — not a measurement.
                {localOuter.deepestInwardMetres != null && localOuter.deepestInwardMetres >= 15
                  ? ` Walk went up to ${localOuter.deepestInwardMetres} m inside the farm `
                    + `(${localOuter.pointsInsideCount} of ${walkPoints.length} points).`
                  : ''}
              </Text>
            )}
            {/* The stretches of edge nobody could walk, and what they stand in for. */}
            {walkEnded && localSize.bridgedSegments > 0 && (
              <Text className="text-text-3 text-xs mt-1">
                {localSize.bridgedSegments} stretch{localSize.bridgedSegments === 1 ? '' : 'es'} bridged
                {' '}· {localSize.bridgedMetres} m of boundary not walked
              </Text>
            )}
          </View>
        )}

        {boundarySaved && walk?.walkRejection && (
          <View className="bg-yellow-50 rounded-xl p-3 mb-3">
            <Text className="text-yellow-500 font-semibold">⚠️ Saved — but not a measurement</Text>
            <Text className="text-text text-xs mt-1">{walk.walkRejection}</Text>
            <Text className="text-text-3 text-xs mt-1">
              {describeArea(walk)} · {walk.pointCount} points
              {walk.walkDurationSeconds != null ? ` · ${walk.walkDurationSeconds}s` : ''}
            </Text>
          </View>
        )}

        {boundarySaved && walk && !walk.walkRejection && (
          <View className="bg-green-50 rounded-xl p-3 mb-3">
            <Text className="text-green-500 font-semibold">✅ Boundary saved</Text>
            <Text className="text-text font-semibold text-sm mt-1">{describeArea(walk)}</Text>
            <Text className="text-text-3 text-xs mt-1">
              {walk.pointCount} points
              {walk.walkDurationSeconds != null ? ` over ${walk.walkDurationSeconds}s` : ''}
            </Text>
            {/* Against what the farmer said, when there is something to compare to.
                Shown whichever way it falls: a farm half the declared size and one
                twice it are both worth a second look before anybody lends on it. */}
            {walk.areaDiscrepancyPct != null && (
              <Text
                className={`text-xs mt-1 ${("fraudSignals" in walk && walk.fraudSignals.significantAreaDiscrepancy) ? 'text-yellow-500 font-semibold' : 'text-text-3'}`}
              >
                {walk.areaDiscrepancyPct > 0 ? '+' : ''}
                {walk.areaDiscrepancyPct.toFixed(1)}% against the size the farmer declared
              </Text>
            )}
          </View>
        )}

        {/* A record saved before the platform could measure it. Says so,
            rather than showing a reassuring tick it has not earned. */}
        {boundarySaved && !walk && (
          <View className="bg-green-50 rounded-xl p-3 mb-3">
            <Text className="text-green-500 font-semibold">✅ Boundary saved</Text>
            <Text className="text-text-3 text-xs mt-1">{walkPoints.length} points — not yet measured</Text>
          </View>
        )}

        {/*
          Resume is offered only while the walk is unfinished. Once ended
          it is withheld, because appending to a completed perimeter joins
          two traverses into one polygon that describes neither.
        */}
        {!isWalking && !boundarySaved && !walkEnded && (
          <Button
            label={
              bridgePending
                ? 'Resume on the other side'
                : walkPoints.length > 0
                  ? 'Resume Boundary Walk'
                  : 'Start Boundary Walk'
            }
            onPress={() => {
              setBridgePending(false);
              startBoundaryWalk(walkPoints.length > 0);
            }}
            disabled={!gpsSaved}
            variant="secondary"
            fullWidth
          />
        )}
        {/*
          THE WALK IS FINISHED. Distinct from stopping, and the only
          action that produces a size.
        */}
        {!isWalking && !boundarySaved && !walkEnded && walkPoints.length >= 3 && (
          <Button
            label={loading ? 'Saving...' : `End boundary walk & calculate size (${walkPoints.length} pts)`}
            onPress={handleEndWalk}
            loading={loading}
            variant="danger"
            fullWidth
          />
        )}
        {/* Ended, measured, and still owed to the server. */}
        {!isWalking && !boundarySaved && walkEnded && (
          <Button
            label={loading ? 'Saving...' : `Save ${walkPoints.length} points for sync`}
            onPress={handleCloseBoundary}
            loading={loading}
            variant="danger"
            fullWidth
          />
        )}
        {/*
          STARTING OVER HAS TO BE POSSIBLE, AND HAS TO BE DELIBERATE.

          Once a walk is held on the device the button above reads
          "Resume", which is right for a walk interrupted halfway and
          wrong for a walk somebody wants to do again — resuming appends,
          so a second traverse would join onto the first and the polygon
          would jump between two different parts of the farm.

          That is not hypothetical: the way a failed walk used to be
          redone was to press Start again, which silently wiped it. So the
          discard is here, named, behind a confirmation, and it is the
          only thing in this screen that throws a walk away.
        */}
        {/*
          END THE SERVER'S WALK, by hand.

          Starting a walk used to set a lock that only a successful close
          cleared, and the app's only route to a walk began by starting
          one — so a failed save left the farm locked and every retry
          bounced off it. Saving the walk whole means this path no longer
          opens one at all, but production still holds rows stuck that
          way, and phones on older builds keep making them.

          It does not touch the points. The server keeps every fix it has;
          all this does is say the walk is over, which is what nothing
          could say before.
        */}
        {!isWalking && !boundarySaved && existingBoundary.data?.isWalkActive === true && (
          <Button
            label="End the walk left open on the server"
            onPress={async () => {
              setLoading(true);
              try {
                const { data } = await boundaryApi.pauseWalk(appId, unitId ?? '');
                await existingBoundary.refetch();
                Alert.alert(
                  'Walk ended on the server',
                  `The server was holding a walk open with ${data.data.pointCount} points. `
                    + 'Those points are kept — it is no longer marked as in progress, '
                    + 'so you can save a walk for this farm again.'
                );
              } catch (err: unknown) {
                Alert.alert('Could not end the walk', getErrorMessage(err));
              } finally {
                setLoading(false);
              }
            }}
            loading={loading}
            variant="secondary"
            fullWidth
          />
        )}
        {!isWalking && !boundarySaved && walkPoints.length > 0 && (
          <Button
            label="Discard and walk again"
            onPress={() =>
              Alert.alert(
                'Discard this walk?',
                `${walkPoints.length} points recorded on this device will be deleted. `
                  + 'They have not been saved on the server, so this cannot be undone.',
                [
                  { text: 'Keep it', style: 'cancel' },
                  {
                    text: 'Discard',
                    style: 'destructive',
                    onPress: () => {
                      restoreBoundaryWalk([]);
                      clearBoundaryDraft(draftKey);
                    },
                  },
                ]
              )
            }
            variant="secondary"
            fullWidth
          />
        )}
        {/*
          Two actions while recording, because they are two decisions.
          Pausing is for an interrupted walk — a gate to open, a farmer to
          talk to — and keeps the walk resumable. Ending declares the
          perimeter complete and is what yields a size.
        */}
        {isWalking && (
          <Button
            label={loading ? 'Saving...' : `End boundary walk & calculate size (${walkPoints.length} pts)`}
            onPress={handleEndWalk}
            loading={loading}
            variant="danger"
            fullWidth
          />
        )}
        {isWalking && (
          <Button
            label="Pause recording (keep walking later)"
            onPress={stopBoundaryWalk}
            variant="secondary"
            fullWidth
          />
        )}
        {/*
          THE EDGE AHEAD CANNOT BE WALKED.

          Recording stops, the coordinator crosses inside the farm, and
          rejoins the boundary further along. Nothing is captured in
          between, so the polygon gets a straight line across the gap
          rather than a bite taken out of it — and the reason travels with
          that segment, so a reviewer reading the record later can tell a
          deliberate bridge from a cut corner.
        */}
        {isWalking && walkPoints.length > 0 && (
          <Button
            label="Can't walk this edge — skip to the other side"
            onPress={() =>
              Alert.alert(
                "Why can't this edge be walked?",
                'Recording stops. Walk round to where the boundary can be followed again, '
                  + 'then press Resume — the gap will be recorded as a straight edge with this reason.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Bush / overgrown',
                    onPress: () => {
                      markEdgeUnwalkable('Bush or overgrown');
                      setBridgePending(true);
                    },
                  },
                  {
                    text: 'Blocked or fenced',
                    onPress: () => {
                      markEdgeUnwalkable('Blocked or fenced');
                      setBridgePending(true);
                    },
                  },
                  {
                    text: 'Water / impassable',
                    onPress: () => {
                      markEdgeUnwalkable('Water or impassable ground');
                      setBridgePending(true);
                    },
                  },
                ]
              )
            }
            variant="secondary"
            fullWidth
          />
        )}
      </Card>

      <Button
        label={unitId ? 'Continue to unit review' : 'Continue'}
        onPress={onNext}
        disabled={!gpsSaved || Boolean(unitId && !boundarySaved && !hasQueuedUnitBoundary)}
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

function LandOwnershipStep({ appId, unitId, siteId, onNext }: { appId: string; unitId?: string; siteId?: string; onNext: () => void }) {
  const [loading, setLoading] = useState(false);
  const enqueue = useOfflineStore((s) => s.enqueue);
  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<LandForm>({
    resolver: zodResolver(landSchema),
    defaultValues: { ownershipType: '', docRef: '', docIssueDate: '', activeDispute: false, encumbrance: false },
  });

  const ownershipTypes = ['C of O', 'Deed', 'Leased', 'Family/Communal', 'Customary'];

  const submit = async (data: LandForm) => {
    setLoading(true);
    try {
      enqueue('fieldActions', appId, {
        action: 'landOwnership',
        unitId: unitId ?? null,
        siteId: siteId ?? null,
        body: { ...data, docIssueDate: new Date(data.docIssueDate).toISOString() },
      });
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
function InfrastructureStep({ appId, unitId, siteId, onNext }: { appId: string; unitId?: string; siteId?: string; onNext: () => void }) {
  const [loading, setLoading] = useState(false);
  const enqueue = useOfflineStore((s) => s.enqueue);
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
      enqueue('fieldActions', appId, {
        action: 'infrastructure',
        unitId: unitId ?? null,
        siteId: siteId ?? null,
        body: {
          waterSource: form.waterSource,
          irrigationStatus: form.irrigationStatus || 'Rain-fed',
          roadCondition: form.roadCondition,
          distanceToRoadValue: parseFloat(form.distanceToRoadValue) || 0,
          distanceToRoadUnit: form.distanceToRoadUnit,
          storageType: form.storageType,
          storageCapacityTonnes: form.storageCapacityTonnes ? parseFloat(form.storageCapacityTonnes) : undefined,
        },
      });
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

function CapacityStep({ appId, unitId, siteId, onNext, farmType, declared, recorded, onEditTypes }: {
  appId: string;
  unitId?: string;
  siteId?: string;
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
  const enqueue = useOfflineStore((s) => s.enqueue);

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

      enqueue('fieldActions', appId, {
        action: 'capacity',
        unitId: unitId ?? null,
        siteId: siteId ?? null,
        body: {
          measurementMethod: method,
          crops: showCrops ? payload('crop') : [],
          livestock: showLivestock ? payload('livestock') : [],
        },
      });
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

/** A photo already stored on the platform, shown with this coordinator's sign-in. */
function StoredPhoto({ fileId, appId }: { fileId?: string; appId: string }) {
  const source = useStoredFileSource(fileId, appId);
  if (!source) return <Text className="text-xs text-text-3">Saved photo</Text>;
  return <Image source={source} className="w-full h-full" resizeMode="cover" />;
}

// ─── Step: Evidence ───────────────────────────────────────────────────────────
function EvidenceStep({ appId, unitId, siteId, onNext, farmType }: {
  appId: string;
  unitId?: string;
  siteId?: string;
  onNext: () => void;
  farmType: 'crop' | 'livestock' | 'mixed';
}) {
  const { photos, takePhoto, pickFromGallery, uploadPhoto, removePhoto } = useCamera(appId, siteId);
  const isLocalSite = siteId ? offlineSiteClientId(siteId) !== null : false;

  /*
    Photos this farm already has on the platform.

    Captures were only held in this screen's memory, so a coordinator who
    left and came back found every slot empty and had to photograph the
    whole farm again, although every photo had uploaded. A slot counts as
    captured when this visit took it OR an earlier one did.
  */
  const { data: uploadedEvidence } = useQuery({
    queryKey: ['evidence-photos', appId, unitId ?? '', siteId ?? ''],
    queryFn: () => uploadsApi.photos(appId, 'evidence', unitId, siteId),
    select: (res) => ((res.data as { data?: UploadedPhoto[] })?.data ?? []).filter((p) => !!p.slotKey),
    enabled: !isLocalSite,
  });
  const earlier = (slotKey: string) => (uploadedEvidence ?? []).find((p) => p.slotKey === slotKey);
  const coordinator = useAuthStore((s) => s.coordinator);
  const superAdminGalleryEvidenceEnabled = useSettingsStore((s) => s.superAdminGalleryEvidenceEnabled);
  const shouldUseGallery = coordinator?.role === 'SuperAdmin' && superAdminGalleryEvidenceEnabled;
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { currentLocation } = useGPS();
  const enqueue = useOfflineStore((s) => s.enqueue);

  const requiredSlots = EVIDENCE_SLOTS.filter(
    (s) => s.allTypes || (s.types ?? []).includes(farmType)
  );
  const requiredCount = requiredSlots.length;
  const completedSlots = requiredSlots.filter((s) => photos.find((p) => p.slotKey === s.key && p.fileId) || earlier(s.key));
  const completedCount = completedSlots.length;

  const isUploadingSlot = (slotKey: string) => uploading === slotKey;

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
      enqueue('fieldActions', appId, {
        action: 'evidenceComplete',
        unitId: unitId ?? null,
        siteId: siteId ?? null,
        body: {},
      });
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
          const saved = photo ? undefined : earlier(slot.key);
          const isUploading = uploading === slot.key;
          return (
            <View key={slot.key} className="mb-3">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-sm font-medium text-text">{slot.label}</Text>
                {photo && photo.fileId && <Badge label="Captured" variant="green" />}
                {photo && !photo.fileId && !isUploadingSlot(slot.key) && <Badge label="Not uploaded, tap to retry" variant="yellow" />}
                {!photo && saved && <Badge label="Captured earlier" variant="green" />}
              </View>
              <TouchableOpacity
                onPress={() => handleCapture(slot.key)}
                className={`h-28 rounded-xl overflow-hidden items-center justify-center border-2 border-dashed ${photo || saved ? 'border-green-500' : 'border-border'}`}
              >
                {isUploading ? (
                  <ActivityIndicator color="#0D7A3D" />
                ) : photo ? (
                  <Image source={{ uri: photo.localUri }} className="w-full h-full" resizeMode="cover" />
                ) : saved ? (
                  <StoredPhoto fileId={saved.fileId} appId={appId} />
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
function ReviewStep({ appId, unitId, siteId, farmName, onSubmit }: {
  appId: string;
  unitId?: string;
  siteId?: string;
  farmName: string;
  onSubmit: () => void;
}) {
  const [certified, setCertified] = useState(false);
  const [loading, setLoading] = useState(false);
  const enqueue = useOfflineStore((s) => s.enqueue);
  const isUnit = Boolean(unitId);

  const submit = async () => {
    if (!isUnit && !certified) { Alert.alert('Required', 'You must confirm the certification statement before submitting.'); return; }
    setLoading(true);
    try {
      if (!isUnit) {
        enqueue('fieldActions', appId, {
          action: 'certify',
          unitId: unitId ?? null,
          siteId: siteId ?? null,
          body: { statementConfirmed: true },
        });
      }
      enqueue('fieldActions', appId, {
        action: 'submit',
        unitId: unitId ?? null,
        siteId: siteId ?? null,
        body: {},
      });
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
        <Text className="font-bold text-green-500 mb-2">
          {isUnit ? '✅ GPS and boundary captured' : '✅ Ready for Submission'}
        </Text>
        <Text className="text-text-3 text-sm">
          {isUnit
            ? 'The unit shares its site’s documents and amenities. Submit its location and boundary walk for admin approval.'
            : 'All verification steps have been completed. Please review and certify before submitting.'}
        </Text>
      </Card>

      {!isUnit && (
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
      )}

      <Button
        label={loading ? 'Submitting...' : isUnit ? 'Submit Unit for Approval' : 'Submit Verification'}
        onPress={submit}
        loading={loading}
        disabled={!isUnit && !certified}
        fullWidth
      />
    </View>
  );
}

function blankVerificationRecord(): VerificationRecord {
  return {
    currentStep: 'identity',
    completedSteps: [],
    overallStatus: 'in_progress',
    farmTypeSelected: null,
    farmTypeCategories: { crop: [], livestock: [] },
    identity: {
      status: 'pending', confidence: null, coordinatorConfirmed: false, confirmedAt: null,
      mismatchReason: null, mismatchNotes: null,
    },
    gps: { centerLat: null, centerLng: null, accuracyMeters: null, verifiedAt: null },
    landOwnership: {
      ownershipType: null, docRef: null, docIssueDate: null, activeDispute: false,
      encumbrance: false, notes: null, verifiedAt: null,
    },
    infrastructure: {
      waterSource: null, irrigationStatus: null, roadCondition: null, distanceToRoadValue: null,
      distanceToRoadUnit: null, storageType: null, storageCapacityTonnes: null, verifiedAt: null,
    },
    capacity: { measurementMethod: null, crops: [], livestock: [], verifiedAt: null },
    certification: { statementText: null, coordinatorId: null, confirmedAt: null },
    submittedAt: null,
    approvedAt: null,
    syncStatus: 'pending',
  };
}

function withQueuedVerification(
  base: VerificationRecord | null,
  queue: ReturnType<typeof useOfflineStore.getState>['queue'],
  appId: string,
  unitId?: string,
  siteId?: string
): VerificationRecord | null {
  const items = queue.filter((item) => item.appId === appId
    && (item.payload.unitId ?? null) === (unitId ?? null)
    && (item.payload.siteId ?? null) === (siteId ?? null)
    && (item.collection === 'fieldActions' || item.collection === 'gpsCenters'));
  if (!base && items.length === 0) return null;

  const record = base ? {
    ...base,
    completedSteps: [...base.completedSteps],
    identity: { ...base.identity },
    gps: { ...base.gps },
    landOwnership: { ...base.landOwnership },
    infrastructure: { ...base.infrastructure },
    capacity: { ...base.capacity },
    certification: { ...base.certification },
  } : blankVerificationRecord();

  const complete = (step: VerificationRecord['currentStep']) => {
    if (!record.completedSteps.includes(step)) record.completedSteps.push(step);
    record.syncStatus = 'pending';
  };

  for (const item of items) {
    if (item.collection === 'gpsCenters') {
      record.gps = {
        centerLat: typeof item.payload.centerLat === 'number' ? item.payload.centerLat : null,
        centerLng: typeof item.payload.centerLng === 'number' ? item.payload.centerLng : null,
        accuracyMeters: typeof item.payload.accuracyMeters === 'number' ? item.payload.accuracyMeters : null,
        verifiedAt: item.clientTimestamp,
      };
      complete('gps');
      continue;
    }

    const body = item.payload.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) continue;
    const value = body as Record<string, unknown>;

    switch (item.payload.action) {
      case 'identity':
        if (value.confirmed === false) record.overallStatus = 'identity_mismatch';
        record.identity = {
          ...record.identity,
          status: value.confirmed === false ? 'mismatch' : 'confirmed',
          coordinatorConfirmed: value.confirmed === true,
          confidence: typeof value.confidence === 'number' ? value.confidence : null,
          mismatchReason: typeof value.mismatchReason === 'string' ? value.mismatchReason : null,
          confirmedAt: item.clientTimestamp,
        };
        complete('identity');
        break;
      case 'farmType':
        if (value.farmType === 'crop' || value.farmType === 'livestock' || value.farmType === 'mixed') {
          record.farmTypeSelected = value.farmType;
        }
        record.farmTypeCategories = {
          crop: Array.isArray(value.cropCategories) ? value.cropCategories.filter((entry): entry is string => typeof entry === 'string') : [],
          livestock: Array.isArray(value.livestockCategories) ? value.livestockCategories.filter((entry): entry is string => typeof entry === 'string') : [],
        };
        complete('farmType');
        break;
      case 'landOwnership':
        record.landOwnership = {
          ...record.landOwnership,
          ownershipType: typeof value.ownershipType === 'string' ? value.ownershipType : null,
          docRef: typeof value.docRef === 'string' ? value.docRef : null,
          docIssueDate: typeof value.docIssueDate === 'string' ? value.docIssueDate : null,
          activeDispute: value.activeDispute === true,
          encumbrance: value.encumbrance === true,
          notes: typeof value.notes === 'string' ? value.notes : null,
          verifiedAt: item.clientTimestamp,
        };
        complete('landOwnership');
        break;
      case 'infrastructure':
        record.infrastructure = {
          ...record.infrastructure,
          waterSource: typeof value.waterSource === 'string' ? value.waterSource : null,
          irrigationStatus: typeof value.irrigationStatus === 'string' ? value.irrigationStatus : null,
          roadCondition: typeof value.roadCondition === 'string' ? value.roadCondition : null,
          distanceToRoadValue: typeof value.distanceToRoadValue === 'number' ? value.distanceToRoadValue : null,
          distanceToRoadUnit: typeof value.distanceToRoadUnit === 'string' ? value.distanceToRoadUnit : null,
          storageType: typeof value.storageType === 'string' ? value.storageType : null,
          storageCapacityTonnes: typeof value.storageCapacityTonnes === 'number' ? value.storageCapacityTonnes : null,
          verifiedAt: item.clientTimestamp,
        };
        complete('infrastructure');
        break;
      case 'capacity':
        record.capacity = {
          measurementMethod: typeof value.measurementMethod === 'string' ? value.measurementMethod : null,
          crops: Array.isArray(value.crops) ? value.crops as VerificationRecord['capacity']['crops'] : [],
          livestock: Array.isArray(value.livestock) ? value.livestock as VerificationRecord['capacity']['livestock'] : [],
          verifiedAt: item.clientTimestamp,
        };
        complete('capacity');
        break;
      case 'evidenceComplete':
        complete('evidence');
        break;
      case 'certify':
        record.certification = { ...record.certification, confirmedAt: item.clientTimestamp };
        complete('review');
        break;
      case 'submit':
        record.overallStatus = 'submitted';
        record.submittedAt = item.clientTimestamp;
        complete('review');
        break;
    }
  }

  return record;
}

// ─── Main Wizard Orchestrator ─────────────────────────────────────────────────
export default function VerificationWizard() {
  const { appId, unitId, siteId, siteLabel, unitLabel, subjectLabel } = useLocalSearchParams<{
    appId: string;
    unitId?: string;
    siteId?: string;
    siteLabel?: string;
    unitLabel?: string;
    /* What the thing is called, for a subject with no registration to read
       its name from — a cluster. Optional: a deep link without it falls
       back to the id rather than showing nothing. */
    subjectLabel?: string;
  }>();
  const router = useRouter();
  const qc = useQueryClient();
  const coordinator = useAuthStore((s) => s.coordinator);
  const offlineQueue = useOfflineStore((s) => s.queue);
  const isLocalSite = siteId ? offlineSiteClientId(siteId) !== null : false;
  const isLocalUnit = unitId ? offlineUnitClientId(unitId) !== null : false;
  const [isApproving, setIsApproving] = useState(false);

  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: ['farm-profile', appId, unitId],
    queryFn: () => farmsApi.profile(appId),
    select: (res) => res.data.data,
    /*
      A CLUSTER HAS NO FARM PROFILE, and that is not a failure.

      This wizard verifies clusters too — they are subjects of the same
      eight steps rather than having a thinner verification of their own.
      The farm profile is a registration's dossier, so for a cluster it
      404s, and retrying a 404 three times only holds the screen on a
      spinner.
    */
    retry: (attempt, error) =>
      (error as { response?: { status?: number } })?.response?.status === 404 ? false : attempt < 2,
    enabled: !siteId && !unitId,
  });

  /*
    Farm verification is part of its profile. Clusters and site scopes read
    their separate verification record so neither can collide with farm data.
  */
  const {
    data: recordOnly,
    isLoading: recordLoading,
    refetch: refetchRecord,
  } = useQuery({
    queryKey: ['verification-record', appId, unitId, siteId],
    queryFn: () => verificationApi.get(appId, unitId, siteId),
    select: (res) => res.data.data,
    enabled: unitId ? !isLocalUnit : siteId ? !isLoading && !isLocalSite : !isLoading && !profile,
  });

  /*
    Everything below reads this, not profile.verification — which is the
    whole of what the cluster case needed on this screen.
  */
  const baseVerification = siteId || unitId ? recordOnly ?? null : profile?.verification ?? recordOnly ?? null;
  const verification = withQueuedVerification(baseVerification, offlineQueue, appId, unitId, siteId);

  /* A subject without a farm profile is a cluster unless it has a site scope. */
  const isCluster = !siteId && !unitId && !profile && (!!recordOnly || offlineQueue.some((item) => item.appId === appId));
  const subjectName = siteLabel ?? profile?.registration.farmName ?? subjectLabel ?? appId;
  const backHref = siteId ? `/sites/${appId}` : isCluster ? `/cluster/${appId}` : `/farm/${appId}`;

  const completedSteps = verification?.completedSteps ?? [];
  const isUnit = Boolean(unitId);
  const visibleSteps: readonly Step[] = isUnit ? ['gps', 'review'] : STEPS;
  const farmType = (verification?.farmTypeSelected ?? 'crop') as 'crop' | 'livestock' | 'mixed';
  /* Which crops and which livestock, chosen at the farm type step. The
     capacity step asks about these and nothing else. */
  const declared = verification?.farmTypeCategories ?? { crop: [], livestock: [] };
  const recorded = {
    crop: verification?.capacity?.crops ?? [],
    livestock: verification?.capacity?.livestock ?? [],
  };
  const overallStatus = verification?.overallStatus;

  /*
    The step was chosen once, as the screen first rendered. On a fresh
    open the farm's saved progress was still loading at that moment, so
    nothing looked done and the wizard started at identity. It never looked
    again, so a verification stopped halfway began from the start every
    time, even though the platform had every completed step saved.

    So the step shown follows the saved progress until the coordinator
    chooses one: moving on, tapping a step dot, or being sent back to farm
    type. After that, their choice stands.
  */
  const resumeAt: Step = isUnit ? resumeUnitStep(completedSteps) : resumeStep(completedSteps);
  const [chosenStep, setActiveStep] = useState<Step | null>(null);
  const activeStep: Step = chosenStep ?? resumeAt;
  const stepIndex = visibleSteps.indexOf(activeStep);

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

    const next = visibleSteps[stepIndex + 1];
    if (next) setActiveStep(next);
  }, [stepIndex, returnTo, visibleSteps]);

  const handleSubmitSuccess = () => {
    Alert.alert('Saved on this device', 'Verification will be submitted for approval when sync succeeds.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const handleFinalApprove = async () => {
    setIsApproving(true);
    try {
      await verificationApi.approve(appId, unitId, siteId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['farms'] }),
        qc.invalidateQueries({ queryKey: ['clusters'] })
      ]);
      Alert.alert(
        'Verified',
        unitId
          ? 'The unit GPS and boundary have been approved.'
          : siteId
            ? 'Site verification has been approved and marked as verified.'
            : 'Farm verification has been approved and marked as verified.',
        [
        { text: 'OK', onPress: () => router.back() }
        ]
      );
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

  if (isLoading || recordLoading) return <LoadingSpinner />;

  /*
    Neither source answered. A missing profile alone is not a failure any
    more — that is every cluster — so the refusal waits until the record
    could not be read either.
  */
  if (!verification && (isError || (!profile && !siteId && !unitId))) {
    return (
      <ErrorMessage
        message="Could not load this verification."
        onRetry={() => {
          refetch();
          refetchRecord();
        }}
      />
    );
  }

  if (overallStatus === 'submitted' || overallStatus === 'approved') {
    const isSuperAdmin = coordinator?.role === 'SuperAdmin';
    return (
      <View className="flex-1 bg-bg items-center justify-center p-6">
        <Stack.Screen
          options={{
            headerShown: true,
            title: isUnit ? 'Unit Verification' : 'Verification',
            headerStyle: { backgroundColor: '#0D7A3D' },
            headerTintColor: '#fff',
            headerLeft: () => <HeaderBackButton fallbackHref={backHref} />
          }}
        />
        <Text className="text-5xl mb-4">🏆</Text>
        <Text className="text-xl font-bold text-text mb-2">
          {overallStatus === 'approved' ? 'Verification Approved' : 'Submitted for Review'}
        </Text>
        <Text className="text-text-3 text-center mb-6">
          {overallStatus === 'approved'
            ? isUnit ? 'This unit’s GPS and boundary have been approved.' : 'This farm has been fully verified and approved.'
            : isUnit
              ? 'The unit’s GPS and boundary are submitted for admin approval.'
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
        <Button label="Back" onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: unitLabel ?? siteLabel ?? (isCluster ? subjectName : 'Verification'),
          headerStyle: { backgroundColor: '#0D7A3D' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontFamily: FACE.bold, color: '#fff' },
          headerLeft: () => <HeaderBackButton fallbackHref={backHref} />,
        }}
      />

      {/* Step header */}
      <View className="bg-white border-b border-border px-5 py-3">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm font-bold text-text">{STEP_LABELS[activeStep]}</Text>
          <Text className="text-xs text-text-3">Step {stepIndex + 1} of {visibleSteps.length}</Text>
        </View>
        <ProgressBar value={stepIndex + 1} max={visibleSteps.length} />

        {/* Step dots */}
        <View className="flex-row justify-center mt-3 gap-1.5">
          {visibleSteps.map((s, i) => (
            <TouchableOpacity
              key={s}
              onPress={() => {
                const canGo = completedSteps.includes(s) || i === 0 || completedSteps.includes(visibleSteps[i - 1] as Step);
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
          <IdentityStep appId={appId} unitId={unitId} siteId={siteId} onNext={goToNext} completedSteps={completedSteps} />
        )}
        {activeStep === 'farmType' && (
          <FarmTypeStep
            appId={appId}
            unitId={unitId}
            siteId={siteId}
            onNext={() => { goToNext(); }}
            currentFarmType={verification?.farmTypeSelected ?? null}
            declared={declared}
          />
        )}
        {activeStep === 'gps' && (
          <GPSStep appId={appId} unitId={unitId} siteId={siteId} onNext={goToNext} completedSteps={completedSteps} />
        )}
        {activeStep === 'landOwnership' && (
          <LandOwnershipStep appId={appId} unitId={unitId} siteId={siteId} onNext={goToNext} />
        )}
        {activeStep === 'infrastructure' && (
          <InfrastructureStep appId={appId} unitId={unitId} siteId={siteId} onNext={goToNext} />
        )}
        {activeStep === 'capacity' && (
          <CapacityStep
            appId={appId}
            unitId={unitId}
            siteId={siteId}
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
          <EvidenceStep appId={appId} unitId={unitId} siteId={siteId} onNext={goToNext} farmType={farmType} />
        )}
        {activeStep === 'review' && (
          <ReviewStep appId={appId} unitId={unitId} siteId={siteId} farmName={subjectName} onSubmit={handleSubmitSuccess} />
        )}
      </ScrollView>
    </View>
  );
}
