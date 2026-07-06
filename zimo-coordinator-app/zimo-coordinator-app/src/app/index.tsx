import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';
import { LoadingSpinner } from '@/components/ui';
import { View } from 'react-native';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <LoadingSpinner size="large" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
