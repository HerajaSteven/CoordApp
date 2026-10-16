import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text, FACE } from '@/components/ui/typography';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { visitsApi } from '@/services/api';
import { Button, Input, Card, HeaderBackButton } from '@/components/ui';
import { getErrorMessage } from '@/utils/errors';

/**
 * A monitoring visit, which is what `visitType: 'inspection'` is for.
 *
 * The service has validated, authorised and persisted these since the move
 * to MySQL, and nothing ever posted one: `visitsApi` was declared and called
 * from no screen at all. A coordinator could verify a farm once, report an
 * incident, and record a harvest — but never say what the crop looked like
 * on an ordinary visit.
 *
 * Distinct from verification, which happens once at registration and decides
 * whether the farm is real. This repeats, and describes a season.
 *
 * Nothing here is derived. Crop health, the three sign toggles and the two
 * status notes are what the field coordinator saw, and the screen does not
 * infer one from another — a farm can have pests and excellent crop health
 * in the same week, and the point of asking separately is to find that out.
 */

const CROP_HEALTH = [
  { value: 'excellent', label: 'Excellent', color: '#0D7A3D', bg: '#ECFDF3' },
  { value: 'good', label: 'Good', color: '#4C9A2A', bg: '#F3FBEF' },
  { value: 'fair', label: 'Fair', color: '#F4B400', bg: '#FEF9E7' },
  { value: 'poor', label: 'Poor', color: '#EF4444', bg: '#FEF2F2' },
] as const;

type CropHealth = (typeof CROP_HEALTH)[number]['value'];

/* The service caps both at 200, so the form does too rather than earning a 422. */
const STATUS_LIMIT = 200;
const NOTES_LIMIT = 5000;

const SIGNS = [
  {
    key: 'pest' as const,
    label: 'Pest signs',
    hint: 'Insects, bites, droppings, webbing',
  },
  {
    key: 'disease' as const,
    label: 'Disease signs',
    hint: 'Spotting, wilting, rot, mould',
  },
  {
    key: 'nutrient' as const,
    label: 'Nutrient deficiency signs',
    hint: 'Yellowing, stunting, poor fill',
  },
];

export default function InspectionScreen() {
  const { appId } = useLocalSearchParams<{ appId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [cropHealth, setCropHealth] = useState<CropHealth | ''>('');
  const [pest, setPest] = useState(false);
  const [disease, setDisease] = useState(false);
  const [nutrient, setNutrient] = useState(false);
  const [water, setWater] = useState('');
  const [fertilizer, setFertilizer] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  /*
    How many times this farm has been inspected, and when last. A coordinator
    standing on the farm needs to know whether this is the first visit of the
    season or the fourth, and nothing else on the app says so.
  */
  const { data: visits, isError: visitsFailed } = useQuery({
    queryKey: ['visits', appId],
    queryFn: () => visitsApi.list(appId, { limit: 50 }),
    select: (res) => res.data.data,
    enabled: Boolean(appId),
  });

  const inspections = (visits?.items ?? []).filter((v) => v.visitType === 'inspection');
  const previous = inspections.length;
  const last = previous > 0 ? inspections[0]?.visitedAt : null;

  const toggles: Record<string, [boolean, (v: boolean) => void]> = {
    pest: [pest, setPest],
    disease: [disease, setDisease],
    nutrient: [nutrient, setNutrient],
  };

  const submit = async () => {
    if (cropHealth === '') {
      Alert.alert('Required', 'Please record how the crop looks.');
      return;
    }

    setLoading(true);
    try {
      await visitsApi.create(appId, {
        visitType: 'inspection',
        visitedAt: new Date().toISOString(),
        cropHealth,
        pestSigns: pest,
        diseaseSigns: disease,
        nutrientDeficiencySigns: nutrient,
        waterSupplyStatus: water.trim() || undefined,
        fertilizerApplicationStatus: fertilizer.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      await qc.invalidateQueries({ queryKey: ['visits', appId] });
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });

      Alert.alert('✅ Inspection recorded', 'This visit has been logged against the farm.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Farm Inspection',
          headerStyle: { backgroundColor: '#0D7A3D' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontFamily: FACE.bold, color: '#fff' },
          headerLeft: () => <HeaderBackButton fallbackHref={`/farm/${appId}`} />,
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/*
          A failed read is not "no previous inspections". Said plainly, because
          telling a coordinator this is visit one when it is visit four is
          worse than telling them nothing.
        */}
        <Card className="mb-4">
          <Text className="text-xs text-text-3">
            {visitsFailed
              ? 'Could not load this farm’s inspection history.'
              : previous === 0
                ? 'No inspection recorded for this farm yet.'
                : `${previous} previous inspection${previous === 1 ? '' : 's'}${
                    last ? ` · last ${new Date(last).toLocaleDateString()}` : ''
                  }`}
          </Text>
        </Card>

        <Card className="mb-4">
          <Text className="font-bold text-text mb-3">How does the crop look? *</Text>
          <View className="flex-row gap-2">
            {CROP_HEALTH.map((h) => (
              <TouchableOpacity
                key={h.value}
                onPress={() => setCropHealth(h.value)}
                className="flex-1 py-3 rounded-xl items-center border-2"
                style={{
                  borderColor: cropHealth === h.value ? h.color : '#E8EDF3',
                  backgroundColor: cropHealth === h.value ? h.bg : '#fff',
                }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: cropHealth === h.value ? h.color : '#8896A7' }}
                >
                  {h.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card className="mb-4">
          <Text className="font-bold text-text mb-1">What did you see?</Text>
          <Text className="text-xs text-text-3 mb-2">
            Each is asked separately. A farm can show pests and still have healthy crop.
          </Text>
          {SIGNS.map((sign) => {
            const [on, set] = toggles[sign.key];

            return (
              <TouchableOpacity
                key={sign.key}
                onPress={() => set(!on)}
                className="flex-row items-center py-3 border-b border-border"
                activeOpacity={0.7}
              >
                <View
                  className={`w-5 h-5 rounded mr-3 items-center justify-center border-2 ${
                    on ? 'border-green-500 bg-green-500' : 'border-border'
                  }`}
                >
                  {on && <Text className="text-white text-[11px] font-bold">✓</Text>}
                </View>
                <View className="flex-1">
                  <Text className="text-sm text-text">{sign.label}</Text>
                  <Text className="text-xs text-text-3">{sign.hint}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </Card>

        <Card className="mb-4">
          <Input
            label="Water supply"
            placeholder="How is the farm watered right now?"
            value={water}
            onChangeText={(t) => setWater(t.slice(0, STATUS_LIMIT))}
          />
          <Input
            label="Fertiliser application"
            placeholder="What has been applied, and when?"
            value={fertilizer}
            onChangeText={(t) => setFertilizer(t.slice(0, STATUS_LIMIT))}
            containerStyle={{ marginTop: 12 }}
          />
        </Card>

        <Card className="mb-6">
          <Input
            label="Notes (optional)"
            placeholder="Anything else worth recording about this visit..."
            value={notes}
            onChangeText={(t) => setNotes(t.slice(0, NOTES_LIMIT))}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={{ minHeight: 90 }}
          />
        </Card>

        <Button
          label={loading ? 'Recording...' : 'Record Inspection'}
          onPress={submit}
          loading={loading}
          disabled={cropHealth === ''}
          fullWidth
        />
      </ScrollView>
    </View>
  );
}
