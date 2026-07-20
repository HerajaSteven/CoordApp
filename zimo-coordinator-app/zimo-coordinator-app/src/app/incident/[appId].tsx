import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { incidentsApi } from '@/services/api';
import { Button, Input, Card, HeaderBackButton } from '@/components/ui';
import { getErrorMessage } from '@/utils/errors';

const INCIDENT_TYPES = [
  'Crop disease',
  'Pest infestation',
  'Weather damage',
  'Land dispute',
  'Security threat',
  'Other',
] as const;

const SEVERITIES = [
  { value: 'low', label: 'Low', color: '#8896A7', bg: '#F5F7FA' },
  { value: 'medium', label: 'Medium', color: '#F4B400', bg: '#FEF9E7' },
  { value: 'high_critical', label: 'High / Critical', color: '#EF4444', bg: '#FEF2F2' },
] as const;

type Severity = 'low' | 'medium' | 'high_critical';

export default function IncidentReportScreen() {
  const { appId } = useLocalSearchParams<{ appId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [incidentType, setIncidentType] = useState('');
  const [severity, setSeverity] = useState<Severity>('low');
  const [description, setDescription] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!incidentType) {
      Alert.alert('Required', 'Please select an incident type.');
      return;
    }
    if (description.length < 10) {
      Alert.alert('Required', 'Description must be at least 10 characters.');
      return;
    }

    setLoading(true);
    try {
      await incidentsApi.create(appId, {
        incidentType,
        severity,
        incidentDateTime: new Date().toISOString(),
        description,
        actionTaken: actionTaken || undefined,
      });

      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });

      const isHighCritical = severity === 'high_critical';
      Alert.alert(
        isHighCritical ? '🚨 Incident Escalated' : '✅ Incident Reported',
        isHighCritical
          ? 'This incident has been escalated to your supervisor immediately.'
          : 'The incident has been logged successfully.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
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
          title: 'Report Incident',
          headerStyle: { backgroundColor: '#0D7A3D' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold', color: '#fff' },
          headerLeft: () => <HeaderBackButton fallbackHref={`/farm/${appId}`} />,
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Incident Type */}
        <Card className="mb-4">
          <Text className="font-bold text-text mb-3">Incident Type *</Text>
          {INCIDENT_TYPES.map((type) => (
            <TouchableOpacity
              key={type}
              onPress={() => setIncidentType(type)}
              className="flex-row items-center py-3 border-b border-border"
            >
              <View
                className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
                  incidentType === type ? 'border-green-500' : 'border-border'
                }`}
              >
                {incidentType === type && (
                  <View className="w-2.5 h-2.5 bg-green-500 rounded-full" />
                )}
              </View>
              <Text className="text-sm text-text">{type}</Text>
            </TouchableOpacity>
          ))}
        </Card>

        {/* Severity */}
        <Card className="mb-4">
          <Text className="font-bold text-text mb-3">Severity *</Text>
          <View className="flex-row gap-2">
            {SEVERITIES.map((s) => (
              <TouchableOpacity
                key={s.value}
                onPress={() => setSeverity(s.value)}
                className="flex-1 py-3 rounded-xl items-center border-2"
                style={{
                  borderColor: severity === s.value ? s.color : '#E8EDF3',
                  backgroundColor: severity === s.value ? s.bg : '#fff',
                }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: severity === s.value ? s.color : '#8896A7' }}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {severity === 'high_critical' && (
            <View className="mt-3 bg-red-50 rounded-xl p-3">
              <Text className="text-red-500 text-xs font-medium">
                ⚠️ High / Critical incidents are escalated to your supervisor immediately.
              </Text>
            </View>
          )}
        </Card>

        {/* Description */}
        <Card className="mb-4">
          <Input
            label="Description *"
            placeholder="Describe the incident in detail (min 10 characters)..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            style={{ minHeight: 100 }}
          />
          <Text className="text-xs text-text-3 mt-1 text-right">{description.length} chars</Text>
        </Card>

        {/* Action taken */}
        <Card className="mb-6">
          <Input
            label="Immediate Action Taken (optional)"
            placeholder="Describe any action you have already taken..."
            value={actionTaken}
            onChangeText={setActionTaken}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </Card>

        <Button
          label={loading ? 'Submitting...' : 'Submit Incident Report'}
          onPress={submit}
          loading={loading}
          disabled={!incidentType || description.length < 10}
          fullWidth
          variant={severity === 'high_critical' ? 'danger' : 'primary'}
        />
      </ScrollView>
    </View>
  );
}
