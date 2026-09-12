import React from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  PixelRatio,
  useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/ui/typography';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth.store';
import { useOfflineStore } from '@/store/offline.store';
import { useSettingsStore } from '@/store/settings.store';
import { Card, InfoRow, Divider, Button } from '@/components/ui';
import { HerajaMark } from '@/components/ui/HerajaMark';

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
  const insets = useSafeAreaInsets();
  /* What this handset says its screen is — see the Screen row below. */
  const window = useWindowDimensions();
  const router = useRouter();
  const coordinator = useAuthStore((s) => s.coordinator);
  const logout = useAuthStore((s) => s.logout);
  const { queue, sync } = useOfflineStore();
  const superAdminManualCoordinatesEnabled = useSettingsStore((s) => s.superAdminManualCoordinatesEnabled);
  const setSuperAdminManualCoordinatesEnabled = useSettingsStore((s) => s.setSuperAdminManualCoordinatesEnabled);
  const superAdminGalleryEvidenceEnabled = useSettingsStore((s) => s.superAdminGalleryEvidenceEnabled);
  const setSuperAdminGalleryEvidenceEnabled = useSettingsStore((s) => s.setSuperAdminGalleryEvidenceEnabled);
  const isSuperAdmin = coordinator?.role === 'SuperAdmin';

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
      <View className="bg-green-500 pb-8 px-5 items-center" style={{ paddingTop: insets.top + 16 }}>
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
          {isSuperAdmin && (
            <>
              <SettingRow
                icon="📍"
                label="Default to manual coordinate entry"
                right={
                  <Switch
                    value={superAdminManualCoordinatesEnabled}
                    onValueChange={setSuperAdminManualCoordinatesEnabled}
                    trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
                    thumbColor={superAdminManualCoordinatesEnabled ? '#0D7A3D' : '#F3F4F6'}
                  />
                }
              />
              <Text className="text-xs text-text-3 mb-2 ml-10">
                Keep manual coordinate input enabled for weeks, then switch off anytime to return to live GPS capture.
              </Text>
              <Divider />
              <SettingRow
                icon="📷"
                label="Use gallery upload for verification photos"
                right={
                  <Switch
                    value={superAdminGalleryEvidenceEnabled}
                    onValueChange={setSuperAdminGalleryEvidenceEnabled}
                    trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
                    thumbColor={superAdminGalleryEvidenceEnabled ? '#0D7A3D' : '#F3F4F6'}
                  />
                }
              />
              <Text className="text-xs text-text-3 mb-2 ml-10">
                When enabled, photo steps use gallery upload by default instead of opening live camera capture.
              </Text>
              <Divider />
            </>
          )}
          <SettingRow
            icon="🔄"
            label={queue.length > 0 ? `Sync Now (${queue.length} pending)` : 'Sync Now'}
            onPress={sync}
          />
          <Divider />
          <SettingRow icon="ℹ️" label="App Version" right={<Text className="text-text-3 text-sm">1.0.0</Text>} />
          <Divider />
          {/*
            ── WHAT THIS DEVICE SAYS ITS SCREEN IS ────────────────────────

            "The app looks zoomed out" is a report nobody can act on from a
            desk: it could be the type scale, the OS display size, or a
            handset reporting a width no phone should. These are the three
            numbers that tell them apart.

            `dp` is the width the layout is drawn into — a phone is around
            360-430, and anything much above that renders a phone design
            with room to spare, which reads as zoomed out. `scale` is the
            device's pixel density, `font` the reader's own text setting.

            Kept in the app rather than in a debug build, because the
            person who can read it is a coordinator in a field, and asking
            them to install a second app to answer a support question is
            not a plan.
          */}
          <SettingRow
            icon="📐"
            label="Screen"
            right={
              <Text className="text-text-3 text-sm">
                {Math.round(window.width)}×{Math.round(window.height)} dp · {PixelRatio.get()}x ·
                font {PixelRatio.getFontScale().toFixed(2)}
              </Text>
            }
          />
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
        />

        {/* The platform this runs on, where somebody goes looking for it. */}
        <View className="mt-8 mb-10">
          <HerajaMark width={78} caption="Powered by Heraja" />
        </View>
      </View>
    </ScrollView>
  );
}
