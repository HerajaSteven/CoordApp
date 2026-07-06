import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
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
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E8EDF3',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
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
