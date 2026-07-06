import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';
import { useOfflineStore } from '@/store/offline.store';
import { Card, InfoRow, Divider, Button } from '@/components/ui';

function SettingRow({ icon, label, onPress, danger = false, right }: {
  icon: string;
  label: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center py-3.5"
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !right}
    >
      <Text className="text-xl w-8">{icon}</Text>
      <Text className={`flex-1 text-sm font-medium ml-2 ${danger ? 'text-red-500' : 'text-text'}`}>
        {label}
      </Text>
      {right ?? (onPress && <Text className="text-text-3">›</Text>)}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const coordinator = useAuthStore((s) => s.coordinator);
  const logout = useAuthStore((s) => s.logout);
  const { queue, sync } = useOfflineStore();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  return (
    <ScrollView className="flex-1 bg-bg">
      {/* Header */}
      <View className="bg-green-500 pt-14 pb-8 px-5 items-center">
        <View className="w-20 h-20 bg-white/20 rounded-full items-center justify-center mb-3">
          <Text className="text-white text-3xl font-bold">
            {coordinator?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2) ?? 'FC'}
          </Text>
        </View>
        <Text className="text-white text-xl font-bold">{coordinator?.name}</Text>
        <Text className="text-white/70 text-sm mt-0.5">{coordinator?.coordinatorId}</Text>
        <View className="bg-white/20 rounded-full px-3 py-1 mt-2">
          <Text className="text-white text-xs font-medium">{coordinator?.role}</Text>
        </View>
      </View>

      <View className="px-5 -mt-4">
        {/* Coordinator details */}
        <Card className="mb-4">
          <Text className="font-bold text-text mb-3">Coordinator Details</Text>
          <InfoRow label="Email" value={coordinator?.email ?? ''} />
          <InfoRow label="Phone" value={coordinator?.phone ?? ''} />
          <InfoRow label="State" value={coordinator?.state ?? ''} />
          <InfoRow label="LGA" value={coordinator?.lga ?? ''} />
          <InfoRow label="Organization" value={coordinator?.organizationSlug ?? ''} />
          <InfoRow label="Status" value={coordinator?.status ?? ''} />
        </Card>

        {/* App settings */}
        <Card className="mb-4">
          <Text className="font-bold text-text mb-2">Settings</Text>
          <Divider className="mb-2" />
          <SettingRow
            icon="🔄"
            label={queue.length > 0 ? `Sync Now (${queue.length} pending)` : 'Sync Now'}
            onPress={sync}
          />
          <Divider />
          <SettingRow icon="ℹ️" label="App Version" right={<Text className="text-text-3 text-sm">1.0.0</Text>} />
          <Divider />
          <SettingRow icon="📋" label="Clear Cache" onPress={() => {
            Alert.alert('Clear Cache', 'This clears downloaded data. Pending offline data will not be affected.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', onPress: () => {} },
            ]);
          }} />
        </Card>

        {/* Logout */}
        <Button
          label="Sign Out"
          onPress={handleLogout}
          variant="danger"
          fullWidth
          style={{ marginBottom: 40 }}
        />
      </View>
    </ScrollView>
  );
}
