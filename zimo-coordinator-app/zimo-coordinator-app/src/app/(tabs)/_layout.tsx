import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Text, scaled } from '@/components/ui/typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth.store';
import { Redirect } from 'expo-router';

function TabIcon({ focused, label, icon }: { focused: boolean; label: string; icon: string }) {
  return (
    <View className="items-center justify-center pt-1">
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <Text
        className={`text-xs mt-0.5 ${focused ? 'text-green-500 font-semibold' : 'text-text-3'}`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const insets = useSafeAreaInsets();
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  // Tab bar must clear the system gesture/home indicator on every device
  const tabBarPaddingBottom = Math.max(8, insets.bottom);

  /*
    ── AND HOLD ITS CONTENT WHEN THE TYPE GROWS ──────────────────────────

    This was a flat 56. The bar's contents are an emoji and a label —
    both TEXT, both obeying the device's font-scale setting — inside a box
    that did not. Raise "Display size" on an Android phone and the icons
    grow into a bar that has not, so they clip and the labels wrap.

    The prototype never meets this: its nav items are `min-height:52px`
    around their content, and the bar takes whatever height that needs.
    `scaled()` is how a container that must state a height reaches the
    same place — it grows by exactly what the text grew by, and no further
    than the cap in typography.tsx.
  */
  /*
    62 rather than 56 because the labels grew with the type scale — see
    tailwind.config.js. A bar sized for 12dp labels clips 14dp ones, and
    the clipping is what the last build was reported as.
  */
  const tabBarHeight = scaled(62) + tabBarPaddingBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E8EDF3',
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Home" icon="🏠" />,
        }}
      />
      <Tabs.Screen
        name="farms"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Farms" icon="🌾" />,
        }}
      />
      <Tabs.Screen
        name="clusters"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Clusters" icon="🗂️" />,
        }}
      />
      <Tabs.Screen
        name="monitor"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Monitor" icon="📊" />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Tasks" icon="✅" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Profile" icon="👤" />,
        }}
      />
    </Tabs>
  );
}
