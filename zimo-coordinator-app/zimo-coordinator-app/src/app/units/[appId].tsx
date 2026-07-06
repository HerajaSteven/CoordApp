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
import { unitsApi } from '@/services/api';
import { Card, Button, Input, LoadingSpinner, ErrorMessage } from '@/components/ui';
import type { FarmUnit, UnitType } from '@/types';
import { getErrorMessage } from '@/utils/errors';

const UNIT_TYPES: Array<{ value: UnitType; label: string; icon: string }> = [
  { value: 'pond', label: 'Pond', icon: '🐟' },
  { value: 'plot', label: 'Crop Plot', icon: '🌽' },
  { value: 'paddock', label: 'Paddock', icon: '🐄' },
  { value: 'pen', label: 'Pen', icon: '🐖' },
  { value: 'greenhouse', label: 'Greenhouse', icon: '🏡' },
  { value: 'orchard', label: 'Orchard', icon: '🍎' },
  { value: 'other', label: 'Other', icon: '📍' },
];

// Suggested focus options per unit type — free text field, these are just
// quick-tap suggestions, coordinator can type anything.
const FOCUS_SUGGESTIONS: Record<UnitType, string[]> = {
  pond: [
    'Table-size Catfish',
    'Fingerling Catfish',
    'Tilapia Grow-out',
    'Tilapia Fingerling',
    'Mixed Species',
  ],
  plot: [
    'Maize',
    'Cassava',
    'Rice',
    'Yam',
    'Soya Beans',
    'Groundnut',
    'Cowpea (Beans)',
    'Vegetables',
  ],
  paddock: ['Beef Cattle', 'Dairy Cattle', 'Goats/Sheep Grazing'],
  pen: ['Piggery', 'Poultry (Broilers)', 'Poultry (Layers)'],
  greenhouse: ['Tomato', 'Pepper', 'Cucumber'],
  orchard: ['Mango', 'Citrus', 'Cashew', 'Plantain/Banana'],
  other: [],
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: '#8896A7', bg: '#F5F7FA' },
  in_progress: { label: 'In Progress', color: '#F4B400', bg: '#FEF9E7' },
  verified:    { label: 'Verified',    color: '#0D7A3D', bg: '#E8F5EE' },
  flagged:     { label: 'Flagged',     color: '#EF4444', bg: '#FEF2F2' },
};

const createUnitSchema = z.object({
  label: z.string().min(2, 'Label must be at least 2 characters').max(200),
  unitType: z.enum(['pond', 'plot', 'paddock', 'pen', 'greenhouse', 'orchard', 'other']),
  primaryFocus: z.string().max(200).optional(),
  secondaryFocus: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});
type CreateUnitForm = z.infer<typeof createUnitSchema>;

function UnitCard({ unit, onPress }: { unit: FarmUnit; onPress: () => void }) {
  const status = STATUS_CONFIG[unit.status] ?? STATUS_CONFIG.pending;
  const typeInfo = UNIT_TYPES.find((t) => t.value === unit.unitType);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Card className="mb-3">
        <View className="flex-row items-center justify-between mb-1">
          <View className="flex-row items-center flex-1 mr-3">
            <Text className="text-2xl mr-2">{typeInfo?.icon ?? '📍'}</Text>
            <View className="flex-1">
              <Text className="font-bold text-text" numberOfLines={1}>{unit.label}</Text>
              <Text className="text-xs text-text-3 font-mono mt-0.5">{unit.unitId}</Text>
            </View>
          </View>
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: status.bg }}>
            <Text className="text-xs font-semibold" style={{ color: status.color }}>{status.label}</Text>
          </View>
        </View>

        {unit.primaryFocus && (
          <View className="flex-row items-center mt-1.5">
            <View className="bg-green-50 rounded-full px-2.5 py-1 mr-2">
              <Text className="text-xs text-green-500 font-medium">{unit.primaryFocus}</Text>
            </View>
            {unit.secondaryFocus && (
              <View className="bg-gray-100 rounded-full px-2.5 py-1">
                <Text className="text-xs text-text-3 font-medium">+ {unit.secondaryFocus}</Text>
              </View>
            )}
          </View>
        )}

        {unit.notes && (
          <Text className="text-xs text-text-3 mt-1.5" numberOfLines={2}>{unit.notes}</Text>
        )}

        <Text className="text-xs text-green-500 font-medium mt-2 text-right">
          {unit.status === 'verified' ? '✓ Verified' : 'Tap to verify →'}
        </Text>
      </Card>
    </TouchableOpacity>
  );
}

function AddUnitModal({
  appId,
  siteId,
  visible,
  onClose,
  onCreated,
}: {
  appId: string;
  siteId: string;
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } =
    useForm<CreateUnitForm>({
      resolver: zodResolver(createUnitSchema),
      defaultValues: { label: '', unitType: 'pond', primaryFocus: '', secondaryFocus: '', notes: '' },
    });

  const selectedType = watch('unitType');
  const primaryFocus = watch('primaryFocus');
  const suggestions = FOCUS_SUGGESTIONS[selectedType] ?? [];

  const submit = async (data: CreateUnitForm) => {
    setLoading(true);
    try {
      await unitsApi.create(appId, siteId, {
        label: data.label,
        unitType: data.unitType,
        primaryFocus: data.primaryFocus || undefined,
        secondaryFocus: data.secondaryFocus || undefined,
        notes: data.notes || undefined,
      });
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
          <Text className="text-lg font-bold text-text">Add New Unit</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-green-500 font-medium">Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Unit type */}
          <Card className="mb-4">
            <Text className="font-bold text-text mb-3">Unit Type *</Text>
            <View className="flex-row flex-wrap gap-2">
              {UNIT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  onPress={() => { setValue('unitType', t.value); setValue('primaryFocus', ''); }}
                  className="flex-row items-center px-3 py-2 rounded-xl border"
                  style={{
                    borderColor: selectedType === t.value ? '#0D7A3D' : '#E8EDF3',
                    backgroundColor: selectedType === t.value ? '#E8F5EE' : '#fff',
                  }}
                >
                  <Text className="mr-1.5">{t.icon}</Text>
                  <Text
                    className="text-xs font-medium"
                    style={{ color: selectedType === t.value ? '#0D7A3D' : '#8896A7' }}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          {/* Label */}
          <Card className="mb-4">
            <Controller
              control={control}
              name="label"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Unit Label / Name *"
                  placeholder='e.g. "Pond 1 - North Corner"'
                  value={value}
                  onChangeText={onChange}
                  error={errors.label?.message}
                />
              )}
            />
          </Card>

          {/* Primary Focus — the key addition for specificity */}
          <Card className="mb-4">
            <Text className="font-bold text-text mb-1">Primary Focus</Text>
            <Text className="text-xs text-text-3 mb-3">
              What is this unit mainly used for? Be specific — e.g. "Table-size Catfish"
              rather than just "Fish".
            </Text>

            {suggestions.length > 0 && (
              <View className="flex-row flex-wrap gap-2 mb-3">
                {suggestions.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setValue('primaryFocus', s)}
                    className="px-3 py-1.5 rounded-full border"
                    style={{
                      borderColor: primaryFocus === s ? '#0D7A3D' : '#E8EDF3',
                      backgroundColor: primaryFocus === s ? '#E8F5EE' : '#fff',
                    }}
                  >
                    <Text
                      className="text-xs font-medium"
                      style={{ color: primaryFocus === s ? '#0D7A3D' : '#8896A7' }}
                    >
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Controller
              control={control}
              name="primaryFocus"
              render={({ field: { onChange, value } }) => (
                <Input
                  placeholder="Or type a custom focus..."
                  value={value ?? ''}
                  onChangeText={onChange}
                  containerStyle={{ marginBottom: 12 }}
                />
              )}
            />

            <Controller
              control={control}
              name="secondaryFocus"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Secondary Focus (optional)"
                  placeholder="e.g. a smaller side activity in this unit"
                  value={value ?? ''}
                  onChangeText={onChange}
                />
              )}
            />
          </Card>

          {/* Notes */}
          <Card className="mb-6">
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Notes (optional)"
                  placeholder="Stocking density, size, special conditions..."
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
            label={loading ? 'Creating...' : 'Create Unit'}
            onPress={handleSubmit(submit)}
            loading={loading}
            fullWidth
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function UnitsScreen() {
  const { appId, siteId, siteLabel } = useLocalSearchParams<{
    appId: string;
    siteId: string;
    siteLabel?: string;
  }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['units', appId, siteId],
    queryFn: () => unitsApi.list(appId, siteId),
    select: (res) => res.data.data,
  });

  const units = data?.units ?? [];
  const summary = data?.summary;

  const handleUnitCreated = async () => {
    setShowAddModal(false);
    await qc.invalidateQueries({ queryKey: ['units', appId, siteId] });
    await qc.invalidateQueries({ queryKey: ['sites', appId] });
    await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorMessage message="Could not load units." onRetry={refetch} />;

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: siteLabel ?? 'Units',
          headerStyle: { backgroundColor: '#0D7A3D' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold', color: '#fff' },
        }}
      />

      {summary && summary.total > 0 && (
        <View className="bg-white px-5 py-3 border-b border-border">
          <Text className="text-sm font-medium text-text">
            {summary.verified} of {summary.total} units verified in this site
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0D7A3D" />}
      >
        {units.length === 0 ? (
          <Card className="items-center py-12 mt-4">
            <Text className="text-5xl mb-3">🗺️</Text>
            <Text className="font-bold text-text text-base mb-1">No units added yet</Text>
            <Text className="text-text-3 text-sm text-center mb-4">
              Walk to each pond or plot within this site and tap "Add Unit" to register it.
            </Text>
          </Card>
        ) : (
          units.map((unit) => (
            <UnitCard
              key={unit.unitId}
              unit={unit}
              onPress={() =>
                router.push({
                  pathname: '/verification/[appId]',
                  params: {
                    appId,
                    unitId: unit.unitId,
                    unitLabel: `${siteLabel ?? ''} — ${unit.label}`,
                  },
                })
              }
            />
          ))
        )}
      </ScrollView>

      <View className="absolute bottom-8 left-5 right-5">
        <Button label="＋ Add New Unit" onPress={() => setShowAddModal(true)} fullWidth size="lg" />
      </View>

      <AddUnitModal
        appId={appId}
        siteId={siteId}
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={handleUnitCreated}
      />
    </View>
  );
}
